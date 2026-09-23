import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { APPOINTMENT_AGENT_IDS, isSheenaCalendarCoordinator } from '@/lib/calendar-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest) {
  const { supabase, userId, profile } = await getCrmSession()
  if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  try {
    const allowedAgentIds = isSheenaCalendarCoordinator(userId, profile)
      ? [...APPOINTMENT_AGENT_IDS]
      : [userId]

    const { data, error } = await supabase
      .from('workspace_leads')
      .select('id,assigned_agent_id,first_name,last_name,phone,date_of_birth,created_at')
      .eq('agency_id', profile.agency_id)
      .in('assigned_agent_id', allowedAgentIds)
      .eq('status', 'lead')
      .order('created_at', { ascending: false })
      .limit(1500)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ leads: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load calendar leads.' }, { status: 500 })
  }
}
