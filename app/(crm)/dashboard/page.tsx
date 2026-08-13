import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCrmSession } from '@/lib/crm-session'
import CompanyDirectory from './CompanyDirectory'
import BuildChartLookup from './BuildChartLookup'
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

export default async function DashboardPage() {
  const { supabase, userId, profile: currentProfile } = await getCrmSession()
  if (!currentProfile?.agency_id) redirect('/account-setup')

  const isManager = currentProfile.role === 'manager'
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
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

  const premiumRollupResult = await supabase
    .from('life_premium_dashboard_rollup')
    .select('assigned_agent_id,effective_month,premium_total')
    .eq('effective_year', currentYear)

  if (premiumRollupResult.error) {
    throw new Error(`Unable to load Life Insurance premium totals: ${premiumRollupResult.error.message}`)
  }

  const premiumRows = (premiumRollupResult.data || []) as PremiumRollupRow[]

  const dashboardStats = await Promise.all(targetAgents.map(async (agent): Promise<AgentDashboardStats> => {
    const [clients, medicare, life, turn65] = await Promise.all([
      supabase.from('clients').select('*', { count: 'exact', head: true }).eq('assigned_agent_id', agent.id),
      supabase.from('clients').select('*', { count: 'exact', head: true }).eq('assigned_agent_id', agent.id).eq('is_medicare', true),
      supabase.from('clients').select('*', { count: 'exact', head: true }).eq('assigned_agent_id', agent.id).eq('is_life', true),
      supabase.from('clients').select('*', { count: 'exact', head: true }).eq('assigned_agent_id', agent.id).gte('date_of_birth', `${turn65Year}-01-01`).lte('date_of_birth', `${turn65Year}-12-31`)
    ])

    const clientErrors = [clients.error, medicare.error, life.error, turn65.error].filter(Boolean)
    if (clientErrors.length) throw new Error(`Unable to load dashboard client totals: ${clientErrors[0]?.message}`)

    let currentMonthPremium = 0
    let currentYearPremium = 0

    for (const row of premiumRows) {
      if (row.assigned_agent_id !== agent.id) continue
      const amount = numeric(row.premium_total)
      currentYearPremium += amount
      if (Number(row.effective_month) - 1 === currentMonth) currentMonthPremium += amount
    }

    return {
      agentId: agent.id,
      agentName: agent.full_name || 'Agent',
      totalClients: clients.count || 0,
      medicareClients: medicare.count || 0,
      lifeClients: life.count || 0,
      turning65: turn65.count || 0,
      currentMonthPremium,
      currentYearPremium
    }
  }))

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
          <div className="card card-pad stat dashboard-monthly-premium-stat"><span>Monthly Premium · {monthNames[currentMonth]}</span><strong>{money(dashboardStats[0]?.currentMonthPremium || 0)}</strong></div>
        </section>
      )}

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

      <CompanyDirectory contacts={COMPANY_CONTACTS} />

      <BuildChartLookup />

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
