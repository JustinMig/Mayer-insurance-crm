import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_RADII = new Set([5, 10, 25, 50, 100])
const NPPES_URL = 'https://npiregistry.cms.hhs.gov/api/'
const ZIP_API_BASE = 'https://api.zippopotam.us/us/'

const zipCoordinateCache = new Map<string, { lat: number; lon: number } | null>()

type NppesAddress = {
  address_purpose?: string
  address_1?: string
  address_2?: string
  city?: string
  state?: string
  postal_code?: string
}

type NppesTaxonomy = {
  desc?: string
  primary?: boolean
}

type NppesResult = {
  number?: string
  basic?: {
    first_name?: string
    last_name?: string
    middle_name?: string
    credential?: string
    status?: string
  }
  addresses?: NppesAddress[]
  practiceLocations?: NppesAddress[]
  taxonomies?: NppesTaxonomy[]
}

type NppesResponse = {
  result_count?: number
  results?: NppesResult[]
}

type ProviderCandidate = {
  npi: string
  location_key: string
  name: string
  credential: string | null
  specialty: string | null
  address: string
  city: string
  state: string
  postal_code: string
}

function cleanZip(value: string) {
  const match = value.trim().match(/^([0-9]{5})/)
  return match?.[1] || ''
}

function cleanNameQuery(value: string) {
  return value
    .replace(/[^a-zA-Z'\-\s.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 70)
}

function normalizeLocationPart(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function makeLocationKey(npi: string, address: string, city: string, zip: string) {
  return [npi, normalizeLocationPart(address), normalizeLocationPart(city), zip].join('|')
}

async function coordinatesForZip(zip: string) {
  if (zipCoordinateCache.has(zip)) return zipCoordinateCache.get(zip) || null

  try {
    const response = await fetch(`${ZIP_API_BASE}${encodeURIComponent(zip)}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 60 * 60 * 24 * 30 }
    })
    if (!response.ok) {
      zipCoordinateCache.set(zip, null)
      return null
    }

    const payload = await response.json() as {
      places?: Array<{ latitude?: string; longitude?: string }>
    }
    const place = payload.places?.[0]
    const lat = Number(place?.latitude)
    const lon = Number(place?.longitude)
    const coordinates = Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null
    zipCoordinateCache.set(zip, coordinates)
    return coordinates
  } catch {
    zipCoordinateCache.set(zip, null)
    return null
  }
}

function haversineMiles(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const earthRadiusMiles = 3958.7613
  const toRadians = (degrees: number) => degrees * Math.PI / 180
  const dLat = toRadians(b.lat - a.lat)
  const dLon = toRadians(b.lon - a.lon)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * earthRadiusMiles * Math.asin(Math.min(1, Math.sqrt(h)))
}

function primarySpecialty(result: NppesResult) {
  const primary = result.taxonomies?.find((taxonomy) => taxonomy.primary)
  return primary?.desc || result.taxonomies?.[0]?.desc || null
}

function locationAddresses(result: NppesResult) {
  const primary = (result.addresses || []).filter((address) => address.address_purpose === 'LOCATION')
  const secondary = result.practiceLocations || []
  return [...primary, ...secondary]
}

function candidatesFromResult(result: NppesResult) {
  const first = result.basic?.first_name?.trim() || ''
  const middle = result.basic?.middle_name?.trim() || ''
  const last = result.basic?.last_name?.trim() || ''
  const name = [first, middle, last].filter(Boolean).join(' ')
  if (!result.number || !name || result.basic?.status === 'D') return []

  const credential = result.basic?.credential?.trim() || null
  const specialty = primarySpecialty(result)
  const deduped = new Map<string, ProviderCandidate>()

  for (const location of locationAddresses(result)) {
    if ((location.state || '').toUpperCase() !== 'MS') continue
    const postalCode = cleanZip(location.postal_code || '')
    if (!postalCode) continue
    const address = [location.address_1, location.address_2].filter(Boolean).join(', ').trim()
    const city = location.city?.trim() || ''
    const locationKey = makeLocationKey(result.number, address, city, postalCode)

    if (!deduped.has(locationKey)) {
      deduped.set(locationKey, {
        npi: result.number,
        location_key: locationKey,
        name,
        credential,
        specialty,
        address,
        city,
        state: 'MS',
        postal_code: postalCode
      })
    }
  }

  return [...deduped.values()]
}

function nppesParams(query: string, field: 'first_name' | 'last_name') {
  const params = new URLSearchParams({
    version: '2.1',
    enumeration_type: 'NPI-1',
    name_purpose: 'PROVIDER',
    address_purpose: 'LOCATION',
    state: 'MS',
    limit: '35',
    use_first_name_alias: 'False'
  })
  params.set(field, `${query}*`)
  return params
}

async function searchNppes(query: string) {
  const words = query.split(' ').filter(Boolean)
  const requests: URLSearchParams[] = []

  if (words.length >= 2) {
    const params = new URLSearchParams({
      version: '2.1',
      enumeration_type: 'NPI-1',
      name_purpose: 'PROVIDER',
      address_purpose: 'LOCATION',
      state: 'MS',
      limit: '45',
      use_first_name_alias: 'False',
      first_name: `${words[0]}*`,
      last_name: `${words[words.length - 1]}*`
    })
    requests.push(params)
  }

  requests.push(nppesParams(query, 'first_name'))
  requests.push(nppesParams(query, 'last_name'))

  const responses = await Promise.allSettled(
    requests.map(async (params) => {
      const response = await fetch(`${NPPES_URL}?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      })
      if (!response.ok) throw new Error(`NPPES ${response.status}`)
      return response.json() as Promise<NppesResponse>
    })
  )

  const merged = new Map<string, NppesResult>()
  for (const response of responses) {
    if (response.status !== 'fulfilled') continue
    for (const result of response.value.results || []) {
      if (result.number && !merged.has(result.number)) merged.set(result.number, result)
    }
  }
  return [...merged.values()]
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const query = cleanNameQuery(request.nextUrl.searchParams.get('q') || '')
  const zip = cleanZip(request.nextUrl.searchParams.get('zip') || '')
  const radius = Number(request.nextUrl.searchParams.get('radius') || '25')

  if (query.length < 2) return NextResponse.json({ error: 'Type at least 2 letters of the doctor name.' }, { status: 400 })
  if (!/^\d{5}$/.test(zip)) return NextResponse.json({ error: 'Enter a valid 5-digit ZIP code.' }, { status: 400 })
  if (!ALLOWED_RADII.has(radius)) return NextResponse.json({ error: 'Choose a valid search radius.' }, { status: 400 })

  const center = await coordinatesForZip(zip)
  if (!center) return NextResponse.json({ error: 'ZIP code could not be located.' }, { status: 400 })

  try {
    const nppesResults = await searchNppes(query)
    const rawCandidates = nppesResults.flatMap(candidatesFromResult)

    const uniqueZipCodes = [...new Set(rawCandidates.map((candidate) => candidate.postal_code))].slice(0, 120)
    const coordinates = new Map<string, { lat: number; lon: number } | null>()
    await Promise.all(uniqueZipCodes.map(async (candidateZip) => {
      coordinates.set(candidateZip, candidateZip === zip ? center : await coordinatesForZip(candidateZip))
    }))

    const uniqueLocations = new Map<string, ProviderCandidate & { distance_miles: number }>()
    for (const candidate of rawCandidates) {
      const candidateCoordinates = coordinates.get(candidate.postal_code)
      if (!candidateCoordinates) continue
      const distance = haversineMiles(center, candidateCoordinates)
      if (distance > radius) continue

      const locationWithDistance = {
        ...candidate,
        distance_miles: Math.round(distance * 10) / 10
      }
      uniqueLocations.set(candidate.location_key, locationWithDistance)
    }

    const results = [...uniqueLocations.values()]
      .sort((a, b) => a.distance_miles - b.distance_miles || a.name.localeCompare(b.name) || a.address.localeCompare(b.address))
      .slice(0, 30)

    return NextResponse.json({
      query,
      zip,
      radius,
      results,
      count: results.length,
      source: 'CMS NPPES NPI Registry API 2.1',
      location_method: 'ZIP centroid distance',
      multiple_locations_preserved: true
    })
  } catch {
    return NextResponse.json({ error: 'Unable to search the CMS doctor directory right now.' }, { status: 502 })
  }
}
