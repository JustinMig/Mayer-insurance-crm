import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BATCH_SIZE = 500

type ClientRow = {
  id: string
  assigned_agent_id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
}

async function loadAgentClients(
  supabase: Awaited<ReturnType<typeof getCrmSession>>['supabase'],
  agentId: string,
  q: string
) {
  const output: ClientRow[] = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase.rpc('crm_client_search', {
      p_query: q,
      p_agent_id: agentId,
      p_limit: BATCH_SIZE,
      p_offset: offset
    })
    if (error) throw new Error(error.message)
    const rows = (Array.isArray(data) ? data : []) as Array<ClientRow & { total_count?: number | string }>
    output.push(...rows.map((row) => ({
      id: row.id,
      assigned_agent_id: row.assigned_agent_id,
      first_name: row.first_name,
      last_name: row.last_name,
      phone: row.phone
    })))
    if (rows.length < BATCH_SIZE) break
    offset += BATCH_SIZE
  }

  return output
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, userId, profile } = await getCrmSession()
    if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
    const q = (request.nextUrl.searchParams.get('q') || '').trim().slice(0, 120)

    let allowedAgentIds = [userId]
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

    if (!allowedAgentIds.length) return NextResponse.json({ clients: [] }, { headers: { 'Cache-Control': 'private, no-store' } })
    const batches = await Promise.all(allowedAgentIds.map((agentId) => loadAgentClients(supabase, agentId, q)))
    const clients = batches.flat().sort((a, b) => {
      const last = String(a.last_name || '').localeCompare(String(b.last_name || ''), undefined, { sensitivity: 'base' })
      return last || String(a.first_name || '').localeCompare(String(b.first_name || ''), undefined, { sensitivity: 'base' })
    })

    return NextResponse.json({ clients }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load clients.' }, { status: 500 })
  }
}
