import { redirect } from 'next/navigation'
import { getCrmSession } from '@/lib/crm-session'
import CallListClient from './CallListClient'

type CallListItem = {
  id: string
  user_id: string
  client_id: string
  status: string
  callback_date: string | null
  callback_time: string | null
  last_outcome: string | null
  last_note: string | null
  last_called_at: string | null
  attempt_count: number | null
  added_at: string
}

type ClientRow = {
  id: string
  assigned_agent_id: string | null
  first_name: string | null
  last_name: string | null
  phone: string | null
  date_of_birth: string | null
  is_medicare: boolean | null
  is_life: boolean | null
  is_retirement: boolean | null
}

type AgentRow = {
  id: string
  full_name: string
}

export default async function CallListPage() {
  const { supabase, userId, profile } = await getCrmSession()
  if (!profile?.agency_id) redirect('/account-setup')

  const isManager = profile.role === 'manager'

  let itemQuery = supabase
    .from('crm_call_list_items')
    .select('id,user_id,client_id,status,callback_date,callback_time,last_outcome,last_note,last_called_at,attempt_count,added_at')
    .eq('agency_id', profile.agency_id)
    .order('added_at', { ascending: true })

  if (!isManager) itemQuery = itemQuery.eq('user_id', userId)

  const [itemsResult, agentsResult] = await Promise.all([
    itemQuery,
    isManager
      ? supabase
          .from('profiles')
          .select('id,full_name')
          .eq('agency_id', profile.agency_id)
          .eq('active', true)
          .in('role', ['admin', 'agent'])
          .order('full_name', { ascending: true })
      : Promise.resolve({ data: [{ id: userId, full_name: profile.full_name || 'Agent' }], error: null })
  ])

  if (itemsResult.error) throw new Error(`Unable to load Call List: ${itemsResult.error.message}`)
  if (agentsResult.error) throw new Error(`Unable to load call-list agents: ${agentsResult.error.message}`)

  const items = (itemsResult.data || []) as CallListItem[]
  const clientIds = Array.from(new Set(items.map((item) => item.client_id)))
  let clients: ClientRow[] = []

  if (clientIds.length) {
    const { data, error } = await supabase
      .from('clients')
      .select('id,assigned_agent_id,first_name,last_name,phone,date_of_birth,is_medicare,is_life,is_retirement')
      .eq('agency_id', profile.agency_id)
      .in('id', clientIds)

    if (error) throw new Error(`Unable to load Call List clients: ${error.message}`)
    clients = (data || []) as ClientRow[]
  }

  const clientById = new Map(clients.map((client) => [client.id, client]))
  const agents = (agentsResult.data || []) as AgentRow[]
  const agentNames = new Map(agents.map((agent) => [agent.id, agent.full_name]))

  const rows = items
    .map((item) => ({
      ...item,
      owner_name: agentNames.get(item.user_id) || 'Agent',
      client: clientById.get(item.client_id) || null
    }))
    .filter((row) => row.client)

  return (
    <CallListClient
      initialRows={rows}
      agents={agents}
      viewerId={userId}
      isManager={isManager}
    />
  )
}
