import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

export async function POST(_request: NextRequest, { params }: { params: Params }) {
  const { id } = await params
  const { supabase, userId, profile } = await getCrmSession()
  if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const { data: lead, error: leadError } = await supabase
    .from('workspace_leads')
    .select('id,agency_id,assigned_agent_id,first_name,last_name,date_of_birth,product_type,notes,status,client_id')
    .eq('id', id)
    .eq('agency_id', profile.agency_id)
    .maybeSingle()

  if (leadError) return NextResponse.json({ error: leadError.message }, { status: 400 })
  if (!lead) return NextResponse.json({ error: 'Lead not found or access denied.' }, { status: 404 })
  if (lead.status === 'converted' && lead.client_id) return NextResponse.json({ client_id: lead.client_id, already_converted: true })

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .insert({
      agency_id: lead.agency_id,
      assigned_agent_id: lead.assigned_agent_id,
      first_name: lead.first_name,
      last_name: lead.last_name,
      date_of_birth: lead.date_of_birth,
      is_medicare: lead.product_type === 'medicare',
      is_life: lead.product_type === 'life',
      is_retirement: lead.product_type === 'retirement',
      notes: lead.notes || null
    })
    .select('id')
    .single()

  if (clientError || !client) return NextResponse.json({ error: clientError?.message || 'Unable to create client record.' }, { status: 400 })

  const now = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('workspace_leads')
    .update({ status: 'converted', client_id: client.id, converted_at: now, updated_at: now })
    .eq('id', lead.id)

  if (updateError) {
    await supabase.from('clients').delete().eq('id', client.id)
    return NextResponse.json({ error: updateError.message }, { status: 400 })
  }

  await supabase.from('audit_log').insert({
    agency_id: profile.agency_id,
    actor_id: userId,
    client_id: client.id,
    action: 'workspace.lead_converted',
    details: { lead_id: lead.id, assigned_agent_id: lead.assigned_agent_id, product_type: lead.product_type }
  })

  return NextResponse.json({ client_id: client.id })
}
