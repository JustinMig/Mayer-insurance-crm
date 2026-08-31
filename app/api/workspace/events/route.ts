import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { assertAppointmentTimeAvailable } from '@/lib/workspace-calendar-conflicts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TYPES = new Set(['appointment', 'activity'])
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
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

function validTime(value: string) {
  return !value || TIME_PATTERN.test(value)
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
    return cleanText(new URL(referer).searchParams.get('calendar_agent'), 100)
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

  // Justin and Isaiah only read their own calendars. All other non-managers also
  // remain limited to their own assigned calendar.
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

async function resolveOwner(
  supabase: Awaited<ReturnType<typeof getCrmSession>>['supabase'],
  profile: NonNullable<Awaited<ReturnType<typeof getCrmSession>>['profile']>,
  userId: string,
  requestedOwner: string
) {
  const viewer = normalizedName(profile.full_name)
  if (viewer === 'justin mayer' || viewer === 'isaiah hernandez' || profile.role !== 'manager') return userId
  if (!requestedOwner) throw new Error('Choose Isaiah for this calendar item.')

  const { data: target } = await supabase
    .from('profiles')
    .select('id,full_name')
    .eq('id', requestedOwner)
    .eq('agency_id', profile.agency_id)
    .eq('active', true)
    .in('role', ['admin', 'agent'])
    .maybeSingle()

  if (!target || normalizedName(target.full_name) !== 'isaiah hernandez') {
    throw new Error('Calendar access denied.')
  }
  return target.id
}

async function resolveClient(
  supabase: Awaited<ReturnType<typeof getCrmSession>>['supabase'],
  agencyId: string,
  ownerId: string,
  requestedClient: string
) {
  if (!requestedClient) return null
  const { data: client } = await supabase
    .from('clients')
    .select('id')
    .eq('id', requestedClient)
    .eq('agency_id', agencyId)
    .eq('assigned_agent_id', ownerId)
    .maybeSingle()
  if (!client) throw new Error('That client is not in the selected agent client book.')
  return client.id
}

async function resolveLead(
  supabase: Awaited<ReturnType<typeof getCrmSession>>['supabase'],
  agencyId: string,
  ownerId: string,
  requestedLead: string
) {
  if (!requestedLead) return null
  const { data: lead } = await supabase
    .from('workspace_leads')
    .select('id,status')
    .eq('id', requestedLead)
    .eq('agency_id', agencyId)
    .eq('assigned_agent_id', ownerId)
    .maybeSingle()
  if (!lead || lead.status !== 'lead') throw new Error('That lead is not an active lead for the selected agent.')
  return lead.id
}

export async function GET(request: NextRequest) {
  if (isLeadsBackgroundRequest(request)) {
    return NextResponse.json({ events: [] }, { headers: { 'Cache-Control': 'private, no-store' } })
  }

  const { supabase, userId, profile } = await getCrmSession()
  if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const from = cleanText(request.nextUrl.searchParams.get('from'), 10)
  const to = cleanText(request.nextUrl.searchParams.get('to'), 10)
  if (!validDate(from) || !validDate(to) || from > to) return NextResponse.json({ error: 'Invalid calendar date range.' }, { status: 400 })

  const fromDate = new Date(`${from}T00:00:00Z`)
  const toDate = new Date(`${to}T00:00:00Z`)
  if ((toDate.getTime() - fromDate.getTime()) / 86400000 > 370) return NextResponse.json({ error: 'Calendar range is too large.' }, { status: 400 })

  let readableOwnerId = ''
  try {
    readableOwnerId = await resolveReadableOwner(supabase, profile, userId, calendarAgentFromReferer(request))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Calendar access denied.' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('workspace_calendar_events')
    .select(EVENT_FIELDS)
    .eq('agency_id', profile.agency_id)
    .eq('assigned_agent_id', readableOwnerId)
    .gte('event_date', from)
    .lte('event_date', to)
    .order('event_date', { ascending: true })
    .order('start_time', { ascending: true, nullsFirst: true })
    .limit(1000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ events: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, userId, profile } = await getCrmSession()
    if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const title = cleanText(body.title, 250)
    const eventType = cleanText(body.event_type, 30).toLowerCase()
    const eventDate = cleanText(body.event_date, 10)
    const startTime = cleanText(body.start_time, 5)
    const endTime = cleanText(body.end_time, 5)
    const notes = cleanText(body.notes, 5000)
    const requestedClient = cleanText(body.client_id, 100)
    const requestedLead = cleanText(body.lead_id, 100)

    if (!title) return NextResponse.json({ error: 'Enter a title.' }, { status: 400 })
    if (!TYPES.has(eventType)) return NextResponse.json({ error: 'Choose Appointment or Activity.' }, { status: 400 })
    if (!validDate(eventDate)) return NextResponse.json({ error: 'Choose a valid date.' }, { status: 400 })
    if (!validTime(startTime) || !validTime(endTime)) return NextResponse.json({ error: 'Enter a valid time.' }, { status: 400 })
    if (startTime && endTime && endTime < startTime) return NextResponse.json({ error: 'End time cannot be before start time.' }, { status: 400 })
    if (requestedClient && requestedLead) return NextResponse.json({ error: 'Tag either a client or a lead, not both.' }, { status: 400 })

    const ownerId = await resolveOwner(supabase, profile, userId, cleanText(body.assigned_agent_id, 100))
    if (eventType === 'appointment') {
      await assertAppointmentTimeAvailable(supabase, profile.agency_id, ownerId, eventDate, startTime, endTime)
    }

    const clientId = await resolveClient(supabase, profile.agency_id, ownerId, requestedClient)
    const leadId = await resolveLead(supabase, profile.agency_id, ownerId, requestedLead)
    const { data, error } = await supabase
      .from('workspace_calendar_events')
      .insert({
        agency_id: profile.agency_id,
        assigned_agent_id: ownerId,
        created_by: userId,
        client_id: clientId,
        lead_id: leadId,
        title,
        event_type: eventType,
        event_date: eventDate,
        start_time: startTime || null,
        end_time: endTime || null,
        notes: notes || null,
        status: 'scheduled'
      })
      .select(EVENT_FIELDS)
      .single()

    if (error || !data) return NextResponse.json({ error: error?.message || 'Unable to save calendar item.' }, { status: 400 })

    await supabase.from('audit_log').insert({
      agency_id: profile.agency_id,
      actor_id: userId,
      client_id: clientId,
      action: 'workspace.calendar_created',
      details: { event_id: data.id, assigned_agent_id: ownerId, event_type: eventType, event_date: eventDate, lead_id: leadId }
    })

    return NextResponse.json({ event: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save calendar item.' }, { status: 400 })
  }
}
