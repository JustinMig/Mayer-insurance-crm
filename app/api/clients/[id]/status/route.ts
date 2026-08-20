import { NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

export async function GET(_request: Request, { params }: { params: Params }) {
  try {
    const { id: clientId } = await params
    const { supabase, profile } = await getCrmSession()
    if (!profile?.agency_id) {
      return NextResponse.json({ error: 'Not authorized.' }, { status: 403, headers: { 'Cache-Control': 'private, no-store' } })
    }

    const { data: client, error } = await supabase
      .from('clients')
      .select('is_deceased')
      .eq('id', clientId)
      .eq('agency_id', profile.agency_id)
      .maybeSingle()

    if (error || !client) {
      return NextResponse.json({ error: 'Client not found or access denied.' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
    }

    return NextResponse.json({ is_deceased: Boolean(client.is_deceased) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load client status.' },
      { status: 500, headers: { 'Cache-Control': 'private, no-store' } }
    )
  }
}
