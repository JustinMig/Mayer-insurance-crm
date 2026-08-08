import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import ClientsResults from './ClientsResults'

type SearchParams = Promise<{ q?: string; product?: string; turn65?: string; agent?: string; deleted?: string; cleanup_warning?: string }>

type AgentProfile = {
  id: string
  full_name: string
  role: string
}

export default async function ClientsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const q = (params.q || '').trim()
  const product = params.product || ''
  const turn65 = params.turn65 === '1'
  const requestedAgent = (params.agent || '').trim()
  const supabase = await createClient()

  const { data: authData } = await supabase.auth.getClaims()
  const userId = authData?.claims?.sub ? String(authData.claims.sub) : ''

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('agency_id, role, full_name')
    .eq('id', userId)
    .maybeSingle()

  const canFilterByAgent = currentProfile?.role === 'admin' || currentProfile?.role === 'manager'

  let agents: AgentProfile[] = []
  if (canFilterByAgent && currentProfile?.agency_id) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('agency_id', currentProfile.agency_id)
      .eq('active', true)
      .in('role', ['admin', 'agent'])
      .order('full_name', { ascending: true })

    agents = (data || []) as AgentProfile[]
  }

  const selectedAgent = canFilterByAgent && agents.some((agent) => agent.id === requestedAgent)
    ? requestedAgent
    : ''

  const shouldSearch = Boolean(q || product || turn65 || selectedAgent)
  const agentNames: Record<string, string> = Object.fromEntries(agents.map((agent) => [agent.id, agent.full_name]))
  if (userId && currentProfile?.full_name) agentNames[userId] = currentProfile.full_name

  let clients: any[] = []
  let errorMessage = ''

  if (shouldSearch) {
    let query = supabase
      .from('clients')
      .select('id, assigned_agent_id, first_name, last_name, date_of_birth, phone, county, state, is_medicare, is_life, is_retirement')
      .order('last_name', { ascending: true })
      .limit(250)

    if (q) {
      const safe = q.replace(/[,%()]/g, ' ').trim()
      query = query.or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`)
    }
    if (product === 'medicare') query = query.eq('is_medicare', true)
    if (product === 'life') query = query.eq('is_life', true)
    if (product === 'retirement') query = query.eq('is_retirement', true)
    if (product === 'life_medicare') query = query.eq('is_life', true).eq('is_medicare', true)
    if (product === 'non_life') query = query.eq('is_life', false)
    if (product === 'non_medicare') query = query.eq('is_medicare', false)
    if (selectedAgent) query = query.eq('assigned_agent_id', selectedAgent)
    if (turn65) {
      const birthYear = new Date().getFullYear() - 65
      query = query.gte('date_of_birth', `${birthYear}-01-01`).lte('date_of_birth', `${birthYear}-12-31`)
    }

    const result = await query
    clients = result.data || []
    errorMessage = result.error?.message || ''
  }

  const turn65Href = selectedAgent
    ? `/clients?turn65=1&agent=${encodeURIComponent(selectedAgent)}`
    : '/clients?turn65=1'

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'end', flexWrap: 'wrap' }}>
        <div><h1>Clients</h1><p className="subtle">Search the database without loading every client onto the screen.</p></div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {canFilterByAgent ? <Link href="/clients/import" className="btn btn-secondary">Import Clients</Link> : null}
          <Link href="/clients/new" className="btn btn-primary">+ Add Client</Link>
        </div>
      </div>

      {params.deleted === '1' ? <div className="notice notice-success" style={{ marginTop: 18 }}>Client deleted successfully.</div> : null}
      {params.cleanup_warning === '1' ? <div className="notice" style={{ marginTop: 10 }}>The client was deleted, but one or more stored file objects could not be cleaned up automatically.</div> : null}

      <form className="toolbar" action="/clients" method="get">
        <input className="input search" name="q" defaultValue={q} placeholder="Search name, phone or email" />

        {canFilterByAgent ? (
          <select className="select" name="agent" defaultValue={selectedAgent} style={{ width: 210 }} aria-label="Filter clients by agent">
            <option value="">All agents</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.full_name}</option>
            ))}
          </select>
        ) : null}

        <select className="select" name="product" defaultValue={product} style={{ width: 180 }}>
          <option value="">All products</option>
          <option value="life">Life</option>
          <option value="medicare">Medicare</option>
          <option value="retirement">Retirement</option>
          <option value="life_medicare">Life + Medicare</option>
          <option value="non_life">Non-Life</option>
          <option value="non_medicare">Non-Medicare</option>
        </select>
        <button className="btn btn-primary" type="submit">Search</button>
        <Link className="btn btn-secondary" href={turn65Href}>Turn 65</Link>
        <Link className="btn btn-secondary" href="/clients">Clear</Link>
      </form>

      {canFilterByAgent ? (
        <div className="notice" style={{ marginBottom: 14 }}>
          <strong>Agent view:</strong> {selectedAgent ? agentNames[selectedAgent] || 'Selected agent' : 'All agents'}
        </div>
      ) : null}

      {!shouldSearch ? (
        <section className="card">
          <div className="empty"><strong>No clients are loaded by default.</strong><br />Search above, choose an agent, or use the Turn 65 button.</div>
        </section>
      ) : (
        <ClientsResults
          key={`${q}|${product}|${turn65 ? '1' : '0'}|${selectedAgent}`}
          clients={clients}
          agentNames={agentNames}
          filters={{ q, product, turn65, agent: selectedAgent }}
          errorMessage={errorMessage}
        />
      )}
    </>
  )
}
