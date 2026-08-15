import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type SelectedDoctor = {
  slot_id: string
  npi: string
  location_key?: string
  name: string
  address: string
  city: string
  state: string
  postal_code: string
}

type ProviderRow = {
  id: string
  carrier: string
  npi: string | null
  full_name: string
  address_line1: string | null
  city: string | null
  state: string
  zip_code: string | null
  source_url: string | null
}

type NetworkRow = {
  provider_id: string
  medicare_plan_id: string
  in_network: boolean
  source_url: string | null
  verified_at: string | null
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

function emptyPlanStatus(planId: string, doctors: SelectedDoctor[]) {
  return {
    plan_id: planId,
    all_selected_in_network: false,
    doctor_matches: doctors.map((doctor) => ({
      slot_id: doctor.slot_id,
      npi: doctor.npi,
      location_key: doctor.location_key || null,
      name: doctor.name,
      status: 'not_verified' as const,
      source_url: null,
      verified_at: null
    }))
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
    return NextResponse.json({ available: true, plans: {}, verified_matches: 0 })
  }

  const npis = [...new Set(doctors.map((doctor) => doctor.npi))]
  const { data: providerData, error: providerError } = await supabase
    .from('medicare_network_providers')
    .select('id, carrier, npi, full_name, address_line1, city, state, zip_code, source_url')
    .in('npi', npis)
    .eq('state', 'MS')

  if (providerError) {
    const relationMissing = providerError.code === '42P01' || /does not exist|schema cache/i.test(providerError.message || '')
    return NextResponse.json({
      available: false,
      plans: Object.fromEntries(planIds.map((planId) => [planId, emptyPlanStatus(planId, doctors)])),
      verified_matches: 0,
      message: relationMissing
        ? 'Verified carrier doctor-network data has not been loaded into the CRM yet.'
        : 'Doctor-network data could not be checked right now.'
    })
  }

  const providers = (providerData || []) as ProviderRow[]
  const providerIdsByDoctor = new Map<string, string[]>()
  for (const doctor of doctors) {
    providerIdsByDoctor.set(
      doctor.slot_id,
      providers.filter((provider) => sameSelectedLocation(provider, doctor)).map((provider) => provider.id)
    )
  }

  const allProviderIds = [...new Set([...providerIdsByDoctor.values()].flat())]
  let networkRows: NetworkRow[] = []

  if (allProviderIds.length) {
    const { data: networkData, error: networkError } = await supabase
      .from('medicare_provider_plan_networks')
      .select('provider_id, medicare_plan_id, in_network, source_url, verified_at')
      .in('provider_id', allProviderIds)
      .in('medicare_plan_id', planIds)

    if (networkError) {
      return NextResponse.json({
        available: false,
        plans: Object.fromEntries(planIds.map((planId) => [planId, emptyPlanStatus(planId, doctors)])),
        verified_matches: 0,
        message: 'Doctor-network data could not be checked right now.'
      })
    }
    networkRows = (networkData || []) as NetworkRow[]
  }

  let verifiedMatches = 0
  const plans = Object.fromEntries(planIds.map((planId) => {
    const doctorMatches = doctors.map((doctor) => {
      const providerIds = new Set(providerIdsByDoctor.get(doctor.slot_id) || [])
      const matchingRows = networkRows.filter((row) => row.medicare_plan_id === planId && providerIds.has(row.provider_id))
      const positive = matchingRows.find((row) => row.in_network)
      const negative = matchingRows.find((row) => !row.in_network)
      const match = positive || negative
      const status = positive ? 'in_network' : negative ? 'out_of_network' : 'not_verified'
      if (status !== 'not_verified') verifiedMatches += 1

      return {
        slot_id: doctor.slot_id,
        npi: doctor.npi,
        location_key: doctor.location_key || null,
        name: doctor.name,
        status,
        source_url: match?.source_url || null,
        verified_at: match?.verified_at || null
      }
    })

    return [planId, {
      plan_id: planId,
      all_selected_in_network: doctorMatches.length > 0 && doctorMatches.every((match) => match.status === 'in_network'),
      doctor_matches: doctorMatches
    }]
  }))

  return NextResponse.json({
    available: true,
    plans,
    verified_matches: verifiedMatches,
    message: verifiedMatches
      ? null
      : 'No verified carrier-network records matched the selected doctor locations yet.'
  })
}
