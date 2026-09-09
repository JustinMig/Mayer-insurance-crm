import { NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getRingCentralAccessToken,
  isRingCentralConfigured,
  listRecentRingCentralCalls,
  normalizePhone
} from '@/lib/ringcentral'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const JUSTIN_USER_ID = '9c9b6c8a-add4-475d-bda5-c27169f117a1'

function isJustin(userId: string, fullName?: string | null) {
  return userId === JUSTIN_USER_ID && String(fullName || '').trim().toLowerCase() === 'justin mayer'
}

export async function GET() {
  const { userId, profile } = await getCrmSession()
  const pilot = Boolean(profile?.agency_id && isJustin(userId, profile.full_name))
  return NextResponse.json({
    pilot,
    configured: pilot && isRingCentralConfigured()
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST() {
  const { userId, profile } = await getCrmSession()
  if (!profile?.agency_id || !isJustin(userId, profile.full_name)) {
    return NextResponse.json({ error: 'RingCentral pilot is currently enabled only for Justin.' }, { status: 403 })
  }
  if (!isRingCentralConfigured()) {
    return NextResponse.json({
      configured: false,
      error: 'RingCentral credentials have not been added to Vercel yet.'
    }, { status: 409 })
  }

  try {
    const accessToken = await getRingCentralAccessToken()
    const records = await listRecentRingCentralCalls(accessToken, 7)
    const admin = createAdminClient()

    const { data: clients, error: clientError } = await admin
      .from('clients')
      .select('id,phone')
      .eq('agency_id', profile.agency_id)

    if (clientError) throw new Error(`Unable to load client phone numbers: ${clientError.message}`)

    const clientByPhone = new Map<string, string>()
    for (const client of clients || []) {
      const phone = normalizePhone(client.phone)
      if (phone && !clientByPhone.has(phone)) clientByPhone.set(phone, client.id)
    }

    const rows = records.map((record) => {
      const externalNumber = record.direction === 'Inbound' ? record.from?.phoneNumber : record.to?.phoneNumber
      const normalizedExternal = normalizePhone(externalNumber)
      return {
        agency_id: profile.agency_id,
        user_id: userId,
        client_id: normalizedExternal ? clientByPhone.get(normalizedExternal) || null : null,
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
        updated_at: new Date().toISOString()
      }
    })

    let saved = 0
    if (rows.length) {
      const { data, error } = await admin
        .from('ringcentral_calls')
        .upsert(rows, { onConflict: 'user_id,ringcentral_call_id' })
        .select('id')
      if (error) throw new Error(`Unable to save RingCentral calls: ${error.message}`)
      saved = data?.length || 0
    }

    const matched = rows.filter((row) => row.client_id).length
    const recordings = rows.filter((row) => row.recording_id).length

    return NextResponse.json({
      configured: true,
      synced: rows.length,
      saved,
      matched,
      unmatched: rows.length - matched,
      recordings
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'RingCentral sync failed.'
    }, { status: 500 })
  }
}
