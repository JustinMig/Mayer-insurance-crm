import { NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function metricSummary(rows: Array<{ metric_name: string; metric_value: number; route: string; device_class: string | null }>) {
  const grouped = new Map<string, number[]>()
  for (const row of rows) {
    const key = `${row.metric_name}|${row.device_class || 'unknown'}`
    const list = grouped.get(key) || []
    list.push(Number(row.metric_value || 0))
    grouped.set(key, list)
  }
  return [...grouped.entries()].map(([key, values]) => {
    values.sort((a, b) => a - b)
    const [metric_name, device_class] = key.split('|')
    const average = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
    const p95 = values[Math.min(values.length - 1, Math.floor(values.length * .95))] || 0
    return { metric_name, device_class, samples: values.length, average, p95 }
  }).sort((a, b) => a.metric_name.localeCompare(b.metric_name) || a.device_class.localeCompare(b.device_class))
}

export async function GET() {
  try {
    const { profile } = await getCrmSession()
    if (!profile?.agency_id || profile.role !== 'admin') return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
    const admin = createAdminClient()
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const [
      clients,
      documents,
      audit,
      sms,
      failedSms,
      jobs,
      pendingSoa,
      performance,
      calendar,
      leads
    ] = await Promise.all([
      admin.from('clients').select('id', { count: 'exact', head: true }).eq('agency_id', profile.agency_id),
      admin.from('documents').select('id', { count: 'exact', head: true }).eq('agency_id', profile.agency_id),
      admin.from('audit_log').select('id', { count: 'exact', head: true }).eq('agency_id', profile.agency_id),
      admin.from('client_sms_messages').select('id', { count: 'exact', head: true }),
      admin.from('client_sms_messages').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('created_at', since24h),
      admin.from('crm_background_jobs').select('id,status,job_type,total_items,processed_items,succeeded_items,failed_items,error_message,created_at,updated_at').eq('agency_id', profile.agency_id).order('created_at', { ascending: false }).limit(30),
      admin.from('soa_signature_requests').select('id', { count: 'exact', head: true }).eq('agency_id', profile.agency_id).eq('status', 'pending'),
      admin.from('crm_performance_events').select('metric_name,metric_value,route,device_class').eq('agency_id', profile.agency_id).gte('created_at', since7d).order('created_at', { ascending: false }).limit(5000),
      admin.from('workspace_calendar_events').select('id', { count: 'exact', head: true }).eq('agency_id', profile.agency_id),
      admin.from('workspace_leads').select('id', { count: 'exact', head: true }).eq('agency_id', profile.agency_id).eq('status', 'lead')
    ])

    const errors = [clients.error, documents.error, audit.error, sms.error, failedSms.error, jobs.error, pendingSoa.error, performance.error, calendar.error, leads.error].filter(Boolean)
    if (errors.length) return NextResponse.json({ error: errors[0]?.message || 'Unable to load system health.' }, { status: 500 })

    const jobRows = jobs.data || []
    return NextResponse.json({
      generated_at: new Date().toISOString(),
      counts: {
        clients: clients.count || 0,
        documents: documents.count || 0,
        audit_log: audit.count || 0,
        sms_messages: sms.count || 0,
        failed_sms_24h: failedSms.count || 0,
        pending_soa: pendingSoa.count || 0,
        calendar_events: calendar.count || 0,
        active_leads: leads.count || 0
      },
      jobs: jobRows,
      job_summary: {
        queued: jobRows.filter((row) => row.status === 'queued').length,
        running: jobRows.filter((row) => row.status === 'running').length,
        failed: jobRows.filter((row) => row.status === 'failed').length
      },
      performance: metricSummary((performance.data || []) as Array<{ metric_name: string; metric_value: number; route: string; device_class: string | null }>),
      recommendations: [
        { key: 'failed_sms', level: (failedSms.count || 0) > 0 ? 'warn' : 'ok', message: (failedSms.count || 0) > 0 ? `${failedSms.count} SMS message(s) failed in the last 24 hours.` : 'No failed SMS messages in the last 24 hours.' },
        { key: 'jobs', level: jobRows.some((row) => row.status === 'failed') ? 'warn' : 'ok', message: jobRows.some((row) => row.status === 'failed') ? 'One or more recent background jobs failed.' : 'Recent background jobs are healthy.' },
        { key: 'audit', level: (audit.count || 0) > 100000 ? 'warn' : 'ok', message: (audit.count || 0) > 100000 ? 'Audit log is large enough to consider archival.' : 'Audit log size is within the normal operating range.' }
      ]
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load system health.' }, { status: 500 })
  }
}
