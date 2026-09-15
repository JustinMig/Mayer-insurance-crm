import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchRingCentralRecording, getRingCentralAccessToken, isRingCentralConfigured } from '@/lib/ringcentral'
import { getAuthorizedMhClients, normalizeMhPhone, OFFICE_RINGCENTRAL_OWNER_ID } from '@/lib/mh-ringcentral-bridge'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

function externalPhone(row: {
  direction?: string | null
  contact_phone?: string | null
  from_phone?: string | null
  to_phone?: string | null
}) {
  const direct = normalizeMhPhone(row.contact_phone)
  if (direct) return direct
  return normalizeMhPhone(row.direction === 'Inbound' ? row.from_phone : row.to_phone)
}

export async function GET(request: Request, { params }: { params: Params }) {
  try {
    const { id } = await params
    const recordingId = String(id || '').trim()
    if (!recordingId) return NextResponse.json({ error: 'Missing recording ID.' }, { status: 400 })
    if (!isRingCentralConfigured()) return NextResponse.json({ error: 'RingCentral is not configured.' }, { status: 409 })

    const { clientByPhone } = await getAuthorizedMhClients(request)
    const admin = createAdminClient()
    const { data: call, error } = await admin
      .from('ringcentral_calls')
      .select('id,direction,contact_phone,from_phone,to_phone,recording_id')
      .eq('user_id', OFFICE_RINGCENTRAL_OWNER_ID)
      .eq('recording_id', recordingId)
      .maybeSingle()

    if (error || !call) return NextResponse.json({ error: 'Recording was not found.' }, { status: 404 })
    const phone = externalPhone(call)
    if (!phone || !clientByPhone.has(phone)) return NextResponse.json({ error: 'Recording is not linked to an M&H client.' }, { status: 404 })

    const accessToken = await getRingCentralAccessToken()
    const source = await fetchRingCentralRecording(recordingId, accessToken)
    const headers = new Headers()
    headers.set('Content-Type', source.headers.get('content-type') || 'audio/mpeg')
    headers.set('Cache-Control', 'private, no-store')
    headers.set('Content-Disposition', `inline; filename="ringcentral-${recordingId}.mp3"`)
    return new Response(source.body, { status: 200, headers })
  } catch (error) {
    const status = Number((error as { status?: number })?.status) || 500
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to play RingCentral recording.'
    }, { status })
  }
}
