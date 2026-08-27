import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { createAdminClient } from '@/lib/supabase/admin'

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

function memberStatusForOutcome(outcome: string) {
  if (['no_answer', 'voicemail', 'busy', 'bad_number'].includes(outcome)) return 'attempted'
  if (outcome === 'spoke') return 'spoke'
  if (outcome === 'follow_up') return 'follow_up'
  if (outcome === 'completed') return 'completed'
  if (outcome === 'not_interested') return 'not_interested'
  if (outcome === 'do_not_call') return 'do_not_call'
  return 'unreachable'
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, userId, profile } = await getCrmSession()
    if (!profile?.agency_id) return json({ error: 'Not authorized.' }, 403)

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const action = clean(body.action, 40).toLowerCase()
    const memberId = clean(body.member_id, 50)
    if (!UUID_PATTERN.test(memberId)) return json({ error: 'Invalid campaign client.' }, 400)

    const { data: member, error: memberError } = await supabase
      .from('crm_outreach_campaign_members')
      .select('id,campaign_id,client_id,assigned_agent_id,status,attempt_count,last_outcome,last_note,last_contacted_at,next_action,follow_up_date,follow_up_time')
      .eq('id', memberId)
      .eq('agency_id', profile.agency_id)
      .maybeSingle()
    if (memberError) return json({ error: memberError.message }, 400)
    if (!member) return json({ error: 'Campaign client not found or access denied.' }, 404)

    const manager = profile.role === 'manager'
    if (!manager && member.assigned_agent_id !== userId) return json({ error: 'This Outreach item belongs to another agent.' }, 403)

    const admin = createAdminClient()
    const [{ data: client, error: clientError }, { data: campaign, error: campaignError }] = await Promise.all([
      admin.from('clients').select('id,first_name,last_name,assigned_agent_id').eq('id', member.client_id).eq('agency_id', profile.agency_id).maybeSingle(),
      admin.from('crm_outreach_campaigns').select('id,name,assigned_agent_id').eq('id', member.campaign_id).eq('agency_id', profile.agency_id).maybeSingle()
    ])
    if (clientError || !client) return json({ error: clientError?.message || 'Client record is unavailable.' }, 404)
    if (campaignError || !campaign) return json({ error: campaignError?.message || 'Campaign is unavailable.' }, 404)
    if (String(client.assigned_agent_id || '') !== member.assigned_agent_id || campaign.assigned_agent_id !== member.assigned_agent_id) {
      return json({ error: 'Agent assignment changed. Refresh the campaign.' }, 409)
    }

    if (action === 'undo_last') {
      const { data: interactions, error: interactionError } = await admin
        .from('crm_outreach_interactions')
        .select('id,outcome,note,next_action,follow_up_date,follow_up_time,calendar_event_id,created_at')
        .eq('agency_id', profile.agency_id)
        .eq('campaign_id', member.campaign_id)
        .eq('member_id', member.id)
        .order('created_at', { ascending: false })
        .limit(2)
      if (interactionError) return json({ error: interactionError.message }, 400)
      if (!interactions?.length) return json({ error: 'There is no Outreach status to undo for this client.' }, 400)

      const latest = interactions[0]
      const previous = interactions[1] || null
      const nextMember = previous ? {
        status: memberStatusForOutcome(previous.outcome),
        last_outcome: previous.outcome,
        last_note: previous.note || null,
        last_contacted_at: previous.created_at,
        next_action: previous.outcome === 'follow_up' ? (previous.next_action || 'Follow up with client') : null,
        follow_up_date: previous.outcome === 'follow_up' ? previous.follow_up_date : null,
        follow_up_time: previous.outcome === 'follow_up' ? previous.follow_up_time : null,
        attempt_count: Math.max(Number(member.attempt_count || 0) - 1, 0)
      } : {
        status: 'not_contacted',
        last_outcome: null,
        last_note: null,
        last_contacted_at: null,
        next_action: null,
        follow_up_date: null,
        follow_up_time: null,
        attempt_count: 0
      }

      const { data: updated, error: updateError } = await supabase
        .from('crm_outreach_campaign_members')
        .update(nextMember)
        .eq('id', member.id)
        .select('id,status,last_outcome,last_note,last_contacted_at,next_action,follow_up_date,follow_up_time,attempt_count')
        .maybeSingle()
      if (updateError || !updated) return json({ error: updateError?.message || 'Unable to undo the last Outreach status.' }, 400)

      const { error: deleteError } = await admin.from('crm_outreach_interactions').delete().eq('id', latest.id)
      if (deleteError) {
        await admin.from('crm_outreach_campaign_members').update({
          status: member.status,
          last_outcome: member.last_outcome,
          last_note: member.last_note,
          last_contacted_at: member.last_contacted_at,
          next_action: member.next_action,
          follow_up_date: member.follow_up_date,
          follow_up_time: member.follow_up_time,
          attempt_count: member.attempt_count
        }).eq('id', member.id)
        return json({ error: 'Unable to remove the incorrect Outreach history entry.' }, 400)
      }

      let calendarRemoved = false
      if (latest.calendar_event_id) {
        const { error } = await admin.from('workspace_calendar_events').delete().eq('id', latest.calendar_event_id)
        calendarRemoved = !error
      }

      await supabase.from('audit_log').insert({
        agency_id: profile.agency_id,
        actor_id: userId,
        client_id: member.client_id,
        action: 'outreach.result_undone',
        details: { campaign_id: member.campaign_id, removed_outcome: latest.outcome, calendar_event_removed: calendarRemoved }
      })

      return json({ member: updated, removed_outcome: latest.outcome, calendar_event_removed: calendarRemoved })
    }

    if (action === 'create_appointment') {
      const eventDate = clean(body.event_date, 10)
      const startTime = clean(body.start_time, 5)
      const notes = clean(body.notes, 5000)
      if (!validDate(eventDate)) return json({ error: 'Enter a valid appointment date.' }, 400)
      if (startTime && !TIME_PATTERN.test(startTime)) return json({ error: 'Enter a valid appointment time.' }, 400)

      const clientName = [client.first_name, client.last_name].filter(Boolean).join(' ').trim() || 'Client'
      const { data: event, error: eventError } = await admin
        .from('workspace_calendar_events')
        .insert({
          agency_id: profile.agency_id,
          assigned_agent_id: member.assigned_agent_id,
          created_by: userId,
          client_id: member.client_id,
          lead_id: null,
          title: `Appointment: ${clientName}`,
          event_type: 'appointment',
          event_date: eventDate,
          start_time: startTime || null,
          end_time: null,
          notes: [notes, `Outreach campaign: ${campaign.name}`].filter(Boolean).join(' — '),
          status: 'scheduled'
        })
        .select('id,event_date,start_time,title,assigned_agent_id')
        .single()
      if (eventError || !event) return json({ error: eventError?.message || 'Unable to create appointment.' }, 400)

      await supabase.from('audit_log').insert({
        agency_id: profile.agency_id,
        actor_id: userId,
        client_id: member.client_id,
        action: 'outreach.appointment_created',
        details: { campaign_id: member.campaign_id, event_id: event.id, assigned_agent_id: member.assigned_agent_id, event_date: eventDate }
      })

      return json({ event })
    }

    return json({ error: 'Unknown Outreach member action.' }, 400)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to update Outreach.' }, 400)
  }
}
