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

  const { data, error } = await supabase
    .from('crm_call_attempts')
    .select('id,user_id,outcome,note,callback_date,callback_time,called_at')
    .eq('agency_id', profile.agency_id)
    .eq('client_id', id)
    .order('called_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message, attempts: [] }, { status: 400 })

  const userIds = Array.from(new Set((data || []).map((row) => row.user_id)))
  const names: Record<string, string> = {}
  if (userIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id,full_name')
      .eq('agency_id', profile.agency_id)
      .in('id', userIds)
    for (const row of profiles || []) names[row.id] = row.full_name || 'Agent'
  }

  return NextResponse.json({
    attempts: (data || []).map((row) => ({ ...row, agent_name: names[row.user_id] || 'Agent' }))
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}
