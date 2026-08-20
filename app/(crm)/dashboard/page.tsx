import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCrmSession } from '@/lib/crm-session'
import CompanyDirectory from './CompanyDirectory'
import BuildChartLookup from './BuildChartLookup'
import DashboardCalendar from './DashboardCalendar'
import DashboardNotes from './DashboardNotes'
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
  const canBackupCrm = currentProfile.role === 'admin'
  const viewerName = currentProfile.full_name?.trim().toLowerCase() || ''
  const isJustinPortal = viewerName === 'justin mayer'
  const isIsaiahPortal = viewerName === 'isaiah hernandez'
  const isCalendarCoordinator = isManager && !['justin mayer', 'isaiah hernandez'].includes(viewerName)
  const params = searchParams ? await searchParams : {}
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const requestedYear = Number(Array.isArray(params.premium_year) ? params.premium_year[0] : params.premium_year)
  const requestedMonth = Number(Array.isArray(params.premium_month) ? params.premium_month[0] : params.premium_month)
  const requestedCalendarAgent = String(Array.isArray(params.calendar_agent) ? params.calendar_agent[0] : params.calendar_agent || '')
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

  const calendarAvailableAgents = isJustinPortal
    ? targetAgents.filter((agent) => agent.full_name.trim().toLowerCase() === 'justin mayer')
    : targetAgents.filter((agent) => agent.full_name.trim().toLowerCase() !== 'justin mayer')

  let calendarAgents = calendarAvailableAgents
  let activeCalendarAgentId = calendarAvailableAgents[0]?.id || ''

  if (isCalendarCoordinator && calendarAvailableAgents.length) {
    const selectedAgent = calendarAvailableAgents.find((agent) => agent.id === requestedCalendarAgent) || calendarAvailableAgents[0]
    activeCalendarAgentId = selectedAgent.id
    calendarAgents = [selectedAgent]

    if (requestedCalendarAgent !== selectedAgent.id) {
      redirect(`/dashboard?calendar_agent=${encodeURIComponent(selectedAgent.id)}`)
    }
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

      {isCalendarCoordinator && calendarAvailableAgents.length > 1 ? (
        <div className="dashboard-calendar-agent-switcher" aria-label="Choose agent calendar">
          {calendarAvailableAgents.map((agent) => {
            const active = agent.id === activeCalendarAgentId
            const firstName = agent.full_name.split(' ')[0]
            return (
              <a
                key={agent.id}
                href={`/dashboard?calendar_agent=${encodeURIComponent(agent.id)}`}
                className={`dashboard-calendar-agent-button ${active ? 'active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {firstName}
              </a>
            )
          })}
        </div>
      ) : null}

      <div className={isCalendarCoordinator ? 'dashboard-calendar-coordinator-view' : undefined}>
        <DashboardCalendar agents={calendarAgents} viewerName={currentProfile.full_name || ''} />
      </div>

      {isJustinPortal ? (
        <>
          <DashboardNotes />
          <Link prefetch={false} href="/fex-quotes" className="dashboard-home-nav-tab dashboard-fex-home-tab">
            <span>FEX QUOTES</span>
            <span className="dashboard-home-nav-meta">Open final expense quoter <b>→</b></span>
          </Link>
        </>
      ) : null}

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

      {canBackupCrm ? (
        <Link prefetch={false} href="/backup" className="dashboard-home-nav-tab dashboard-backup-home-tab">
          <span>CRM BACKUP</span>
          <span className="dashboard-home-nav-meta">Open Google Drive backup screen <b>→</b></span>
        </Link>
      ) : null}

      <style>{`
        .dashboard-premium-combined{background:#18324a!important;border-color:#18324a!important;color:#fff!important;display:grid!important;gap:12px!important}
        .dashboard-premium-combined span,.dashboard-premium-combined strong{color:#fff!important}
        .dashboard-premium-combined>div{display:grid;gap:4px}
        .dashboard-premium-divider{border-top:1px solid rgba(255,255,255,.28);padding-top:12px}
        .dashboard-premium-combined strong{font-size:1.3rem}
        .dashboard-calendar-agent-switcher{display:grid;grid-template-columns:1fr 1fr;gap:8px;max-width:430px;margin:18px 0 -8px;position:relative;z-index:2}
        .dashboard-calendar-agent-button{display:flex;align-items:center;justify-content:center;min-height:42px;border:1px solid #cbd5e1;border-radius:11px;background:#f8fafc;color:#334155;font-weight:900;text-decoration:none;box-shadow:0 1px 2px rgba(15,23,42,.04)}
        .dashboard-calendar-agent-button.active{background:#18324a;border-color:#18324a;color:#fff;box-shadow:0 4px 12px rgba(24,50,74,.2)}
        .dashboard-calendar-agent-button:active{transform:translateY(1px)}
        .dashboard-calendar-coordinator-view .dashboard-calendar-legend{display:none!important}
        .dashboard-home-nav-tab{width:100%;min-height:50px;margin-top:10px;border:1px solid #cbd5e1;border-radius:13px;background:#18324a;color:#fff;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-weight:900;letter-spacing:.025em;text-align:left;text-decoration:none;box-shadow:0 2px 8px rgba(15,23,42,.08)}
        .dashboard-home-nav-tab:hover{filter:brightness(.97);color:#fff}
        .dashboard-home-nav-meta{display:flex;align-items:center;gap:10px;font-size:.76rem;letter-spacing:0;color:#dbe7f1;font-weight:800}
        .dashboard-home-nav-meta b{display:grid;place-items:center;min-width:24px;height:24px;padding:0 6px;border-radius:999px;background:rgba(255,255,255,.16);font-size:.9rem;color:#fff}
        .dashboard-fex-home-tab{margin-top:10px;background:#b4232f;border-color:#991f28;box-shadow:0 3px 10px rgba(180,35,47,.18)}
        .dashboard-fex-home-tab .dashboard-home-nav-meta{color:#ffe4e6}
        .dashboard-backup-home-tab{margin-top:22px;background:#05070a;border-color:#101827;color:#5aa9ff;box-shadow:0 3px 12px rgba(2,6,23,.22)}
        .dashboard-backup-home-tab:hover{background:#000;color:#76b9ff}
        .dashboard-backup-home-tab .dashboard-home-nav-meta{color:#5aa9ff}
        .dashboard-backup-home-tab .dashboard-home-nav-meta b{background:rgba(59,130,246,.18);color:#5aa9ff}
        @media(max-width:720px){
          .dashboard-calendar-agent-switcher{max-width:none;margin-top:14px}.dashboard-calendar-agent-button{min-height:44px}
          .dashboard-home-nav-tab{padding:11px 12px}.dashboard-home-nav-meta{font-size:.72rem}
        }
      `}</style>
    </>
  )
}
