import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCrmSession } from '@/lib/crm-session'
import { APPOINTMENT_AGENT_IDS, isSheenaCalendarCoordinator } from '@/lib/calendar-access'
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

type SearchParams = Promise<{ calendar_agent?: string }>

export default async function CalendarPage({ searchParams }: { searchParams?: SearchParams }) {
  const { supabase, userId, profile } = await getCrmSession()
  if (!profile?.agency_id) redirect('/account-setup')

  const coordinator = isSheenaCalendarCoordinator(userId, profile)
  const params = searchParams ? await searchParams : {}
  const requestedAgent = String(params.calendar_agent || '')
  let availableAgents: CalendarAgent[] = []

  if (coordinator) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,full_name')
      .eq('agency_id', profile.agency_id)
      .eq('active', true)
      .in('id', [...APPOINTMENT_AGENT_IDS])

    if (error) throw new Error(`Unable to load Calendar agents: ${error.message}`)
    const byId = new Map((data || []).map((agent) => [agent.id, agent as CalendarAgent]))
    availableAgents = APPOINTMENT_AGENT_IDS.map((id) => byId.get(id)).filter(Boolean) as CalendarAgent[]
  } else {
    availableAgents = [{ id: userId, full_name: profile.full_name || 'Agent' }]
  }

  let agents = availableAgents
  let activeAgentId = availableAgents[0]?.id || ''
  if (coordinator && availableAgents.length) {
    const selected = availableAgents.find((agent) => agent.id === requestedAgent) || availableAgents[0]
    activeAgentId = selected.id
    agents = [selected]
    if (requestedAgent !== selected.id) redirect(`/calendar?calendar_agent=${encodeURIComponent(selected.id)}`)
  }

  return (
    <>
      <div className="clients-page-heading calendar-page-heading">
        <h1>Calendar</h1>
        <p className="subtle">Appointments, activities, clients, and leads.</p>
      </div>

      {coordinator && availableAgents.length > 1 ? (
        <div className="calendar-agent-switcher" aria-label="Choose agent calendar">
          {availableAgents.map((agent) => (
            <a
              key={agent.id}
              href={`/calendar?calendar_agent=${encodeURIComponent(agent.id)}`}
              className={agent.id === activeAgentId ? 'active' : ''}
              aria-current={agent.id === activeAgentId ? 'page' : undefined}
            >
              {agent.full_name.split(' ')[0]}
            </a>
          ))}
        </div>
      ) : null}

      <div className={coordinator ? 'calendar-coordinator-view' : undefined}>
        <DashboardCalendar agents={agents} viewerName={profile.full_name || ''} />
      </div>
      <style>{`
        .calendar-page-heading{margin-bottom:4px}.calendar-page-heading+section.dashboard-calendar-block{margin-top:10px}
        .calendar-agent-switcher{display:grid;grid-template-columns:1fr 1fr;gap:8px;max-width:430px;margin:12px 0 8px}
        .calendar-agent-switcher a{display:flex;align-items:center;justify-content:center;min-height:42px;border:1px solid #cbd5e1;border-radius:11px;background:#f8fafc;color:#334155;font-weight:900;text-decoration:none}
        .calendar-agent-switcher a.active{background:#18324a;border-color:#18324a;color:#fff}
        .calendar-coordinator-view .dashboard-calendar-legend{display:none!important}
        @media(max-width:720px){.calendar-agent-switcher{max-width:none}}
      `}</style>
    </>
  )
}
