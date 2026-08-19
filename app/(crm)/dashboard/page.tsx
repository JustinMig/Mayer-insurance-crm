import { redirect } from 'next/navigation'
import { getCrmSession } from '@/lib/crm-session'
import CompanyDirectory from './CompanyDirectory'
import BuildChartLookup from './BuildChartLookup'
import DashboardCalendar from './DashboardCalendar'
import { COMPANY_CONTACTS } from '@/lib/company-contacts'

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
  selectedMonthPremium: number
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

  if (premiumRollupResult.error) throw new Error(`Unable to load Life Insurance premium totals: ${premiumRollupResult.error.message}`)
  if (clientStatsResult.error) throw new Error(`Unable to load dashboard client totals: ${clientStatsResult.error.message}`)

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
    let selectedMonthPremium = 0
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
      const rowMonth = Number(row.effective_month) - 1

      if (rowYear === currentYear && rowMonth === currentMonth) currentMonthPremium += amount

      if (isIsaiahPortal) {
        if (rowYear === selectedPremiumYear) {
          currentYearPremium += amount
          if (rowMonth === selectedPremiumMonth) selectedMonthPremium += amount
        }
      } else if (rowYear === currentYear) {
        currentYearPremium += amount
      }
    }

    return {
      agentId: agent.id,
      agentName: agent.full_name || 'Agent',
      totalClients,
      medicareClients,
      lifeClients,
      turning65,
      currentMonthPremium,
      selectedMonthPremium,
      currentYearPremium
    }
  })

  return (
    <>
      <div className="clients-page-heading">
        <h1>Dashboard</h1>
        <p className="subtle">Your client database at a glance.</p>
      </div>

      <DashboardCalendar agents={targetAgents} viewerName={currentProfile.full_name || ''} />

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
                <div className="dashboard-agent-stat premium dashboard-premium-combined">
                  <div><span>Monthly Premium · {monthNames[currentMonth]}</span><strong>{money(agent.currentMonthPremium)}</strong></div>
                  <div className="dashboard-premium-divider"><span>Yearly Total · {currentYear}</span><strong>{money(agent.currentYearPremium)}</strong></div>
                </div>
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
          <div className="card card-pad stat dashboard-monthly-premium-stat dashboard-premium-combined">
            <div><span>Monthly Premium · {monthNames[currentMonth]} {currentYear}</span><strong>{money(dashboardStats[0]?.currentMonthPremium || 0)}</strong></div>
            <div className="dashboard-premium-divider"><span>Yearly Total · {currentYear}</span><strong>{money(dashboardStats[0]?.currentYearPremium || 0)}</strong></div>
          </div>
        </section>
      )}

      {isIsaiahPortal && !isManager ? (
        <section className="dashboard-premium-grid isaiah-premium-tools" style={{ marginTop: 20 }}>
          <form method="get" className="card card-pad premium-period-card isaiah-premium-history-card">
            <div>
              <span className="premium-card-label">Premium Sales History</span>
              <p className="subtle" style={{ margin: '5px 0 0' }}>Choose a month and year. The selected period stays in this box.</p>
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

            <div className="isaiah-premium-inline-results">
              <div>
                <span className="premium-card-label">{monthNames[selectedPremiumMonth]} {selectedPremiumYear} Monthly Premium</span>
                <strong className="premium-total-value">{money(dashboardStats[0]?.selectedMonthPremium || 0)}</strong>
              </div>
              <div>
                <span className="premium-card-label">Annualized Premium · {selectedPremiumYear}</span>
                <strong className="premium-total-value">{money((dashboardStats[0]?.currentYearPremium || 0) * 12)}</strong>
                <p className="subtle" style={{ margin: '6px 0 0' }}>{money(dashboardStats[0]?.currentYearPremium || 0)} monthly premium sold in {selectedPremiumYear} × 12.</p>
              </div>
            </div>
          </form>
        </section>
      ) : null}

      <CompanyDirectory contacts={COMPANY_CONTACTS} />
      <BuildChartLookup />

      <style>{`
        .dashboard-premium-combined{background:#18324a!important;border-color:#18324a!important;color:#fff!important;display:grid!important;gap:12px!important}
        .dashboard-premium-combined span,.dashboard-premium-combined strong{color:#fff!important}
        .dashboard-premium-combined>div{display:grid;gap:4px}
        .dashboard-premium-divider{border-top:1px solid rgba(255,255,255,.28);padding-top:12px}
        .dashboard-premium-combined strong{font-size:1.3rem}
      `}</style>
    </>
  )
}
