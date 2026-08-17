import { NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { supabase } = await getCrmSession()

  const { data: messages, error } = await supabase
    .from('client_sms_messages')
    .select('id,client_id,body,created_at')
    .eq('direction', 'inbound')
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const clientIds = Array.from(new Set((messages || []).map((row) => row.client_id).filter(Boolean)))
  if (!clientIds.length) return NextResponse.json({ total: 0, conversations: [] })

  const { data: clients, error: clientError } = await supabase
    .from('clients')
    .select('id,first_name,last_name,phone,assigned_agent_id')
    .in('id', clientIds)

  if (clientError) return NextResponse.json({ error: clientError.message }, { status: 500 })

  const clientMap = new Map((clients || []).map((client) => [client.id, client]))
  const grouped = new Map<string, { client_id: string; client_name: string; phone: string; latest_body: string; latest_at: string; unread_count: number }>()

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
      unread_count: 1
    })
  }

  const conversations = Array.from(grouped.values())
  const total = conversations.reduce((sum, row) => sum + row.unread_count, 0)
  return NextResponse.json({ total, conversations })
}
