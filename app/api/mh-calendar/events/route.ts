import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { JUSTIN_CALENDAR_USER_ID } from '@/lib/calendar-access'
import { assertAppointmentTimeAvailable } from '@/lib/workspace-calendar-conflicts'
import { getAuthorizedMhClients, normalizeMhPhone } from '@/lib/mh-ringcentral-bridge'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EVENT_FIELDS = 'id,assigned_agent_id,client_id,title,event_type,event_date,start_time,end_time,notes,status,completed_at,reschedule_note,reschedule_requested_at,created_at,updated_at'
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
const TYPES = new Set(['appointment', 'activity'])
const STATUSES = new Set(['scheduled', 'completed', 'needs_reschedule'])

function text(value: unknown, max = 5000) {
  return String(value || '').trim().slice(0, max)
}
function time(value: unknown) {
  const v = text(value, 8).slice(0, 5)
  return TIME_PATTERN.test(v) ? v : ''
}
function validDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

async function context(request: Request) {
  const { userId, clientByPhone } = await getAuthorizedMhClients(request)
  const admin = createAdminClient()
  const { data: justin, error: ownerError } = await admin
    .from('profiles')
    .select('id,agency_id,active')
    .eq('id', JUSTIN_CALENDAR_USER_ID)
    .maybeSingle()
  if (ownerError || !justin?.active || !justin.agency_id) throw new Error(ownerError?.message || 'Justin calendar is unavailable.')

  const { data: mayerClients, error: clientError } = await admin
    .from('clients')
    .select('id,phone')
    .eq('agency_id', justin.agency_id)
    .eq('assigned_agent_id', JUSTIN_CALENDAR_USER_ID)
    .not('phone', 'is', null)
  if (clientError) throw new Error(clientError.message)

  const idsByPhone = new Map<string, string[]>()
  const phoneByMayerId = new Map<string, string>()
  for (const client of mayerClients || []) {
    const phone = normalizeMhPhone(client.phone)
    if (!phone) continue
    phoneByMayerId.set(client.id, phone)
    const ids = idsByPhone.get(phone) || []
    ids.push(client.id)
    idsByPhone.set(phone, ids)
  }
  const mayerClientByPhone = new Map<string, string>()
  for (const [phone, ids] of idsByPhone) if (ids.length === 1) mayerClientByPhone.set(phone, ids[0])
  const mhPhoneByClientId = new Map<string, string>()
  for (const [phone, id] of clientByPhone) mhPhoneByClientId.set(id, phone)

  return { admin, agencyId: justin.agency_id as string, userId, clientByPhone, phoneByMayerId, mayerClientByPhone, mhPhoneByClientId }
}

function outward(row: any, ctx: Awaited<ReturnType<typeof context>>) {
  const phone = row.client_id ? ctx.phoneByMayerId.get(row.client_id) || '' : ''
  return {
    id: row.id,
    event_id: row.id,
    assigned_agent_id: ctx.userId,
    client_id: phone ? ctx.clientByPhone.get(phone) || null : null,
    title: row.title,
    event_type: row.event_type,
    event_date: row.event_date,
    start_time: row.start_time ? String(row.start_time).slice(0, 5) : null,
    end_time: row.end_time ? String(row.end_time).slice(0, 5) : null,
    notes: row.notes,
    status: row.status,
    completed_at: row.completed_at,
    reschedule_note: row.reschedule_note,
    reschedule_requested_at: row.reschedule_requested_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    calendar_source: 'mayer_justin'
  }
}

async function resolveMayerClient(body: Record<string, unknown>, ctx: Awaited<ReturnType<typeof context>>) {
  const mhClientId = text(body.client_id, 100)
  if (!mhClientId) return null
  const phone = ctx.mhPhoneByClientId.get(mhClientId)
  return phone ? ctx.mayerClientByPhone.get(phone) || null : null
}

async function loadEvent(id: string, ctx: Awaited<ReturnType<typeof context>>) {
  const { data, error } = await ctx.admin
    .from('workspace_calendar_events')
    .select(EVENT_FIELDS)
    .eq('id', id)
    .eq('agency_id', ctx.agencyId)
    .eq('assigned_agent_id', JUSTIN_CALENDAR_USER_ID)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function GET(request: Request) {
  try {
    const ctx = await context(request)
    const url = new URL(request.url)
    const from = text(url.searchParams.get('start') || url.searchParams.get('from'), 10)
    const to = text(url.searchParams.get('end') || url.searchParams.get('to'), 10)
    if (!validDate(from) || !validDate(to) || from > to) return NextResponse.json({ error: 'Invalid calendar date range.' }, { status: 400 })

    const all: any[] = []
    const add = (rows: any[] | null) => { for (const row of rows || []) if (!all.some(existing => existing.id === row.id)) all.push(row) }
    const range = await ctx.admin.from('workspace_calendar_events').select(EVENT_FIELDS)
      .eq('agency_id', ctx.agencyId).eq('assigned_agent_id', JUSTIN_CALENDAR_USER_ID)
      .gte('event_date', from).lte('event_date', to).order('event_date').order('start_time', { nullsFirst: true }).limit(1000)
    if (range.error) throw new Error(range.error.message)
    add(range.data)

    if (url.searchParams.get('includeToday') === '1') {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
      if (today < from || today > to) {
        const extra = await ctx.admin.from('workspace_calendar_events').select(EVENT_FIELDS)
          .eq('agency_id', ctx.agencyId).eq('assigned_agent_id', JUSTIN_CALENDAR_USER_ID).eq('event_date', today).limit(300)
        if (extra.error) throw new Error(extra.error.message)
        add(extra.data)
      }
    }
    if (url.searchParams.get('includeReschedule') === '1') {
      const extra = await ctx.admin.from('workspace_calendar_events').select(EVENT_FIELDS)
        .eq('agency_id', ctx.agencyId).eq('assigned_agent_id', JUSTIN_CALENDAR_USER_ID).eq('status', 'needs_reschedule').limit(300)
      if (extra.error) throw new Error(extra.error.message)
      add(extra.data)
    }

    all.sort((a, b) => `${a.event_date} ${a.start_time || ''}`.localeCompare(`${b.event_date} ${b.start_time || ''}`))
    return NextResponse.json({ events: all.map(row => outward(row, ctx)) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const status = Number((error as { status?: number })?.status) || 500
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load Justin calendar.' }, { status })
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await context(request)
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const title = text(body.title, 250)
    const eventType = text(body.event_type, 30).toLowerCase()
    const eventDate = text(body.event_date, 10)
    const startTime = time(body.start_time)
    const endTime = time(body.end_time)
    const notes = text(body.notes, 5000)
    if (!title || !TYPES.has(eventType) || !validDate(eventDate)) return NextResponse.json({ error: 'Enter a valid title, type, and date.' }, { status: 400 })
    if (startTime && endTime && endTime < startTime) return NextResponse.json({ error: 'End time cannot be before start time.' }, { status: 400 })
    if (eventType === 'appointment') await assertAppointmentTimeAvailable(ctx.admin, ctx.agencyId, JUSTIN_CALENDAR_USER_ID, eventDate, startTime, endTime)
    const clientId = await resolveMayerClient(body, ctx)
    const { data, error } = await ctx.admin.from('workspace_calendar_events').insert({
      agency_id: ctx.agencyId,
      assigned_agent_id: JUSTIN_CALENDAR_USER_ID,
      created_by: JUSTIN_CALENDAR_USER_ID,
      client_id: clientId,
      lead_id: null,
      title,
      event_type: eventType,
      event_date: eventDate,
      start_time: startTime || null,
      end_time: endTime || null,
      notes: notes || null,
      status: 'scheduled'
    }).select(EVENT_FIELDS).single()
    if (error || !data) throw new Error(error?.message || 'Unable to add calendar event.')
    return NextResponse.json({ event: outward(data, ctx) })
  } catch (error) {
    const status = Number((error as { status?: number })?.status) || 400
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to add calendar event.' }, { status })
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await context(request)
    const url = new URL(request.url)
    const id = text(url.searchParams.get('id'), 100)
    const existing = id ? await loadEvent(id, ctx) : null
    if (!existing) return NextResponse.json({ error: 'Justin calendar item not found.' }, { status: 404 })
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const action = text(body.action, 30).toLowerCase()
    const now = new Date().toISOString()
    if (action === 'complete') {
      const { data, error } = await ctx.admin.from('workspace_calendar_events').update({ status: 'completed', completed_at: now, updated_at: now }).eq('id', id).select(EVENT_FIELDS).single()
      if (error || !data) throw new Error(error?.message || 'Unable to complete calendar item.')
      return NextResponse.json({ event: outward(data, ctx) })
    }
    if (action === 'reschedule') {
      const note = text(body.note, 3000)
      if (!note) return NextResponse.json({ error: 'Enter a reschedule note.' }, { status: 400 })
      const { data, error } = await ctx.admin.from('workspace_calendar_events').update({ status: 'needs_reschedule', reschedule_note: note, reschedule_requested_at: now, completed_at: null, updated_at: now }).eq('id', id).select(EVENT_FIELDS).single()
      if (error || !data) throw new Error(error?.message || 'Unable to mark calendar item for reschedule.')
      return NextResponse.json({ event: outward(data, ctx) })
    }

    const title = text(body.title, 250)
    const eventType = text(body.event_type, 30).toLowerCase()
    const eventDate = text(body.event_date, 10)
    const startTime = time(body.start_time)
    const endTime = time(body.end_time)
    const notes = text(body.notes, 5000)
    if (!title || !TYPES.has(eventType) || !validDate(eventDate)) return NextResponse.json({ error: 'Enter a valid title, type, and date.' }, { status: 400 })
    if (eventType === 'appointment') await assertAppointmentTimeAvailable(ctx.admin, ctx.agencyId, JUSTIN_CALENDAR_USER_ID, eventDate, startTime, endTime, id)
    const clientId = await resolveMayerClient(body, ctx)
    const requestedStatus = text(body.status, 40).toLowerCase()
    const status = STATUSES.has(requestedStatus) ? requestedStatus : existing.status
    const { data, error } = await ctx.admin.from('workspace_calendar_events').update({
      client_id: clientId,
      title,
      event_type: eventType,
      event_date: eventDate,
      start_time: startTime || null,
      end_time: endTime || null,
      notes: notes || null,
      status,
      completed_at: status === 'completed' ? existing.completed_at || now : null,
      updated_at: now
    }).eq('id', id).select(EVENT_FIELDS).single()
    if (error || !data) throw new Error(error?.message || 'Unable to update calendar item.')
    return NextResponse.json({ event: outward(data, ctx) })
  } catch (error) {
    const status = Number((error as { status?: number })?.status) || 400
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update calendar item.' }, { status })
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await context(request)
    const id = text(new URL(request.url).searchParams.get('id'), 100)
    const existing = id ? await loadEvent(id, ctx) : null
    if (!existing) return NextResponse.json({ error: 'Justin calendar item not found.' }, { status: 404 })
    const { error } = await ctx.admin.from('workspace_calendar_events').delete().eq('id', id).eq('agency_id', ctx.agencyId).eq('assigned_agent_id', JUSTIN_CALENDAR_USER_ID)
    if (error) throw new Error(error.message)
    return NextResponse.json({ deleted: true })
  } catch (error) {
    const status = Number((error as { status?: number })?.status) || 400
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to delete calendar item.' }, { status })
  }
}
