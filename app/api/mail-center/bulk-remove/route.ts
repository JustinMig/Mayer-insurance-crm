import { NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { isJustinWebsiteLeadUser } from '@/lib/website-leads'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const { supabase, userId } = await getCrmSession()
  if (!isJustinWebsiteLeadUser(userId)) {
    return NextResponse.json({ error: 'Mail access is not available for this user.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const rawIds = Array.isArray(body?.message_ids) ? body.message_ids : []
  const ids = [...new Set(rawIds.map((value: unknown) => String(value || '').trim()).filter(Boolean))].slice(0, 100)
  if (!ids.length) return NextResponse.json({ error: 'Select at least one message.' }, { status: 400 })

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('crm_mail')
    .update({ removed_at: now, updated_at: now })
    .eq('user_id', userId)
    .in('id', ids)
    .is('removed_at', null)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const removedIds = (data || []).map((row) => String(row.id))
  return NextResponse.json(
    { removed_count: removedIds.length, removed_ids: removedIds },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}
