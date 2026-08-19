import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function normalizedName(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function calendarAgentFromReferer(request: NextRequest) {
  const referer = request.headers.get('referer')
  if (!referer) return ''
  try {
    return String(new URL(referer).searchParams.get('calendar_agent') || '').trim().slice(0, 100)
  } catch {
    return ''
  }
}

async function resolveReadableOwner(
  supabase: Awaited<ReturnType<typeof getCrmSession>>['supabase'],
  profile: NonNullable<Awaited<ReturnType<typeof getCrmSession>>['profile']>,
  userId: string,
  requestedOwner: string
) {
  const viewer = normalizedName(profile.full_name)
  if (viewer === 'justin mayer' || viewer === 'isaiah hernandez' || profile.role !== 'manager') return userId

  let target = null as { id: string; full_name: string | null } | null
  if (requestedOwner) {
    const { data } = await supabase
      .from('profiles')
      .select('id,full_name')
      .eq('id', requestedOwner)
      .eq('agency_id', profile.agency_id)
      .eq('active', true)
      .in('role', ['admin', 'agent'])
      .maybeSingle()
    target = data as { id: string; full_name: string | null } | null
  } else {
    const { data } = await supabase
      .from('profiles')
      .select('id,full_name')
      .eq('agency_id', profile.agency_id)
      .eq('active', true)
      .in('role', ['admin', 'agent'])
      .ilike('full_name', 'Isaiah Hernandez')
      .maybeSingle()
    target = data as { id: string; full_name: string | null } | null
  }

  if (!target || normalizedName(target.full_name) !== 'isaiah hernandez') throw new Error('Calendar access denied.')
  return target.id
}

export async function GET(request: NextRequest) {
  const { supabase, userId, profile } = await getCrmSession()
  if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  try {
    const ownerId = await resolveReadableOwner(supabase, profile, userId, calendarAgentFromReferer(request))
    const { data, error } = await supabase
      .from('workspace_leads')
      .select('id,assigned_agent_id,first_name,last_name,phone,date_of_birth,created_at')
      .eq('agency_id', profile.agency_id)
      .eq('assigned_agent_id', ownerId)
      .eq('status', 'lead')
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ leads: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Calendar access denied.' }, { status: 403 })
  }
}
