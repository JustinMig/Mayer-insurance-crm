import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function cleanSearch(value: string) {
  return value
    .replace(/[^\p{L}\p{N}\s\-'.()]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
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

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('client_medications')
    .select('medication_name')
    .eq('agency_id', profile.agency_id)
    .not('medication_name', 'is', null)
    .ilike('medication_name', `${query}%`)
    .order('medication_name', { ascending: true })
    .limit(80)

  if (error) {
    console.error('Medication autocomplete search failed', { message: error.message })
    return NextResponse.json({ suggestions: [] }, { status: 500 })
  }

  const seen = new Set<string>()
  const suggestions: string[] = []

  for (const row of data || []) {
    const name = String(row.medication_name || '').trim()
    if (!name) continue
    const key = name.toLocaleLowerCase('en-US')
    if (seen.has(key)) continue
    seen.add(key)
    suggestions.push(name)
    if (suggestions.length >= 10) break
  }

  return NextResponse.json(
    { suggestions },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}
