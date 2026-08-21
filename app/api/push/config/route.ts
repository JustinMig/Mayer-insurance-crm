import { NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { getVapidPublicKey } from '@/lib/web-push'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { profile } = await getCrmSession()
  if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

  try {
    return NextResponse.json(
      { enabled: true, publicKey: getVapidPublicKey() },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (error) {
    console.error('CRM push configuration unavailable', error)
    return NextResponse.json(
      { enabled: false, error: 'Push notifications are not configured.' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
}
