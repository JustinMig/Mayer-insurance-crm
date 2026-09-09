import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSheenaCalendarCoordinator, resolveCalendarOwner } from '@/lib/calendar-access'
import { assertAppointmentTimeAvailable } from '@/lib/workspace-calendar-conflicts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

function clean(value: unknown, max = 5000) {
  return String(value || '').trim().slice(0, max)
}

function validDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export async function POST(request: NextRequest) {
  try {
    const { userId, profile } = await getCrmSession()
    if (!profile?.agency_id || !isSheenaCalendarCoordinator(userId, profile)) {
      return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const campaignId = clean(body.campaign_id, 50)
    const clientId = clean(body.client_id, 50)
    const ownerId = resolveCalendarOwner(userId, profile, clean(body.assigned_agent_id, 100))
    const eventDate = clean(body.event_date, 10)
    const startTime = clean(body.start_time, 5)
    const notes = clean(body.notes, 5000)

    if (!UUID_PATTERN.test(campaignId) || !UUID_PATTERN.test(clientId)) {
      return NextResponse.json({ error: 'Invalid Outreach appointment.' }, { status: 400 })
    }
    if (!validDate(eventDate)) return NextResponse.json({ error: 'Choose a valid appointment date.' }, { status: 400 })
    if (!startTime || !TIME_PATTERN.test(startTime)) return NextResponse.json({ error: 'Choose an available appointment time.' }, { status: 400 })

    const admin = createAdminClient()
    const [{ data: member }, { data: client }, { data: campaign }] = await Promise.all([
      admin.from('crm_outreach_campaign_members').select('id').eq('agency_id', profile.agency_id).eq('campaign_id', campaignId).eq('client_id', clientId).maybeSingle(),
      admin.from('clients').select('id,first_name,last_name').eq('agency_id', profile.agency_id).eq('id', clientId).maybeSingle(),
      admin.from('crm_outreach_campaigns').select('id,name').eq('agency_id', profile.agency_id).eq('id', campaignId).maybeSingle()
    ])

    if (!member || !client || !campaign) return NextResponse.json({ error: 'Outreach client or campaign was not found.' }, { status: 404 })

    await assertAppointmentTimeAvailable(admin, profile.agency_id, ownerId, eventDate, startTime, '')

    const name = [client.first_name, client.last_name].filter(Boolean).join(' ').trim() || 'Client'
    const { data: event, error } = await admin
      .from('workspace_calendar_events')
      .insert({
        agency_id: profile.agency_id,
        assigned_agent_id: ownerId,
        created_by: userId,
        client_id: clientId,
        lead_id: null,
        title: `Appointment: ${name}`,
        event_type: 'appointment',
        event_date: eventDate,
        start_time: startTime,
        end_time: null,
        notes: [notes, `Outreach campaign: ${campaign.name}`].filter(Boolean).join(' — '),
        status: 'scheduled'
      })
      .select('id,event_date,start_time,title,assigned_agent_id')
      .single()

    if (error || !event) return NextResponse.json({ error: error?.message || 'Unable to create appointment.' }, { status: 400 })

    return NextResponse.json({ event }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create appointment.' }, { status: 400 })
  }
}
