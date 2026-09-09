import { NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

function numeric(value: unknown) {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? amount : 0
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

export async function GET() {
  const { supabase, userId, profile } = await getCrmSession()
  if (!profile?.agency_id) return NextResponse.json({ error: 'CRM profile not available.' }, { status: 403 })
  if (profile.full_name?.trim().toLowerCase() !== 'justin mayer') {
    return NextResponse.json({ error: 'Commission summary is not enabled for this CRM.' }, { status: 403 })
  }

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const contractYear = contractYearForSeason(now)
  const rates = CMS_MA_RATES[contractYear] || CMS_MA_RATES[2027]

  const [lifeStatsResult, medicareClientsResult, eventsResult] = await Promise.all([
    supabase.rpc('crm_dashboard_agent_stats', {
      p_agent_ids: [userId],
      p_year: currentYear,
      p_month: currentMonth + 1,
      p_turn65_year: currentYear - 65
    }),
    supabase
      .from('clients')
      .select('id')
      .eq('assigned_agent_id', userId)
      .eq('is_medicare', true)
      .eq('is_deceased', false),
    supabase
      .from('medicare_commission_events')
      .select('election_period,compensation_type,likely_t65,effective_date,contract_year')
      .eq('assigned_agent_id', userId)
      .eq('contract_year', contractYear)
  ])

  if (lifeStatsResult.error) return NextResponse.json({ error: lifeStatsResult.error.message }, { status: 500 })
  if (medicareClientsResult.error) return NextResponse.json({ error: medicareClientsResult.error.message }, { status: 500 })
  if (eventsResult.error) return NextResponse.json({ error: eventsResult.error.message }, { status: 500 })

  const lifeRow = Array.isArray(lifeStatsResult.data) ? lifeStatsResult.data[0] : null
  const clientIds = (medicareClientsResult.data || []).map((row) => String(row.id))
  const healthPlansResult = clientIds.length
    ? await supabase
        .from('client_health_plan_info')
        .select('client_id,company_name,plan_id,effective_date')
        .in('client_id', clientIds)
    : { data: [], error: null }

  if (healthPlansResult.error) return NextResponse.json({ error: healthPlansResult.error.message }, { status: 500 })

  const currentBookCount = (healthPlansResult.data || []).filter((row) => {
    const company = String(row.company_name || '').trim().toLowerCase()
    return Boolean(company) && !company.includes('original medicare')
  }).length

  const events = (eventsResult.data || []) as CommissionEvent[]
  const aep = summarize(events, 'AEP', rates)
  const oep = summarize(events, 'OEP', rates)
  const sep = summarize(events, 'SEP', rates)
  const t65 = summarize(events, 'IEP/T65', rates)
  const retainedAnnual = currentBookCount * rates.renewal

  return NextResponse.json({
    life: {
      month_name: MONTH_NAMES[currentMonth],
      year: currentYear,
      monthly_premium: numeric(lifeRow?.month_premium),
      yearly_total: numeric(lifeRow?.year_premium)
    },
    medicare: {
      contract_year: contractYear,
      rates: {
        initial: rates.initial,
        switch: rates.renewal,
        renewal_monthly_equivalent: rates.renewal / 12
      },
      current_book_count: currentBookCount,
      monthly_renewal_equivalent: retainedAnnual / 12,
      annual_renewal_value: retainedAnnual,
      periods: { aep, oep, sep, t65 }
    }
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}
