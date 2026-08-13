import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { attachmentRule, type ImportDocumentType } from '@/lib/import-attachments'

export const runtime = 'nodejs'

const BUCKET = 'client-documents'
const MAX_FILE_SIZE = 10 * 1024 * 1024
const COGNITO_FORM_ID = process.env.COGNITO_FORM_ID?.trim() || '9'
const SOURCE_ID_PATTERN = /^\d+$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
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

type CognitoFile = {
  Id?: string | null
  Name?: string | null
  ContentType?: string | null
  Size?: number | null
  File?: string | null
}

type DirectFile = {
  field_name: string
  document_type: ImportDocumentType
  id: string | null
  name: string
  content_type: string
  size: number
  url: string
}

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

const DIRECT_FIELD_DOCUMENT_TYPES: Record<string, ImportDocumentType> = {
  SoA2: 'scope_of_appointment',
  SoA: 'scope_of_appointment',
  CardInformation2: 'card_information',
  CardInformation: 'card_information',
  MedicationsPhotos: 'medications',
  MedicationPhotos: 'medications',
  PolicyDocuments: 'life_insurance',
  PolicyDocuments2: 'life_insurance',
  HipPlanDocument2: 'hospital_indemnity',
  HipPlanDocument: 'hospital_indemnity',
  PlanDocuments: 'health_plan',
  PlanExtraDocuments: 'health_plan',
  PlanExtraDocuments2: 'health_plan',
  PDPPlanInfo2: 'medicare_document',
  PDPPlanInfo: 'medicare_document',
  PDPExtra: 'medicare_document',
  SupplementPlanInfo: 'medicare_document',
  ACAFiles: 'aca',
  DentalFiles2: 'dental',
  DentalFiles: 'dental',
  HearingFiles: 'hearing',
  VisionFiles: 'vision',
  RetirementFiles: 'retirement'
}

function filesFromEntry(entry: Record<string, unknown>): DirectFile[] {
  const files: DirectFile[] = []
  for (const [fieldName, value] of Object.entries(entry)) {
    if (!Array.isArray(value) || value.length === 0) continue
    const explicitDocumentType = DIRECT_FIELD_DOCUMENT_TYPES[fieldName]
    const rule = explicitDocumentType ? { document_type: explicitDocumentType } : attachmentRule(fieldName, [fieldName])
    if (!rule) continue
    for (const raw of value) {
      if (!raw || typeof raw !== 'object') continue
      const item = raw as CognitoFile
      const name = String(item.Name || '').trim()
      const url = String(item.File || '').trim()
      if (!name || !url) continue
      const contentType = String(item.ContentType || mimeFromName(name)).trim().toLowerCase()
      const size = Number(item.Size || 0)
      files.push({
        field_name: fieldName,
        document_type: rule.document_type,
        id: item.Id ? String(item.Id) : null,
        name,
        content_type: contentType,
        size: Number.isFinite(size) ? size : 0,
        url
      })
    }
  }
  return files
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()
    if (!claimsData?.claims) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 })

    const userId = String(claimsData.claims.sub)
    const { data: profile } = await supabase
      .from('profiles')
      .select('agency_id, role')
      .eq('id', userId)
      .single()
    if (!profile?.agency_id || !['admin', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Only an Admin or Manager can pull Cognito files.' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const clientId = String(body?.client_id || '').trim()
    const sourceId = String(body?.source_id || '').trim()
    if (!UUID_PATTERN.test(clientId) || !SOURCE_ID_PATTERN.test(sourceId)) {
      return NextResponse.json({ error: 'A valid CRM client and Cognito Entry ID are required.' }, { status: 400 })
    }

    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .maybeSingle()
    if (!client) return NextResponse.json({ error: 'Client not found or access denied.' }, { status: 404 })

    const apiKey = process.env.COGNITO_API_KEY?.trim()
    if (!apiKey) {
      return NextResponse.json({ error: 'COGNITO_API_KEY is not configured in the production environment.' }, { status: 503 })
    }

    const entryResponse = await fetch(`https://www.cognitoforms.com/api/forms/${encodeURIComponent(COGNITO_FORM_ID)}/entries/${encodeURIComponent(sourceId)}`, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
      cache: 'no-store'
    })

    if (!entryResponse.ok) {
      return NextResponse.json({
        error: entryResponse.status === 404
          ? `Cognito Entry ${sourceId} was not found.`
          : `Cognito entry lookup failed with HTTP ${entryResponse.status}. Check the API key Entry Read permission and form access.`
      }, { status: entryResponse.status === 401 || entryResponse.status === 403 ? 502 : 400 })
    }

    const entry = await entryResponse.json().catch(() => null) as Record<string, unknown> | null
    if (!entry || typeof entry !== 'object') return NextResponse.json({ error: 'Cognito returned an invalid entry response.' }, { status: 502 })

    const entryMeta = entry.Entry && typeof entry.Entry === 'object' ? entry.Entry as Record<string, unknown> : null
    const returnedNumber = Number(entryMeta?.Number || sourceId)
    if (Number.isFinite(returnedNumber) && String(returnedNumber) !== sourceId) {
      return NextResponse.json({ error: `Cognito returned Entry ${returnedNumber} instead of ${sourceId}.` }, { status: 502 })
    }

    const files = filesFromEntry(entry)
    let uploaded = 0
    let skipped = 0
    const errors: string[] = []

    for (const cognitoFile of files) {
      const fileName = safeFileName(cognitoFile.name)
      const contentType = cognitoFile.content_type || mimeFromName(fileName)
      if (cognitoFile.size > MAX_FILE_SIZE) {
        errors.push(`${cognitoFile.name}: larger than the CRM 10 MB file limit.`)
        continue
      }
      if (!ALLOWED_MIME_TYPES.has(contentType)) {
        errors.push(`${cognitoFile.name}: unsupported file type ${contentType || 'unknown'}.`)
        continue
      }

      const { data: existingDocument } = await supabase
        .from('documents')
        .select('id')
        .eq('client_id', clientId)
        .eq('document_type', cognitoFile.document_type)
        .eq('file_name', fileName)
        .maybeSingle()
      if (existingDocument) {
        skipped += 1
        continue
      }

      try {
        const fileResponse = await fetch(cognitoFile.url, { method: 'GET', cache: 'no-store', redirect: 'follow' })
        if (!fileResponse.ok) throw new Error(`Cognito download returned HTTP ${fileResponse.status}`)
        const bytes = await fileResponse.arrayBuffer()
        if (!bytes.byteLength) throw new Error('Cognito returned an empty file')
        if (bytes.byteLength > MAX_FILE_SIZE) throw new Error('File exceeds the CRM 10 MB limit')

        const storageName = `${crypto.randomUUID()}-${fileName}`
        const storagePath = `${profile.agency_id}/${clientId}/${storageName}`
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, { contentType, upsert: false })
        if (uploadError) throw new Error(uploadError.message)

        const { data: document, error: documentError } = await supabase
          .from('documents')
          .insert({
            agency_id: profile.agency_id,
            client_id: clientId,
            uploaded_by: userId,
            storage_path: storagePath,
            file_name: fileName,
            mime_type: contentType,
            document_type: cognitoFile.document_type
          })
          .select('id')
          .single()

        if (documentError || !document) {
          await supabase.storage.from(BUCKET).remove([storagePath])
          throw new Error(documentError?.message || 'Unable to save document record')
        }

        await supabase.from('audit_log').insert({
          agency_id: profile.agency_id,
          actor_id: userId,
          client_id: clientId,
          action: 'document.uploaded.cognito',
          details: {
            document_id: document.id,
            document_type: cognitoFile.document_type,
            file_name: fileName,
            cognito_entry_id: sourceId,
            cognito_file_id: cognitoFile.id,
            cognito_field: cognitoFile.field_name
          }
        })
        uploaded += 1
      } catch (error) {
        errors.push(`${cognitoFile.name}: ${error instanceof Error ? error.message : 'Download/upload failed.'}`)
      }
    }

    return NextResponse.json({ source_id: sourceId, files_found: files.length, uploaded, skipped, errors }, {
      headers: { 'Cache-Control': 'private, no-store' }
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Cognito file pull failed.' }, { status: 500 })
  }
}
