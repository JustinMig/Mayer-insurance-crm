import { NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { APPOINTMENT_AGENT_IDS, isSheenaCalendarCoordinator } from '@/lib/calendar-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { supabase, userId, profile } = await getCrmSession()
  if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const coordinator = isSheenaCalendarCoordinator(userId, profile)
  if (!coordinator) {
    return NextResponse.json({
      coordinator: false,
      owner_id: userId,
      agents: [{ id: userId, full_name: profile.full_name || 'Agent' }]
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id,full_name')
    .eq('agency_id', profile.agency_id)
    .eq('active', true)
    .in('id', [...APPOINTMENT_AGENT_IDS])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const byId = new Map((data || []).map((agent) => [agent.id, agent]))
  const agents = APPOINTMENT_AGENT_IDS.map((id) => byId.get(id)).filter(Boolean)

  return NextResponse.json({
    coordinator: true,
    owner_id: '',
    agents
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}
