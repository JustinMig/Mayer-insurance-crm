import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
const TOPICS = new Set(['medicare', 'life', 'health', 'retirement', 'general', 'other'])
const OUTCOMES = new Set(['no_answer', 'voicemail', 'busy', 'bad_number', 'spoke', 'follow_up', 'completed', 'not_interested', 'do_not_call', 'unreachable'])

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

async function addMembers(
  clientIds: string[],
  campaignId: string,
  agencyId: string,
  userId: string,
  role: string | null | undefined,
  supabase: Awaited<ReturnType<typeof getCrmSession>>['supabase']
) {
  const privileged = role === 'manager' || role === 'admin'
  const reader = privileged ? createAdminClient() : supabase

  let clientQuery = reader
    .from('clients')
    .select('id,assigned_agent_id')
    .eq('agency_id', agencyId)
    .in('id', clientIds)

  if (!privileged) clientQuery = clientQuery.eq('assigned_agent_id', userId)

  const { data: clients, error: clientError } = await clientQuery
  if (clientError) throw new Error(clientError.message)

  const eligible = (clients || []).filter((client) => Boolean(client.assigned_agent_id))
  if (!eligible.length) return { added: 0, existing: 0, unavailable: clientIds.length }

  const eligibleIds = eligible.map((client) => client.id)
  const { data: existingRows, error: existingError } = await supabase
    .from('crm_outreach_campaign_members')
    .select('client_id')
    .eq('campaign_id', campaignId)
    .in('client_id', eligibleIds)

  if (existingError) throw new Error(existingError.message)
  const existing = new Set((existingRows || []).map((row) => row.client_id))
  const inserts = eligible
    .filter((client) => !existing.has(client.id))
    .map((client) => ({
      agency_id: agencyId,
      campaign_id: campaignId,
      client_id: client.id,
      assigned_agent_id: String(client.assigned_agent_id),
      status: 'not_contacted'
    }))

  if (inserts.length) {
    const { error } = await supabase.from('crm_outreach_campaign_members').insert(inserts)
    if (error) throw new Error(error.message)
  }

  return {
    added: inserts.length,
    existing: eligible.length - inserts.length,
    unavailable: clientIds.length - eligible.length
  }
}

export async function GET() {
  try {
    const { supabase, profile } = await getCrmSession()
    if (!profile?.agency_id) return json({ error: 'Not authorized.' }, 403)

    const { data, error } = await supabase
      .from('crm_outreach_campaigns')
      .select('id,name,topic,status,created_at')
      .eq('agency_id', profile.agency_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    if (error) return json({ error: error.message }, 400)
    return json({ campaigns: data || [] })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to load campaigns.' }, 400)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, userId, profile } = await getCrmSession()
    if (!profile?.agency_id) return json({ error: 'Not authorized.' }, 403)

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const action = clean(body.action, 40).toLowerCase()
    const privileged = profile.role === 'manager' || profile.role === 'admin'

    if (action === 'create' || action === 'create_and_add') {
      const name = clean(body.name, 120)
      const topic = clean(body.topic, 30).toLowerCase() || 'general'
      if (name.length < 2) return json({ error: 'Enter a campaign name.' }, 400)
      if (!TOPICS.has(topic)) return json({ error: 'Choose a valid campaign topic.' }, 400)

      const { data: campaign, error } = await supabase
        .from('crm_outreach_campaigns')
        .insert({ agency_id: profile.agency_id, name, topic, status: 'active', created_by: userId })
        .select('id,name,topic,status,created_at')
        .single()

      if (error || !campaign) return json({ error: error?.message || 'Unable to create campaign.' }, 400)

      let memberResult = { added: 0, existing: 0, unavailable: 0 }
      if (action === 'create_and_add') {
        const rawIds = Array.isArray(body.client_ids) ? body.client_ids : []
        const clientIds = Array.from(new Set(rawIds.map((value) => clean(value, 50)).filter((value) => UUID_PATTERN.test(value)))).slice(0, 500)
        if (clientIds.length) memberResult = await addMembers(clientIds, campaign.id, profile.agency_id, userId, profile.role, supabase)
      }

      await supabase.from('audit_log').insert({
        agency_id: profile.agency_id,
        actor_id: userId,
        action: 'outreach.campaign_created',
        details: { campaign_id: campaign.id, topic, added_clients: memberResult.added }
      })

      return json({ campaign, ...memberResult })
    }

    if (action === 'add_members') {
      const campaignId = clean(body.campaign_id, 50)
      if (!UUID_PATTERN.test(campaignId)) return json({ error: 'Choose a valid campaign.' }, 400)
      const rawIds = Array.isArray(body.client_ids) ? body.client_ids : []
      const clientIds = Array.from(new Set(rawIds.map((value) => clean(value, 50)).filter((value) => UUID_PATTERN.test(value)))).slice(0, 500)
      if (!clientIds.length) return json({ error: 'Select at least one client.' }, 400)

      const { data: campaign } = await supabase
        .from('crm_outreach_campaigns')
        .select('id,status')
        .eq('id', campaignId)
        .eq('agency_id', profile.agency_id)
        .maybeSingle()
      if (!campaign || campaign.status !== 'active') return json({ error: 'Campaign not found or archived.' }, 404)

      const result = await addMembers(clientIds, campaignId, profile.agency_id, userId, profile.role, supabase)
      return json(result)
    }

    if (action === 'archive') {
      const campaignId = clean(body.campaign_id, 50)
      if (!UUID_PATTERN.test(campaignId)) return json({ error: 'Invalid campaign.' }, 400)
      const { data, error } = await supabase
        .from('crm_outreach_campaigns')
        .update({ status: 'archived' })
        .eq('id', campaignId)
        .eq('agency_id', profile.agency_id)
        .select('id,status')
        .maybeSingle()
      if (error) return json({ error: error.message }, 400)
      if (!data) return json({ error: 'Campaign not found or you cannot archive it.' }, 404)
      return json({ campaign: data })
    }

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

    if (action === 'remove_member') {
      const { error } = await supabase.from('crm_outreach_campaign_members').delete().eq('id', member.id)
      if (error) return json({ error: error.message }, 400)
      return json({ removed: true })
    }

    if (action === 'reset_member') {
      const { data, error } = await supabase
        .from('crm_outreach_campaign_members')
        .update({ status: 'not_contacted', next_action: null, follow_up_date: null, follow_up_time: null })
        .eq('id', member.id)
        .select('id,status,next_action,follow_up_date,follow_up_time')
        .maybeSingle()
      if (error || !data) return json({ error: error?.message || 'Unable to reset this client.' }, 400)
      return json({ member: data })
    }

    if (action !== 'record') return json({ error: 'Unknown campaign action.' }, 400)

    const outcome = clean(body.outcome, 30).toLowerCase()
    if (!OUTCOMES.has(outcome)) return json({ error: 'Choose a valid outreach result.' }, 400)
    const note = clean(body.note, 5000)
    const nextAction = clean(body.next_action, 500)
    const followUpDate = clean(body.follow_up_date, 10)
    const followUpTime = clean(body.follow_up_time, 5)

    if (outcome === 'follow_up') {
      if (!validDate(followUpDate)) return json({ error: 'Enter a valid follow-up date.' }, 400)
      if (followUpTime && !TIME_PATTERN.test(followUpTime)) return json({ error: 'Enter a valid follow-up time.' }, 400)
    }

    const reader = privileged ? createAdminClient() : supabase
    const [{ data: client, error: clientError }, { data: campaign, error: campaignError }] = await Promise.all([
      reader.from('clients').select('id,first_name,last_name,agency_id,assigned_agent_id').eq('id', member.client_id).eq('agency_id', profile.agency_id).maybeSingle(),
      supabase.from('crm_outreach_campaigns').select('id,name,topic').eq('id', member.campaign_id).eq('agency_id', profile.agency_id).maybeSingle()
    ])
    if (clientError || !client) return json({ error: clientError?.message || 'Client record is unavailable.' }, 404)
    if (campaignError || !campaign) return json({ error: campaignError?.message || 'Campaign is unavailable.' }, 404)
    if (String(client.assigned_agent_id || '') !== member.assigned_agent_id) return json({ error: 'Client assignment changed. Refresh the campaign.' }, 409)

    let calendarEventId: string | null = null
    const admin = createAdminClient()
    if (outcome === 'follow_up') {
      const clientName = [client.first_name, client.last_name].filter(Boolean).join(' ').trim() || 'Client'
      const calendarClient = privileged ? admin : supabase
      const { data: event, error: eventError } = await calendarClient
        .from('workspace_calendar_events')
        .insert({
          agency_id: profile.agency_id,
          assigned_agent_id: member.assigned_agent_id,
          created_by: userId,
          client_id: member.client_id,
          lead_id: null,
          title: `Follow-up: ${clientName} — ${campaign.name}`,
          event_type: 'activity',
          event_date: followUpDate,
          start_time: followUpTime || null,
          end_time: null,
          notes: [nextAction, note].filter(Boolean).join(' — ') || null,
          status: 'scheduled'
        })
        .select('id')
        .single()
      if (eventError || !event) return json({ error: eventError?.message || 'Unable to schedule follow-up.' }, 400)
      calendarEventId = event.id
    }

    const { data: interaction, error: interactionError } = await supabase
      .from('crm_outreach_interactions')
      .insert({
        agency_id: profile.agency_id,
        campaign_id: member.campaign_id,
        member_id: member.id,
        client_id: member.client_id,
        assigned_agent_id: member.assigned_agent_id,
        user_id: userId,
        outcome,
        note: note || null,
        next_action: outcome === 'follow_up' ? (nextAction || 'Follow up with client') : (nextAction || null),
        follow_up_date: outcome === 'follow_up' ? followUpDate : null,
        follow_up_time: outcome === 'follow_up' && followUpTime ? followUpTime : null,
        calendar_event_id: calendarEventId
      })
      .select('id,created_at')
      .single()

    if (interactionError || !interaction) {
      if (calendarEventId) await admin.from('workspace_calendar_events').delete().eq('id', calendarEventId)
      return json({ error: interactionError?.message || 'Unable to save outreach history.' }, 400)
    }

    const nextStatus = memberStatusForOutcome(outcome)
    const { data: updated, error: updateError } = await supabase
      .from('crm_outreach_campaign_members')
      .update({
        status: nextStatus,
        last_outcome: outcome,
        last_note: note || null,
        last_contacted_at: interaction.created_at,
        next_action: outcome === 'follow_up' ? (nextAction || 'Follow up with client') : null,
        follow_up_date: outcome === 'follow_up' ? followUpDate : null,
        follow_up_time: outcome === 'follow_up' && followUpTime ? followUpTime : null,
        attempt_count: Number(member.attempt_count || 0) + 1
      })
      .eq('id', member.id)
      .select('id,status,last_outcome,last_note,last_contacted_at,next_action,follow_up_date,follow_up_time,attempt_count')
      .maybeSingle()

    if (updateError || !updated) {
      await admin.from('crm_outreach_interactions').delete().eq('id', interaction.id)
      if (calendarEventId) await admin.from('workspace_calendar_events').delete().eq('id', calendarEventId)
      return json({ error: updateError?.message || 'Unable to update campaign progress.' }, 400)
    }

    await supabase.from('audit_log').insert({
      agency_id: profile.agency_id,
      actor_id: userId,
      client_id: member.client_id,
      action: 'outreach.result_recorded',
      details: { campaign_id: member.campaign_id, outcome, assigned_agent_id: member.assigned_agent_id }
    })

    return json({ member: updated, interaction_id: interaction.id, calendar_event_id: calendarEventId })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to update outreach campaign.' }, 400)
  }
}
