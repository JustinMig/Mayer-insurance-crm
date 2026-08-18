import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>
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

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params
    const { supabase, userId, profile } = await getCrmSession()
    if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

    const { data: existing } = await supabase
      .from('workspace_calendar_events')
      .select('id')
      .eq('id', id)
      .eq('agency_id', profile.agency_id)
      .maybeSingle()
    if (!existing) return NextResponse.json({ error: 'Calendar item not found or access denied.' }, { status: 404 })

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
    const { data, error } = await supabase
      .from('workspace_calendar_events')
      .update({
        assigned_agent_id: ownerId,
        title,
        event_type: eventType,
        event_date: eventDate,
        start_time: startTime || null,
        end_time: endTime || null,
        notes: notes || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select('id,assigned_agent_id,title,event_type,event_date,start_time,end_time,notes,created_at,updated_at')
      .single()

    if (error || !data) return NextResponse.json({ error: error?.message || 'Unable to update calendar item.' }, { status: 400 })
    return NextResponse.json({ event: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update calendar item.' }, { status: 400 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Params }) {
  const { id } = await params
  const { supabase, userId, profile } = await getCrmSession()
  if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const { data, error } = await supabase
    .from('workspace_calendar_events')
    .delete()
    .eq('id', id)
    .eq('agency_id', profile.agency_id)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Calendar item not found or access denied.' }, { status: 404 })

  await supabase.from('audit_log').insert({
    agency_id: profile.agency_id,
    actor_id: userId,
    client_id: null,
    action: 'workspace.calendar_deleted',
    details: { event_id: id }
  })

  return NextResponse.json({ deleted: true })
}
