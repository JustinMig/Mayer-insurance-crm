import { redirect } from 'next/navigation'
import { getCrmSession } from '@/lib/crm-session'
import CampaignsClient from './CampaignsClient'
import spacing from './OutreachSpacing.module.css'

type Campaign = {
  id: string
  name: string
  topic: string
  status: string
  created_by: string
  assigned_agent_id: string
  created_at: string
}

type Member = {
  campaign_id: string
  status: string
}

type Agent = { id: string; full_name: string }
type CampaignCounts = {
  total: number
  not_contacted: number
  attempted: number
  spoke: number
  follow_up: number
  completed: number
  not_interested: number
  do_not_call: number
  unreachable: number
}

function emptyCounts(): CampaignCounts {
  return {
    total: 0,
    not_contacted: 0,
    attempted: 0,
    spoke: 0,
    follow_up: 0,
    completed: 0,
    not_interested: 0,
    do_not_call: 0,
    unreachable: 0
  }
}

export default async function CampaignsPage() {
  const { supabase, userId, profile } = await getCrmSession()
  if (!profile?.agency_id) redirect('/account-setup')

  const manager = profile.role === 'manager'
  const agentsPromise = manager
    ? supabase
        .from('profiles')
        .select('id,full_name')
        .eq('agency_id', profile.agency_id)
        .eq('active', true)
        .in('role', ['admin', 'agent'])
        .order('full_name', { ascending: true })
    : Promise.resolve({ data: [{ id: userId, full_name: profile.full_name || 'Agent' }], error: null })

  const [campaignResult, memberResult, agentResult] = await Promise.all([
    supabase
      .from('crm_outreach_campaigns')
      .select('id,name,topic,status,created_by,assigned_agent_id,created_at')
      .eq('agency_id', profile.agency_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false }),
    supabase
      .from('crm_outreach_campaign_members')
      .select('campaign_id,status')
      .eq('agency_id', profile.agency_id),
    agentsPromise
  ])

  if (campaignResult.error) throw new Error(`Unable to load outreach campaigns: ${campaignResult.error.message}`)
  if (memberResult.error) throw new Error(`Unable to load campaign progress: ${memberResult.error.message}`)

  const campaigns = (campaignResult.data || []) as Campaign[]
  const members = (memberResult.data || []) as Member[]
  const agents = (agentResult.data || []) as Agent[]
  const agentNames = new Map(agents.map((agent) => [agent.id, agent.full_name]))
  const countsByCampaign = new Map<string, CampaignCounts>()

  for (const member of members) {
    const counts = countsByCampaign.get(member.campaign_id) || emptyCounts()
    counts.total += 1
    if (member.status in counts && member.status !== 'total') {
      counts[member.status as keyof Omit<CampaignCounts, 'total'>] += 1
    }
    countsByCampaign.set(member.campaign_id, counts)
  }

  const summaries = campaigns.map((campaign) => {
    const counts = countsByCampaign.get(campaign.id) || emptyCounts()
    return {
      id: campaign.id,
      name: campaign.name,
      topic: campaign.topic,
      assigned_agent_id: campaign.assigned_agent_id,
      agent_name: agentNames.get(campaign.assigned_agent_id) || 'Agent',
      created_at: campaign.created_at,
      can_archive: manager || campaign.assigned_agent_id === userId,
      ...counts
    }
  })

  return (
    <div className={spacing.scope}>
      <CampaignsClient
        campaigns={summaries}
        agents={agents}
        canChooseAgent={manager}
        defaultAgentId={manager ? (agents[0]?.id || '') : userId}
      />
    </div>
  )
}
