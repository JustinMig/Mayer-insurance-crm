import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCrmSession } from '@/lib/crm-session'
import WorkspaceClient from '../workspace/WorkspaceClient'
import WorkspaceLeadCollapseController from '../workspace/WorkspaceLeadCollapseController'
import LeadsAutoOpen from './LeadsAutoOpen'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'Mayer Leads',
  description: 'Quick lead entry for Mayer CRM',
  applicationName: 'Mayer Leads',
  manifest: '/leads.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Mayer Leads'
  },
  icons: {
    icon: [{ url: '/mayer-leads-icon-v4.png', sizes: '512x512', type: 'image/png' }],
    apple: [{ url: '/mayer-leads-ios-v5.png', sizes: '180x180', type: 'image/png' }],
    shortcut: [{ url: '/mayer-leads-icon-v4.png', sizes: '512x512', type: 'image/png' }]
  }
}

type WorkspaceAgent = {
  id: string
  full_name: string
}

export default async function LeadsPage() {
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

    if (error) throw new Error(`Unable to load Leads agents: ${error.message}`)
    agents = ((data || []) as WorkspaceAgent[]).filter((agent) =>
      ['justin mayer', 'isaiah hernandez'].includes((agent.full_name || '').trim().toLowerCase())
    )
  } else {
    agents = [{ id: userId, full_name: profile.full_name || 'Agent' }]
  }

  return (
    <>
      <style>{`.workspace-heading,.workspace-tabs{display:none!important}.workspace-owner-bar{margin-top:0!important}`}</style>
      <LeadsAutoOpen />
      <WorkspaceLeadCollapseController />
      <WorkspaceClient
        viewerId={userId}
        viewerName={profile.full_name || ''}
        isManager={isManager}
        agents={agents}
      />
    </>
  )
}
