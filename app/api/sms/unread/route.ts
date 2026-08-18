import { NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId, profile } = await getCrmSession()
  if (!profile?.agency_id) return NextResponse.json({ total: 0, conversations: [], boards: {} })

  const admin = createAdminClient()
  const canSeeAgency = profile.role === 'admin' || profile.role === 'manager'
  const { data, error } = await admin.rpc('crm_sms_conversation_summaries', {
    p_agency_id: profile.agency_id,
    p_user_id: userId,
    p_can_see_agency: canSeeAgency
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const conversations = (data || [])
    .filter((row: any) => Number(row.unread_count || 0) > 0)
    .map((row: any) => ({
      client_id: row.client_id,
      client_name: row.client_name || 'Client',
      phone: row.phone || '',
      latest_body: row.latest_body || '',
      latest_at: row.latest_at,
      unread_count: Number(row.unread_count || 0),
      assigned_agent_id: row.assigned_agent_id || null,
      agent_name: row.agent_name || 'Unassigned'
    }))

  const total = conversations.reduce((sum: number, row: any) => sum + row.unread_count, 0)
  const boards: Record<string, number> = {}
  for (const row of conversations) boards[row.agent_name] = (boards[row.agent_name] || 0) + row.unread_count

  return NextResponse.json(
    { total, conversations, boards },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}
