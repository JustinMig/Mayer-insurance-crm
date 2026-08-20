import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCrmSession } from '@/lib/crm-session'
import { canDeleteClients, canSeeAllClients } from '@/lib/client-access'
import ClientsResults from './ClientsResults'

type SearchParams = Promise<{
  q?: string
  product?: string
  turn65?: string
  age65plus?: string
  agent?: string
  health_company?: string
  sort?: string
  deleted?: string
  cleanup_warning?: string
  show_all?: string
  page?: string
}>

type AgentProfile = {
  id: string
  full_name: string
  role: string
}

const SORT_OPTIONS = new Set(['first_name', 'last_name', 'county'])

function getCentralTodayParts() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day)
  }
}

function getAgeCutoffDate(age: number) {
  const { year, month, day } = getCentralTodayParts()
  const cutoffYear = year - age
  const maxDay = new Date(Date.UTC(cutoffYear, month, 0)).getUTCDate()
  const cutoffDay = Math.min(day, maxDay)
  return `${cutoffYear}-${String(month).padStart(2, '0')}-${String(cutoffDay).padStart(2, '0')}`
}

export default async function ClientsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const q = (params.q || '').trim()
  const product = params.product || ''
  const turn65 = params.turn65 === '1'
  const age65plus = params.age65plus === '1'
  const requestedAgent = (params.agent || '').trim()
  const requestedHealthCompany = (params.health_company || '').trim()
  const sort = SORT_OPTIONS.has(params.sort || '') ? String(params.sort) : 'last_name'
  const showAll = params.show_all === '1'
  const requestedPage = Number.parseInt(params.page || '1', 10)
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const pageSize = 50
  const { supabase, userId, profile: currentProfile } = await getCrmSession()
  if (!currentProfile?.agency_id) redirect('/account-setup')

  const canFilterByAgent = canSeeAllClients(currentProfile.role)
  const canBulkDelete = canDeleteClients(currentProfile.role)

  const agentsPromise = canFilterByAgent
    ? supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('agency_id', currentProfile.agency_id)
        .eq('active', true)
        .in('role', ['admin', 'agent'])
        .order('full_name', { ascending: true })
    : Promise.resolve({ data: [] as AgentProfile[], error: null })

  const healthCompaniesPromise = supabase
    .from('client_health_plan_info')
    .select('company_name')
    .eq('agency_id', currentProfile.agency_id)
    .not('company_name', 'is', null)
    .order('company_name', { ascending: true })

  const [agentsResult, healthCompaniesResult] = await Promise.all([agentsPromise, healthCompaniesPromise])
  const agents = ((agentsResult.data || []) as AgentProfile[])
  const healthPlanRows = healthCompaniesResult.data || []

  const selectedAgent = canFilterByAgent && agents.some((agent) => agent.id === requestedAgent)
    ? requestedAgent
    : ''

  const healthCompanies = Array.from(new Set(
    (healthPlanRows || [])
      .map((row: { company_name: string | null }) => (row.company_name || '').trim())
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))

  const selectedHealthCompany = healthCompanies.includes(requestedHealthCompany)
    ? requestedHealthCompany
    : ''

  const shouldSearch = Boolean(showAll || q || product || turn65 || age65plus || selectedAgent || selectedHealthCompany || params.sort)
  const agentNames: Record<string, string> = Object.fromEntries(agents.map((agent) => [agent.id, agent.full_name]))
  if (userId && currentProfile.full_name) agentNames[userId] = currentProfile.full_name

  // Managers can view either agent or the whole agency. Every other login is
  // explicitly scoped to the client records assigned to that signed-in user.
  const totalCountAgentId = canFilterByAgent ? selectedAgent : userId
  let totalClientCount = 0
  let totalMedicareCount = 0
  let totalNonMedicareCount = 0
  let totalCountError = ''

  if (totalCountAgentId || canFilterByAgent) {
    let allCountQuery = supabase.from('clients').select('id', { count: 'exact', head: true })
    let medicareCountQuery = supabase.from('clients').select('id', { count: 'exact', head: true }).eq('is_medicare', true)
    let nonMedicareCountQuery = supabase.from('clients').select('id', { count: 'exact', head: true }).eq('is_medicare', false)

    if (totalCountAgentId) {
      allCountQuery = allCountQuery.eq('assigned_agent_id', totalCountAgentId)
      medicareCountQuery = medicareCountQuery.eq('assigned_agent_id', totalCountAgentId)
      nonMedicareCountQuery = nonMedicareCountQuery.eq('assigned_agent_id', totalCountAgentId)
    }

    const [allResult, medicareResult, nonMedicareResult] = await Promise.all([
      allCountQuery,
      medicareCountQuery,
      nonMedicareCountQuery
    ])

    totalClientCount = allResult.count || 0
    totalMedicareCount = medicareResult.count || 0
    totalNonMedicareCount = nonMedicareResult.count || 0
    totalCountError = allResult.error?.message || medicareResult.error?.message || nonMedicareResult.error?.message || ''
  }

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

      // Defense in depth in addition to database RLS. Managers alone may omit
      // the agent filter or intentionally choose another agent's book.
      if (!canFilterByAgent) query = query.eq('assigned_agent_id', userId)
      else if (selectedAgent) query = query.eq('assigned_agent_id', selectedAgent)

      if (sort === 'first_name') {
        query = query.order('first_name', { ascending: true, nullsFirst: false }).order('last_name', { ascending: true, nullsFirst: false })
      } else if (sort === 'county') {
        query = query.order('county', { ascending: true, nullsFirst: false }).order('last_name', { ascending: true, nullsFirst: false }).order('first_name', { ascending: true, nullsFirst: false })
      } else {
        query = query.order('last_name', { ascending: true, nullsFirst: false }).order('first_name', { ascending: true, nullsFirst: false })
      }

      if (!showAll && q) {
        const searchTerms = q
          .replace(/[,%()]/g, ' ')
          .split(/\s+/)
          .map((term) => term.trim())
          .filter(Boolean)
          .slice(0, 8)

        for (const term of searchTerms) {
          query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`)
        }
      }
      if (!showAll && product === 'medicare') query = query.eq('is_medicare', true)
      if (!showAll && product === 'life') query = query.eq('is_life', true)
      if (!showAll && product === 'retirement') query = query.eq('is_retirement', true)
      if (!showAll && product === 'life_medicare') query = query.eq('is_life', true).eq('is_medicare', true)
      if (!showAll && product === 'non_life') query = query.eq('is_life', false)
      if (!showAll && product === 'non_medicare') query = query.eq('is_medicare', false)
      if (!showAll && product === 'non_life_non_medicare') query = query.eq('is_life', false).eq('is_medicare', false)
      if (!showAll && healthClientIds) query = query.in('id', healthClientIds)
      if (!showAll && turn65) {
        const birthYear = getCentralTodayParts().year - 65
        query = query.gte('date_of_birth', `${birthYear}-01-01`).lte('date_of_birth', `${birthYear}-12-31`)
      }
      if (!showAll && age65plus) {
        query = query.lte('date_of_birth', getAgeCutoffDate(65))
      }

      if (showAll) {
        const from = (page - 1) * pageSize
        query = query.range(from, from + pageSize - 1)
      } else {
        query = query.limit(250)
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

  const age65PlusParams = new URLSearchParams({ age65plus: '1' })
  if (selectedAgent) age65PlusParams.set('agent', selectedAgent)
  if (selectedHealthCompany) age65PlusParams.set('health_company', selectedHealthCompany)
  if (sort !== 'last_name') age65PlusParams.set('sort', sort)
  const age65PlusHref = `/clients?${age65PlusParams.toString()}`

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'end', flexWrap: 'wrap' }}>
        <div className="clients-page-heading"><h1>CLIENT RECORDS</h1><p className="subtle">Search, filter, sort, select, export, or manage clients from one screen.</p></div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link prefetch={false} href="/clients/new" className="btn btn-primary">+ NEW CLIENT</Link>
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
          <option value="non_life_non_medicare">Non-Life + Non-Medicare</option>
        </select>

        <select className="select" name="sort" defaultValue={sort} style={{ width: 190 }} aria-label="Sort clients">
          <option value="last_name">Last name A-Z</option>
          <option value="first_name">First name A-Z</option>
          <option value="county">County A-Z</option>
        </select>

        <button className="btn btn-primary" type="submit">Search</button>
        <Link prefetch={false} className="btn btn-secondary" href={turn65Href}>T-65</Link>
        <Link prefetch={false} className="btn btn-secondary" href={age65PlusHref}>65+</Link>
        <Link prefetch={false} className="btn btn-secondary" href="/clients">Clear</Link>
      </form>

      {canFilterByAgent ? (
        <div className="notice" style={{ marginBottom: 14 }}>
          <strong>Agent view:</strong> {selectedAgent ? agentNames[selectedAgent] || 'Selected agent' : 'All agents'}
          {selectedHealthCompany ? <> &nbsp;•&nbsp; <strong>Health plan:</strong> {selectedHealthCompany}</> : null}
          <> &nbsp;•&nbsp; <strong>Sort:</strong> {sort === 'first_name' ? 'First name A-Z' : sort === 'county' ? 'County A-Z' : 'Last name A-Z'}</>
        </div>
      ) : null}

      {!totalCountError ? (
        <>
          <div className="clients-stat-grid">
            <div className="card clients-stat-card">
              <div className="clients-stat-label">Total clients</div>
              <div className="clients-stat-value">{totalClientCount}</div>
              <div style={{ marginTop: 6 }}>
                {canFilterByAgent
                  ? selectedAgent
                    ? `${agentNames[selectedAgent] || 'This agent'} has ${totalClientCount} client${totalClientCount === 1 ? '' : 's'} in total.`
                    : `Your agency has ${totalClientCount} client${totalClientCount === 1 ? '' : 's'} in total.`
                  : `You have ${totalClientCount} client${totalClientCount === 1 ? '' : 's'} in total.`}
              </div>
            </div>
            <div className="card clients-stat-card medicare">
              <div className="clients-stat-label">Medicare clients</div>
              <div className="clients-stat-value">{totalMedicareCount}</div>
              <div style={{ marginTop: 6 }}>Marked as Medicare.</div>
            </div>
            <div className="card clients-stat-card non-medicare">
              <div className="clients-stat-label">Non-Medicare clients</div>
              <div className="clients-stat-value">{totalNonMedicareCount}</div>
              <div style={{ marginTop: 6 }}>Not marked as Medicare.</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <Link
              prefetch={false}
              className="btn btn-secondary"
              href={`/clients?${new URLSearchParams({
                show_all: '1',
                ...(selectedAgent ? { agent: selectedAgent } : {}),
                ...(sort !== 'last_name' ? { sort } : {})
              }).toString()}`}
            >
              Show All
            </Link>
            {showAll ? <span className="subtle" style={{ alignSelf: 'center' }}>Showing 50 clients per page.</span> : null}
          </div>
        </>
      ) : null}

      {!shouldSearch ? (
        <section className="card">
          <div className="empty"><strong>No clients are loaded by default.</strong><br />Search above, choose a filter, choose a sort order and press Search, or use the T-65 or 65+ button.</div>
        </section>
      ) : (
        <ClientsResults
          key={`${q}|${product}|${turn65 ? '1' : '0'}|${age65plus ? '1' : '0'}|${selectedAgent}|${selectedHealthCompany}|${sort}|${showAll ? 'all' : 'filtered'}|${page}`}
          clients={clients}
          agentNames={agentNames}
          filters={{ q, product, turn65, agent: selectedAgent }}
          errorMessage={errorMessage}
          canBulkDelete={canBulkDelete}
          pagination={showAll ? {
            page,
            pageSize,
            total: totalClientCount,
            baseParams: {
              show_all: '1',
              ...(selectedAgent ? { agent: selectedAgent } : {}),
              ...(sort !== 'last_name' ? { sort } : {})
            }
          } : null}
        />
      )}
    </>
  )
}
