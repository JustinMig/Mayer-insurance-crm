import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function money(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)
}

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

export default async function DashboardPage() {
  const supabase = await createClient()
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const turn65Year = currentYear - 65

  const [clients, medicare, life, turn65, lifePremiumRows] = await Promise.all([
    supabase.from('clients').select('*', { count: 'exact', head: true }),
    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('is_medicare', true),
    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('is_life', true),
    supabase.from('clients').select('*', { count: 'exact', head: true }).gte('date_of_birth', `${turn65Year}-01-01`).lte('date_of_birth', `${turn65Year}-12-31`),
    supabase.from('client_life_insurance').select('premium_amount,effective_date')
  ])

  const premiumRows = lifePremiumRows.data || []
  const totalLifePremium = premiumRows.reduce((sum, row) => {
    const amount = Number(row.premium_amount || 0)
    return sum + (Number.isFinite(amount) ? amount : 0)
  }, 0)

  const monthlyPremiums = Array.from({ length: 12 }, () => 0)
  let premiumsWithoutEffectiveDate = 0

  for (const row of premiumRows) {
    const amount = Number(row.premium_amount || 0)
    if (!Number.isFinite(amount) || amount === 0) continue

    if (!row.effective_date) {
      premiumsWithoutEffectiveDate += amount
      continue
    }

    const [yearText, monthText] = String(row.effective_date).split('-')
    const year = Number(yearText)
    const monthIndex = Number(monthText) - 1

    if (year === currentYear && monthIndex >= 0 && monthIndex <= 11) {
      monthlyPremiums[monthIndex] += amount
    }
  }

  const currentMonthPremium = monthlyPremiums[currentMonth]
  const currentYearPremium = monthlyPremiums.reduce((sum, amount) => sum + amount, 0)

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
          <span className="premium-card-label">Total Life Insurance Premium</span>
          <strong className="premium-total-value">{money(totalLifePremium)}</strong>
          <p className="subtle" style={{ margin: '8px 0 0' }}>Total of all premium amounts saved in Life Insurance.</p>
        </div>

        <div className="card card-pad premium-current-card">
          <span className="premium-card-label">{monthNames[currentMonth]} {currentYear}</span>
          <strong className="premium-current-value">{money(currentMonthPremium)}</strong>
          <p className="subtle" style={{ margin: '8px 0 0' }}>Premium for policies effective this month.</p>
        </div>
      </section>

      <section className="card card-pad" style={{ marginTop: 20 }}>
        <div className="monthly-premium-heading">
          <div>
            <h2 style={{ marginBottom: 4 }}>Life Premium by Month — {currentYear}</h2>
            <p className="subtle" style={{ margin: 0 }}>Totals are grouped by the Life Insurance policy effective date.</p>
          </div>
          <div className="year-premium-total">
            <span>Year total</span>
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
