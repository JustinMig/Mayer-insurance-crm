import { redirect } from 'next/navigation'
import { getCrmSession } from '@/lib/crm-session'
import WorkspaceClient from './WorkspaceClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type WorkspaceAgent = {
  id: string
  full_name: string
}

export default async function WorkspacePage() {
  const { supabase, userId, profile } = await getCrmSession()
  if (!profile?.agency_id) redirect('/account-setup')

  const isManager = profile.role === 'manager'
  let agents: WorkspaceAgent[] = []

  if (isManager) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,full_name')
      .eq('agency_id', profile.agency_id)
      .eq('active', true)
      .in('role', ['admin', 'agent'])
      .order('full_name', { ascending: true })

    if (error) throw new Error(`Unable to load Workspace agents: ${error.message}`)
    agents = ((data || []) as WorkspaceAgent[]).filter((agent) =>
      ['justin mayer', 'isaiah hernandez'].includes((agent.full_name || '').trim().toLowerCase())
    )
  } else {
    agents = [{ id: userId, full_name: profile.full_name || 'Agent' }]
  }

  return (
    <WorkspaceClient
      viewerId={userId}
      viewerName={profile.full_name || ''}
      isManager={isManager}
      agents={agents}
    />
  )
}
