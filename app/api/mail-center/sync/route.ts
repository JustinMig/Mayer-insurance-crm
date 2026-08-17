import { NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { syncCrmMail } from '@/lib/gmail-mail'

export const dynamic = 'force-dynamic'

export async function POST() {
  const { supabase, userId } = await getCrmSession()
  try {
    const result = await syncCrmMail(supabase, userId)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Mail sync failed' }, { status: 500 })
  }
}
