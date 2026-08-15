import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const MEDICAID_LEVELS = new Set(['none', 'qmb', 'slmb', 'qi', 'fbde', 'other'])

type MedicarePlanRow = {
  id: string
  carrier: string
  plan_name: string
  contract_id: string
  plan_id: string
  segment_id: string
  plan_type: string | null
  snp_indicator: boolean
  snp_type: string | null
  dsnp_integration_status: string | null
  zero_dollar_cost_sharing_dsnp: boolean | null
  monthly_premium: string | null
  moop_in_network: string | null
  pcp_copay: string | null
  specialist_copay: string | null
  inpatient_hospital: string | null
  otc_benefit: string | null
  food_benefit: string | null
  dental_benefit: string | null
  vision_benefit: string | null
  hearing_benefit: string | null
  medicaid_levels: string[] | null
  medicaid_level_status: 'not_required' | 'verified' | 'needs_verification'
  cms_source_date: string | null
  q1_source_url: string | null
  source_note: string | null
}

type CountyJoinRow = {
  county_name: string
  medicare_plans: MedicarePlanRow | MedicarePlanRow[] | null
}

function isDsnp(plan: MedicarePlanRow) {
  return /d-snp|dual/i.test(`${plan.snp_type || ''} ${plan.plan_name}`)
}

function normalizedPlan(joined: CountyJoinRow['medicare_plans']) {
  if (Array.isArray(joined)) return joined[0] || null
  return joined || null
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()

  if (!claimsData?.claims) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const county = (request.nextUrl.searchParams.get('county') || '').trim().replace(/\s+county$/i, '').slice(0, 80)
  const medicaid = (request.nextUrl.searchParams.get('medicaid') || 'none').trim().toLowerCase()

  if (!county) {
    return NextResponse.json({ error: 'County is required' }, { status: 400 })
  }

  if (!MEDICAID_LEVELS.has(medicaid)) {
    return NextResponse.json({ error: 'Invalid Medicaid level' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('medicare_plan_counties')
    .select(`
      county_name,
      medicare_plans!inner(
        id, carrier, plan_name, contract_id, plan_id, segment_id, plan_type,
        snp_indicator, snp_type, dsnp_integration_status, zero_dollar_cost_sharing_dsnp,
        monthly_premium, moop_in_network, pcp_copay, specialist_copay,
        inpatient_hospital, otc_benefit, food_benefit, dental_benefit,
        vision_benefit, hearing_benefit, medicaid_levels, medicaid_level_status,
        cms_source_date, q1_source_url, source_note
      )
    `)
    .eq('state', 'MS')
    .ilike('county_name', county)
    .order('county_name')

  if (error) {
    return NextResponse.json({ error: 'Unable to load Medicare plans' }, { status: 500 })
  }

  const exactRows = ((data || []) as unknown as CountyJoinRow[])
    .filter((row) => row.county_name.toLowerCase() === county.toLowerCase())

  let plans = exactRows
    .map((row) => normalizedPlan(row.medicare_plans))
    .filter((plan): plan is MedicarePlanRow => Boolean(plan))

  if (medicaid === 'none') {
    plans = plans.filter((plan) => !isDsnp(plan))
  } else {
    plans = plans.filter((plan) => {
      if (!isDsnp(plan)) return true
      if (plan.medicaid_level_status !== 'verified') return true
      return (plan.medicaid_levels || []).some((level) => level.toLowerCase() === medicaid)
    })
  }

  plans.sort((a, b) => {
    if (medicaid !== 'none') {
      const dualDifference = Number(isDsnp(b)) - Number(isDsnp(a))
      if (dualDifference) return dualDifference
    }
    return a.carrier.localeCompare(b.carrier) || a.plan_name.localeCompare(b.plan_name) || a.plan_id.localeCompare(b.plan_id)
  })

  const results = plans.map((plan) => ({
    ...plan,
    plan_key: `${plan.contract_id}-${plan.plan_id}${plan.segment_id && plan.segment_id !== '0' ? `-${plan.segment_id}` : ''}`,
    is_dsnp: isDsnp(plan),
    medicaid_match_status: !isDsnp(plan)
      ? 'not_required'
      : plan.medicaid_level_status === 'verified'
        ? 'verified'
        : medicaid === 'none'
          ? 'not_selected'
          : 'needs_verification'
  }))

  return NextResponse.json(
    {
      county: exactRows[0]?.county_name || county,
      medicaid,
      plan_year: 2026,
      results,
      count: results.length,
      cms_source_date: results.find((plan) => plan.cms_source_date)?.cms_source_date || '2026-08-10'
    },
    {
      headers: {
        'Cache-Control': 'private, max-age=120, stale-while-revalidate=600'
      }
    }
  )
}
