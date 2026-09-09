import { NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(_request: Request, { params }: { params: Params }) {
  const { id } = await params
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ attempts: [] }, { status: 400 })

  const { supabase, profile } = await getCrmSession()
  if (!profile?.agency_id) return NextResponse.json({ attempts: [] }, { status: 403 })

  const [manualResult, ringCentralResult] = await Promise.all([
    supabase
      .from('crm_call_attempts')
      .select('id,user_id,outcome,note,callback_date,callback_time,called_at')
      .eq('agency_id', profile.agency_id)
      .eq('client_id', id)
      .order('called_at', { ascending: false })
      .limit(75),
    supabase
      .from('ringcentral_calls')
      .select('id,user_id,direction,result,started_at,duration_seconds,contact_phone,from_phone,to_phone,recording_id')
      .eq('agency_id', profile.agency_id)
      .eq('client_id', id)
      .order('started_at', { ascending: false })
      .limit(75)
  ])

  if (manualResult.error) return NextResponse.json({ error: manualResult.error.message, attempts: [] }, { status: 400 })
  if (ringCentralResult.error && ringCentralResult.error.code !== '42P01') {
    return NextResponse.json({ error: ringCentralResult.error.message, attempts: [] }, { status: 400 })
  }

  const manualRows = manualResult.data || []
  const ringCentralRows = ringCentralResult.data || []
  const userIds = Array.from(new Set([...manualRows, ...ringCentralRows].map((row) => row.user_id)))
  const names: Record<string, string> = {}
  if (userIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id,full_name')
      .eq('agency_id', profile.agency_id)
      .in('id', userIds)
    for (const row of profiles || []) names[row.id] = row.full_name || 'Agent'
  }

  const manualAttempts = manualRows.map((row) => ({
    ...row,
    source: 'manual' as const,
    agent_name: names[row.user_id] || 'Agent'
  }))

  const ringCentralAttempts = ringCentralRows.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    agent_name: names[row.user_id] || 'Agent',
    source: 'ringcentral' as const,
    outcome: row.result || (row.direction === 'Inbound' ? 'Inbound' : 'Outbound'),
    note: null,
    callback_date: null,
    callback_time: null,
    called_at: row.started_at,
    direction: row.direction,
    duration_seconds: row.duration_seconds || 0,
    contact_phone: row.contact_phone,
    from_phone: row.from_phone,
    to_phone: row.to_phone,
    recording_id: row.recording_id
  }))

  const attempts = [...manualAttempts, ...ringCentralAttempts]
    .sort((a, b) => new Date(b.called_at).getTime() - new Date(a.called_at).getTime())
    .slice(0, 125)

  return NextResponse.json({ attempts }, { headers: { 'Cache-Control': 'private, no-store' } })
}
