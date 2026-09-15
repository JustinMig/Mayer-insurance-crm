import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthorizedMhClients, normalizeMhPhone, OFFICE_RINGCENTRAL_OWNER_ID } from '@/lib/mh-ringcentral-bridge'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

export async function GET(request: Request) {
  try {
    const { clientByPhone } = await getAuthorizedMhClients(request)
    if (!clientByPhone.size) {
      return NextResponse.json({ calls: [] }, { headers: { 'Cache-Control': 'private, no-store' } })
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('ringcentral_calls')
      .select('id,ringcentral_call_id,direction,result,started_at,duration_seconds,contact_phone,from_phone,to_phone,recording_id')
      .eq('user_id', OFFICE_RINGCENTRAL_OWNER_ID)
      .order('started_at', { ascending: false })
      .limit(5000)

    if (error) throw new Error(error.message)

    const calls = (data || []).flatMap((row) => {
      const phone = externalPhone(row)
      const clientId = phone ? clientByPhone.get(phone) : undefined
      if (!clientId) return []
      return [{
        client_id: clientId,
        source_call_id: row.ringcentral_call_id,
        direction: row.direction,
        result: row.result,
        started_at: row.started_at,
        duration_seconds: Math.max(0, Number(row.duration_seconds || 0)),
        contact_phone: phone || row.contact_phone || null,
        from_phone: row.from_phone || null,
        to_phone: row.to_phone || null,
        recording_id: row.recording_id || null
      }]
    })

    return NextResponse.json({ calls }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const status = Number((error as { status?: number })?.status) || 500
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to load M&H RingCentral call data.'
    }, { status })
  }
}
