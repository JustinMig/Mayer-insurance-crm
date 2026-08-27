import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  const { supabase, userId, profile } = await getCrmSession()
  if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const campaignId = String(request.nextUrl.searchParams.get('campaign_id') || '').trim()
  if (!UUID_PATTERN.test(campaignId)) return NextResponse.json({ error: 'Invalid campaign.' }, { status: 400 })

  const { data: campaign, error: campaignError } = await supabase
    .from('crm_outreach_campaigns')
    .select('id,assigned_agent_id')
    .eq('id', campaignId)
    .eq('agency_id', profile.agency_id)
    .maybeSingle()
  if (campaignError) return NextResponse.json({ error: campaignError.message }, { status: 400 })
  if (!campaign) return NextResponse.json({ error: 'Campaign not found or access denied.' }, { status: 404 })
  if (profile.role !== 'manager' && campaign.assigned_agent_id !== userId) {
    return NextResponse.json({ error: 'Campaign access denied.' }, { status: 403 })
  }

  const { data: members, error } = await supabase
    .from('crm_outreach_campaign_members')
    .select('id,client_id,attempt_count')
    .eq('campaign_id', campaign.id)
    .eq('agency_id', profile.agency_id)
    .eq('assigned_agent_id', campaign.assigned_agent_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ members: members || [] }, { headers: { 'Cache-Control': 'private, no-store' } })
}
