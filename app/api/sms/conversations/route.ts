import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { createAdminClient } from '@/lib/supabase/admin'
import { canSeeAllClients } from '@/lib/client-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function getContext() {
  const { userId, profile } = await getCrmSession()
  if (!profile?.agency_id) return { admin: null, profile: null as any, userId, canSeeAgency: false }
  return {
    admin: createAdminClient(),
    profile,
    userId,
    canSeeAgency: canSeeAllClients(profile.role)
  }
}

async function accessibleClientIds(admin: ReturnType<typeof createAdminClient>, agencyId: string, userId: string, canSeeAgency: boolean, requestedIds: string[]) {
  if (!requestedIds.length) return []
  let query = admin
    .from('clients')
    .select('id')
    .eq('agency_id', agencyId)
    .in('id', requestedIds)
  if (!canSeeAgency) query = query.eq('assigned_agent_id', userId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data || []).map((row) => row.id)
}

export async function GET() {
  try {
    const { admin, profile, userId, canSeeAgency } = await getContext()
    if (!admin || !profile?.agency_id) return NextResponse.json({ total_unread: 0, conversations: [] })

    const { data, error } = await admin.rpc('crm_sms_conversation_summaries', {
      p_agency_id: profile.agency_id,
      p_user_id: userId,
      p_can_see_agency: canSeeAgency
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const conversations = (data || []).map((row: any) => ({
      client_id: row.client_id,
      client_name: row.client_name || 'Client',
      phone: row.phone || '',
      assigned_agent_id: row.assigned_agent_id || null,
      agent_name: row.agent_name || 'Unassigned',
      unread_count: Number(row.unread_count || 0),
      latest_body: row.latest_body || '',
      latest_at: row.latest_at
    }))
    const totalUnread = conversations.reduce((sum: number, conversation: any) => sum + conversation.unread_count, 0)

    return NextResponse.json(
      { total_unread: totalUnread, conversations },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load messages.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => ({})) as { client_ids?: string[] }
    const requestedIds = Array.isArray(payload.client_ids) ? Array.from(new Set(payload.client_ids.filter(Boolean))).slice(0, 100) : []
    if (!requestedIds.length) return NextResponse.json({ error: 'Choose at least one client conversation.' }, { status: 400 })

    const { admin, profile, userId, canSeeAgency } = await getContext()
    if (!admin || !profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

    const clientIds = await accessibleClientIds(admin, profile.agency_id, userId, canSeeAgency, requestedIds)
    if (!clientIds.length) return NextResponse.json({ error: 'No accessible conversations selected.' }, { status: 403 })

    const now = new Date().toISOString()
    const { error } = await admin
      .from('client_sms_messages')
      .update({ read_at: now, updated_at: now })
      .in('client_id', clientIds)
      .eq('direction', 'inbound')
      .is('read_at', null)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to mark messages read.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => ({})) as { message_ids?: string[] }
    const requestedIds = Array.isArray(payload.message_ids) ? Array.from(new Set(payload.message_ids.filter(Boolean))).slice(0, 200) : []
    if (!requestedIds.length) return NextResponse.json({ error: 'Choose at least one text to delete.' }, { status: 400 })

    const { admin, profile, userId, canSeeAgency } = await getContext()
    if (!admin || !profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

    const { data: candidateMessages, error: lookupError } = await admin
      .from('client_sms_messages')
      .select('id,client_id')
      .in('id', requestedIds)
    if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })

    const candidateClientIds = Array.from(new Set((candidateMessages || []).map((row) => row.client_id)))
    const allowedClientIds = new Set(await accessibleClientIds(admin, profile.agency_id, userId, canSeeAgency, candidateClientIds))
    const messageIds = (candidateMessages || []).filter((row) => allowedClientIds.has(row.client_id)).map((row) => row.id)
    if (!messageIds.length) return NextResponse.json({ error: 'No accessible texts selected.' }, { status: 403 })

    const { error } = await admin.from('client_sms_messages').delete().in('id', messageIds)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, deleted: messageIds.length })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to delete messages.' }, { status: 500 })
  }
}
