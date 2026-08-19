import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function validDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

function normalizedName(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function isLeadsBackgroundRequest(request: NextRequest) {
  const referer = request.headers.get('referer')
  if (!referer) return false
  try {
    return new URL(referer).pathname === '/leads'
  } catch {
    return false
  }
}

function calendarAgentFromReferer(request: NextRequest) {
  const referer = request.headers.get('referer')
  if (!referer) return ''
  try {
    return String(new URL(referer).searchParams.get('calendar_agent') || '').trim().slice(0, 100)
  } catch {
    return ''
  }
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

const FIELDS = 'id,assigned_agent_id,client_id,title,event_type,event_date,start_time,end_time,notes,status,completed_at,reschedule_note,reschedule_requested_at,created_at,updated_at'

export async function GET(request: NextRequest) {
  if (isLeadsBackgroundRequest(request)) {
    return NextResponse.json(
      { today: [], rescheduled: [] },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  }

  const { supabase, userId, profile } = await getCrmSession()
  if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const date = String(request.nextUrl.searchParams.get('date') || '').trim()
  if (!validDate(date)) return NextResponse.json({ error: 'Invalid date.' }, { status: 400 })

  let readableOwnerId = ''
  try {
    readableOwnerId = await resolveReadableOwner(supabase, profile, userId, calendarAgentFromReferer(request))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Calendar access denied.' }, { status: 403 })
  }

  const [todayResult, rescheduledResult] = await Promise.all([
    supabase
      .from('workspace_calendar_events')
      .select(FIELDS)
      .eq('agency_id', profile.agency_id)
      .eq('assigned_agent_id', readableOwnerId)
      .eq('event_type', 'appointment')
      .eq('event_date', date)
      .eq('status', 'scheduled')
      .order('start_time', { ascending: true, nullsFirst: true })
      .limit(300),
    supabase
      .from('workspace_calendar_events')
      .select(FIELDS)
      .eq('agency_id', profile.agency_id)
      .eq('assigned_agent_id', readableOwnerId)
      .eq('event_type', 'appointment')
      .eq('status', 'needs_reschedule')
      .order('reschedule_requested_at', { ascending: false, nullsFirst: false })
      .limit(300)
  ])

  const error = todayResult.error || rescheduledResult.error
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(
    { today: todayResult.data || [], rescheduled: rescheduledResult.data || [] },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}
