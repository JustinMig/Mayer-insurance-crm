import { NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { createAdminClient } from '@/lib/supabase/admin'
import { isJustinWebsiteLeadUser } from '@/lib/website-leads'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { supabase, userId, profile } = await getCrmSession()
  if (!profile?.agency_id) return NextResponse.json({ total: 0, mail: 0, text: 0 })

  let mail = 0
  if (isJustinWebsiteLeadUser(userId)) {
    const { count } = await supabase
      .from('crm_mail')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null)
      .is('removed_at', null)
      .is('archived_at', null)
    mail = count || 0
  }

  const admin = createAdminClient()
  const canSeeAgency = profile.role === 'admin' || profile.role === 'manager'
  let clientQuery = admin.from('clients').select('id').eq('agency_id', profile.agency_id)
  if (!canSeeAgency) clientQuery = clientQuery.eq('assigned_agent_id', userId)

  const { data: clients } = await clientQuery
  const clientIds = (clients || []).map((client) => client.id)
  let text = 0

  if (clientIds.length) {
    const { count } = await admin
      .from('client_sms_messages')
      .select('id', { count: 'exact', head: true })
      .in('client_id', clientIds)
      .eq('direction', 'inbound')
      .is('read_at', null)
    text = count || 0
  }

  return NextResponse.json({ total: mail + text, mail, text })
}
