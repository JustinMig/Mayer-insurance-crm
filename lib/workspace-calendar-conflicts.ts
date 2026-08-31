type CalendarQueryClient = {
  from: (table: string) => any
}

export type CalendarBlock = {
  id: string
  title: string | null
  start_time: string | null
  end_time: string | null
}

const DEFAULT_SLOT_MINUTES = 15

function timeToMinutes(value: string | null | undefined) {
  if (!value) return null
  const match = String(value).slice(0, 5).match(/^(\d{2}):(\d{2})$/)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function effectiveRange(start: string | null | undefined, end: string | null | undefined) {
  const startMinutes = timeToMinutes(start)
  if (startMinutes === null) return null
  const parsedEnd = timeToMinutes(end)
  const endMinutes = parsedEnd !== null && parsedEnd > startMinutes
    ? parsedEnd
    : startMinutes + DEFAULT_SLOT_MINUTES
  return { start: startMinutes, end: endMinutes }
}

export function calendarRangesOverlap(
  start: string | null | undefined,
  end: string | null | undefined,
  otherStart: string | null | undefined,
  otherEnd: string | null | undefined
) {
  const first = effectiveRange(start, end)
  const second = effectiveRange(otherStart, otherEnd)
  if (!first || !second) return false
  return first.start < second.end && second.start < first.end
}

export async function loadScheduledAppointmentBlocks(
  supabase: CalendarQueryClient,
  agencyId: string,
  ownerId: string,
  eventDate: string,
  excludeId = ''
): Promise<CalendarBlock[]> {
  let query = supabase
    .from('workspace_calendar_events')
    .select('id,title,start_time,end_time')
    .eq('agency_id', agencyId)
    .eq('assigned_agent_id', ownerId)
    .eq('event_type', 'appointment')
    .eq('event_date', eventDate)
    .eq('status', 'scheduled')
    .not('start_time', 'is', null)
    .order('start_time', { ascending: true })
    .limit(300)

  if (excludeId) query = query.neq('id', excludeId)

  const { data, error } = await query
  if (error) throw new Error(`Unable to check scheduled appointment times: ${error.message}`)
  return (data || []) as CalendarBlock[]
}

export async function assertAppointmentTimeAvailable(
  supabase: CalendarQueryClient,
  agencyId: string,
  ownerId: string,
  eventDate: string,
  startTime: string,
  endTime: string,
  excludeId = ''
) {
  if (!startTime) return
  const blocks = await loadScheduledAppointmentBlocks(supabase, agencyId, ownerId, eventDate, excludeId)
  const conflict = blocks.find((block) => calendarRangesOverlap(startTime, endTime, block.start_time, block.end_time))
  if (!conflict) return

  const bookedStart = String(conflict.start_time || '').slice(0, 5)
  const bookedEnd = String(conflict.end_time || '').slice(0, 5)
  const range = bookedStart ? `${bookedStart}${bookedEnd ? `-${bookedEnd}` : ''}` : 'that time'
  throw new Error(`That appointment time conflicts with an appointment already scheduled at ${range}. Choose another time.`)
}
