import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

type SearchParams = Promise<{ q?: string; product?: string; turn65?: string; agent?: string }>

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
    .select('agency_id, role')
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
      .order('full_name', { ascending: true })

    agents = (data || []) as AgentProfile[]
  }

  const selectedAgent = canFilterByAgent && agents.some((agent) => agent.id === requestedAgent)
    ? requestedAgent
    : ''

  const shouldSearch = Boolean(q || product || turn65 || selectedAgent)
  const agentNames = new Map(agents.map((agent) => [agent.id, agent.full_name]))

  let clients: any[] = []
  let errorMessage = ''

  if (shouldSearch) {
    let query = supabase
      .from('clients')
      .select('id, assigned_agent_id, first_name, last_name, date_of_birth, phone, email, county, state, is_medicare, is_life, is_retirement, created_at')
      .order('last_name', { ascending: true })
      .limit(250)

    if (q) {
      const safe = q.replace(/[,%()]/g, ' ').trim()
      query = query.or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`)
    }
    if (product === 'medicare') query = query.eq('is_medicare', true)
    if (product === 'life') query = query.eq('is_life', true)
    if (product === 'retirement') query = query.eq('is_retirement', true)
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
        <Link href="/clients/new" className="btn btn-primary">+ Add Client</Link>
      </div>

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
          <option value="">All products</option><option value="medicare">Medicare</option><option value="life">Life</option><option value="retirement">Retirement</option>
        </select>
        <button className="btn btn-primary" type="submit">Search</button>
        <Link className="btn btn-secondary" href={turn65Href}>Turn 65</Link>
        <Link className="btn btn-secondary" href="/clients">Clear</Link>
      </form>

      {canFilterByAgent ? (
        <div className="notice" style={{ marginBottom: 14 }}>
          <strong>Agent view:</strong> {selectedAgent ? agentNames.get(selectedAgent) || 'Selected agent' : 'All agents'}
        </div>
      ) : null}

      <section className="card">
        {errorMessage ? <div className="notice notice-error" style={{ margin: 16 }}>{errorMessage}</div> : null}
        {!shouldSearch ? (
          <div className="empty"><strong>No clients are loaded by default.</strong><br />Search above, choose an agent, or use the Turn 65 button.</div>
        ) : clients.length === 0 ? (
          <div className="empty">No matching clients found.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  {canFilterByAgent ? <th>Agent</th> : null}
                  <th>DOB</th><th>Phone</th><th>Location</th><th>Products</th><th></th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id}>
                    <td><strong>{client.first_name} {client.last_name}</strong><br /><span style={{ color: '#657084', fontSize: 12 }}>{client.email || ''}</span></td>
                    {canFilterByAgent ? <td><strong>{agentNames.get(client.assigned_agent_id) || 'Unassigned'}</strong></td> : null}
                    <td>{client.date_of_birth || '—'}</td>
                    <td>{client.phone || '—'}</td>
                    <td>{[client.county, client.state].filter(Boolean).join(', ') || '—'}</td>
                    <td>
                      {client.is_medicare ? <span className="badge badge-gold">Medicare</span> : null}
                      {client.is_life ? <span className="badge">Life</span> : null}
                      {client.is_retirement ? <span className="badge">Retirement</span> : null}
                    </td>
                    <td><Link className="btn btn-secondary" href={`/clients/${client.id}`}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
