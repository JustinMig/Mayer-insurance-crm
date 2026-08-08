import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const BUCKET = 'client-documents'
const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
])

function safeFileName(name: string) {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return cleaned.slice(0, 120) || 'document'
}

function mimeFromName(name: string) {
  const lower = name.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.heic')) return 'image/heic'
  if (lower.endsWith('.heif')) return 'image/heif'
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.txt')) return 'text/plain'
  if (lower.endsWith('.doc')) return 'application/msword'
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  return ''
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await context.params
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()
    if (!claimsData?.claims) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

    const userId = String(claimsData.claims.sub)
    const { data: profile } = await supabase
      .from('profiles')
      .select('agency_id')
      .eq('id', userId)
      .single()
    if (!profile?.agency_id) return NextResponse.json({ error: 'CRM profile not found.' }, { status: 403 })

    // RLS makes this succeed only if the signed-in user is allowed to access the client.
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .maybeSingle()
    if (!client) return NextResponse.json({ error: 'Client not found or access denied.' }, { status: 404 })

    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a file first.' }, { status: 400 })
    if (file.size <= 0) return NextResponse.json({ error: 'The selected file is empty.' }, { status: 400 })
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'Maximum file size is 10 MB.' }, { status: 413 })

    const contentType = file.type || mimeFromName(file.name)
    if (!ALLOWED_MIME_TYPES.has(contentType)) {
      return NextResponse.json({ error: 'That file type is not allowed. Use an image, PDF, TXT, DOC, or DOCX file.' }, { status: 415 })
    }

    const requestedName = String(form.get('file_name') || file.name || 'document')
    const fileName = safeFileName(requestedName)
    const documentType = String(form.get('document_type') || 'medicare_document').slice(0, 80)

    const { data: existingDocument } = await supabase
      .from('documents')
      .select('id, file_name, mime_type, document_type, created_at')
      .eq('client_id', clientId)
      .eq('document_type', documentType)
      .eq('file_name', fileName)
      .maybeSingle()

    if (existingDocument) {
      return NextResponse.json({ document: existingDocument, duplicate: true }, {
        headers: { 'Cache-Control': 'private, no-store' }
      })
    }

    const storageName = `${crypto.randomUUID()}-${fileName}`
    const storagePath = `${profile.agency_id}/${clientId}/${storageName}`

    const bytes = await file.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType, upsert: false })
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 })

    const { data: document, error: documentError } = await supabase
      .from('documents')
      .insert({
        agency_id: profile.agency_id,
        client_id: clientId,
        uploaded_by: userId,
        storage_path: storagePath,
        file_name: fileName,
        mime_type: contentType,
        document_type: documentType
      })
      .select('id, file_name, mime_type, document_type, created_at')
      .single()

    if (documentError || !document) {
      await supabase.storage.from(BUCKET).remove([storagePath])
      return NextResponse.json({ error: documentError?.message || 'Unable to save document record.' }, { status: 400 })
    }

    await supabase.from('audit_log').insert({
      agency_id: profile.agency_id,
      actor_id: userId,
      client_id: clientId,
      action: 'document.uploaded',
      details: { document_id: document.id, document_type: documentType, file_name: fileName }
    })

    return NextResponse.json({ document })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed.' }, { status: 500 })
  }
}
