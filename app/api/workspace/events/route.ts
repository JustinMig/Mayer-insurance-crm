import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TYPES = new Set(['appointment', 'activity'])
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

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

function isLeadsBackgroundRequest(request: NextRequest) {
  const referer = request.headers.get('referer')
  if (!referer) return false
  try {
    return new URL(referer).pathname === '/leads'
  } catch {
    return false
  }
}

async function resolveOwner(
  supabase: Awaited<ReturnType<typeof getCrmSession>>['supabase'],
  profile: NonNullable<Awaited<ReturnType<typeof getCrmSession>>['profile']>,
  userId: string,
  requestedOwner: string
) {
  if (profile.role !== 'manager') return userId
  if (!requestedOwner) throw new Error('Choose Justin or Isaiah for this calendar item.')

  const { data: target } = await supabase
    .from('profiles')
    .select('id,full_name')
    .eq('id', requestedOwner)
    .eq('agency_id', profile.agency_id)
    .eq('active', true)
    .in('role', ['admin', 'agent'])
    .maybeSingle()

  const allowed = target && ['justin mayer', 'isaiah hernandez'].includes(String(target.full_name || '').trim().toLowerCase())
  if (!allowed) throw new Error('Choose Justin or Isaiah for this calendar item.')
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

export async function GET(request: NextRequest) {
  // Calendar data is hidden on the dedicated Leads page. Avoid the session and
  // database work while preserving the shared Workspace component unchanged.
  if (isLeadsBackgroundRequest(request)) {
    return NextResponse.json({ events: [] }, { headers: { 'Cache-Control': 'private, no-store' } })
  }

  const { supabase, profile } = await getCrmSession()
  if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const from = cleanText(request.nextUrl.searchParams.get('from'), 10)
  const to = cleanText(request.nextUrl.searchParams.get('to'), 10)
  if (!validDate(from) || !validDate(to) || from > to) return NextResponse.json({ error: 'Invalid calendar date range.' }, { status: 400 })

  const fromDate = new Date(`${from}T00:00:00Z`)
  const toDate = new Date(`${to}T00:00:00Z`)
  if ((toDate.getTime() - fromDate.getTime()) / 86400000 > 370) return NextResponse.json({ error: 'Calendar range is too large.' }, { status: 400 })

  const { data, error } = await supabase
    .from('workspace_calendar_events')
    .select('id,assigned_agent_id,client_id,title,event_type,event_date,start_time,end_time,notes,status,completed_at,reschedule_note,reschedule_requested_at,created_at,updated_at')
    .eq('agency_id', profile.agency_id)
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

    if (!title) return NextResponse.json({ error: 'Enter a title.' }, { status: 400 })
    if (!TYPES.has(eventType)) return NextResponse.json({ error: 'Choose Appointment or Activity.' }, { status: 400 })
    if (!validDate(eventDate)) return NextResponse.json({ error: 'Choose a valid date.' }, { status: 400 })
    if (!validTime(startTime) || !validTime(endTime)) return NextResponse.json({ error: 'Enter a valid time.' }, { status: 400 })
    if (startTime && endTime && endTime < startTime) return NextResponse.json({ error: 'End time cannot be before start time.' }, { status: 400 })

    const ownerId = await resolveOwner(supabase, profile, userId, cleanText(body.assigned_agent_id, 100))
    const clientId = await resolveClient(supabase, profile.agency_id, ownerId, cleanText(body.client_id, 100))
    const { data, error } = await supabase
      .from('workspace_calendar_events')
      .insert({
        agency_id: profile.agency_id,
        assigned_agent_id: ownerId,
        created_by: userId,
        client_id: clientId,
        title,
        event_type: eventType,
        event_date: eventDate,
        start_time: startTime || null,
        end_time: endTime || null,
        notes: notes || null,
        status: 'scheduled'
      })
      .select('id,assigned_agent_id,client_id,title,event_type,event_date,start_time,end_time,notes,status,completed_at,reschedule_note,reschedule_requested_at,created_at,updated_at')
      .single()

    if (error || !data) return NextResponse.json({ error: error?.message || 'Unable to save calendar item.' }, { status: 400 })

    await supabase.from('audit_log').insert({
      agency_id: profile.agency_id,
      actor_id: userId,
      client_id: clientId,
      action: 'workspace.calendar_created',
      details: { event_id: data.id, assigned_agent_id: ownerId, event_type: eventType, event_date: eventDate }
    })

    return NextResponse.json({ event: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save calendar item.' }, { status: 400 })
  }
}
