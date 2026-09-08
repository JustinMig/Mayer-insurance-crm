import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeUsPhone, sendTwilioSms } from '@/lib/twilio'

const SEND_CONCURRENCY = 10

type BulkSmsPayload = {
  client_ids?: string[]
  body?: string
  preflight_failures?: string[]
}

type ClientRow = { id: string; first_name: string | null; last_name: string | null; phone: string | null }

function clientName(client: ClientRow) {
  return [client.first_name, client.last_name].filter(Boolean).join(' ').trim() || 'Client'
}

async function updateJob(id: string, values: Record<string, unknown>) {
  const admin = createAdminClient()
  await admin.from('crm_background_jobs').update({ ...values, updated_at: new Date().toISOString() }).eq('id', id)
}

export async function processBulkSmsJob(jobId: string) {
  const admin = createAdminClient()
  const { data: claimed, error: claimError } = await admin
    .from('crm_background_jobs')
    .update({ status: 'running', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('job_type', 'bulk_sms')
    .eq('status', 'queued')
    .select('id,agency_id,created_by,payload,total_items')
    .maybeSingle()

  if (claimError || !claimed) return

  try {
    const payload = (claimed.payload || {}) as BulkSmsPayload
    const clientIds = Array.from(new Set(Array.isArray(payload.client_ids) ? payload.client_ids.filter(Boolean) : []))
    const body = String(payload.body || '').trim()
    const failures = Array.isArray(payload.preflight_failures) ? [...payload.preflight_failures] : []
    if (!clientIds.length || !body) throw new Error('The bulk SMS job is missing recipients or message text.')

    const { data: clients, error: clientError } = await admin
      .from('clients')
      .select('id,first_name,last_name,phone')
      .eq('agency_id', claimed.agency_id)
      .in('id', clientIds)
    if (clientError) throw new Error(clientError.message)

    const recipients = ((clients || []) as ClientRow[]).flatMap((client) => {
      const phone = normalizeUsPhone(String(client.phone || ''))
      if (!phone) {
        failures.push(`${clientName(client)}: invalid or missing U.S. mobile number`)
        return []
      }
      return [{ client, phone }]
    })

    const now = new Date().toISOString()
    const { data: pendingRows, error: pendingError } = recipients.length ? await admin
      .from('client_sms_messages')
      .insert(recipients.map(({ client, phone }) => ({
        client_id: client.id,
        user_id: claimed.created_by,
        direction: 'outbound',
        body,
        to_number: phone,
        status: 'sending',
        read_at: now
      })))
      .select('id,client_id') : { data: [], error: null }

    if (pendingError) throw new Error(pendingError.message)
    const pendingByClient = new Map((pendingRows || []).map((row) => [row.client_id, row.id]))

    let processed = 0
    let succeeded = 0
    let failed = failures.length

    for (let index = 0; index < recipients.length; index += SEND_CONCURRENCY) {
      const batch = recipients.slice(index, index + SEND_CONCURRENCY)
      const results = await Promise.all(batch.map(async ({ client, phone }) => {
        const pendingId = pendingByClient.get(client.id)
        try {
          const sent = await sendTwilioSms(phone, body)
          if (pendingId) {
            await admin.from('client_sms_messages').update({
              twilio_message_sid: String(sent.sid || '') || null,
              status: String(sent.status || 'queued'),
              from_number: String(sent.from || '') || null,
              updated_at: new Date().toISOString()
            }).eq('id', pendingId)
          }
          return { ok: true as const }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to send'
          if (pendingId) await admin.from('client_sms_messages').update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() }).eq('id', pendingId)
          return { ok: false as const, failure: `${clientName(client)}: ${message}` }
        }
      }))

      for (const result of results) {
        processed += 1
        if (result.ok) succeeded += 1
        else {
          failed += 1
          failures.push(result.failure)
        }
      }

      await updateJob(jobId, { processed_items: processed, succeeded_items: succeeded, failed_items: failed, result: { failures: failures.slice(0, 100) } })
    }

    await updateJob(jobId, {
      status: 'completed',
      processed_items: processed,
      succeeded_items: succeeded,
      failed_items: failed,
      result: { failures: failures.slice(0, 100) },
      completed_at: new Date().toISOString()
    })

    await admin.from('audit_log').insert({
      agency_id: claimed.agency_id,
      actor_id: claimed.created_by,
      client_id: null,
      action: 'bulk_sms.job_completed',
      details: { job_id: jobId, total: claimed.total_items, succeeded, failed }
    })
  } catch (error) {
    await updateJob(jobId, {
      status: 'failed',
      error_message: error instanceof Error ? error.message : 'Bulk SMS job failed.',
      completed_at: new Date().toISOString()
    })
  }
}
