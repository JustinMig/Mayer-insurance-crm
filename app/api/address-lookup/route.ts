import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'

export const dynamic = 'force-dynamic'

function clean(value: string | null, max = 120) {
  return String(value || '').trim().slice(0, max)
}

export async function GET(request: NextRequest) {
  await getCrmSession()

  const street = clean(request.nextUrl.searchParams.get('street'))
  const city = clean(request.nextUrl.searchParams.get('city'), 80)
  const state = clean(request.nextUrl.searchParams.get('state'), 2).toUpperCase()
  const zip = clean(request.nextUrl.searchParams.get('zip'), 10).replace(/[^0-9-]/g, '')

  if (!street || !/^\d{5}(?:-\d{4})?$/.test(zip)) {
    return NextResponse.json({ matched: false }, { status: 400 })
  }

  const params = new URLSearchParams({
    street,
    zip,
    benchmark: 'Public_AR_Current',
    vintage: 'Current_Current',
    format: 'json',
  })
  if (city) params.set('city', city)
  if (state) params.set('state', state)

  try {
    const response = await fetch(`https://geocoding.geo.census.gov/geocoder/geographies/address?${params.toString()}`, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Mayer-Insurance-CRM/1.0' },
    })

    if (!response.ok) {
      return NextResponse.json({ matched: false }, { status: 200 })
    }

    const payload = await response.json() as {
      result?: {
        addressMatches?: Array<{
          matchedAddress?: string
          addressComponents?: {
            city?: string
            state?: string
            zip?: string
          }
          geographies?: Record<string, Array<{ NAME?: string; BASENAME?: string }>>
        }>
      }
    }

    const match = payload.result?.addressMatches?.[0]
    if (!match) return NextResponse.json({ matched: false })

    const countyRows = match.geographies?.Counties || match.geographies?.['Counties'] || []
    const countyRaw = countyRows[0]?.NAME || countyRows[0]?.BASENAME || ''
    const county = countyRaw.replace(/\s+County$/i, '').trim()

    return NextResponse.json({
      matched: true,
      city: match.addressComponents?.city || '',
      state: match.addressComponents?.state || '',
      zip: match.addressComponents?.zip || zip.slice(0, 5),
      county,
      matchedAddress: match.matchedAddress || '',
    })
  } catch {
    return NextResponse.json({ matched: false })
  }
}
