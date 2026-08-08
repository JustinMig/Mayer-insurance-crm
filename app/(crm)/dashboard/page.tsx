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

type AgentPremiumStats = {
  agentId: string
  agentName: string
  currentMonth: number
  currentYear: number
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

  const canSeeAllAgents = currentProfile.role === 'admin' || currentProfile.role === 'manager'
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const turn65Year = currentYear - 65

  const [clients, medicare, life, turn65, premiumRollupResult, agentProfilesResult] = await Promise.all([
    supabase.from('clients').select('*', { count: 'exact', head: true }),
    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('is_medicare', true),
    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('is_life', true),
    supabase.from('clients').select('*', { count: 'exact', head: true }).gte('date_of_birth', `${turn65Year}-01-01`).lte('date_of_birth', `${turn65Year}-12-31`),
    supabase
      .from('life_premium_dashboard_rollup')
      .select('assigned_agent_id,effective_month,premium_total')
      .eq('effective_year', currentYear),
    canSeeAllAgents
      ? supabase
          .from('profiles')
          .select('id, full_name, role')
          .eq('agency_id', currentProfile.agency_id)
          .eq('active', true)
          .in('role', ['admin', 'agent'])
          .order('full_name', { ascending: true })
      : Promise.resolve({ data: [{ id: userId, full_name: currentProfile.full_name || 'Agent', role: currentProfile.role }], error: null })
  ])

  if (premiumRollupResult.error) {
    throw new Error(`Unable to load Life Insurance premium totals: ${premiumRollupResult.error.message}`)
  }

  const premiumRows = (premiumRollupResult.data || []) as PremiumRollupRow[]
  const agentProfiles = (agentProfilesResult.data || []) as AgentProfile[]
  const agentNames = new Map(agentProfiles.map((agent) => [agent.id, agent.full_name || 'Agent']))
  const agentTotals = new Map<string, AgentPremiumStats>()

  for (const agent of agentProfiles) {
    agentTotals.set(agent.id, {
      agentId: agent.id,
      agentName: agent.full_name || 'Agent',
      currentMonth: 0,
      currentYear: 0
    })
  }

  for (const row of premiumRows) {
    const agentId = row.assigned_agent_id || 'unassigned'
    if (!agentTotals.has(agentId)) {
      agentTotals.set(agentId, {
        agentId,
        agentName: row.assigned_agent_id ? (agentNames.get(row.assigned_agent_id) || 'Agent') : 'Unassigned',
        currentMonth: 0,
        currentYear: 0
      })
    }

    const stats = agentTotals.get(agentId)!
    const amount = numeric(row.premium_total)
    stats.currentYear += amount

    const monthIndex = Number(row.effective_month) - 1
    if (monthIndex === currentMonth) stats.currentMonth += amount
  }

  const allAgentPremiumCards = Array.from(agentTotals.values())
    .filter((stats) => stats.agentId !== 'unassigned')
    .sort((a, b) => a.agentName.localeCompare(b.agentName))

  const myPremiumStats = agentTotals.get(userId) || {
    agentId: userId,
    agentName: currentProfile.full_name || 'Agent',
    currentMonth: 0,
    currentYear: 0
  }

  const monthlyAgentPremiumCards = canSeeAllAgents ? allAgentPremiumCards : [myPremiumStats]

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'end', flexWrap: 'wrap' }}>
        <div><h1>Dashboard</h1><p className="subtle">Your client database at a glance.</p></div>
        <Link prefetch={false} href="/clients/new" className="btn btn-primary">+ Add Client</Link>
      </div>

      <section className="grid grid-4" style={{ marginTop: 22 }}>
        <div className="card card-pad stat"><span>Total clients</span><strong>{clients.count || 0}</strong></div>
        <div className="card card-pad stat"><span>Medicare clients</span><strong>{medicare.count || 0}</strong></div>
        <div className="card card-pad stat"><span>Life clients</span><strong>{life.count || 0}</strong></div>
        <div className="card card-pad stat"><span>Turning 65 in {currentYear}</span><strong>{turn65.count || 0}</strong></div>
      </section>

      <section className="dashboard-premium-grid" style={{ marginTop: 20 }}>
        <div className="card card-pad premium-total-card">
          <span className="premium-card-label">My Life Insurance Premium — {currentYear}</span>
          <strong className="premium-total-value">{money(myPremiumStats.currentYear)}</strong>
          <p className="subtle" style={{ margin: '8px 0 0' }}>
            Your total Life Insurance premium for policies effective in {currentYear}.
          </p>
        </div>

        <div className="card card-pad monthly-agent-premium-card">
          <div className="monthly-agent-premium-heading">
            <div>
              <span className="premium-card-label">Monthly Premium by Agent</span>
              <h2>{monthNames[currentMonth]} {currentYear}</h2>
            </div>
          </div>

          <div className="monthly-agent-premium-list">
            {monthlyAgentPremiumCards.map((agent) => (
              <div className="monthly-agent-premium-row" key={agent.agentId}>
                <span>{agent.agentId === userId ? `${agent.agentName} (Me)` : agent.agentName}</span>
                <strong>{money(agent.currentMonth)}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CompanyDirectory contacts={COMPANY_CONTACTS} />

      <BuildChartLookup />

      <section className="card card-pad" style={{ marginTop: 20 }}>
        <h2>Quick actions</h2>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <Link prefetch={false} href="/clients/new" className="btn btn-primary">Add a client</Link>
          <Link prefetch={false} href="/clients" className="btn btn-secondary">Search clients</Link>
          <Link prefetch={false} href="/clients?turn65=1" className="btn btn-secondary">Turn 65 list</Link>
        </div>
      </section>
    </>
  )
}
