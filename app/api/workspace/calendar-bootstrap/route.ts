import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const EVENT_FIELDS = 'id,assigned_agent_id,client_id,lead_id,title,event_type,event_date,start_time,end_time,notes,status,completed_at,reschedule_note,reschedule_requested_at,created_at,updated_at'

function cleanText(value: unknown, max: number) {
  return String(value || '').trim().slice(0, max)
}

function validDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
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

  if (!target || normalizedName(target.full_name) !== 'isaiah hernandez') throw new Error('Calendar access denied.')
  return target.id
}

export async function GET(request: NextRequest) {
  const { supabase, userId, profile } = await getCrmSession()
  if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const from = cleanText(request.nextUrl.searchParams.get('from'), 10)
  const to = cleanText(request.nextUrl.searchParams.get('to'), 10)
  const date = cleanText(request.nextUrl.searchParams.get('date'), 10)
  const requestedOwner = cleanText(request.nextUrl.searchParams.get('owner'), 100)

  if (!validDate(from) || !validDate(to) || !validDate(date) || from > to) {
    return NextResponse.json({ error: 'Invalid calendar date range.' }, { status: 400 })
  }

  const fromDate = new Date(`${from}T00:00:00Z`)
  const toDate = new Date(`${to}T00:00:00Z`)
  if ((toDate.getTime() - fromDate.getTime()) / 86400000 > 370) {
    return NextResponse.json({ error: 'Calendar range is too large.' }, { status: 400 })
  }

  let ownerId = ''
  try {
    ownerId = await resolveReadableOwner(supabase, profile, userId, requestedOwner)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Calendar access denied.' }, { status: 403 })
  }

  const [eventsResult, todayResult, rescheduledResult] = await Promise.all([
    supabase
      .from('workspace_calendar_events')
      .select(EVENT_FIELDS)
      .eq('agency_id', profile.agency_id)
      .eq('assigned_agent_id', ownerId)
      .gte('event_date', from)
      .lte('event_date', to)
      .order('event_date', { ascending: true })
      .order('start_time', { ascending: true, nullsFirst: true })
      .limit(1000),
    supabase
      .from('workspace_calendar_events')
      .select(EVENT_FIELDS)
      .eq('agency_id', profile.agency_id)
      .eq('assigned_agent_id', ownerId)
      .eq('event_type', 'appointment')
      .eq('event_date', date)
      .eq('status', 'scheduled')
      .order('start_time', { ascending: true, nullsFirst: true })
      .limit(300),
    supabase
      .from('workspace_calendar_events')
      .select(EVENT_FIELDS)
      .eq('agency_id', profile.agency_id)
      .eq('assigned_agent_id', ownerId)
      .eq('event_type', 'appointment')
      .eq('status', 'needs_reschedule')
      .order('reschedule_requested_at', { ascending: false, nullsFirst: false })
      .limit(300)
  ])

  const calendarError = eventsResult.error || todayResult.error || rescheduledResult.error
  if (calendarError) return NextResponse.json({ error: calendarError.message }, { status: 500 })

  const events = eventsResult.data || []
  const today = todayResult.data || []
  const rescheduled = rescheduledResult.data || []
  const allEvents = [...events, ...today, ...rescheduled]
  const clientIds = [...new Set(allEvents.map((event) => event.client_id).filter((value): value is string => Boolean(value)))]
  const leadIds = [...new Set(allEvents.map((event) => event.lead_id).filter((value): value is string => Boolean(value)))]

  const [clientsResult, leadsResult] = await Promise.all([
    clientIds.length
      ? supabase
          .from('clients')
          .select('id,assigned_agent_id,first_name,last_name,phone')
          .eq('agency_id', profile.agency_id)
          .in('id', clientIds)
      : Promise.resolve({ data: [], error: null }),
    leadIds.length
      ? supabase
          .from('workspace_leads')
          .select('id,assigned_agent_id,first_name,last_name,phone,date_of_birth,created_at')
          .eq('agency_id', profile.agency_id)
          .in('id', leadIds)
      : Promise.resolve({ data: [], error: null })
  ])

  const linkedError = clientsResult.error || leadsResult.error
  if (linkedError) return NextResponse.json({ error: linkedError.message }, { status: 500 })

  return NextResponse.json(
    {
      events,
      today,
      rescheduled,
      linkedClients: clientsResult.data || [],
      linkedLeads: leadsResult.data || []
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}
