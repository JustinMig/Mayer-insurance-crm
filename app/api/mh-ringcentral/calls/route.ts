import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthorizedMhClients, normalizeMhPhone, OFFICE_RINGCENTRAL_OWNER_ID } from '@/lib/mh-ringcentral-bridge'
import { getRingCentralAccessToken, isRingCentralConfigured, listRecentRingCentralCalls, normalizePhone } from '@/lib/ringcentral'

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

async function refreshMayerRingCentral(admin: ReturnType<typeof createAdminClient>) {
  if (!isRingCentralConfigured()) return

  const { data: owner } = await admin
    .from('profiles')
    .select('agency_id')
    .eq('id', OFFICE_RINGCENTRAL_OWNER_ID)
    .maybeSingle()
  if (!owner?.agency_id) return

  const [accessToken, clientsResult] = await Promise.all([
    getRingCentralAccessToken(),
    admin
      .from('clients')
      .select('id,phone,created_at')
      .eq('agency_id', owner.agency_id)
      .not('phone', 'is', null)
      .order('created_at', { ascending: false })
  ])
  if (clientsResult.error) throw new Error(`Unable to load Mayer client phone numbers: ${clientsResult.error.message}`)

  const records = await listRecentRingCentralCalls(accessToken, 7)
  const mayerClientByPhone = new Map<string, string>()
  for (const client of clientsResult.data || []) {
    const phone = normalizePhone(client.phone)
    if (phone && !mayerClientByPhone.has(phone)) mayerClientByPhone.set(phone, client.id)
  }

  const nowIso = new Date().toISOString()
  const rows = records.map((record) => {
    const externalNumber = record.direction === 'Inbound' ? record.from?.phoneNumber : record.to?.phoneNumber
    const normalizedExternal = normalizePhone(externalNumber)
    return {
      agency_id: owner.agency_id,
      user_id: OFFICE_RINGCENTRAL_OWNER_ID,
      client_id: normalizedExternal ? mayerClientByPhone.get(normalizedExternal) || null : null,
      ringcentral_call_id: record.id,
      ringcentral_session_id: record.sessionId || null,
      telephony_session_id: record.telephonySessionId || null,
      direction: record.direction,
      result: record.result || null,
      started_at: record.startTime,
      duration_seconds: Math.max(0, Number(record.duration || 0)),
      contact_phone: normalizedExternal || null,
      from_phone: record.from?.phoneNumber || null,
      to_phone: record.to?.phoneNumber || null,
      recording_id: record.recording?.id || null,
      updated_at: nowIso
    }
  })

  if (rows.length) {
    const { error } = await admin
      .from('ringcentral_calls')
      .upsert(rows, { onConflict: 'user_id,ringcentral_call_id' })
    if (error) throw new Error(`Unable to refresh Mayer RingCentral calls: ${error.message}`)
  }
}

export async function GET(request: Request) {
  try {
    const { clientByPhone } = await getAuthorizedMhClients(request)
    if (!clientByPhone.size) {
      return NextResponse.json({ calls: [] }, { headers: { 'Cache-Control': 'private, no-store' } })
    }

    const admin = createAdminClient()
    // Keep M&H independent from Mayer's manual Sync button. Each M&H refresh
    // first asks RingCentral for the latest office calls, saves them in Mayer,
    // then exports only phone numbers that uniquely belong to an M&H client.
    await refreshMayerRingCentral(admin)

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
