export const JUSTIN_CALENDAR_USER_ID = '9c9b6c8a-add4-475d-bda5-c27169f117a1'
export const ISAIAH_CALENDAR_USER_ID = 'b34219da-711a-4f6d-a3c6-087ae96e31c4'
export const SHEENA_CALENDAR_USER_ID = '6c0698be-d030-44db-94ec-c771013ec1a9'

export const APPOINTMENT_AGENT_IDS = [JUSTIN_CALENDAR_USER_ID, ISAIAH_CALENDAR_USER_ID] as const

export type CalendarProfile = {
  role?: string | null
  full_name?: string | null
  agency_id?: string | null
}

function normalize(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

export function isSheenaCalendarCoordinator(userId: string, profile?: CalendarProfile | null) {
  return userId === SHEENA_CALENDAR_USER_ID
    && normalize(profile?.full_name) === 'sheena hester'
    && normalize(profile?.role) === 'manager'
}

export function isAppointmentAgent(userId: string) {
  return APPOINTMENT_AGENT_IDS.includes(userId as (typeof APPOINTMENT_AGENT_IDS)[number])
}

export function resolveCalendarOwner(userId: string, profile: CalendarProfile | null | undefined, requestedOwner?: string | null) {
  if (!isSheenaCalendarCoordinator(userId, profile)) return userId

  const requested = String(requestedOwner || '').trim()
  if (!requested) throw new Error('Choose Justin or Isaiah for this appointment.')
  if (!isAppointmentAgent(requested)) throw new Error('Calendar access denied.')
  return requested
}

export function canAccessCalendarOwner(userId: string, profile: CalendarProfile | null | undefined, ownerId: string) {
  if (ownerId === userId) return true
  return isSheenaCalendarCoordinator(userId, profile) && isAppointmentAgent(ownerId)
}
