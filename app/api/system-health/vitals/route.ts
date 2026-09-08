import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function clean(value: unknown, max: number) {
  return String(value || '').trim().slice(0, max)
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, userId, profile } = await getCrmSession()
    if (!profile?.agency_id) return new NextResponse(null, { status: 204 })
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const metricValue = Number(body.metric_value)
    if (!Number.isFinite(metricValue) || metricValue < 0) return new NextResponse(null, { status: 204 })

    await supabase.from('crm_performance_events').insert({
      agency_id: profile.agency_id,
      user_id: userId,
      route: clean(body.route, 240) || '/',
      metric_name: clean(body.metric_name, 80),
      metric_value: metricValue,
      rating: clean(body.rating, 30) || null,
      device_class: clean(body.device_class, 30) || null,
      connection_type: clean(body.connection_type, 30) || null,
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {}
    })

    return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return new NextResponse(null, { status: 204 })
  }
}
