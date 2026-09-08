import { after, NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { createAdminClient } from '@/lib/supabase/admin'
import { canSeeAllClients } from '@/lib/client-access'
import { processBulkSmsJob } from '@/lib/background-jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_RECIPIENTS = 250

type ClientRow = {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
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
    const canSeeAgency = canSeeAllClients(profile.role)
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
    const preflightFailures = clientIds
      .filter((id) => !accessibleIds.has(id))
      .map(() => 'One selected client is not accessible.')

    if (!clients.length) return NextResponse.json({ error: 'None of the selected clients are accessible.' }, { status: 403 })

    const { data: job, error: jobError } = await admin
      .from('crm_background_jobs')
      .insert({
        agency_id: profile.agency_id,
        created_by: userId,
        job_type: 'bulk_sms',
        status: 'queued',
        payload: { client_ids: clients.map((client) => client.id), body, preflight_failures: preflightFailures },
        total_items: clients.length,
        failed_items: preflightFailures.length
      })
      .select('id,status,total_items,created_at')
      .single()

    if (jobError || !job) return NextResponse.json({ error: jobError?.message || 'Unable to queue mass text.' }, { status: 500 })

    after(async () => {
      await processBulkSmsJob(job.id)
    })

    await admin.from('audit_log').insert({
      agency_id: profile.agency_id,
      actor_id: userId,
      client_id: null,
      action: 'bulk_sms.job_queued',
      details: { job_id: job.id, recipients: clients.length, inaccessible: preflightFailures.length }
    })

    return NextResponse.json({
      queued: true,
      job_id: job.id,
      total_count: clients.length,
      preflight_failed_count: preflightFailures.length
    }, { status: 202 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to queue mass text.' }, { status: 500 })
  }
}
