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

  let clientQuery = admin
    .from('clients')
    .select('id,first_name,last_name,phone,assigned_agent_id')
    .eq('agency_id', profile.agency_id)

  if (!canSeeAgency) clientQuery = clientQuery.eq('assigned_agent_id', userId)

  const [{ data: clients, error: clientError }, { data: profiles }] = await Promise.all([
    clientQuery,
    admin.from('profiles').select('id,full_name').eq('agency_id', profile.agency_id)
  ])

  if (clientError) return NextResponse.json({ error: clientError.message }, { status: 500 })

  const clientIds = (clients || []).map((client) => client.id)
  if (!clientIds.length) return NextResponse.json({ total: 0, conversations: [], boards: {} })

  const { data: messages, error } = await admin
    .from('client_sms_messages')
    .select('id,client_id,body,created_at')
    .in('client_id', clientIds)
    .eq('direction', 'inbound')
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(250)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const profileMap = new Map((profiles || []).map((row) => [row.id, row.full_name || 'Agent']))
  const clientMap = new Map((clients || []).map((client) => [client.id, client]))
  const grouped = new Map<string, { client_id: string; client_name: string; phone: string; latest_body: string; latest_at: string; unread_count: number; assigned_agent_id: string | null; agent_name: string }>()

  for (const message of messages || []) {
    const client = clientMap.get(message.client_id)
    if (!client) continue
    const current = grouped.get(message.client_id)
    if (current) {
      current.unread_count += 1
      continue
    }
    grouped.set(message.client_id, {
      client_id: message.client_id,
      client_name: [client.first_name, client.last_name].filter(Boolean).join(' ') || 'Client',
      phone: client.phone || '',
      latest_body: message.body || '',
      latest_at: message.created_at,
      unread_count: 1,
      assigned_agent_id: client.assigned_agent_id || null,
      agent_name: profileMap.get(client.assigned_agent_id) || 'Unassigned'
    })
  }

  const conversations = Array.from(grouped.values())
  const total = conversations.reduce((sum, row) => sum + row.unread_count, 0)
  const boards: Record<string, number> = {}
  for (const row of conversations) boards[row.agent_name] = (boards[row.agent_name] || 0) + row.unread_count

  return NextResponse.json({ total, conversations, boards })
}
