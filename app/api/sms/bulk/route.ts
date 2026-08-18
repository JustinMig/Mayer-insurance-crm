import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeUsPhone, sendTwilioSms } from '@/lib/twilio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_RECIPIENTS = 250
const SEND_CONCURRENCY = 5

type ClientRow = {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
}

function clientName(client: ClientRow) {
  return [client.first_name, client.last_name].filter(Boolean).join(' ').trim() || 'Client'
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => ({})) as { client_ids?: string[]; body?: string }
    const clientIds = Array.isArray(payload.client_ids)
      ? Array.from(new Set(payload.client_ids.filter(Boolean))).slice(0, MAX_RECIPIENTS)
      : []
    const body = String(payload.body || '').trim()

    if (!clientIds.length) return NextResponse.json({ error: 'Choose at least one client.' }, { status: 400 })
    if (!body) return NextResponse.json({ error: 'Enter a message.' }, { status: 400 })
    if (body.length > 1500) return NextResponse.json({ error: 'Message is too long.' }, { status: 400 })

    const { userId, profile } = await getCrmSession()
    if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

    const admin = createAdminClient()
    const canSeeAgency = profile.role === 'admin' || profile.role === 'manager'
    let clientQuery = admin
      .from('clients')
      .select('id,first_name,last_name,phone')
      .eq('agency_id', profile.agency_id)
      .in('id', clientIds)
    if (!canSeeAgency) clientQuery = clientQuery.eq('assigned_agent_id', userId)

    const { data: clientData, error: clientError } = await clientQuery
    if (clientError) return NextResponse.json({ error: clientError.message }, { status: 500 })

    const clients = (clientData || []) as ClientRow[]
    const accessibleIds = new Set(clients.map((client) => client.id))
    const failures: string[] = clientIds
      .filter((id) => !accessibleIds.has(id))
      .map(() => 'One selected client is not accessible.')

    const recipients = clients.flatMap((client) => {
      const phone = normalizeUsPhone(String(client.phone || ''))
      if (!phone) {
        failures.push(`${clientName(client)}: invalid or missing U.S. mobile number`)
        return []
      }
      return [{ client, phone }]
    })

    if (!recipients.length) {
      return NextResponse.json({ sent_count: 0, failed_count: failures.length, failures })
    }

    const now = new Date().toISOString()
    const { data: pendingRows, error: pendingError } = await admin
      .from('client_sms_messages')
      .insert(recipients.map(({ client, phone }) => ({
        client_id: client.id,
        user_id: userId,
        direction: 'outbound',
        body,
        to_number: phone,
        status: 'sending',
        read_at: now
      })))
      .select('id,client_id')

    if (pendingError) return NextResponse.json({ error: pendingError.message }, { status: 500 })
    const pendingByClient = new Map((pendingRows || []).map((row) => [row.client_id, row.id]))

    let sentCount = 0
    for (let index = 0; index < recipients.length; index += SEND_CONCURRENCY) {
      const batch = recipients.slice(index, index + SEND_CONCURRENCY)
      const results = await Promise.all(batch.map(async ({ client, phone }) => {
        const pendingId = pendingByClient.get(client.id)
        try {
          const sent = await sendTwilioSms(phone, body)
          const sid = String(sent.sid || '')
          const status = String(sent.status || 'queued')
          const from = String(sent.from || '')
          if (pendingId) {
            await admin
              .from('client_sms_messages')
              .update({
                twilio_message_sid: sid || null,
                status,
                from_number: from || null,
                updated_at: new Date().toISOString()
              })
              .eq('id', pendingId)
          }
          return { ok: true as const }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to send'
          if (pendingId) {
            await admin
              .from('client_sms_messages')
              .update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() })
              .eq('id', pendingId)
          }
          return { ok: false as const, failure: `${clientName(client)}: ${message}` }
        }
      }))

      for (const result of results) {
        if (result.ok) sentCount += 1
        else failures.push(result.failure)
      }
    }

    return NextResponse.json({
      sent_count: sentCount,
      failed_count: failures.length,
      failures
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to send mass text.' }, { status: 500 })
  }
}
