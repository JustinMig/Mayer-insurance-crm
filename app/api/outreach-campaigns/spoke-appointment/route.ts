import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertAppointmentTimeAvailable } from '@/lib/workspace-calendar-conflicts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

function clean(value: unknown, max = 5000) {
  return String(value || '').trim().slice(0, max)
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

function validDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, userId, profile } = await getCrmSession()
    if (!profile?.agency_id) return json({ error: 'Not authorized.' }, 403)

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const campaignId = clean(body.campaign_id, 50)
    const clientId = clean(body.client_id, 50)
    const eventDate = clean(body.event_date, 10)
    const startTime = clean(body.start_time, 5)
    const note = clean(body.note, 5000)

    if (!UUID_PATTERN.test(campaignId) || !UUID_PATTERN.test(clientId)) return json({ error: 'Invalid Outreach appointment.' }, 400)
    if (!validDate(eventDate)) return json({ error: 'Choose a valid appointment date.' }, 400)
    if (!startTime || !TIME_PATTERN.test(startTime)) return json({ error: 'Choose an appointment time.' }, 400)

    const { data: member, error: memberError } = await supabase
      .from('crm_outreach_campaign_members')
      .select('id,campaign_id,client_id,assigned_agent_id,status,attempt_count')
      .eq('agency_id', profile.agency_id)
      .eq('campaign_id', campaignId)
      .eq('client_id', clientId)
      .maybeSingle()

    if (memberError) return json({ error: memberError.message }, 400)
    if (!member) return json({ error: 'This client is not in the selected Outreach campaign.' }, 404)

    const privileged = profile.role === 'manager' || profile.role === 'admin'
    if (!privileged && member.assigned_agent_id !== userId) return json({ error: 'This Outreach item belongs to another agent.' }, 403)

    const admin = createAdminClient()
    const [{ data: client, error: clientError }, { data: campaign, error: campaignError }] = await Promise.all([
      admin.from('clients').select('id,first_name,last_name,assigned_agent_id').eq('id', clientId).eq('agency_id', profile.agency_id).maybeSingle(),
      admin.from('crm_outreach_campaigns').select('id,name,assigned_agent_id').eq('id', campaignId).eq('agency_id', profile.agency_id).maybeSingle()
    ])

    if (clientError || !client) return json({ error: clientError?.message || 'Client record is unavailable.' }, 404)
    if (campaignError || !campaign) return json({ error: campaignError?.message || 'Campaign is unavailable.' }, 404)
    if (String(client.assigned_agent_id || '') !== member.assigned_agent_id || campaign.assigned_agent_id !== member.assigned_agent_id) {
      return json({ error: 'Agent assignment changed. Refresh the campaign.' }, 409)
    }

    await assertAppointmentTimeAvailable(
      admin,
      profile.agency_id,
      member.assigned_agent_id,
      eventDate,
      startTime,
      ''
    )

    const clientName = [client.first_name, client.last_name].filter(Boolean).join(' ').trim() || 'Client'
    const { data: event, error: eventError } = await admin
      .from('workspace_calendar_events')
      .insert({
        agency_id: profile.agency_id,
        assigned_agent_id: member.assigned_agent_id,
        created_by: userId,
        client_id: clientId,
        lead_id: null,
        title: `Appointment: ${clientName}`,
        event_type: 'appointment',
        event_date: eventDate,
        start_time: startTime,
        end_time: null,
        notes: [note, `Outreach campaign: ${campaign.name}`].filter(Boolean).join(' — '),
        status: 'scheduled'
      })
      .select('id,event_date,start_time,title,assigned_agent_id')
      .single()

    if (eventError || !event) return json({ error: eventError?.message || 'Unable to create appointment.' }, 400)

    const { data: interaction, error: interactionError } = await supabase
      .from('crm_outreach_interactions')
      .insert({
        agency_id: profile.agency_id,
        campaign_id: campaignId,
        member_id: member.id,
        client_id: clientId,
        assigned_agent_id: member.assigned_agent_id,
        user_id: userId,
        outcome: 'follow_up',
        note: note || null,
        next_action: 'Appointment scheduled',
        follow_up_date: eventDate,
        follow_up_time: startTime,
        calendar_event_id: event.id
      })
      .select('id,created_at')
      .single()

    if (interactionError || !interaction) {
      await admin.from('workspace_calendar_events').delete().eq('id', event.id)
      return json({ error: interactionError?.message || 'Unable to save Outreach appointment history.' }, 400)
    }

    const { data: updated, error: updateError } = await supabase
      .from('crm_outreach_campaign_members')
      .update({
        status: 'follow_up',
        last_outcome: 'follow_up',
        last_note: note || null,
        last_contacted_at: interaction.created_at,
        next_action: 'Appointment scheduled',
        follow_up_date: eventDate,
        follow_up_time: startTime,
        attempt_count: Number(member.attempt_count || 0) + 1
      })
      .eq('id', member.id)
      .select('id,status,last_outcome,last_note,last_contacted_at,next_action,follow_up_date,follow_up_time,attempt_count')
      .maybeSingle()

    if (updateError || !updated) {
      await supabase.from('crm_outreach_interactions').delete().eq('id', interaction.id)
      await admin.from('workspace_calendar_events').delete().eq('id', event.id)
      return json({ error: updateError?.message || 'Unable to update Outreach progress.' }, 400)
    }

    await supabase.from('audit_log').insert({
      agency_id: profile.agency_id,
      actor_id: userId,
      client_id: clientId,
      action: 'outreach.spoke_appointment_created',
      details: {
        campaign_id: campaignId,
        member_id: member.id,
        event_id: event.id,
        assigned_agent_id: member.assigned_agent_id,
        event_date: eventDate,
        start_time: startTime
      }
    })

    return json({ event, member: updated })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to create the Outreach appointment.' }, 400)
  }
}
