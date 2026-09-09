import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function clean(value: unknown, max: number) {
  return String(value || '').trim().slice(0, max)
}

type RawMetric = Record<string, unknown>

function toInsertRow(metric: RawMetric, agencyId: string, userId: string) {
  const metricValue = Number(metric.metric_value)
  if (!Number.isFinite(metricValue) || metricValue < 0) return null
  const metricName = clean(metric.metric_name, 80)
  if (!metricName) return null
  return {
    agency_id: agencyId,
    user_id: userId,
    route: clean(metric.route, 240) || '/',
    metric_name: metricName,
    metric_value: metricValue,
    rating: clean(metric.rating, 30) || null,
    device_class: clean(metric.device_class, 30) || null,
    connection_type: clean(metric.connection_type, 30) || null,
    metadata: metric.metadata && typeof metric.metadata === 'object' ? metric.metadata : {}
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, userId, profile } = await getCrmSession()
    const agencyId = profile?.agency_id
    if (!agencyId) return new NextResponse(null, { status: 204 })
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const rawEvents = Array.isArray(body.events) ? body.events.slice(0, 30) : [body]
    const rows = rawEvents
      .filter((event): event is RawMetric => Boolean(event) && typeof event === 'object' && !Array.isArray(event))
      .map((event) => toInsertRow(event, agencyId, userId))
      .filter((row): row is NonNullable<typeof row> => Boolean(row))

    if (rows.length) await supabase.from('crm_performance_events').insert(rows)

    return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return new NextResponse(null, { status: 204 })
  }
}
