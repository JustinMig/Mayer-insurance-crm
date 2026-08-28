import { NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { COMPANY_CONTACTS } from '@/lib/company-contacts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { profile } = await getCrmSession()
  if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  return NextResponse.json(
    { contacts: COMPANY_CONTACTS },
    {
      headers: {
        'Cache-Control': 'private, max-age=86400, stale-while-revalidate=604800',
        Vary: 'Cookie'
      }
    }
  )
}
