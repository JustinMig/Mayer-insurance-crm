import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { loadScheduledAppointmentBlocks } from '@/lib/workspace-calendar-conflicts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function clean(value: unknown, max = 500) {
  return String(value || '').trim().slice(0, max)
}

function validDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function normalizedName(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' }
  })
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, userId, profile } = await getCrmSession()
    if (!profile?.agency_id) return json({ error: 'Not authorized.' }, 403)

    const clientId = clean(request.nextUrl.searchParams.get('client_id'), 50)
    const date = clean(request.nextUrl.searchParams.get('date'), 10)
    if (!UUID_PATTERN.test(clientId)) return json({ error: 'Invalid client.' }, 400)
    if (!validDate(date)) return json({ error: 'Enter a valid appointment date.' }, 400)

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id,assigned_agent_id')
      .eq('id', clientId)
      .eq('agency_id', profile.agency_id)
      .maybeSingle()

    if (clientError) return json({ error: clientError.message }, 400)
    if (!client?.assigned_agent_id) return json({ error: 'Client record is unavailable or has no assigned agent.' }, 404)

    const viewer = normalizedName(profile.full_name)
    if (client.assigned_agent_id !== userId) {
      if (profile.role !== 'manager' || viewer === 'justin mayer' || viewer === 'isaiah hernandez') {
        return json({ error: 'This client belongs to another agent.' }, 403)
      }

      const { data: owner } = await supabase
        .from('profiles')
        .select('id,full_name')
        .eq('id', client.assigned_agent_id)
        .eq('agency_id', profile.agency_id)
        .eq('active', true)
        .maybeSingle()

      if (!owner || normalizedName(owner.full_name) !== 'isaiah hernandez') {
        return json({ error: 'Calendar access denied.' }, 403)
      }
    }

    const blocks = await loadScheduledAppointmentBlocks(
      supabase,
      profile.agency_id,
      client.assigned_agent_id,
      date
    )

    return json({
      client_id: client.id,
      owner_id: client.assigned_agent_id,
      date,
      blocks
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to load appointment availability.' }, 400)
  }
}
