import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function clean(value: unknown, max = 500) {
  return String(value || '').trim().slice(0, max)
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, userId, profile } = await getCrmSession()
    if (!profile?.agency_id) return json({ error: 'Not authorized.' }, 403)

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const action = clean(body.action, 30).toLowerCase()
    const campaignId = clean(body.campaign_id, 50)
    if (!UUID_PATTERN.test(campaignId)) return json({ error: 'Invalid campaign.' }, 400)

    const { data: campaign, error: campaignError } = await supabase
      .from('crm_outreach_campaigns')
      .select('id,name,created_by,status')
      .eq('id', campaignId)
      .eq('agency_id', profile.agency_id)
      .maybeSingle()

    if (campaignError) return json({ error: campaignError.message }, 400)
    if (!campaign) return json({ error: 'Campaign not found.' }, 404)

    const canManage = profile.role === 'manager' || profile.role === 'admin' || campaign.created_by === userId
    if (!canManage) return json({ error: 'You do not have permission to manage this campaign.' }, 403)

    if (action === 'rename') {
      const name = clean(body.name, 120)
      if (name.length < 2) return json({ error: 'Enter a campaign name.' }, 400)

      const { data: updated, error } = await supabase
        .from('crm_outreach_campaigns')
        .update({ name })
        .eq('id', campaignId)
        .eq('agency_id', profile.agency_id)
        .select('id,name')
        .maybeSingle()

      if (error) return json({ error: error.message }, 400)
      if (!updated) return json({ error: 'Unable to rename this campaign.' }, 400)

      await supabase.from('audit_log').insert({
        agency_id: profile.agency_id,
        actor_id: userId,
        action: 'outreach.campaign_renamed',
        details: { campaign_id: campaignId, old_name: campaign.name, new_name: name }
      })

      return json({ campaign: updated })
    }

    if (action === 'delete') {
      const [{ count: memberCount }, { count: interactionCount }] = await Promise.all([
        supabase
          .from('crm_outreach_campaign_members')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', campaignId)
          .eq('agency_id', profile.agency_id),
        supabase
          .from('crm_outreach_interactions')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', campaignId)
          .eq('agency_id', profile.agency_id)
      ])

      const { error } = await supabase
        .from('crm_outreach_campaigns')
        .delete()
        .eq('id', campaignId)
        .eq('agency_id', profile.agency_id)

      if (error) return json({ error: error.message }, 400)

      await supabase.from('audit_log').insert({
        agency_id: profile.agency_id,
        actor_id: userId,
        action: 'outreach.campaign_deleted',
        details: {
          campaign_id: campaignId,
          campaign_name: campaign.name,
          campaign_members: Number(memberCount || 0),
          campaign_interactions: Number(interactionCount || 0)
        }
      })

      return json({
        deleted: true,
        member_count: Number(memberCount || 0),
        interaction_count: Number(interactionCount || 0)
      })
    }

    return json({ error: 'Unknown campaign management action.' }, 400)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to manage campaign.' }, 400)
  }
}
