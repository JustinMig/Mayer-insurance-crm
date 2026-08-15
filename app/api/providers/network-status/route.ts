import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  carrierLiveSupport,
  verifyDoctorForPlan,
  type LiveNetworkResult,
  type LiveNetworkStatus,
  type NetworkDoctor,
  type NetworkPlan
} from '@/lib/medicare-provider-live'

export const maxDuration = 60

type SelectedDoctor = NetworkDoctor

type PlanRow = NetworkPlan

type ProviderRow = {
  id: string
  carrier: string
  npi: string | null
  practitioner_id: string | null
  full_name: string
  specialty: string | null
  address_line1: string | null
  city: string | null
  state: string
  zip_code: string | null
  source_url: string | null
  source_updated_at: string | null
}

type NetworkRow = {
  provider_id: string
  medicare_plan_id: string
  network_id: string | null
  in_network: boolean
  source_url: string | null
  verified_at: string | null
}

type DoctorMatch = {
  slot_id: string
  npi: string
  location_key: string | null
  name: string
  status: LiveNetworkStatus
  source_url: string | null
  verified_at: string | null
  message: string | null
  verification_method: 'cache' | 'live' | 'unavailable'
}

const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const LIVE_CHECK_CONCURRENCY = 6

async function settleWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const results = new Array<PromiseSettledResult<R>>(items.length)
  let cursor = 0

  async function runner() {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index]) }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }

  const runnerCount = Math.min(Math.max(1, limit), items.length)
  await Promise.all(Array.from({ length: runnerCount }, () => runner()))
  return results
}

function cleanZip(value: string | null | undefined) {
  return value?.match(/^(\d{5})/)?.[1] || ''
}

function canonicalStreet(value: string | null | undefined) {
  return (value || '')
    .toUpperCase()
    .replace(/\b(SUITE|STE|UNIT|APT|APARTMENT|ROOM|RM|FLOOR|FL)\b.*$/i, '')
    .replace(/#/g, ' ')
    .replace(/\bSTREET\b/g, 'ST')
    .replace(/\bROAD\b/g, 'RD')
    .replace(/\bAVENUE\b/g, 'AVE')
    .replace(/\bDRIVE\b/g, 'DR')
    .replace(/\bBOULEVARD\b/g, 'BLVD')
    .replace(/\bHIGHWAY\b/g, 'HWY')
    .replace(/\bPARKWAY\b/g, 'PKWY')
    .replace(/\bLANE\b/g, 'LN')
    .replace(/\bCOURT\b/g, 'CT')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function sameSelectedLocation(provider: ProviderRow, doctor: SelectedDoctor) {
  if ((provider.npi || '') !== doctor.npi) return false
  if (cleanZip(provider.zip_code) !== cleanZip(doctor.postal_code)) return false

  const selectedStreet = canonicalStreet(doctor.address)
  const providerStreet = canonicalStreet(provider.address_line1)
  if (selectedStreet && providerStreet) return selectedStreet === providerStreet

  return (provider.city || '').trim().toUpperCase() === doctor.city.trim().toUpperCase()
}

function isFresh(value: string | null | undefined) {
  if (!value) return false
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) && Date.now() - timestamp <= CACHE_MAX_AGE_MS
}

function emptyMatch(doctor: SelectedDoctor, status: LiveNetworkStatus = 'not_verified', message: string | null = null): DoctorMatch {
  return {
    slot_id: doctor.slot_id,
    npi: doctor.npi,
    location_key: doctor.location_key || null,
    name: doctor.name,
    status,
    source_url: null,
    verified_at: null,
    message,
    verification_method: status === 'source_unavailable' ? 'unavailable' : 'live'
  }
}

function cacheMatch(doctor: SelectedDoctor, row: NetworkRow): DoctorMatch {
  return {
    slot_id: doctor.slot_id,
    npi: doctor.npi,
    location_key: doctor.location_key || null,
    name: doctor.name,
    status: row.in_network ? 'in_network' : 'out_of_network',
    source_url: row.source_url,
    verified_at: row.verified_at,
    message: 'Verified carrier-network result from the CRM cache.',
    verification_method: 'cache'
  }
}

function liveMatch(doctor: SelectedDoctor, result: LiveNetworkResult): DoctorMatch {
  return {
    slot_id: doctor.slot_id,
    npi: doctor.npi,
    location_key: doctor.location_key || null,
    name: doctor.name,
    status: result.status,
    source_url: result.source_url,
    verified_at: result.verified_at,
    message: result.message,
    verification_method: result.status === 'source_unavailable' ? 'unavailable' : 'live'
  }
}

async function persistLiveResult(doctor: SelectedDoctor, plan: PlanRow, result: LiveNetworkResult) {
  if (!['in_network', 'out_of_network'].includes(result.status) || !result.verified_at) return

  try {
    const admin = createAdminClient()
    const { data: providerData } = await admin
      .from('medicare_network_providers')
      .select('id, carrier, npi, practitioner_id, full_name, specialty, address_line1, city, state, zip_code, source_url, source_updated_at')
      .eq('carrier', plan.carrier)
      .eq('npi', doctor.npi)
      .eq('state', 'MS')
      .eq('zip_code', cleanZip(doctor.postal_code))
      .limit(20)

    const providers = (providerData || []) as ProviderRow[]
    let provider = providers.find((row) => sameSelectedLocation(row, doctor)) || null

    if (!provider) {
      const { data: inserted } = await admin
        .from('medicare_network_providers')
        .insert({
          carrier: plan.carrier,
          npi: doctor.npi,
          practitioner_id: result.practitioner_id,
          full_name: doctor.name,
          address_line1: doctor.address || null,
          city: doctor.city || null,
          state: doctor.state || 'MS',
          zip_code: cleanZip(doctor.postal_code),
          source_url: result.source_url,
          source_updated_at: result.verified_at,
          updated_at: new Date().toISOString()
        })
        .select('id, carrier, npi, practitioner_id, full_name, specialty, address_line1, city, state, zip_code, source_url, source_updated_at')
        .single()
      provider = inserted as ProviderRow | null
    } else {
      await admin
        .from('medicare_network_providers')
        .update({
          practitioner_id: result.practitioner_id || provider.practitioner_id,
          source_url: result.source_url || provider.source_url,
          source_updated_at: result.verified_at,
          updated_at: new Date().toISOString()
        })
        .eq('id', provider.id)
    }

    if (!provider?.id) return

    const networkId = `live:${plan.carrier}:${plan.contract_id}-${plan.plan_id}-${plan.segment_id || '0'}`
    await admin
      .from('medicare_provider_plan_networks')
      .upsert({
        provider_id: provider.id,
        medicare_plan_id: plan.id,
        network_id: networkId,
        in_network: result.status === 'in_network',
        source_url: result.source_url,
        verified_at: result.verified_at
      }, {
        onConflict: 'provider_id,medicare_plan_id,network_id'
      })
  } catch {
    // Live verification remains useful even if server-side cache credentials are absent.
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { doctors?: SelectedDoctor[]; plan_ids?: string[] }
  try {
    body = await request.json() as { doctors?: SelectedDoctor[]; plan_ids?: string[] }
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const doctors = (body.doctors || []).filter((doctor) => doctor?.npi && doctor?.slot_id).slice(0, 5)
  const planIds = [...new Set((body.plan_ids || []).filter(Boolean))].slice(0, 100)

  if (!doctors.length || !planIds.length) {
    return NextResponse.json({ available: true, plans: {}, verified_matches: 0, carrier_support: {} })
  }

  const { data: planData, error: planError } = await supabase
    .from('medicare_plans')
    .select('id, plan_year, carrier, contract_id, plan_id, segment_id, plan_name')
    .in('id', planIds)

  if (planError) return NextResponse.json({ error: 'Unable to load plans for doctor-network verification.' }, { status: 500 })
  const plans = (planData || []) as PlanRow[]
  const planById = new Map(plans.map((plan) => [plan.id, plan]))

  const npis = [...new Set(doctors.map((doctor) => doctor.npi))]
  const { data: providerData } = await supabase
    .from('medicare_network_providers')
    .select('id, carrier, npi, practitioner_id, full_name, specialty, address_line1, city, state, zip_code, source_url, source_updated_at')
    .in('npi', npis)
    .eq('state', 'MS')

  const providers = (providerData || []) as ProviderRow[]
  const providerIdsByDoctorCarrier = new Map<string, string[]>()
  for (const doctor of doctors) {
    for (const plan of plans) {
      const key = `${doctor.slot_id}|${plan.carrier}`
      if (providerIdsByDoctorCarrier.has(key)) continue
      providerIdsByDoctorCarrier.set(
        key,
        providers.filter((provider) => provider.carrier === plan.carrier && sameSelectedLocation(provider, doctor)).map((provider) => provider.id)
      )
    }
  }

  const allProviderIds = [...new Set([...providerIdsByDoctorCarrier.values()].flat())]
  let networkRows: NetworkRow[] = []
  if (allProviderIds.length) {
    const { data: networkData } = await supabase
      .from('medicare_provider_plan_networks')
      .select('provider_id, medicare_plan_id, network_id, in_network, source_url, verified_at')
      .in('provider_id', allProviderIds)
      .in('medicare_plan_id', planIds)
    networkRows = (networkData || []) as NetworkRow[]
  }

  const resultMatrix = new Map<string, DoctorMatch>()
  const liveChecks: Array<{ doctor: SelectedDoctor; plan: PlanRow; key: string }> = []

  for (const planId of planIds) {
    const plan = planById.get(planId)
    if (!plan) continue
    for (const doctor of doctors) {
      const key = `${plan.id}|${doctor.slot_id}`
      const providerIds = new Set(providerIdsByDoctorCarrier.get(`${doctor.slot_id}|${plan.carrier}`) || [])
      const cached = networkRows
        .filter((row) => row.medicare_plan_id === plan.id && providerIds.has(row.provider_id) && isFresh(row.verified_at))
        .sort((a, b) => new Date(b.verified_at || 0).getTime() - new Date(a.verified_at || 0).getTime())[0]

      if (cached) resultMatrix.set(key, cacheMatch(doctor, cached))
      else liveChecks.push({ doctor, plan, key })
    }
  }

  const liveSettled = await settleWithConcurrency(
    liveChecks,
    LIVE_CHECK_CONCURRENCY,
    async ({ doctor, plan, key }) => {
      const result = await verifyDoctorForPlan(doctor, plan)
      if (result.status === 'in_network' || result.status === 'out_of_network') {
        await persistLiveResult(doctor, plan, result)
      }
      return { key, doctor, plan, result }
    }
  )

  for (let index = 0; index < liveSettled.length; index += 1) {
    const settled = liveSettled[index]
    const source = liveChecks[index]
    if (settled.status === 'fulfilled') {
      resultMatrix.set(settled.value.key, liveMatch(settled.value.doctor, settled.value.result))
    } else if (source) {
      resultMatrix.set(source.key, emptyMatch(source.doctor, 'not_verified', `${source.plan.carrier} live verification failed for this request.`))
    }
  }

  let verifiedMatches = 0
  let unavailableMatches = 0
  const responsePlans = Object.fromEntries(planIds.map((planId) => {
    const plan = planById.get(planId)
    const doctorMatches = doctors.map((doctor) => {
      const match = resultMatrix.get(`${planId}|${doctor.slot_id}`) || emptyMatch(doctor)
      if (match.status === 'in_network' || match.status === 'out_of_network') verifiedMatches += 1
      if (match.status === 'source_unavailable') unavailableMatches += 1
      return match
    })

    return [planId, {
      plan_id: planId,
      carrier: plan?.carrier || null,
      all_selected_in_network: doctorMatches.length > 0 && doctorMatches.every((match) => match.status === 'in_network'),
      doctor_matches: doctorMatches
    }]
  }))

  const carriers = [...new Set(plans.map((plan) => plan.carrier))]
  const carrierSupport = Object.fromEntries(carriers.map((carrier) => [carrier, carrierLiveSupport(carrier)]))

  return NextResponse.json({
    available: true,
    plans: responsePlans,
    verified_matches: verifiedMatches,
    unavailable_matches: unavailableMatches,
    carrier_support: carrierSupport,
    cache_max_age_days: 7,
    message: verifiedMatches
      ? 'Doctor network results include live carrier checks and recent verified cache records.'
      : 'No plan/doctor match could be verified from a connected carrier directory yet.'
  }, {
    headers: {
      'Cache-Control': 'private, no-store'
    }
  })
}
