import { notFound, redirect } from 'next/navigation'
import { getCrmSession } from '@/lib/crm-session'
import { createAdminClient } from '@/lib/supabase/admin'
import CampaignDetailClient from './CampaignDetailClient'
import spacing from '../OutreachSpacing.module.css'

type Params = Promise<{ id: string }>

type Member = {
  id: string
  campaign_id: string
  client_id: string
  assigned_agent_id: string
  status: string
  last_outcome: string | null
  last_note: string | null
  last_contacted_at: string | null
  next_action: string | null
  follow_up_date: string | null
  follow_up_time: string | null
  attempt_count: number
  created_at: string
}

type Client = {
  id: string
  assigned_agent_id: string | null
  first_name: string | null
  last_name: string | null
  phone: string | null
  date_of_birth: string | null
  county: string | null
  state: string | null
  is_medicare: boolean | null
  is_life: boolean | null
  is_retirement: boolean | null
}

type Agent = { id: string; full_name: string }

export default async function CampaignDetailPage({ params }: { params: Params }) {
  const { id } = await params
  const { supabase, userId, profile } = await getCrmSession()
  if (!profile?.agency_id) redirect('/account-setup')

  const { data: campaign, error: campaignError } = await supabase
    .from('crm_outreach_campaigns')
    .select('id,name,topic,status,created_by,created_at')
    .eq('id', id)
    .eq('agency_id', profile.agency_id)
    .maybeSingle()

  if (campaignError) throw new Error(`Unable to load campaign: ${campaignError.message}`)
  if (!campaign) notFound()

  const { data: memberData, error: memberError } = await supabase
    .from('crm_outreach_campaign_members')
    .select('id,campaign_id,client_id,assigned_agent_id,status,last_outcome,last_note,last_contacted_at,next_action,follow_up_date,follow_up_time,attempt_count,created_at')
    .eq('campaign_id', id)
    .eq('agency_id', profile.agency_id)
    .order('created_at', { ascending: true })

  if (memberError) throw new Error(`Unable to load campaign clients: ${memberError.message}`)
  const members = (memberData || []) as Member[]
  const privileged = profile.role === 'manager' || profile.role === 'admin'
  const reader = privileged ? createAdminClient() : supabase
  const clientIds = Array.from(new Set(members.map((member) => member.client_id)))

  let clients: Client[] = []
  if (clientIds.length) {
    let query = reader
      .from('clients')
      .select('id,assigned_agent_id,first_name,last_name,phone,date_of_birth,county,state,is_medicare,is_life,is_retirement')
      .eq('agency_id', profile.agency_id)
      .in('id', clientIds)
    if (!privileged) query = query.eq('assigned_agent_id', userId)
    const { data, error } = await query
    if (error) throw new Error(`Unable to load campaign client records: ${error.message}`)
    clients = (data || []) as Client[]
  }

  let agents: Agent[] = [{ id: userId, full_name: profile.full_name || 'Agent' }]
  if (privileged) {
    const { data, error } = await reader
      .from('profiles')
      .select('id,full_name')
      .eq('agency_id', profile.agency_id)
      .eq('active', true)
      .in('role', ['admin', 'agent', 'manager'])
      .order('full_name', { ascending: true })
    if (!error && data) agents = data as Agent[]
  }

  const clientById = new Map(clients.map((client) => [client.id, client]))
  const agentById = new Map(agents.map((agent) => [agent.id, agent.full_name]))
  const rows = members
    .map((member) => ({ ...member, owner_name: agentById.get(member.assigned_agent_id) || 'Agent', client: clientById.get(member.client_id) || null }))
    .filter((row) => row.client)

  return (
    <div className={spacing.scope}>
      <CampaignDetailClient
        campaign={{ id: campaign.id, name: campaign.name, topic: campaign.topic, status: campaign.status }}
        initialRows={rows}
        agents={agents}
        viewerId={userId}
        canViewAll={privileged}
      />
    </div>
  )
}
