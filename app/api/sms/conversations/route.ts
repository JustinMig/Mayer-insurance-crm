import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SmsRow = {
  id: string
  client_id: string
  direction: 'inbound' | 'outbound'
  body: string
  status: string
  error_code: string | null
  read_at: string | null
  created_at: string
}

async function getAccessibleClients() {
  const { userId, profile } = await getCrmSession()
  if (!profile?.agency_id) return { admin: null, clients: [] as any[] }

  const admin = createAdminClient()
  const canSeeAgency = profile.role === 'admin' || profile.role === 'manager'
  let query = admin
    .from('clients')
    .select('id,first_name,last_name,phone,assigned_agent_id')
    .eq('agency_id', profile.agency_id)

  if (!canSeeAgency) query = query.eq('assigned_agent_id', userId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return { admin, clients: data || [] }
}

export async function GET() {
  try {
    const { admin, clients } = await getAccessibleClients()
    if (!admin || !clients.length) return NextResponse.json({ total_unread: 0, conversations: [] })

    const clientIds = clients.map((client) => client.id)
    const { data: messages, error } = await admin
      .from('client_sms_messages')
      .select('id,client_id,direction,body,status,error_code,read_at,created_at')
      .in('client_id', clientIds)
      .order('created_at', { ascending: false })
      .limit(1500)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const clientMap = new Map(clients.map((client) => [client.id, client]))
    const grouped = new Map<string, {
      client_id: string
      client_name: string
      phone: string
      unread_count: number
      latest_body: string
      latest_at: string
      messages: SmsRow[]
    }>()

    for (const row of (messages || []) as SmsRow[]) {
      const client = clientMap.get(row.client_id)
      if (!client) continue
      let conversation = grouped.get(row.client_id)
      if (!conversation) {
        conversation = {
          client_id: row.client_id,
          client_name: [client.first_name, client.last_name].filter(Boolean).join(' ') || 'Client',
          phone: client.phone || '',
          unread_count: 0,
          latest_body: row.body || '',
          latest_at: row.created_at,
          messages: []
        }
        grouped.set(row.client_id, conversation)
      }
      if (row.direction === 'inbound' && !row.read_at) conversation.unread_count += 1
      conversation.messages.push(row)
    }

    const conversations = Array.from(grouped.values()).map((conversation) => ({
      ...conversation,
      messages: conversation.messages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    }))
    const totalUnread = conversations.reduce((sum, conversation) => sum + conversation.unread_count, 0)
    return NextResponse.json({ total_unread: totalUnread, conversations })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load messages.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => ({})) as { client_ids?: string[] }
    const requestedIds = Array.isArray(payload.client_ids) ? payload.client_ids.filter(Boolean) : []
    if (!requestedIds.length) return NextResponse.json({ error: 'Choose at least one client conversation.' }, { status: 400 })

    const { admin, clients } = await getAccessibleClients()
    if (!admin) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

    const allowed = new Set(clients.map((client) => client.id))
    const clientIds = requestedIds.filter((id) => allowed.has(id))
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
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to clear unread messages.' }, { status: 500 })
  }
}
