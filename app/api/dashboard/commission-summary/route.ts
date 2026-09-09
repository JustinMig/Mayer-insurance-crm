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

type AgentOption = {
  id: string
  full_name: string
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

export async function GET(request: Request) {
  const { supabase, userId, profile } = await getCrmSession()
  if (!profile?.agency_id) return NextResponse.json({ error: 'CRM profile not available.' }, { status: 403 })

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const contractYear = contractYearForSeason(now)
  const rates = CMS_MA_RATES[contractYear] || CMS_MA_RATES[2027]
  const requestedAgentId = new URL(request.url).searchParams.get('agent_id') || ''

  let agents: AgentOption[] = []
  let selectedAgentId = userId

  if (profile.role === 'manager') {
    const { data: agentRows, error: agentError } = await supabase
      .from('profiles')
      .select('id,full_name')
      .eq('agency_id', profile.agency_id)
      .eq('active', true)
      .in('role', ['admin', 'agent'])
      .order('full_name', { ascending: true })

    if (agentError) return NextResponse.json({ error: agentError.message }, { status: 500 })
    agents = (agentRows || []).map((row) => ({ id: String(row.id), full_name: String(row.full_name || 'Agent') }))
    if (!agents.length) return NextResponse.json({ error: 'No commission agents are available.' }, { status: 404 })
    selectedAgentId = agents.some((agent) => agent.id === requestedAgentId) ? requestedAgentId : agents[0].id
  } else {
    agents = [{ id: userId, full_name: profile.full_name || 'Agent' }]
  }

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) || agents[0]

  const [lifeStatsResult, medicareClientsResult, eventsResult] = await Promise.all([
    supabase.rpc('crm_dashboard_agent_stats', {
      p_agent_ids: [selectedAgentId],
      p_year: currentYear,
      p_month: currentMonth + 1,
      p_turn65_year: currentYear - 65
    }),
    supabase
      .from('clients')
      .select('id')
      .eq('assigned_agent_id', selectedAgentId)
      .eq('is_medicare', true)
      .eq('is_deceased', false),
    supabase
      .from('medicare_commission_events')
      .select('election_period,compensation_type,likely_t65,effective_date,contract_year')
      .eq('assigned_agent_id', selectedAgentId)
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
    agents,
    selected_agent: selectedAgent,
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
