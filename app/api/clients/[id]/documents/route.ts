import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const BUCKET = 'client-documents'
const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_REQUEST_SIZE = MAX_FILE_SIZE + 1024 * 1024
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

function byteIndexOf(source: Uint8Array, target: Uint8Array, start = 0) {
  if (!target.length) return start
  outer: for (let i = start; i <= source.length - target.length; i += 1) {
    for (let j = 0; j < target.length; j += 1) {
      if (source[i + j] !== target[j]) continue outer
    }
    return i
  }
  return -1
}

function boundaryFromContentType(contentType: string) {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i)
  return (match?.[1] || match?.[2] || '').trim()
}

type ParsedUpload = {
  bytes: Uint8Array
  originalName: string
  requestedName: string
  documentType: string
  contentType: string
}

async function parseMultipartUpload(request: NextRequest, contentTypeHeader: string): Promise<ParsedUpload> {
  const boundary = boundaryFromContentType(contentTypeHeader)
  if (!boundary) throw new Error('The upload request is missing its multipart boundary.')

  const body = new Uint8Array(await request.arrayBuffer())
  if (!body.length) throw new Error('The upload request was empty.')
  if (body.length > MAX_REQUEST_SIZE) throw new Error('Maximum file size is 10 MB.')

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const boundaryBytes = encoder.encode(`--${boundary}`)
  const nextBoundaryBytes = encoder.encode(`\r\n--${boundary}`)
  const headerSeparator = encoder.encode('\r\n\r\n')

  let cursor = byteIndexOf(body, boundaryBytes)
  if (cursor < 0) throw new Error('The upload body did not contain its multipart boundary.')

  let fileBytes: Uint8Array | null = null
  let originalName = ''
  let partContentType = ''
  let requestedName = ''
  let documentType = 'medicare_document'

  while (cursor >= 0 && cursor < body.length) {
    cursor += boundaryBytes.length

    // Final boundary ends with "--".
    if (body[cursor] === 45 && body[cursor + 1] === 45) break

    // Each part begins after CRLF.
    if (body[cursor] === 13 && body[cursor + 1] === 10) cursor += 2

    const headersEnd = byteIndexOf(body, headerSeparator, cursor)
    if (headersEnd < 0) break

    const headersText = decoder.decode(body.slice(cursor, headersEnd))
    const bodyStart = headersEnd + headerSeparator.length
    const nextBoundary = byteIndexOf(body, nextBoundaryBytes, bodyStart)
    if (nextBoundary < 0) break

    const disposition = headersText.match(/content-disposition:\s*form-data;([^\r\n]+)/i)?.[1] || ''
    const name = disposition.match(/(?:^|;)\s*name="([^"]*)"/i)?.[1] || ''
    const filename = disposition.match(/(?:^|;)\s*filename="([^"]*)"/i)?.[1] || ''
    const currentContentType = headersText.match(/content-type:\s*([^\r\n;]+)/i)?.[1]?.trim() || ''
    const partBody = body.slice(bodyStart, nextBoundary)

    if (name === 'file') {
      fileBytes = partBody
      originalName = filename || 'document'
      partContentType = currentContentType
    } else if (name === 'file_name') {
      requestedName = decoder.decode(partBody).trim()
    } else if (name === 'document_type') {
      documentType = decoder.decode(partBody).trim() || 'medicare_document'
    }

    cursor = nextBoundary + 2
  }

  if (!fileBytes) throw new Error('Choose a file first.')

  return {
    bytes: fileBytes,
    originalName: originalName || 'document',
    requestedName: requestedName || originalName || 'document',
    documentType,
    contentType: partContentType || mimeFromName(originalName)
  }
}

async function parseUploadRequest(request: NextRequest): Promise<ParsedUpload> {
  const contentTypeHeader = request.headers.get('content-type') || ''

  if (contentTypeHeader.toLowerCase().startsWith('multipart/form-data')) {
    // Parse multipart ourselves instead of request.formData(). Safari/WebKit can
    // occasionally produce uploads that the runtime's FormData parser rejects.
    return parseMultipartUpload(request, contentTypeHeader)
  }

  // Raw-body support keeps this endpoint usable without multipart parsing.
  const body = new Uint8Array(await request.arrayBuffer())
  const originalName = request.nextUrl.searchParams.get('file_name') || 'document'
  const documentType = request.nextUrl.searchParams.get('document_type') || 'medicare_document'
  const normalizedContentType = contentTypeHeader.split(';')[0].trim().toLowerCase()

  return {
    bytes: body,
    originalName,
    requestedName: originalName,
    documentType,
    contentType: normalizedContentType === 'application/octet-stream' ? mimeFromName(originalName) : normalizedContentType || mimeFromName(originalName)
  }
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

    const contentLength = Number(request.headers.get('content-length') || 0)
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_SIZE) {
      return NextResponse.json({ error: 'Maximum file size is 10 MB.' }, { status: 413 })
    }

    const upload = await parseUploadRequest(request)
    if (upload.bytes.byteLength <= 0) return NextResponse.json({ error: 'The selected file is empty.' }, { status: 400 })
    if (upload.bytes.byteLength > MAX_FILE_SIZE) return NextResponse.json({ error: 'Maximum file size is 10 MB.' }, { status: 413 })

    const contentType = upload.contentType || mimeFromName(upload.originalName)
    if (!ALLOWED_MIME_TYPES.has(contentType)) {
      return NextResponse.json({ error: 'That file type is not allowed. Use an image, PDF, TXT, DOC, or DOCX file.' }, { status: 415 })
    }

    const fileName = safeFileName(upload.requestedName || upload.originalName || 'document')
    const documentType = String(upload.documentType || 'medicare_document').slice(0, 80)

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

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, upload.bytes, { contentType, upsert: false })
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
    const message = error instanceof Error ? error.message : 'Upload failed.'
    const status = message === 'Maximum file size is 10 MB.' ? 413 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
