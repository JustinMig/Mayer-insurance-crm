import { NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { createAdminClient } from '@/lib/supabase/admin'
import { canSeeAllClients } from '@/lib/client-access'
import { isJustinWebsiteLeadUser } from '@/lib/website-leads'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { supabase, userId, profile } = await getCrmSession()
  if (!profile?.agency_id) return NextResponse.json({ total: 0, mail: 0, text: 0, forms: 0 })

  let mail = 0
  let forms = 0
  if (isJustinWebsiteLeadUser(userId)) {
    const [{ count: mailCount }, { count: formCount }] = await Promise.all([
      supabase
        .from('crm_mail')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('read_at', null)
        .is('removed_at', null)
        .is('archived_at', null),
      supabase
        .from('website_leads')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_agent_id', userId)
        .is('read_at', null)
    ])
    mail = mailCount || 0
    forms = formCount || 0
  }

  const admin = createAdminClient()
  const canSeeAgency = canSeeAllClients(profile.role)
  let text = 0

  if (canSeeAgency) {
    const { data: agencyUsers } = await admin
      .from('profiles')
      .select('id')
      .eq('agency_id', profile.agency_id)
      .eq('active', true)

    const userIds = (agencyUsers || []).map((row) => row.id)
    if (userIds.length) {
      const { count } = await admin
        .from('client_sms_messages')
        .select('id', { count: 'exact', head: true })
        .in('user_id', userIds)
        .eq('direction', 'inbound')
        .is('read_at', null)
      text = count || 0
    }
  } else {
    const { count } = await admin
      .from('client_sms_messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('direction', 'inbound')
      .is('read_at', null)
    text = count || 0
  }

  return NextResponse.json(
    { total: mail + text + forms, mail, text, forms },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}
