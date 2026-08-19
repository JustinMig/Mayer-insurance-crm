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

const FIELDS = 'id,assigned_agent_id,client_id,title,event_type,event_date,start_time,end_time,notes,status,completed_at,reschedule_note,reschedule_requested_at,created_at,updated_at'

export async function GET(request: NextRequest) {
  if (isLeadsBackgroundRequest(request)) {
    return NextResponse.json(
      { today: [], rescheduled: [] },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  }

  const { supabase, profile } = await getCrmSession()
  if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const date = String(request.nextUrl.searchParams.get('date') || '').trim()
  if (!validDate(date)) return NextResponse.json({ error: 'Invalid date.' }, { status: 400 })

  const selectedCalendarAgent = profile.role === 'manager' ? calendarAgentFromReferer(request) : ''

  let todayQuery = supabase
    .from('workspace_calendar_events')
    .select(FIELDS)
    .eq('agency_id', profile.agency_id)
    .eq('event_type', 'appointment')
    .eq('event_date', date)
    .eq('status', 'scheduled')

  let rescheduledQuery = supabase
    .from('workspace_calendar_events')
    .select(FIELDS)
    .eq('agency_id', profile.agency_id)
    .eq('event_type', 'appointment')
    .eq('status', 'needs_reschedule')

  if (selectedCalendarAgent) {
    todayQuery = todayQuery.eq('assigned_agent_id', selectedCalendarAgent)
    rescheduledQuery = rescheduledQuery.eq('assigned_agent_id', selectedCalendarAgent)
  }

  const [todayResult, rescheduledResult] = await Promise.all([
    todayQuery
      .order('start_time', { ascending: true, nullsFirst: true })
      .limit(300),
    rescheduledQuery
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
