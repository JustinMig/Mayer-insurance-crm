import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isLeadsBackgroundRequest(request: NextRequest) {
  const referer = request.headers.get('referer')
  if (!referer) return false
  try {
    return new URL(referer).pathname === '/leads'
  } catch {
    return false
  }
}

export async function GET(request: NextRequest) {
  // The dedicated Leads page reuses the legacy Workspace client component but
  // hides all calendar/client-picker UI. Return immediately so that hidden UI
  // does not trigger a database/session lookup every time Leads opens.
  if (isLeadsBackgroundRequest(request)) {
    return NextResponse.json({ clients: [] }, { headers: { 'Cache-Control': 'private, no-store' } })
  }

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
