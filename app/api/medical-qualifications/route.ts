import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  ALL_MEDICAL_QUALIFICATIONS,
  MEDICAL_CARRIER_OPTIONS,
  type MedicalCarrierKey,
  type MedicalQualificationEntry
} from '@/lib/medical-qualifications'

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const carrierKeys = new Set(MEDICAL_CARRIER_OPTIONS.map((item) => item.key))

const SEARCH_INDEX = ALL_MEDICAL_QUALIFICATIONS.map((entry) => {
  const values = [entry.name, ...(entry.aliases || []), entry.associatedDiagnosis || '']
    .map(normalize)
    .filter(Boolean)

  return {
    entry,
    values,
    joined: values.join(' ')
  }
})

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()

  if (!claimsData?.claims) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const carrier = request.nextUrl.searchParams.get('carrier') as MedicalCarrierKey | null
  const query = request.nextUrl.searchParams.get('q') || ''
  const needle = normalize(query).slice(0, 120)

  if (!carrier || !carrierKeys.has(carrier)) {
    return NextResponse.json({ error: 'Invalid carrier' }, { status: 400 })
  }

  if (!needle) {
    return NextResponse.json({ results: [] satisfies MedicalQualificationEntry[] })
  }

  const words = needle.split(/\s+/).filter(Boolean)
  const results = SEARCH_INDEX
    .filter(({ entry }) => entry.carrier === carrier)
    .map(({ entry, values, joined }) => ({
      entry,
      exact: values.some((value) => value === needle),
      starts: values.some((value) => value.startsWith(needle)),
      contains: words.every((word) => joined.includes(word))
    }))
    .filter((match) => match.contains)
    .sort((a, b) =>
      Number(b.exact) - Number(a.exact) ||
      Number(b.starts) - Number(a.starts) ||
      a.entry.name.localeCompare(b.entry.name)
    )
    .slice(0, 30)
    .map((match) => match.entry)

  return NextResponse.json(
    { results },
    {
      headers: {
        'Cache-Control': 'private, max-age=60, stale-while-revalidate=300'
      }
    }
  )
}
