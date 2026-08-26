import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

export async function GET(_request: NextRequest, { params }: { params: Params }) {
  try {
    const { id: clientId } = await params
    const { supabase, profile } = await getCrmSession()
    if (!profile?.agency_id) return json({ error: 'Not authorized.' }, 403)

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('agency_id', profile.agency_id)
      .maybeSingle()
    if (clientError || !client) return json({ error: 'Client not found or access denied.' }, 404)

    const [{ data: members, error: memberError }, { data: interactions, error: interactionError }] = await Promise.all([
      supabase
        .from('crm_outreach_campaign_members')
        .select('id,campaign_id,status,last_outcome,last_note,last_contacted_at,next_action,follow_up_date,follow_up_time,attempt_count')
        .eq('client_id', clientId)
        .eq('agency_id', profile.agency_id)
        .order('updated_at', { ascending: false }),
      supabase
        .from('crm_outreach_interactions')
        .select('id,campaign_id,outcome,note,next_action,follow_up_date,follow_up_time,created_at')
        .eq('client_id', clientId)
        .eq('agency_id', profile.agency_id)
        .order('created_at', { ascending: false })
        .limit(50)
    ])

    if (memberError) return json({ error: memberError.message }, 400)
    if (interactionError) return json({ error: interactionError.message }, 400)

    const campaignIds = Array.from(new Set([
      ...(members || []).map((row) => row.campaign_id),
      ...(interactions || []).map((row) => row.campaign_id)
    ]))

    let campaigns: Array<{ id: string; name: string; topic: string; status: string }> = []
    if (campaignIds.length) {
      const { data, error } = await supabase
        .from('crm_outreach_campaigns')
        .select('id,name,topic,status')
        .eq('agency_id', profile.agency_id)
        .in('id', campaignIds)
      if (error) return json({ error: error.message }, 400)
      campaigns = data || []
    }

    const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]))
    return json({
      memberships: (members || []).map((row) => ({ ...row, campaign: campaignById.get(row.campaign_id) || null })),
      interactions: (interactions || []).map((row) => ({ ...row, campaign: campaignById.get(row.campaign_id) || null }))
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to load outreach history.' }, 400)
  }
}
