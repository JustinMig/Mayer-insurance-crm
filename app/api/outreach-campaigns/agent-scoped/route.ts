import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TOPICS = new Set(['medicare', 'life', 'health', 'retirement', 'general', 'other'])

function clean(value: unknown, max = 500) {
  return String(value || '').trim().slice(0, max)
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

function clientIdsFrom(value: unknown) {
  const raw = Array.isArray(value) ? value : []
  return Array.from(new Set(raw.map((item) => clean(item, 50)).filter((id) => UUID_PATTERN.test(id)))).slice(0, 500)
}

async function resolveManagerOwner(agencyId: string, requestedOwner: string, clientIds: string[]) {
  const admin = createAdminClient()

  if (requestedOwner && UUID_PATTERN.test(requestedOwner)) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id,full_name,role,active')
      .eq('id', requestedOwner)
      .eq('agency_id', agencyId)
      .eq('active', true)
      .in('role', ['admin', 'agent'])
      .maybeSingle()
    if (!profile) throw new Error('Choose an active CRM agent for this campaign.')
    return { id: profile.id, name: profile.full_name || 'Agent' }
  }

  if (!clientIds.length) throw new Error('Choose which agent owns this campaign.')
  const { data: clients, error } = await admin
    .from('clients')
    .select('assigned_agent_id')
    .eq('agency_id', agencyId)
    .in('id', clientIds)
  if (error) throw new Error(error.message)

  const owners = Array.from(new Set((clients || []).map((client) => String(client.assigned_agent_id || '')).filter(Boolean)))
  if (owners.length !== 1) throw new Error('Selected clients must all belong to the same agent when creating an Outreach campaign.')

  const { data: profile } = await admin
    .from('profiles')
    .select('id,full_name,role,active')
    .eq('id', owners[0])
    .eq('agency_id', agencyId)
    .eq('active', true)
    .in('role', ['admin', 'agent'])
    .maybeSingle()
  if (!profile) throw new Error('The selected clients do not have an active CRM agent.')
  return { id: profile.id, name: profile.full_name || 'Agent' }
}

async function addMembers(
  campaignId: string,
  ownerId: string,
  clientIds: string[],
  agencyId: string,
  manager: boolean,
  supabase: Awaited<ReturnType<typeof getCrmSession>>['supabase']
) {
  if (!clientIds.length) return { added: 0, existing: 0, unavailable: 0 }
  const reader = manager ? createAdminClient() : supabase
  const { data: clients, error: clientError } = await reader
    .from('clients')
    .select('id,assigned_agent_id')
    .eq('agency_id', agencyId)
    .eq('assigned_agent_id', ownerId)
    .in('id', clientIds)
  if (clientError) throw new Error(clientError.message)

  const eligibleIds = (clients || []).map((client) => client.id)
  if (!eligibleIds.length) return { added: 0, existing: 0, unavailable: clientIds.length }

  const { data: existingRows, error: existingError } = await supabase
    .from('crm_outreach_campaign_members')
    .select('client_id')
    .eq('campaign_id', campaignId)
    .in('client_id', eligibleIds)
  if (existingError) throw new Error(existingError.message)

  const existing = new Set((existingRows || []).map((row) => row.client_id))
  const inserts = eligibleIds
    .filter((clientId) => !existing.has(clientId))
    .map((clientId) => ({
      agency_id: agencyId,
      campaign_id: campaignId,
      client_id: clientId,
      assigned_agent_id: ownerId,
      status: 'not_contacted'
    }))

  if (inserts.length) {
    const { error } = await supabase.from('crm_outreach_campaign_members').insert(inserts)
    if (error) throw new Error(error.message)
  }

  return {
    added: inserts.length,
    existing: eligibleIds.length - inserts.length,
    unavailable: clientIds.length - eligibleIds.length
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, userId, profile } = await getCrmSession()
    if (!profile?.agency_id) return json({ error: 'Not authorized.' }, 403)

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const action = clean(body.action, 40).toLowerCase()
    const manager = profile.role === 'manager'
    const clientIds = clientIdsFrom(body.client_ids)

    if (action === 'create' || action === 'create_and_add') {
      const name = clean(body.name, 120)
      const topic = clean(body.topic, 30).toLowerCase() || 'general'
      if (name.length < 2) return json({ error: 'Enter a campaign name.' }, 400)
      if (!TOPICS.has(topic)) return json({ error: 'Choose a valid campaign topic.' }, 400)

      const owner = manager
        ? await resolveManagerOwner(profile.agency_id, clean(body.assigned_agent_id, 50), clientIds)
        : { id: userId, name: profile.full_name || 'Agent' }

      const { data: campaign, error } = await supabase
        .from('crm_outreach_campaigns')
        .insert({
          agency_id: profile.agency_id,
          name,
          topic,
          status: 'active',
          created_by: userId,
          assigned_agent_id: owner.id
        })
        .select('id,name,topic,status,assigned_agent_id,created_at')
        .single()
      if (error || !campaign) return json({ error: error?.message || 'Unable to create campaign.' }, 400)

      let memberResult = { added: 0, existing: 0, unavailable: 0 }
      if (action === 'create_and_add' && clientIds.length) {
        memberResult = await addMembers(campaign.id, owner.id, clientIds, profile.agency_id, manager, supabase)
      }

      await supabase.from('audit_log').insert({
        agency_id: profile.agency_id,
        actor_id: userId,
        action: 'outreach.campaign_created',
        details: { campaign_id: campaign.id, topic, assigned_agent_id: owner.id, added_clients: memberResult.added }
      })

      return json({ campaign: { ...campaign, agent_name: owner.name }, ...memberResult })
    }

    if (action === 'add_members') {
      const campaignId = clean(body.campaign_id, 50)
      if (!UUID_PATTERN.test(campaignId)) return json({ error: 'Choose a valid campaign.' }, 400)
      if (!clientIds.length) return json({ error: 'Select at least one client.' }, 400)

      const { data: campaign, error } = await supabase
        .from('crm_outreach_campaigns')
        .select('id,status,assigned_agent_id')
        .eq('id', campaignId)
        .eq('agency_id', profile.agency_id)
        .maybeSingle()
      if (error) return json({ error: error.message }, 400)
      if (!campaign || campaign.status !== 'active') return json({ error: 'Campaign not found, archived, or assigned to another agent.' }, 404)
      if (!manager && campaign.assigned_agent_id !== userId) return json({ error: 'This campaign belongs to another agent.' }, 403)

      const result = await addMembers(campaign.id, campaign.assigned_agent_id, clientIds, profile.agency_id, manager, supabase)
      return json(result)
    }

    return json({ error: 'Unknown campaign assignment action.' }, 400)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to update Outreach campaign.' }, 400)
  }
}
