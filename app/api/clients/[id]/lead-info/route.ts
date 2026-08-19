import { NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

export async function GET(_request: Request, { params }: { params: Params }) {
  const { id } = await params
  const { supabase, profile } = await getCrmSession()
  if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id,agency_id')
    .eq('id', id)
    .eq('agency_id', profile.agency_id)
    .maybeSingle()

  if (clientError) return NextResponse.json({ error: clientError.message }, { status: 400 })
  if (!client) return NextResponse.json({ error: 'Client not found or access denied.' }, { status: 404 })

  const { data: leads, error: leadError } = await supabase
    .from('workspace_leads')
    .select('id,assigned_agent_id,first_name,last_name,date_of_birth,phone,product_type,is_medicare,is_life,is_retirement,notes,status,client_id,photo_storage_path,photo_file_name,photo_mime_type,photo_uploaded_at,created_at,updated_at,converted_at')
    .eq('agency_id', profile.agency_id)
    .eq('client_id', id)
    .order('converted_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)

  if (leadError) return NextResponse.json({ error: leadError.message }, { status: 400 })
  const lead = leads?.[0] || null
  if (!lead) return NextResponse.json({ lead: null }, { headers: { 'Cache-Control': 'private, no-store' } })

  let agentName = ''
  if (lead.assigned_agent_id) {
    const { data: agent } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', lead.assigned_agent_id)
      .eq('agency_id', profile.agency_id)
      .maybeSingle()
    agentName = String(agent?.full_name || '')
  }

  return NextResponse.json({
    lead: {
      ...lead,
      agent_name: agentName,
      has_file: Boolean(lead.photo_storage_path),
      file_url: lead.photo_storage_path ? `/api/workspace/leads/${lead.id}/photo` : null
    }
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}
