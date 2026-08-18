import { NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { supabase, profile } = await getCrmSession()
  if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  let allowedAgentIds: string[] | null = null
  if (profile.role === 'manager') {
    const { data: agents, error: agentError } = await supabase
      .from('profiles')
      .select('id,full_name')
      .eq('agency_id', profile.agency_id)
      .eq('active', true)
      .in('role', ['admin', 'agent'])

    if (agentError) return NextResponse.json({ error: agentError.message }, { status: 500 })
    allowedAgentIds = (agents || [])
      .filter((agent) => ['justin mayer', 'isaiah hernandez'].includes(String(agent.full_name || '').trim().toLowerCase()))
      .map((agent) => agent.id)
  }

  let query = supabase
    .from('clients')
    .select('id,assigned_agent_id,first_name,last_name,phone')
    .eq('agency_id', profile.agency_id)
    .order('last_name', { ascending: true, nullsFirst: false })
    .order('first_name', { ascending: true, nullsFirst: false })
    .limit(1000)

  if (allowedAgentIds) {
    if (!allowedAgentIds.length) return NextResponse.json({ clients: [] })
    query = query.in('assigned_agent_id', allowedAgentIds)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ clients: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } })
}
