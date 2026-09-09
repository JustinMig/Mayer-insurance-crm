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

// The RingCentral line is an agency office resource. Keep one stable internal
// owner for the existing unique key so every CRM user sees the same call rows
// without creating duplicates when more than one person presses Sync.
const OFFICE_RINGCENTRAL_OWNER_ID = '9c9b6c8a-add4-475d-bda5-c27169f117a1'

export async function GET() {
  const { profile } = await getCrmSession()
  const available = Boolean(profile?.agency_id)
  return NextResponse.json({
    pilot: available,
    office: available,
    configured: available && isRingCentralConfigured()
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST() {
  const { profile } = await getCrmSession()
  if (!profile?.agency_id) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
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
      .select('id,phone,created_at')
      .eq('agency_id', profile.agency_id)
      .order('created_at', { ascending: false })

    if (clientError) throw new Error(`Unable to load client phone numbers: ${clientError.message}`)

    // Use the newest agency client with the matching phone number. The office
    // call log itself is shared; the matched client record determines which
    // agent/client file the call is preserved under.
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
        user_id: OFFICE_RINGCENTRAL_OWNER_ID,
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
      office: true,
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
