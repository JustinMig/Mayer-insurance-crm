import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCrmSession } from '@/lib/crm-session'
import DashboardCalendar from '../dashboard/DashboardCalendar'

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
    icon: [{ url: '/calendar-icon-v2.png', sizes: '180x180', type: 'image/png' }],
    apple: [{ url: '/calendar-icon-v2.png', sizes: '180x180', type: 'image/png' }],
    shortcut: [{ url: '/calendar-icon-v2.png', sizes: '180x180', type: 'image/png' }]
  }
}

type CalendarAgent = {
  id: string
  full_name: string
}

export default async function CalendarPage() {
  const { supabase, userId, profile } = await getCrmSession()
  if (!profile?.agency_id) redirect('/account-setup')

  const viewerName = (profile.full_name || '').trim().toLowerCase()
  const isJustin = viewerName === 'justin mayer'
  const isIsaiah = viewerName === 'isaiah hernandez'
  const isCoordinator = profile.role === 'manager' && !isJustin && !isIsaiah
  let agents: CalendarAgent[] = []

  if (isCoordinator) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,full_name')
      .eq('agency_id', profile.agency_id)
      .eq('active', true)
      .in('role', ['admin', 'agent'])
      .ilike('full_name', 'Isaiah Hernandez')
      .limit(1)

    if (error) throw new Error(`Unable to load Calendar agent: ${error.message}`)
    agents = (data || []) as CalendarAgent[]
  } else {
    agents = [{ id: userId, full_name: profile.full_name || 'Agent' }]
  }

  return (
    <>
      <div className="clients-page-heading calendar-page-heading">
        <h1>Calendar</h1>
        <p className="subtle">Appointments, activities, clients, and leads.</p>
      </div>
      <DashboardCalendar agents={agents} viewerName={profile.full_name || ''} />
      <style>{`.calendar-page-heading{margin-bottom:4px}.calendar-page-heading+section.dashboard-calendar-block{margin-top:10px}`}</style>
    </>
  )
}
