import { NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchRingCentralRecording, getRingCentralAccessToken, isRingCentralConfigured } from '@/lib/ringcentral'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

export async function GET(_request: Request, { params }: { params: Params }) {
  const { id } = await params
  const recordingId = String(id || '').trim()
  if (!recordingId) return NextResponse.json({ error: 'Missing recording ID.' }, { status: 400 })

  const { profile } = await getCrmSession()
  if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  if (!isRingCentralConfigured()) return NextResponse.json({ error: 'RingCentral is not configured.' }, { status: 409 })

  const admin = createAdminClient()
  const { data: call, error } = await admin
    .from('ringcentral_calls')
    .select('id,recording_id')
    .eq('agency_id', profile.agency_id)
    .eq('recording_id', recordingId)
    .maybeSingle()

  if (error || !call) return NextResponse.json({ error: 'Recording was not found for this agency.' }, { status: 404 })

  try {
    const accessToken = await getRingCentralAccessToken()
    const source = await fetchRingCentralRecording(recordingId, accessToken)
    const headers = new Headers()
    headers.set('Content-Type', source.headers.get('content-type') || 'audio/mpeg')
    headers.set('Cache-Control', 'private, no-store')
    headers.set('Content-Disposition', `inline; filename="ringcentral-${recordingId}.mp3"`)
    return new Response(source.body, { status: 200, headers })
  } catch (playbackError) {
    return NextResponse.json({
      error: playbackError instanceof Error ? playbackError.message : 'Unable to play recording.'
    }, { status: 502 })
  }
}
