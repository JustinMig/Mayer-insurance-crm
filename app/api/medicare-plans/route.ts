import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const MEDICAID_LEVELS = new Set(['none', 'qmb', 'slmb', 'qi', 'fbde', 'other'])

type BenefitDetails = Record<string, unknown>

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
  benefit_details: BenefitDetails | null
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

function detailString(details: BenefitDetails | null, key: string) {
  const value = details?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function moneyString(value: string) {
  const numeric = Number(value.replace(/[$,\s]/g, ''))
  if (!Number.isFinite(numeric)) return value.trim()
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: numeric % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  }).format(numeric)
}

function annualAllowanceFromText(value: string | null) {
  if (!value || /not covered/i.test(value)) return null

  const candidates: number[] = []
  const patterns = [
    /maximum benefit:\s*\$([\d,]+(?:\.\d{1,2})?)(?=[^·]*(?:every year|per year|annually|annual))/gi,
    /(?:allowance|benefit)[^$]{0,80}\$([\d,]+(?:\.\d{1,2})?)[^·]{0,80}(?:every year|per year|annually|annual)/gi,
    /\$([\d,]+(?:\.\d{1,2})?)\s*(?:every year|per year|annually|annual)/gi
  ]

  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      const amount = Number(match[1].replace(/,/g, ''))
      if (Number.isFinite(amount) && amount >= 0) candidates.push(amount)
    }
  }

  if (!candidates.length) return null
  const highest = Math.max(...candidates)
  return `${moneyString(String(highest))} / year`
}

function recurringAllowanceFromText(value: string | null) {
  if (!value || /not covered|dollar amount not published|verify carrier/i.test(value)) return null

  const match = value.match(/\$([\d,]+(?:\.\d{1,2})?)[^·]{0,60}\b(month|monthly|quarter|quarterly|year|yearly|annual|annually)\b/i)
  if (!match) return null

  const frequency = match[2].toLowerCase()
  const normalizedFrequency = frequency.startsWith('month')
    ? 'month'
    : frequency.startsWith('quarter')
      ? 'quarter'
      : 'year'

  return `${moneyString(match[1])} / ${normalizedFrequency}`
}

function recurringAllowance(details: BenefitDetails | null, prefix: 'otc' | 'food', fallback: string | null) {
  const amount = detailString(details, `${prefix}_amount`)
  const frequency = detailString(details, `${prefix}_frequency`)

  if (amount) {
    const normalizedAmount = moneyString(amount)
    if (!frequency) return normalizedAmount
    const cleanedFrequency = frequency.replace(/^\s*per\s+/i, '').trim().toLowerCase()
    return `${normalizedAmount} / ${cleanedFrequency}`
  }

  return recurringAllowanceFromText(fallback)
}


function benefitSegment(value: string | null, label: string) {
  if (!value) return null
  const segment = value
    .split(/\s*·\s*/g)
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith(`${label.toLowerCase()}:`))

  if (!segment) return null
  const cleaned = segment.slice(segment.indexOf(':') + 1).trim()
  return cleaned || null
}

function firstBenefitSegment(value: string | null) {
  if (!value) return null
  const segment = value.split(/\s*·\s*/g).map((part) => part.trim()).find(Boolean)
  if (!segment) return null
  const separator = segment.indexOf(':')
  return separator >= 0 ? segment.slice(separator + 1).trim() || null : segment
}

function compactVisionSummary(exam: string | null, eyewear: string | null, allowance: string | null) {
  const parts: string[] = []
  if (exam) parts.push(`Eye exam: ${exam}`)
  if (allowance) parts.push(`Eyewear: ${allowance}`)
  else if (eyewear) parts.push(`Eyewear: ${eyewear}`)
  return parts.length ? parts.join(' · ') : null
}

function compactHearingSummary(exam: string | null, aids: string | null) {
  const parts: string[] = []
  if (exam) parts.push(`Exam: ${exam}`)
  if (aids) parts.push(`Hearing aids: ${aids}`)
  return parts.length ? parts.join(' · ') : null
}

function partBGiveback(details: BenefitDetails | null) {
  const amount = detailString(details, 'part_b_credit_monthly') || detailString(details, 'part_b_giveback_monthly')
  return amount ? `${moneyString(amount)} / month` : null
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
        benefit_details, cms_source_date, q1_source_url, source_note
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

  const results = plans.map((plan) => {
    const details = plan.benefit_details || {}
    const dentalAnnualAllowance = detailString(details, 'dental_annual_allowance') || annualAllowanceFromText(plan.dental_benefit)
    const visionAnnualAllowance = detailString(details, 'vision_annual_allowance') || annualAllowanceFromText(plan.vision_benefit)
    const visionExam = benefitSegment(plan.vision_benefit, 'Routine eye exam') || firstBenefitSegment(plan.vision_benefit)
    const visionEyewear = benefitSegment(plan.vision_benefit, 'Eyeglasses (frames and lenses)') || benefitSegment(plan.vision_benefit, 'Eyeglasses') || benefitSegment(plan.vision_benefit, 'Contact lenses')
    const hearingExam = benefitSegment(plan.hearing_benefit, 'Hearing exam') || firstBenefitSegment(plan.hearing_benefit)
    const hearingAids = benefitSegment(plan.hearing_benefit, 'Hearing aids')
    const otcAllowance = recurringAllowance(details, 'otc', plan.otc_benefit)
    const foodAllowance = recurringAllowance(details, 'food', plan.food_benefit)

    return {
      ...plan,
      benefit_details: undefined,
      plan_key: `${plan.contract_id}-${plan.plan_id}${plan.segment_id && plan.segment_id !== '0' ? `-${plan.segment_id}` : ''}`,
      is_dsnp: isDsnp(plan),
      part_b_credit: partBGiveback(details),
      dental_annual_allowance: dentalAnnualAllowance,
      vision_annual_allowance: visionAnnualAllowance,
      vision_exam: visionExam,
      vision_eyewear: visionAnnualAllowance || visionEyewear,
      vision_summary: compactVisionSummary(visionExam, visionEyewear, visionAnnualAllowance),
      hearing_exam: hearingExam,
      hearing_aids: hearingAids,
      hearing_summary: compactHearingSummary(hearingExam, hearingAids),
      otc_allowance: otcAllowance,
      food_allowance: foodAllowance,
      medicaid_match_status: !isDsnp(plan)
        ? 'not_required'
        : plan.medicaid_level_status === 'verified'
          ? 'verified'
          : medicaid === 'none'
            ? 'not_selected'
            : 'needs_verification'
    }
  })

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
