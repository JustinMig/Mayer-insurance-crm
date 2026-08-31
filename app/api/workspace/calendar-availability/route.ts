import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { loadScheduledAppointmentBlocks } from '@/lib/workspace-calendar-conflicts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function cleanText(value: unknown, max: number) {
  return String(value || '').trim().slice(0, max)
}

function validDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function normalizedName(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

async function resolveReadableOwner(
  supabase: Awaited<ReturnType<typeof getCrmSession>>['supabase'],
  profile: NonNullable<Awaited<ReturnType<typeof getCrmSession>>['profile']>,
  userId: string,
  requestedOwner: string
) {
  const viewer = normalizedName(profile.full_name)
  if (viewer === 'justin mayer' || viewer === 'isaiah hernandez' || profile.role !== 'manager') return userId

  let target = null as { id: string; full_name: string | null } | null
  if (requestedOwner) {
    const { data } = await supabase
      .from('profiles')
      .select('id,full_name')
      .eq('id', requestedOwner)
      .eq('agency_id', profile.agency_id)
      .eq('active', true)
      .in('role', ['admin', 'agent'])
      .maybeSingle()
    target = data as { id: string; full_name: string | null } | null
  } else {
    const { data } = await supabase
      .from('profiles')
      .select('id,full_name')
      .eq('agency_id', profile.agency_id)
      .eq('active', true)
      .in('role', ['admin', 'agent'])
      .ilike('full_name', 'Isaiah Hernandez')
      .maybeSingle()
    target = data as { id: string; full_name: string | null } | null
  }

  if (!target || normalizedName(target.full_name) !== 'isaiah hernandez') {
    throw new Error('Calendar access denied.')
  }
  return target.id
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, userId, profile } = await getCrmSession()
    if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

    const date = cleanText(request.nextUrl.searchParams.get('date'), 10)
    const requestedOwner = cleanText(request.nextUrl.searchParams.get('owner'), 100)
    if (!validDate(date)) return NextResponse.json({ error: 'Choose a valid date.' }, { status: 400 })

    const ownerId = await resolveReadableOwner(supabase, profile, userId, requestedOwner)
    const blocks = await loadScheduledAppointmentBlocks(supabase, profile.agency_id, ownerId, date)

    return NextResponse.json(
      { owner_id: ownerId, date, blocks },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load appointment availability.' },
      { status: 403, headers: { 'Cache-Control': 'private, no-store' } }
    )
  }
}
