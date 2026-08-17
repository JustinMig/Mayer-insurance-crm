import { NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { isJustinWebsiteLeadUser } from '@/lib/website-leads'
import { syncCrmMail } from '@/lib/gmail-mail'

export const dynamic = 'force-dynamic'

export async function POST() {
  const { supabase, userId } = await getCrmSession()
  if (!isJustinWebsiteLeadUser(userId)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const result = await syncCrmMail(supabase, userId)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Mail sync failed' }, { status: 500 })
  }
}
