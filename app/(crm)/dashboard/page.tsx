import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCrmSession } from '@/lib/crm-session'
import CompanyDirectory from './CompanyDirectory'
import BuildChartLookup from './BuildChartLookup'
import MedicalQualificationsLookup from './MedicalQualificationsLookup'
import { COMPANY_CONTACTS } from '@/lib/company-contacts'
import { MEDICAL_CARRIER_OPTIONS } from '@/lib/medical-qualifications'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type AgentProfile = {
  id: string
  full_name: string
  role: string
}

type PremiumRollupRow = {
  assigned_agent_id: string | null
  effective_year: number | null
  effective_month: number | null
  premium_total: number | string | null
}

type AgentDashboardStats = {
  agentId: string
  agentName: string
  totalClients: number
  medicareClients: number
  lifeClients: number
  turning65: number
  currentMonthPremium: number
  currentYearPremium: number
}

function money(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)
}

function numeric(value: number | string | null | undefined) {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? amount : 0
}

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, userId, profile: currentProfile } = await getCrmSession()
  if (!currentProfile?.agency_id) redirect('/account-setup')

  const isManager = currentProfile.role === 'manager'
  const isIsaiahPortal = currentProfile.full_name?.trim().toLowerCase() === 'isaiah hernandez'
  const params = searchParams ? await searchParams : {}
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const requestedYear = Number(Array.isArray(params.premium_year) ? params.premium_year[0] : params.premium_year)
  const requestedMonth = Number(Array.isArray(params.premium_month) ? params.premium_month[0] : params.premium_month)
  const selectedPremiumYear = isIsaiahPortal && Number.isInteger(requestedYear) && requestedYear >= 2020 && requestedYear <= currentYear + 1 ? requestedYear : currentYear
  const selectedPremiumMonth = isIsaiahPortal && Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12 ? requestedMonth - 1 : currentMonth
  const turn65Year = currentYear - 65

  let targetAgents: AgentProfile[] = []

  if (isManager) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('agency_id', currentProfile.agency_id)
      .eq('active', true)
      .in('role', ['admin', 'agent'])
      .order('full_name', { ascending: true })

    if (error) throw new Error(`Unable to load dashboard agents: ${error.message}`)

    targetAgents = ((data || []) as AgentProfile[]).filter((agent) =>
      ['justin mayer', 'isaiah hernandez'].includes(agent.full_name.trim().toLowerCase())
    )
  } else {
    targetAgents = [{
      id: userId,
      full_name: currentProfile.full_name || 'Agent',
      role: currentProfile.role
    }]
  }

  const targetAgentIds = targetAgents.map((agent) => agent.id)

  const premiumQuery = supabase
    .from('life_premium_dashboard_rollup')
    .select('assigned_agent_id,effective_year,effective_month,premium_total')

  if (!isIsaiahPortal) premiumQuery.eq('effective_year', currentYear)
  if (isIsaiahPortal) premiumQuery.eq('assigned_agent_id', userId)

  const [premiumRollupResult, clientStatsResult] = await Promise.all([
    premiumQuery,
    targetAgentIds.length
      ? supabase
          .from('clients')
          .select('assigned_agent_id,is_medicare,is_life,date_of_birth')
          .in('assigned_agent_id', targetAgentIds)
      : Promise.resolve({ data: [], error: null })
  ])

  if (premiumRollupResult.error) {
    throw new Error(`Unable to load Life Insurance premium totals: ${premiumRollupResult.error.message}`)
  }
  if (clientStatsResult.error) {
    throw new Error(`Unable to load dashboard client totals: ${clientStatsResult.error.message}`)
  }

  const premiumRows = (premiumRollupResult.data || []) as PremiumRollupRow[]
  const clientRows = (clientStatsResult.data || []) as Array<{
    assigned_agent_id: string | null
    is_medicare: boolean | null
    is_life: boolean | null
    date_of_birth: string | null
  }>

  const dashboardStats = targetAgents.map((agent): AgentDashboardStats => {
    let totalClients = 0
    let medicareClients = 0
    let lifeClients = 0
    let turning65 = 0
    let currentMonthPremium = 0
    let currentYearPremium = 0

    for (const client of clientRows) {
      if (client.assigned_agent_id !== agent.id) continue
      totalClients += 1
      if (client.is_medicare) medicareClients += 1
      if (client.is_life) lifeClients += 1
      if (client.date_of_birth?.startsWith(`${turn65Year}-`)) turning65 += 1
    }

    for (const row of premiumRows) {
      if (row.assigned_agent_id !== agent.id) continue
      const amount = numeric(row.premium_total)
      const rowYear = Number(row.effective_year || currentYear)
      const targetYear = isIsaiahPortal ? selectedPremiumYear : currentYear
      const targetMonth = isIsaiahPortal ? selectedPremiumMonth : currentMonth
      if (rowYear !== targetYear) continue
      currentYearPremium += amount
      if (Number(row.effective_month) - 1 === targetMonth) currentMonthPremium += amount
    }

    return {
      agentId: agent.id,
      agentName: agent.full_name || 'Agent',
      totalClients,
      medicareClients,
      lifeClients,
      turning65,
      currentMonthPremium,
      currentYearPremium
    }
  })

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'end', flexWrap: 'wrap' }}>
        <div className="clients-page-heading"><h1>Dashboard</h1><p className="subtle">Your client database at a glance.</p></div>
        <Link prefetch={false} href="/clients/new" className="btn btn-primary">+ NEW CLIENT</Link>
      </div>

      {isManager ? (
        <section className="dashboard-agent-split" style={{ marginTop: 22 }}>
          {dashboardStats.map((agent) => (
            <div className="card card-pad dashboard-agent-panel" key={agent.agentId}>
              <div className="dashboard-agent-title">{agent.agentName}</div>
              <div className="dashboard-agent-stat-grid">
                <div className="dashboard-agent-stat"><span>Total Clients</span><strong>{agent.totalClients}</strong></div>
                <div className="dashboard-agent-stat"><span>Medicare Clients</span><strong>{agent.medicareClients}</strong></div>
                <div className="dashboard-agent-stat"><span>Life Clients</span><strong>{agent.lifeClients}</strong></div>
                <div className="dashboard-agent-stat"><span>Turning 65 in {currentYear}</span><strong>{agent.turning65}</strong></div>
                <div className="dashboard-agent-stat premium"><span>Monthly Premium · {monthNames[currentMonth]}</span><strong>{money(agent.currentMonthPremium)}</strong></div>
              </div>
            </div>
          ))}
        </section>
      ) : (
        <section className="grid grid-5 dashboard-personal-stats" style={{ marginTop: 22 }}>
          <div className="card card-pad stat"><span>Total Clients</span><strong>{dashboardStats[0]?.totalClients || 0}</strong></div>
          <div className="card card-pad stat"><span>Medicare Clients</span><strong>{dashboardStats[0]?.medicareClients || 0}</strong></div>
          <div className="card card-pad stat"><span>Life Clients</span><strong>{dashboardStats[0]?.lifeClients || 0}</strong></div>
          <div className="card card-pad stat"><span>Turning 65 in {currentYear}</span><strong>{dashboardStats[0]?.turning65 || 0}</strong></div>
          <div className="card card-pad stat dashboard-monthly-premium-stat"><span>Monthly Premium · {monthNames[isIsaiahPortal ? selectedPremiumMonth : currentMonth]} {isIsaiahPortal ? selectedPremiumYear : ''}</span><strong>{money(dashboardStats[0]?.currentMonthPremium || 0)}</strong></div>
        </section>
      )}

      {isIsaiahPortal && !isManager ? (
        <section className="dashboard-premium-grid isaiah-premium-tools" style={{ marginTop: 20 }}>
          <form method="get" className="card card-pad premium-period-card">
            <div>
              <span className="premium-card-label">Premium Sales Period</span>
              <p className="subtle" style={{ margin: '5px 0 0' }}>Choose a month and year to review what was sold.</p>
            </div>
            <div className="premium-period-controls">
              <select name="premium_month" defaultValue={String(selectedPremiumMonth + 1)} aria-label="Premium month">
                {monthNames.map((month, index) => <option value={index + 1} key={month}>{month}</option>)}
              </select>
              <select name="premium_year" defaultValue={String(selectedPremiumYear)} aria-label="Premium year">
                {Array.from({ length: 7 }, (_, index) => currentYear + 1 - index).map((year) => <option value={year} key={year}>{year}</option>)}
              </select>
              <button className="btn btn-primary" type="submit">View</button>
            </div>
          </form>

          <div className="isaiah-premium-summary">
            <div className="card card-pad premium-total-card">
              <span className="premium-card-label">Monthly Premium Sold · {monthNames[selectedPremiumMonth]} {selectedPremiumYear}</span>
              <strong className="premium-total-value">{money(dashboardStats[0]?.currentMonthPremium || 0)}</strong>
              <p className="subtle" style={{ margin: '8px 0 0' }}>Monthly premium on Life Insurance policies effective in the selected month.</p>
            </div>
            <div className="card card-pad premium-total-card annualized-premium-card">
              <span className="premium-card-label">Annualized Premium · {selectedPremiumYear}</span>
              <strong className="premium-total-value">{money((dashboardStats[0]?.currentYearPremium || 0) * 12)}</strong>
              <p className="subtle" style={{ margin: '8px 0 0' }}>Monthly premium sold in {selectedPremiumYear}: {money(dashboardStats[0]?.currentYearPremium || 0)} × 12.</p>
            </div>
          </div>
        </section>
      ) : (
        <section className="dashboard-premium-grid" style={{ marginTop: 20 }}>
          <div style={{ display: 'grid', gap: 14 }}>
            {dashboardStats.map((agent) => (
              <div className="card card-pad premium-total-card" key={agent.agentId}>
                <span className="premium-card-label">{isManager ? `${agent.agentName} — Life Insurance Premium` : 'My Life Insurance Premium'} — {currentYear}</span>
                <strong className="premium-total-value">{money(agent.currentYearPremium)}</strong>
                <p className="subtle" style={{ margin: '8px 0 0' }}>
                  {isManager ? `${agent.agentName}'s` : 'Your'} total Life Insurance premium for policies effective in {currentYear}.
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <CompanyDirectory contacts={COMPANY_CONTACTS} />

      <BuildChartLookup />

      <MedicalQualificationsLookup carrierOptions={MEDICAL_CARRIER_OPTIONS} />

      <section className="card card-pad" style={{ marginTop: 20 }}>
        <h2>Quick actions</h2>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <Link prefetch={false} href="/clients/new" className="btn btn-primary">NEW CLIENT</Link>
          <Link prefetch={false} href="/clients" className="btn btn-secondary">CLIENT RECORDS</Link>
          <Link prefetch={false} href="/clients?turn65=1" className="btn btn-secondary">Turn 65 list</Link>
        </div>
      </section>
    </>
  )
}
