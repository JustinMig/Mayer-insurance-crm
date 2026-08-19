import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'client-documents'
const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'application/pdf'])
type Params = Promise<{ id: string }>

function safeFileName(name: string) {
  const cleaned = String(name || 'lead-file')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return cleaned.slice(0, 120) || 'lead-file'
}

function mimeFromName(name: string) {
  const lower = name.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.heic')) return 'image/heic'
  if (lower.endsWith('.heif')) return 'image/heif'
  if (lower.endsWith('.pdf')) return 'application/pdf'
  return ''
}

async function loadLead(id: string) {
  const { supabase, userId, profile } = await getCrmSession()
  if (!profile?.agency_id) return { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }

  const { data: lead, error } = await supabase
    .from('workspace_leads')
    .select('id,agency_id,status,photo_storage_path,photo_file_name,photo_mime_type')
    .eq('id', id)
    .eq('agency_id', profile.agency_id)
    .maybeSingle()

  if (error) return { error: NextResponse.json({ error: error.message }, { status: 400 }) }
  if (!lead) return { error: NextResponse.json({ error: 'Lead not found or access denied.' }, { status: 404 }) }
  return { supabase, userId, profile, lead }
}

export async function GET(_request: NextRequest, { params }: { params: Params }) {
  const { id } = await params
  const context = await loadLead(id)
  if ('error' in context) return context.error
  const { supabase, lead } = context
  if (!lead.photo_storage_path) return NextResponse.json({ error: 'No file is attached to this lead.' }, { status: 404 })

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(lead.photo_storage_path, 120)
  if (error || !data?.signedUrl) return NextResponse.json({ error: error?.message || 'Unable to open lead file.' }, { status: 400 })
  return NextResponse.redirect(data.signedUrl)
}

export async function POST(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params
    const context = await loadLead(id)
    if ('error' in context) return context.error
    const { supabase, userId, profile, lead } = context
    if (lead.status !== 'lead') return NextResponse.json({ error: 'This lead is already a client record.' }, { status: 400 })

    const bytes = new Uint8Array(await request.arrayBuffer())
    if (!bytes.byteLength) return NextResponse.json({ error: 'The selected file is empty.' }, { status: 400 })
    if (bytes.byteLength > MAX_FILE_SIZE) return NextResponse.json({ error: 'Maximum file size is 10 MB.' }, { status: 413 })

    const originalName = safeFileName(request.nextUrl.searchParams.get('file_name') || 'lead-file')
    const headerType = String(request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    const contentType = headerType === 'application/octet-stream' ? mimeFromName(originalName) : headerType || mimeFromName(originalName)
    if (!ALLOWED_TYPES.has(contentType)) {
      return NextResponse.json({ error: 'Use a JPG, PNG, HEIC, HEIF, or PDF file.' }, { status: 415 })
    }

    const storagePath = `${profile.agency_id}/${lead.id}/${crypto.randomUUID()}-${originalName}`
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType, upsert: false })
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 })

    const now = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('workspace_leads')
      .update({
        photo_storage_path: storagePath,
        photo_file_name: originalName,
        photo_mime_type: contentType,
        photo_uploaded_at: now,
        updated_at: now
      })
      .eq('id', lead.id)

    if (updateError) {
      await supabase.storage.from(BUCKET).remove([storagePath])
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }

    if (lead.photo_storage_path && lead.photo_storage_path !== storagePath) {
      await supabase.storage.from(BUCKET).remove([lead.photo_storage_path])
    }

    await supabase.from('audit_log').insert({
      agency_id: profile.agency_id,
      actor_id: userId,
      client_id: null,
      action: 'workspace.lead_file_uploaded',
      details: { lead_id: lead.id, file_name: originalName, mime_type: contentType }
    })

    return NextResponse.json({ uploaded: true, file_name: originalName, uploaded_at: now, mime_type: contentType })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to upload lead file.' }, { status: 400 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Params }) {
  const { id } = await params
  const context = await loadLead(id)
  if ('error' in context) return context.error
  const { supabase, userId, profile, lead } = context
  if (!lead.photo_storage_path) return NextResponse.json({ deleted: true })

  const { error: removeError } = await supabase.storage.from(BUCKET).remove([lead.photo_storage_path])
  if (removeError) return NextResponse.json({ error: removeError.message }, { status: 400 })

  const { error: updateError } = await supabase
    .from('workspace_leads')
    .update({ photo_storage_path: null, photo_file_name: null, photo_mime_type: null, photo_uploaded_at: null, updated_at: new Date().toISOString() })
    .eq('id', lead.id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })

  await supabase.from('audit_log').insert({
    agency_id: profile.agency_id,
    actor_id: userId,
    client_id: null,
    action: 'workspace.lead_file_deleted',
    details: { lead_id: lead.id }
  })

  return NextResponse.json({ deleted: true })
}
