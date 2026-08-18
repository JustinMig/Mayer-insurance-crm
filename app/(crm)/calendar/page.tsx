import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCrmSession } from '@/lib/crm-session'
import WorkspaceClient from '../workspace/WorkspaceClient'
import WorkspaceLeadCollapseController from '../workspace/WorkspaceLeadCollapseController'
import CalendarAutoOpen from './CalendarAutoOpen'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'Mayer Calendar',
  description: 'Mayer CRM appointments and activities calendar',
  applicationName: 'Mayer Calendar',
  manifest: '/calendar.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Mayer Calendar'
  },
  icons: {
    icon: [{ url: '/calendar-icon.png', sizes: '180x180', type: 'image/png' }],
    apple: [{ url: '/calendar-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: [{ url: '/calendar-icon.png', sizes: '180x180', type: 'image/png' }]
  }
}

type WorkspaceAgent = {
  id: string
  full_name: string
}

export default async function CalendarPage() {
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

    if (error) throw new Error(`Unable to load Calendar agents: ${error.message}`)
    agents = ((data || []) as WorkspaceAgent[]).filter((agent) =>
      ['justin mayer', 'isaiah hernandez'].includes((agent.full_name || '').trim().toLowerCase())
    )
  } else {
    agents = [{ id: userId, full_name: profile.full_name || 'Agent' }]
  }

  return (
    <>
      <CalendarAutoOpen />
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
