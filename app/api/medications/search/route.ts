import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type MedicationSuggestion = {
  name: string
  strengths: string[]
  rxcuis: string[]
  source: 'rxterms' | 'crm'
}

function cleanSearch(value: string) {
  return value
    .replace(/[^\p{L}\p{N}\s\-'.()]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
}

async function searchRxTerms(query: string): Promise<MedicationSuggestion[]> {
  const url = new URL('https://clinicaltables.nlm.nih.gov/api/rxterms/v3/search')
  url.searchParams.set('terms', query)
  url.searchParams.set('ef', 'STRENGTHS_AND_FORMS,RXCUIS')
  url.searchParams.set('maxList', '20')

  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`NLM RxTerms returned ${response.status}`)
  }

  const payload = await response.json() as unknown
  if (!Array.isArray(payload)) return []

  const rawNames = Array.isArray(payload[1]) ? payload[1] : []
  const extra = payload[2] && typeof payload[2] === 'object'
    ? payload[2] as Record<string, unknown>
    : {}
  const rawStrengths = Array.isArray(extra.STRENGTHS_AND_FORMS)
    ? extra.STRENGTHS_AND_FORMS
    : []
  const rawRxcuis = Array.isArray(extra.RXCUIS) ? extra.RXCUIS : []

  const suggestions: MedicationSuggestion[] = []
  for (let index = 0; index < rawNames.length; index += 1) {
    const name = typeof rawNames[index] === 'string' ? rawNames[index].trim() : ''
    if (!name) continue

    suggestions.push({
      name,
      strengths: stringArray(rawStrengths[index]),
      rxcuis: stringArray(rawRxcuis[index]),
      source: 'rxterms',
    })
  }

  return suggestions
}

async function searchCrmFallback(agencyId: string, query: string): Promise<MedicationSuggestion[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('client_medications')
    .select('medication_name')
    .eq('agency_id', agencyId)
    .not('medication_name', 'is', null)
    .ilike('medication_name', `${query}%`)
    .order('medication_name', { ascending: true })
    .limit(80)

  if (error) {
    console.error('Medication fallback search failed', { message: error.message })
    return []
  }

  const seen = new Set<string>()
  const suggestions: MedicationSuggestion[] = []
  for (const row of data || []) {
    const name = String(row.medication_name || '').trim()
    if (!name) continue
    const key = name.toLocaleLowerCase('en-US')
    if (seen.has(key)) continue
    seen.add(key)
    suggestions.push({ name, strengths: [], rxcuis: [], source: 'crm' })
    if (suggestions.length >= 12) break
  }

  return suggestions
}

export async function GET(request: NextRequest) {
  const { profile } = await getCrmSession()
  if (!profile?.agency_id) {
    return NextResponse.json({ suggestions: [] }, { status: 401 })
  }

  const query = cleanSearch(request.nextUrl.searchParams.get('q') || '')
  if (query.length < 2) {
    return NextResponse.json(
      { suggestions: [] },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  }

  try {
    const suggestions = await searchRxTerms(query)
    return NextResponse.json(
      { suggestions, source: 'NLM RxTerms' },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (error) {
    console.error('NLM RxTerms medication search failed', {
      message: error instanceof Error ? error.message : String(error),
    })

    const suggestions = await searchCrmFallback(profile.agency_id, query)
    return NextResponse.json(
      { suggestions, source: 'CRM fallback' },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  }
}
