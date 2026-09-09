import { getCrmSession } from '@/lib/crm-session'

type CommissionEvent = {
  election_period: 'AEP' | 'OEP' | 'SEP' | 'IEP/T65'
  compensation_type: 'initial' | 'switch'
  likely_t65: boolean
  effective_date: string
  contract_year: number
}

type CommissionRates = {
  initial: number
  renewal: number
}

const CMS_MA_RATES: Record<number, CommissionRates> = {
  2026: { initial: 694, renewal: 347 },
  2027: { initial: 725, renewal: 363 }
}

function money(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)
}

function contractYearForSeason(now: Date) {
  const year = now.getFullYear()
  const month = now.getMonth()
  return month >= 5 ? year + 1 : year
}

function monthsEnrolledInYear(effectiveDate: string) {
  const match = String(effectiveDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return 0
  const month = Number(match[2])
  if (!Number.isInteger(month) || month < 1 || month > 12) return 0
  return 13 - month
}

function eventCommission(event: CommissionEvent, rates: CommissionRates) {
  const annualRate = event.compensation_type === 'initial' ? rates.initial : rates.renewal
  const months = monthsEnrolledInYear(event.effective_date)
  return annualRate * (months / 12)
}

function summarize(events: CommissionEvent[], period: CommissionEvent['election_period'], rates: CommissionRates) {
  const rows = events.filter((event) => event.election_period === period)
  const initial = rows.filter((event) => event.compensation_type === 'initial').length
  const switches = rows.filter((event) => event.compensation_type === 'switch').length
  const t65 = rows.filter((event) => event.likely_t65).length
  const payout = rows.reduce((sum, event) => sum + eventCommission(event, rates), 0)
  return { total: rows.length, initial, switches, t65, payout }
}

export default async function JustinMedicareCommissionCard() {
  const { supabase, userId, profile } = await getCrmSession()
  if (!profile?.agency_id || profile.full_name?.trim().toLowerCase() !== 'justin mayer') return null

  const now = new Date()
  const contractYear = contractYearForSeason(now)
  const rates = CMS_MA_RATES[contractYear] || CMS_MA_RATES[2027]

  const { data: medicareClients, error: clientsError } = await supabase
    .from('clients')
    .select('id')
    .eq('assigned_agent_id', userId)
    .eq('is_medicare', true)
    .eq('is_deceased', false)

  if (clientsError) throw new Error(`Unable to load Medicare commission clients: ${clientsError.message}`)

  const clientIds = (medicareClients || []).map((row) => String(row.id))
  const [healthPlansResult, eventsResult] = await Promise.all([
    clientIds.length
      ? supabase
          .from('client_health_plan_info')
          .select('client_id,company_name,plan_id,effective_date')
          .in('client_id', clientIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('medicare_commission_events')
      .select('election_period,compensation_type,likely_t65,effective_date,contract_year')
      .eq('assigned_agent_id', userId)
      .eq('contract_year', contractYear)
  ])

  if (healthPlansResult.error) throw new Error(`Unable to load Medicare plans: ${healthPlansResult.error.message}`)
  if (eventsResult.error) throw new Error(`Unable to load Medicare commission tracking: ${eventsResult.error.message}`)

  const currentBookCount = (healthPlansResult.data || []).filter((row) => {
    const company = String(row.company_name || '').trim().toLowerCase()
    if (!company) return false
    return !company.includes('original medicare')
  }).length

  const events = (eventsResult.data || []) as CommissionEvent[]
  const aep = summarize(events, 'AEP', rates)
  const oep = summarize(events, 'OEP', rates)
  const sep = summarize(events, 'SEP', rates)
  const t65 = summarize(events, 'IEP/T65', rates)

  const retainedAnnual = currentBookCount * rates.renewal
  const retainedMonthly = retainedAnnual / 12
  const aepJanuaryEstimate = aep.payout

  return (
    <section className="card card-pad justin-medicare-commission-card" aria-label="Medicare commission totals">
      <div className="justin-medicare-commission-head">
        <div>
          <span className="justin-medicare-eyebrow">MISSISSIPPI · CMS MAXIMUM ESTIMATE</span>
          <h2>Medicare Commissions · {contractYear}</h2>
          <p>Tracks AEP, OEP, SEP and T65/new-to-Medicare production from the CRM.</p>
        </div>
        <div className="justin-medicare-rate-badge">{contractYear}</div>
      </div>

      <div className="justin-medicare-rate-grid">
        <div><span>New / T65 Initial</span><strong>{money(rates.initial)}</strong></div>
        <div><span>MA → MA Switch</span><strong>{money(rates.renewal)}</strong></div>
        <div><span>Renewal Monthly Eq.</span><strong>{money(rates.renewal / 12)}</strong></div>
      </div>

      <div className="justin-medicare-book">
        <div>
          <span>Current Medicare Book</span>
          <strong>{currentBookCount} clients</strong>
        </div>
        <div>
          <span>{contractYear} Monthly Renewal Equivalent</span>
          <strong>{money(retainedMonthly)}</strong>
        </div>
        <div>
          <span>{contractYear} Annual Renewal Value</span>
          <strong>{money(retainedAnnual)}</strong>
        </div>
      </div>

      <div className="justin-medicare-period-grid">
        <article className="justin-medicare-period aep">
          <header><strong>AEP</strong><span>→ January {contractYear}</span></header>
          <div className="justin-medicare-mini"><span>New / T65</span><b>{aep.initial}</b></div>
          <div className="justin-medicare-mini"><span>Switches</span><b>{aep.switches}</b></div>
          <div className="justin-medicare-period-total"><span>Projected January</span><strong>{money(aepJanuaryEstimate)}</strong></div>
        </article>

        <article className="justin-medicare-period">
          <header><strong>OEP</strong><span>{contractYear}</span></header>
          <div className="justin-medicare-mini"><span>New / T65</span><b>{oep.initial}</b></div>
          <div className="justin-medicare-mini"><span>Switches</span><b>{oep.switches}</b></div>
          <div className="justin-medicare-period-total"><span>Prorated Est.</span><strong>{money(oep.payout)}</strong></div>
        </article>

        <article className="justin-medicare-period">
          <header><strong>SEP</strong><span>{contractYear}</span></header>
          <div className="justin-medicare-mini"><span>New / T65</span><b>{sep.initial}</b></div>
          <div className="justin-medicare-mini"><span>Switches</span><b>{sep.switches}</b></div>
          <div className="justin-medicare-period-total"><span>Prorated Est.</span><strong>{money(sep.payout)}</strong></div>
        </article>

        <article className="justin-medicare-period">
          <header><strong>T65 / IEP</strong><span>{contractYear}</span></header>
          <div className="justin-medicare-mini"><span>T65 Clients</span><b>{t65.t65}</b></div>
          <div className="justin-medicare-mini"><span>Initial Rate</span><b>{money(rates.initial)}</b></div>
          <div className="justin-medicare-period-total"><span>Prorated Est.</span><strong>{money(t65.payout)}</strong></div>
        </article>
      </div>

      <p className="justin-medicare-disclaimer">
        Estimates use CMS Medicare Advantage fair-market-value maximums. Actual carrier compensation and payment timing can differ. Mid-year OEP/SEP/T65 estimates are prorated by months enrolled. Automatic sale tracking starts with plan changes saved in the CRM from September 2026 forward.
      </p>

      <style>{`
        .justin-medicare-commission-card{background:#f8fbfd;border-color:#c7d8e5;display:grid;gap:14px;min-width:0}
        .justin-medicare-commission-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
        .justin-medicare-commission-head h2{margin:2px 0 3px;color:#163047;font-size:1.08rem}
        .justin-medicare-commission-head p{margin:0;color:#687b8c;font-size:.76rem}
        .justin-medicare-eyebrow{font-size:.62rem;letter-spacing:.08em;font-weight:900;color:#5d7488}
        .justin-medicare-rate-badge{display:grid;place-items:center;min-width:52px;height:32px;padding:0 9px;border-radius:999px;background:#163047;color:#fff;font-size:.72rem;font-weight:900}
        .justin-medicare-rate-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
        .justin-medicare-rate-grid>div{padding:10px;border:1px solid #d8e3eb;border-radius:10px;background:#fff;display:grid;gap:3px}
        .justin-medicare-rate-grid span,.justin-medicare-book span,.justin-medicare-mini span,.justin-medicare-period-total span{font-size:.68rem;color:#6b7d8c;font-weight:800}
        .justin-medicare-rate-grid strong{font-size:1rem;color:#1e405c}
        .justin-medicare-book{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:10px;border-radius:11px;background:#18324a;color:#fff}
        .justin-medicare-book>div{display:grid;gap:3px;min-width:0}
        .justin-medicare-book span{color:#d7e6f2}
        .justin-medicare-book strong{color:#fff;font-size:1rem}
        .justin-medicare-period-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
        .justin-medicare-period{border:1px solid #d8e3eb;border-radius:11px;background:#fff;padding:10px;display:grid;gap:7px}
        .justin-medicare-period.aep{border-color:#b9d7c4;background:#f3faf5}
        .justin-medicare-period header{display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid #e8eef2;padding-bottom:6px}
        .justin-medicare-period header strong{color:#254a64;font-size:.82rem}.justin-medicare-period header span{color:#738393;font-size:.66rem;font-weight:800}
        .justin-medicare-mini{display:flex;align-items:center;justify-content:space-between;gap:8px}.justin-medicare-mini b{color:#263c4d;font-size:.78rem}
        .justin-medicare-period-total{border-top:1px solid #e8eef2;padding-top:7px;display:flex;align-items:end;justify-content:space-between;gap:10px}.justin-medicare-period-total strong{color:#153f5b;font-size:.98rem}
        .justin-medicare-disclaimer{margin:0;color:#788897;font-size:.64rem;line-height:1.42}
        @media(max-width:720px){
          .justin-medicare-rate-grid,.justin-medicare-book{grid-template-columns:1fr}
          .justin-medicare-period-grid{grid-template-columns:1fr 1fr}
          .justin-medicare-commission-head p{font-size:.7rem}
        }
        @media(max-width:440px){.justin-medicare-period-grid{grid-template-columns:1fr}}
      `}</style>
    </section>
  )
}
