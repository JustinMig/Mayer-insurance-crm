import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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
  effective_year: number | null
  effective_month: number | null
  policy_count: number | string | null
  premium_total: number | string | null
}

type AgentPremiumStats = {
  agentId: string
  agentName: string
  total: number
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
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) redirect('/login')

  const userId = String(claimsData.claims.sub)
  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('agency_id, full_name, role')
    .eq('id', userId)
    .maybeSingle()

  if (!currentProfile?.agency_id) throw new Error('Your CRM profile is not connected to an agency.')

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
      .select('assigned_agent_id,effective_year,effective_month,policy_count,premium_total'),
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
  const agentProfiles = ((agentProfilesResult.data || []) as AgentProfile[])
  const agentNames = new Map(agentProfiles.map((agent) => [agent.id, agent.full_name || 'Agent']))

  const monthlyPremiums = Array.from({ length: 12 }, () => 0)
  const agentTotals = new Map<string, AgentPremiumStats>()
  let totalLifePremium = 0
  let premiumsWithoutEffectiveDate = 0

  for (const agent of agentProfiles) {
    agentTotals.set(agent.id, {
      agentId: agent.id,
      agentName: agent.full_name || 'Agent',
      total: 0,
      currentMonth: 0,
      currentYear: 0
    })
  }

  for (const row of premiumRows) {
    const amount = numeric(row.premium_total)
    totalLifePremium += amount

    const agentId = row.assigned_agent_id || 'unassigned'
    if (!agentTotals.has(agentId)) {
      agentTotals.set(agentId, {
        agentId,
        agentName: row.assigned_agent_id ? (agentNames.get(row.assigned_agent_id) || 'Agent') : 'Unassigned',
        total: 0,
        currentMonth: 0,
        currentYear: 0
      })
    }

    const stats = agentTotals.get(agentId)!
    stats.total += amount

    if (!row.effective_year || !row.effective_month) {
      premiumsWithoutEffectiveDate += amount
      continue
    }

    const monthIndex = Number(row.effective_month) - 1
    if (Number(row.effective_year) === currentYear && monthIndex >= 0 && monthIndex <= 11) {
      monthlyPremiums[monthIndex] += amount
      stats.currentYear += amount
      if (monthIndex === currentMonth) stats.currentMonth += amount
    }
  }

  const currentMonthPremium = monthlyPremiums[currentMonth]
  const currentYearPremium = monthlyPremiums.reduce((sum, amount) => sum + amount, 0)

  const agentPremiumCards = Array.from(agentTotals.values())
    .filter((stats) => canSeeAllAgents || stats.agentId === userId)
    .sort((a, b) => a.agentName.localeCompare(b.agentName))

  const totalCardLabel = canSeeAllAgents
    ? 'Total Life Insurance Premium — All Agents'
    : 'Your Total Life Insurance Premium'

  const monthlyHeading = canSeeAllAgents
    ? `Life Premium by Month — All Agents — ${currentYear}`
    : `Your Life Premium by Month — ${currentYear}`

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'end', flexWrap: 'wrap' }}>
        <div><h1>Dashboard</h1><p className="subtle">Your client database at a glance.</p></div>
        <Link href="/clients/new" className="btn btn-primary">+ Add Client</Link>
      </div>

      <section className="grid grid-4" style={{ marginTop: 22 }}>
        <div className="card card-pad stat"><span>Total clients</span><strong>{clients.count || 0}</strong></div>
        <div className="card card-pad stat"><span>Medicare clients</span><strong>{medicare.count || 0}</strong></div>
        <div className="card card-pad stat"><span>Life clients</span><strong>{life.count || 0}</strong></div>
        <div className="card card-pad stat"><span>Turning 65 in {currentYear}</span><strong>{turn65.count || 0}</strong></div>
      </section>

      <section className="dashboard-premium-grid" style={{ marginTop: 20 }}>
        <div className="card card-pad premium-total-card">
          <span className="premium-card-label">{totalCardLabel}</span>
          <strong className="premium-total-value">{money(totalLifePremium)}</strong>
          <p className="subtle" style={{ margin: '8px 0 0' }}>
            {canSeeAllAgents ? 'Combined premium across every agent you are authorized to view.' : 'Premium from your assigned Life Insurance clients only.'}
          </p>
        </div>

        <div className="card card-pad premium-current-card">
          <span className="premium-card-label">{monthNames[currentMonth]} {currentYear}</span>
          <strong className="premium-current-value">{money(currentMonthPremium)}</strong>
          <p className="subtle" style={{ margin: '8px 0 0' }}>
            {canSeeAllAgents ? 'Premium for all visible policies effective this month.' : 'Premium for your policies effective this month.'}
          </p>
        </div>
      </section>

      {canSeeAllAgents ? (
        <section className="card card-pad" style={{ marginTop: 20 }}>
          <div className="agent-premium-heading">
            <div>
              <h2 style={{ marginBottom: 4 }}>Life Insurance Premium by Agent</h2>
              <p className="subtle" style={{ margin: 0 }}>Each agent is totaled separately from their assigned clients.</p>
            </div>
          </div>

          <div className="agent-premium-grid">
            {agentPremiumCards.map((agent) => (
              <div className="agent-premium-card" key={agent.agentId}>
                <span className="agent-premium-name">{agent.agentName}</span>
                <strong className="agent-premium-value">{money(agent.total)}</strong>
                <div className="agent-premium-meta">
                  <span>{monthNames[currentMonth]}: <b>{money(agent.currentMonth)}</b></span>
                  <span>{currentYear}: <b>{money(agent.currentYear)}</b></span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card card-pad" style={{ marginTop: 20 }}>
        <div className="monthly-premium-heading">
          <div>
            <h2 style={{ marginBottom: 4 }}>{monthlyHeading}</h2>
            <p className="subtle" style={{ margin: 0 }}>Totals are grouped by the Life Insurance policy effective date.</p>
          </div>
          <div className="year-premium-total">
            <span>{canSeeAllAgents ? 'Year total' : 'Your year total'}</span>
            <strong>{money(currentYearPremium)}</strong>
          </div>
        </div>

        <div className="monthly-premium-grid">
          {monthNames.map((month, index) => (
            <div key={month} className={`monthly-premium-item${index === currentMonth ? ' current' : ''}`}>
              <span>{month}</span>
              <strong>{money(monthlyPremiums[index])}</strong>
            </div>
          ))}
        </div>

        {premiumsWithoutEffectiveDate > 0 && (
          <p className="subtle" style={{ margin: '14px 0 0' }}>
            {money(premiumsWithoutEffectiveDate)} is included in the overall total but not a monthly total because those policies do not have an effective date yet.
          </p>
        )}
      </section>

      <CompanyDirectory contacts={COMPANY_CONTACTS} />

      <BuildChartLookup />

      <section className="card card-pad" style={{ marginTop: 20 }}>
        <h2>Quick actions</h2>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <Link href="/clients/new" className="btn btn-primary">Add a client</Link>
          <Link href="/clients" className="btn btn-secondary">Search clients</Link>
          <Link href="/clients?turn65=1" className="btn btn-secondary">Turn 65 list</Link>
        </div>
      </section>
    </>
  )
}
