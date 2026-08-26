import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const OUTCOMES = new Set(['answered', 'no_answer', 'voicemail', 'callback', 'not_interested'])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

function text(value: unknown, max = 5000) {
  return String(value || '').trim().slice(0, max)
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' }
  })
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
    const action = text(body.action, 40).toLowerCase()
    const isManager = profile.role === 'manager'

    if (action === 'add') {
      const requestedIds = Array.isArray(body.client_ids) ? body.client_ids : []
      const clientIds = Array.from(new Set(
        requestedIds
          .map((value) => text(value, 50))
          .filter((value) => UUID_PATTERN.test(value))
      )).slice(0, 500)

      if (!clientIds.length) return json({ error: 'Select at least one client.' }, 400)

      let clientQuery = supabase
        .from('clients')
        .select('id,assigned_agent_id')
        .eq('agency_id', profile.agency_id)
        .in('id', clientIds)

      if (!isManager) clientQuery = clientQuery.eq('assigned_agent_id', userId)

      const { data: clients, error: clientError } = await clientQuery
      if (clientError) return json({ error: clientError.message }, 400)

      const eligible = (clients || []).filter((client) => Boolean(client.assigned_agent_id))
      if (!eligible.length) return json({ error: 'No selected clients are available for your call list.' }, 403)

      const eligibleIds = eligible.map((client) => client.id)
      const { data: existing, error: existingError } = await supabase
        .from('crm_call_list_items')
        .select('user_id,client_id')
        .eq('agency_id', profile.agency_id)
        .in('client_id', eligibleIds)

      if (existingError) return json({ error: existingError.message }, 400)

      const existingKeys = new Set((existing || []).map((row) => `${row.user_id}:${row.client_id}`))
      const inserts = eligible
        .map((client) => ({
          agency_id: profile.agency_id,
          user_id: String(client.assigned_agent_id),
          client_id: client.id,
          status: 'pending'
        }))
        .filter((row) => !existingKeys.has(`${row.user_id}:${row.client_id}`))

      if (inserts.length) {
        const { error: insertError } = await supabase.from('crm_call_list_items').insert(inserts)
        if (insertError) return json({ error: insertError.message }, 400)
      }

      await supabase.from('audit_log').insert({
        agency_id: profile.agency_id,
        actor_id: userId,
        action: 'call_list.clients_added',
        details: { requested: clientIds.length, added: inserts.length }
      })

      return json({
        added_count: inserts.length,
        already_on_list: eligible.length - inserts.length,
        unavailable_count: clientIds.length - eligible.length
      })
    }

    const itemId = text(body.item_id, 50)
    if (!UUID_PATTERN.test(itemId)) return json({ error: 'Invalid call-list item.' }, 400)

    const { data: item, error: itemError } = await supabase
      .from('crm_call_list_items')
      .select('id,user_id,client_id,status,attempt_count')
      .eq('id', itemId)
      .eq('agency_id', profile.agency_id)
      .maybeSingle()

    if (itemError) return json({ error: itemError.message }, 400)
    if (!item) return json({ error: 'Call-list item not found or access denied.' }, 404)

    if (action === 'reset') {
      const { data: updated, error } = await supabase
        .from('crm_call_list_items')
        .update({ status: 'pending', callback_date: null, callback_time: null })
        .eq('id', item.id)
        .select('id,status,callback_date,callback_time')
        .maybeSingle()

      if (error) return json({ error: error.message }, 400)
      if (!updated) return json({ error: 'Unable to reset this call-list item.' }, 400)
      return json({ item: updated })
    }

    if (action === 'remove') {
      const { error } = await supabase.from('crm_call_list_items').delete().eq('id', item.id)
      if (error) return json({ error: error.message }, 400)

      await supabase.from('audit_log').insert({
        agency_id: profile.agency_id,
        actor_id: userId,
        client_id: item.client_id,
        action: 'call_list.removed',
        details: { call_list_item_id: item.id, owner_id: item.user_id }
      })

      return json({ removed: true })
    }

    if (action !== 'outcome') return json({ error: 'Unknown call-list action.' }, 400)

    const outcome = text(body.outcome, 40).toLowerCase()
    if (!OUTCOMES.has(outcome)) return json({ error: 'Choose a valid call outcome.' }, 400)

    const note = text(body.note, 5000)
    const callbackDate = text(body.callback_date, 10)
    const callbackTime = text(body.callback_time, 5)

    if (outcome === 'callback') {
      if (!validDate(callbackDate)) return json({ error: 'Enter a valid callback date.' }, 400)
      if (callbackTime && !TIME_PATTERN.test(callbackTime)) return json({ error: 'Enter a valid callback time.' }, 400)
    }

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id,first_name,last_name')
      .eq('id', item.client_id)
      .eq('agency_id', profile.agency_id)
      .maybeSingle()

    if (clientError) return json({ error: clientError.message }, 400)
    if (!client) return json({ error: 'Client record not found or access denied.' }, 404)

    let calendarEventId: string | null = null
    if (outcome === 'callback') {
      const clientName = [client.first_name, client.last_name].filter(Boolean).join(' ').trim() || 'Client'
      const { data: calendarEvent, error: calendarError } = await supabase
        .from('workspace_calendar_events')
        .insert({
          agency_id: profile.agency_id,
          assigned_agent_id: item.user_id,
          created_by: userId,
          client_id: item.client_id,
          lead_id: null,
          title: `Callback: ${clientName}`,
          event_type: 'activity',
          event_date: callbackDate,
          start_time: callbackTime || null,
          end_time: null,
          notes: note || null,
          status: 'scheduled'
        })
        .select('id')
        .single()

      if (calendarError || !calendarEvent) {
        return json({ error: calendarError?.message || 'Unable to schedule callback.' }, 400)
      }
      calendarEventId = calendarEvent.id
    }

    const { data: attempt, error: attemptError } = await supabase
      .from('crm_call_attempts')
      .insert({
        agency_id: profile.agency_id,
        user_id: item.user_id,
        client_id: item.client_id,
        outcome,
        note: note || null,
        callback_date: outcome === 'callback' ? callbackDate : null,
        callback_time: outcome === 'callback' && callbackTime ? callbackTime : null,
        calendar_event_id: calendarEventId
      })
      .select('id,called_at')
      .single()

    if (attemptError || !attempt) {
      if (calendarEventId) await supabase.from('workspace_calendar_events').delete().eq('id', calendarEventId)
      return json({ error: attemptError?.message || 'Unable to save call history.' }, 400)
    }

    const { data: updated, error: updateError } = await supabase
      .from('crm_call_list_items')
      .update({
        status: outcome,
        callback_date: outcome === 'callback' ? callbackDate : null,
        callback_time: outcome === 'callback' && callbackTime ? callbackTime : null,
        last_outcome: outcome,
        last_note: note || null,
        last_called_at: attempt.called_at,
        attempt_count: Number(item.attempt_count || 0) + 1
      })
      .eq('id', item.id)
      .select('id,status,callback_date,callback_time,last_outcome,last_note,last_called_at,attempt_count')
      .maybeSingle()

    if (updateError || !updated) {
      await supabase.from('crm_call_attempts').delete().eq('id', attempt.id)
      if (calendarEventId) await supabase.from('workspace_calendar_events').delete().eq('id', calendarEventId)
      return json({ error: updateError?.message || 'Unable to update the call list.' }, 400)
    }

    await supabase.from('audit_log').insert({
      agency_id: profile.agency_id,
      actor_id: userId,
      client_id: item.client_id,
      action: 'call_list.outcome_recorded',
      details: { outcome, owner_id: item.user_id, callback_date: outcome === 'callback' ? callbackDate : null }
    })

    return json({ item: updated, calendar_event_id: calendarEventId })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to update the call list.' }, 400)
  }
}
