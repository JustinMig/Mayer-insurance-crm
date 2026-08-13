import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCrmSession } from '@/lib/crm-session'
import ClientsResults from './ClientsResults'

type SearchParams = Promise<{
  q?: string
  product?: string
  turn65?: string
  agent?: string
  health_company?: string
  sort?: string
  deleted?: string
  cleanup_warning?: string
}>

type AgentProfile = {
  id: string
  full_name: string
  role: string
}

const SORT_OPTIONS = new Set(['first_name', 'last_name', 'county'])

export default async function ClientsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const q = (params.q || '').trim()
  const product = params.product || ''
  const turn65 = params.turn65 === '1'
  const requestedAgent = (params.agent || '').trim()
  const requestedHealthCompany = (params.health_company || '').trim()
  const sort = SORT_OPTIONS.has(params.sort || '') ? String(params.sort) : 'last_name'
  const { supabase, userId, profile: currentProfile } = await getCrmSession()
  if (!currentProfile?.agency_id) redirect('/account-setup')

  const canFilterByAgent = currentProfile.role === 'admin' || currentProfile.role === 'manager'
  const canBulkDelete = canFilterByAgent

  let agents: AgentProfile[] = []
  if (canFilterByAgent) {
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

  const { data: healthPlanRows } = await supabase
    .from('client_health_plan_info')
    .select('company_name')
    .eq('agency_id', currentProfile.agency_id)
    .not('company_name', 'is', null)
    .order('company_name', { ascending: true })

  const healthCompanies = Array.from(new Set(
    (healthPlanRows || [])
      .map((row: { company_name: string | null }) => (row.company_name || '').trim())
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))

  const selectedHealthCompany = healthCompanies.includes(requestedHealthCompany)
    ? requestedHealthCompany
    : ''

  const shouldSearch = Boolean(q || product || turn65 || selectedAgent || selectedHealthCompany || params.sort)
  const agentNames: Record<string, string> = Object.fromEntries(agents.map((agent) => [agent.id, agent.full_name]))
  if (userId && currentProfile.full_name) agentNames[userId] = currentProfile.full_name

  let clients: any[] = []
  let errorMessage = ''

  if (shouldSearch) {
    let healthClientIds: string[] | null = null

    if (selectedHealthCompany) {
      const { data: matchingPlans, error: healthError } = await supabase
        .from('client_health_plan_info')
        .select('client_id')
        .eq('agency_id', currentProfile.agency_id)
        .eq('company_name', selectedHealthCompany)

      if (healthError) {
        errorMessage = healthError.message
        healthClientIds = []
      } else {
        healthClientIds = Array.from(new Set((matchingPlans || []).map((row: { client_id: string }) => row.client_id)))
      }
    }

    if (!selectedHealthCompany || (healthClientIds && healthClientIds.length > 0)) {
      let query = supabase
        .from('clients')
        .select('id, assigned_agent_id, first_name, last_name, date_of_birth, phone, county, state, is_medicare, is_life, is_retirement')
        .limit(250)

      if (sort === 'first_name') {
        query = query.order('first_name', { ascending: true, nullsFirst: false }).order('last_name', { ascending: true, nullsFirst: false })
      } else if (sort === 'county') {
        query = query.order('county', { ascending: true, nullsFirst: false }).order('last_name', { ascending: true, nullsFirst: false }).order('first_name', { ascending: true, nullsFirst: false })
      } else {
        query = query.order('last_name', { ascending: true, nullsFirst: false }).order('first_name', { ascending: true, nullsFirst: false })
      }

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
      if (healthClientIds) query = query.in('id', healthClientIds)
      if (turn65) {
        const birthYear = new Date().getFullYear() - 65
        query = query.gte('date_of_birth', `${birthYear}-01-01`).lte('date_of_birth', `${birthYear}-12-31`)
      }

      const result = await query
      clients = result.data || []
      if (!errorMessage) errorMessage = result.error?.message || ''
    }
  }

  const turn65Params = new URLSearchParams({ turn65: '1' })
  if (selectedAgent) turn65Params.set('agent', selectedAgent)
  if (selectedHealthCompany) turn65Params.set('health_company', selectedHealthCompany)
  if (sort !== 'last_name') turn65Params.set('sort', sort)
  const turn65Href = `/clients?${turn65Params.toString()}`

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'end', flexWrap: 'wrap' }}>
        <div><h1>Clients</h1><p className="subtle">Search, filter, sort, select, export, or manage clients from one screen.</p></div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {canFilterByAgent ? <Link prefetch={false} href="/clients/import" className="btn btn-secondary">Import Clients</Link> : null}
          <Link prefetch={false} href="/clients/new" className="btn btn-primary">+ Add Client</Link>
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

        <select className="select" name="health_company" defaultValue={selectedHealthCompany} style={{ width: 210 }} aria-label="Filter clients by health plan company">
          <option value="">All health plan companies</option>
          {healthCompanies.map((company) => <option key={company} value={company}>{company}</option>)}
        </select>

        <select className="select" name="product" defaultValue={product} style={{ width: 180 }}>
          <option value="">All products</option>
          <option value="life">Life</option>
          <option value="medicare">Medicare</option>
          <option value="retirement">Retirement</option>
          <option value="life_medicare">Life + Medicare</option>
          <option value="non_life">Non-Life</option>
          <option value="non_medicare">Non-Medicare</option>
        </select>

        <select className="select" name="sort" defaultValue={sort} style={{ width: 190 }} aria-label="Sort clients">
          <option value="last_name">Last name A-Z</option>
          <option value="first_name">First name A-Z</option>
          <option value="county">County A-Z</option>
        </select>

        <button className="btn btn-primary" type="submit">Search</button>
        <Link prefetch={false} className="btn btn-secondary" href={turn65Href}>Turn 65</Link>
        <Link prefetch={false} className="btn btn-secondary" href="/clients">Clear</Link>
      </form>

      {canFilterByAgent ? (
        <div className="notice" style={{ marginBottom: 14 }}>
          <strong>Agent view:</strong> {selectedAgent ? agentNames[selectedAgent] || 'Selected agent' : 'All agents'}
          {selectedHealthCompany ? <> &nbsp;•&nbsp; <strong>Health plan:</strong> {selectedHealthCompany}</> : null}
          <> &nbsp;•&nbsp; <strong>Sort:</strong> {sort === 'first_name' ? 'First name A-Z' : sort === 'county' ? 'County A-Z' : 'Last name A-Z'}</>
        </div>
      ) : null}

      {!shouldSearch ? (
        <section className="card">
          <div className="empty"><strong>No clients are loaded by default.</strong><br />Search above, choose a filter, choose a sort order and press Search, or use the Turn 65 button.</div>
        </section>
      ) : (
        <ClientsResults
          key={`${q}|${product}|${turn65 ? '1' : '0'}|${selectedAgent}|${selectedHealthCompany}|${sort}`}
          clients={clients}
          agentNames={agentNames}
          filters={{ q, product, turn65, agent: selectedAgent }}
          errorMessage={errorMessage}
          canBulkDelete={canBulkDelete}
        />
      )}
    </>
  )
}
