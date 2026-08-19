import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'client-documents'
type Params = Promise<{ id: string }>

type ClientMatch = {
  id: string
  assigned_agent_id: string | null
  first_name: string | null
  last_name: string | null
  date_of_birth: string | null
  phone: string | null
  is_medicare: boolean | null
  is_life: boolean | null
  is_retirement: boolean | null
  created_at: string | null
}

function safeFileName(name: string) {
  const cleaned = String(name || 'lead-file')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return cleaned.slice(0, 120) || 'lead-file'
}

function normalizeName(value: unknown) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function phoneDigits(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.length > 10 ? digits.slice(-10) : digits
}

function findExistingClient(lead: {
  first_name: string | null
  last_name: string | null
  date_of_birth: string | null
  phone: string | null
}, candidates: ClientMatch[]) {
  const first = normalizeName(lead.first_name)
  const last = normalizeName(lead.last_name)
  const dob = String(lead.date_of_birth || '')
  const phone = phoneDigits(lead.phone)

  const sameName = candidates.filter(candidate =>
    normalizeName(candidate.first_name) === first && normalizeName(candidate.last_name) === last
  )

  // Name + DOB is the strongest practical match for this workflow.
  if (dob) {
    const dobMatch = sameName.find(candidate => String(candidate.date_of_birth || '') === dob)
    if (dobMatch) return dobMatch
  }

  // If DOB is missing, or did not match, use name + normalized 10-digit phone.
  if (phone.length === 10) {
    const phoneMatch = sameName.find(candidate => phoneDigits(candidate.phone) === phone)
    if (phoneMatch) return phoneMatch
  }

  return null
}

export async function POST(_request: NextRequest, { params }: { params: Params }) {
  const { id } = await params
  const { supabase, userId, profile } = await getCrmSession()
  if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const { data: lead, error: leadError } = await supabase
    .from('workspace_leads')
    .select('id,agency_id,assigned_agent_id,first_name,last_name,date_of_birth,phone,product_type,is_medicare,is_life,is_retirement,notes,status,client_id,photo_storage_path,photo_file_name,photo_mime_type')
    .eq('id', id)
    .eq('agency_id', profile.agency_id)
    .maybeSingle()

  if (leadError) return NextResponse.json({ error: leadError.message }, { status: 400 })
  if (!lead) return NextResponse.json({ error: 'Lead not found or access denied.' }, { status: 404 })
  if (lead.status === 'converted' && lead.client_id) return NextResponse.json({ client_id: lead.client_id, already_converted: true })

  const isMedicare = Boolean(lead.is_medicare || lead.product_type === 'medicare')
  const isLife = Boolean(lead.is_life || lead.product_type === 'life')
  const isRetirement = Boolean(lead.is_retirement || lead.product_type === 'retirement')

  const { data: possibleMatches, error: matchError } = await supabase
    .from('clients')
    .select('id,assigned_agent_id,first_name,last_name,date_of_birth,phone,is_medicare,is_life,is_retirement,created_at')
    .eq('agency_id', lead.agency_id)
    .eq('assigned_agent_id', lead.assigned_agent_id)
    .ilike('first_name', String(lead.first_name || '').trim())
    .ilike('last_name', String(lead.last_name || '').trim())
    .order('created_at', { ascending: true })
    .limit(25)

  if (matchError) return NextResponse.json({ error: matchError.message }, { status: 400 })

  const existingClient = findExistingClient(lead, (possibleMatches || []) as ClientMatch[])
  let client: { id: string }
  let createdNewClient = false

  if (existingClient) {
    const updates: Record<string, unknown> = {
      is_medicare: Boolean(existingClient.is_medicare || isMedicare),
      is_life: Boolean(existingClient.is_life || isLife),
      is_retirement: Boolean(existingClient.is_retirement || isRetirement),
      updated_at: new Date().toISOString()
    }
    if (!existingClient.date_of_birth && lead.date_of_birth) updates.date_of_birth = lead.date_of_birth
    if (!existingClient.phone && lead.phone) updates.phone = lead.phone

    const { data: updatedClient, error: updateClientError } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', existingClient.id)
      .eq('agency_id', lead.agency_id)
      .select('id')
      .single()

    if (updateClientError || !updatedClient) {
      return NextResponse.json({ error: updateClientError?.message || 'Unable to update the matching client record.' }, { status: 400 })
    }
    client = updatedClient
  } else {
    const { data: newClient, error: clientError } = await supabase
      .from('clients')
      .insert({
        agency_id: lead.agency_id,
        assigned_agent_id: lead.assigned_agent_id,
        first_name: lead.first_name,
        last_name: lead.last_name,
        date_of_birth: lead.date_of_birth,
        phone: lead.phone || null,
        is_medicare: isMedicare,
        is_life: isLife,
        is_retirement: isRetirement,
        notes: lead.notes || null
      })
      .select('id')
      .single()

    if (clientError || !newClient) return NextResponse.json({ error: clientError?.message || 'Unable to create client record.' }, { status: 400 })
    client = newClient
    createdNewClient = true
  }

  let copiedPhotoPath: string | null = null
  let documentId: string | null = null

  if (lead.photo_storage_path) {
    const { data: fileBlob, error: downloadError } = await supabase.storage.from(BUCKET).download(lead.photo_storage_path)
    if (downloadError || !fileBlob) {
      if (createdNewClient) await supabase.from('clients').delete().eq('id', client.id)
      return NextResponse.json({ error: downloadError?.message || 'Unable to transfer the lead file.' }, { status: 400 })
    }

    const fileName = safeFileName(lead.photo_file_name || 'lead-file')
    const mimeType = lead.photo_mime_type || fileBlob.type || 'application/octet-stream'
    copiedPhotoPath = `${lead.agency_id}/${client.id}/${crypto.randomUUID()}-${fileName}`

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(copiedPhotoPath, fileBlob, { contentType: mimeType, upsert: false })
    if (uploadError) {
      if (createdNewClient) await supabase.from('clients').delete().eq('id', client.id)
      return NextResponse.json({ error: uploadError.message }, { status: 400 })
    }

    const { data: document, error: documentError } = await supabase
      .from('documents')
      .insert({
        agency_id: lead.agency_id,
        client_id: client.id,
        uploaded_by: userId,
        storage_path: copiedPhotoPath,
        file_name: fileName,
        mime_type: mimeType,
        document_type: 'lead_photo'
      })
      .select('id')
      .single()

    if (documentError || !document) {
      await supabase.storage.from(BUCKET).remove([copiedPhotoPath])
      if (createdNewClient) await supabase.from('clients').delete().eq('id', client.id)
      return NextResponse.json({ error: documentError?.message || 'Unable to attach the lead file to the client.' }, { status: 400 })
    }
    documentId = document.id
  }

  const now = new Date().toISOString()
  const leadUpdate: Record<string, unknown> = {
    status: 'converted',
    client_id: client.id,
    converted_at: now,
    updated_at: now
  }
  if (copiedPhotoPath) leadUpdate.photo_storage_path = copiedPhotoPath

  const { error: updateError } = await supabase
    .from('workspace_leads')
    .update(leadUpdate)
    .eq('id', lead.id)

  if (updateError) {
    if (documentId) await supabase.from('documents').delete().eq('id', documentId)
    if (copiedPhotoPath) await supabase.storage.from(BUCKET).remove([copiedPhotoPath])
    if (createdNewClient) await supabase.from('clients').delete().eq('id', client.id)
    return NextResponse.json({ error: updateError.message }, { status: 400 })
  }

  if (copiedPhotoPath && lead.photo_storage_path && copiedPhotoPath !== lead.photo_storage_path) {
    await supabase.storage.from(BUCKET).remove([lead.photo_storage_path])
  }

  await supabase.from('audit_log').insert({
    agency_id: profile.agency_id,
    actor_id: userId,
    client_id: client.id,
    action: existingClient ? 'workspace.lead_linked_existing_client' : 'workspace.lead_converted',
    details: {
      lead_id: lead.id,
      assigned_agent_id: lead.assigned_agent_id,
      matched_existing_client: Boolean(existingClient),
      match_basis: existingClient ? 'name_plus_dob_or_phone' : null,
      is_medicare: isMedicare,
      is_life: isLife,
      is_retirement: isRetirement,
      file_transferred: Boolean(copiedPhotoPath)
    }
  })

  return NextResponse.json({ client_id: client.id, matched_existing_client: Boolean(existingClient) })
}
