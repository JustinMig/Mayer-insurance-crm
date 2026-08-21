import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function cleanEndpoint(value: unknown) {
  const endpoint = String(value || '').trim()
  if (!endpoint || endpoint.length > 4096) throw new Error('Invalid push endpoint.')
  const parsed = new URL(endpoint)
  if (parsed.protocol !== 'https:') throw new Error('Push endpoint must use HTTPS.')
  return endpoint
}

function cleanKey(value: unknown, label: string) {
  const key = String(value || '').trim()
  if (!key || key.length > 1024) throw new Error(`Invalid ${label} push key.`)
  return key
}

export async function POST(request: NextRequest) {
  const { userId, profile } = await getCrmSession()
  if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

  try {
    const body = await request.json() as {
      endpoint?: string
      keys?: { p256dh?: string; auth?: string }
    }
    const endpoint = cleanEndpoint(body.endpoint)
    const p256dh = cleanKey(body.keys?.p256dh, 'p256dh')
    const auth = cleanKey(body.keys?.auth, 'auth')
    const admin = createAdminClient()

    const { error } = await admin.from('push_subscriptions').upsert({
      user_id: userId,
      agency_id: profile.agency_id,
      endpoint,
      p256dh,
      auth,
      user_agent: String(request.headers.get('user-agent') || '').slice(0, 500) || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' })
    if (error) throw new Error(error.message)

    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to save push subscription.' },
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
}

export async function DELETE(request: NextRequest) {
  const { userId, profile } = await getCrmSession()
  if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

  try {
    const body = await request.json() as { endpoint?: string }
    const endpoint = cleanEndpoint(body.endpoint)
    const admin = createAdminClient()
    const { error } = await admin
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('agency_id', profile.agency_id)
      .eq('endpoint', endpoint)
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to remove push subscription.' },
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
}
