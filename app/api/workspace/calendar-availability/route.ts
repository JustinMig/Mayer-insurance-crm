import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { resolveCalendarOwner } from '@/lib/calendar-access'
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

export async function GET(request: NextRequest) {
  try {
    const { supabase, userId, profile } = await getCrmSession()
    if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

    const date = cleanText(request.nextUrl.searchParams.get('date'), 10)
    const requestedOwner = cleanText(request.nextUrl.searchParams.get('owner'), 100)
    if (!validDate(date)) return NextResponse.json({ error: 'Choose a valid date.' }, { status: 400 })

    const ownerId = resolveCalendarOwner(userId, profile, requestedOwner)
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
