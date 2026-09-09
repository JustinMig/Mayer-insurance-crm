import { NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function DELETE(_request: Request, { params }: { params: Params }) {
  const { id } = await params
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Invalid call ID.' }, { status: 400 })

  const { profile } = await getCrmSession()
  if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ringcentral_calls')
    .update({ hidden_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('agency_id', profile.agency_id)
    .is('hidden_at', null)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Call was not found.' }, { status: 404 })

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } })
}
