import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'client-documents'

type Params = Promise<{ token: string }>

type SoaPayload = {
  beneficiary_name?: string
  beneficiary_phone?: string
  beneficiary_address?: string
  agent_name?: string
  agent_email?: string
  products?: string[]
  other_product?: string
}

type CertificateLine = { text: string; size?: number; bold?: boolean; gap?: number }

function tokenHash(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for') || ''
  const first = forwarded.split(',')[0]?.trim()
  return first || request.headers.get('x-real-ip') || 'Unavailable'
}

function requestUserAgent(request: NextRequest) {
  return (request.headers.get('user-agent') || 'Unavailable').slice(0, 1000)
}

function shortUserAgent(value: string) {
  return String(value || 'Unavailable').replace(/\s+/g, ' ').slice(0, 180)
}

function wrapText(value: string, max = 88) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (next.length > max && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

function pdfSafe(value: string) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildSimplePdf(lines: CertificateLine[]) {
  let y = 748
  const commands: string[] = []
  for (const line of lines) {
    const size = line.size || 10
    const font = line.bold ? 'F2' : 'F1'
    commands.push(`BT /${font} ${size} Tf 54 ${y} Td (${pdfSafe(line.text)}) Tj ET`)
    y -= size + (line.gap ?? 5)
  }
  const stream = commands.join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`
  ]

  let pdf = '%PDF-1.4\n%MayerIG\n'
  const offsets: number[] = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'ascii'))
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = Buffer.byteLength(pdf, 'ascii')
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(pdf, 'ascii')
}

function buildCertificatePdf(input: {
  requestId: string
  phone: string
  payload: SoaPayload
  createdAt: string | null
  openedAt: string | null
  openedIp: string | null
  openedUserAgent: string | null
  signedAt: string
  signedIp: string
  signedUserAgent: string
  documentId: string
  documentFileName: string
  documentSha256: string
}) {
  const lines: CertificateLine[] = []
  const add = (text: string, options: Omit<CertificateLine, 'text'> = {}) => lines.push({ text, ...options })
  const wrapped = (text: string, max = 88, options: Omit<CertificateLine, 'text'> = {}) => {
    wrapText(text, max).forEach(line => add(line, options))
  }
  const section = (title: string) => {
    add(' ', { size: 5, gap: 2 })
    add(title, { size: 12, bold: true, gap: 5 })
  }

  add('MAYER INSURANCE GROUP', { size: 14, bold: true, gap: 6 })
  add('SOA Certificate of Completion', { size: 20, bold: true, gap: 7 })
  add('Electronic Signature Audit Record', { size: 11, gap: 7 })

  section('Envelope / Request Details')
  wrapped(`SOA Request ID: ${input.requestId}`)
  wrapped(`Beneficiary: ${input.payload.beneficiary_name || 'Client'}`)
  wrapped(`Recipient phone: ${input.phone || input.payload.beneficiary_phone || 'Not provided'}`)
  wrapped(`Beneficiary address: ${input.payload.beneficiary_address || 'Not provided'}`)
  wrapped(`Agent: ${input.payload.agent_name || 'Agent'}`)
  if (input.payload.agent_email) wrapped(`Agent email: ${input.payload.agent_email}`)

  section('Event History')
  wrapped(`Created / sent: ${input.createdAt ? new Date(input.createdAt).toLocaleString('en-US') : 'Recorded in CRM message history'}`)
  wrapped(`Opened: ${input.openedAt ? new Date(input.openedAt).toLocaleString('en-US') : 'Not separately recorded'}`)
  wrapped(`Opened IP: ${input.openedIp || 'Unavailable'}`)
  wrapped(`Signed / submitted: ${new Date(input.signedAt).toLocaleString('en-US')}`)
  wrapped(`Signed IP: ${input.signedIp}`)

  section('Device / Browser Evidence')
  wrapped(`Opened device/browser: ${shortUserAgent(input.openedUserAgent || 'Unavailable')}`, 96, { size: 9 })
  wrapped(`Signing device/browser: ${shortUserAgent(input.signedUserAgent)}`, 96, { size: 9 })

  section('Signed Document Integrity')
  wrapped(`Signed SOA document ID: ${input.documentId}`, 88, { size: 9 })
  wrapped(`Signed SOA file: ${input.documentFileName}`, 88, { size: 9 })
  wrapped(`SHA-256 fingerprint: ${input.documentSha256}`, 76, { size: 9 })

  section('Record Statement')
  wrapped('This certificate was generated automatically by Mayer Insurance Group CRM when the beneficiary submitted the electronic signature. The signed SOA and this certificate are locked as immutable CRM records after completion.', 96, { size: 9 })
  wrapped('IP addresses identify the network connection observed by the CRM and are not a guarantee of an exact physical or GPS location.', 96, { size: 9 })
  add(' ', { size: 5, gap: 2 })
  add(`Certificate generated: ${new Date(input.signedAt).toLocaleString('en-US')}`, { size: 8 })

  return buildSimplePdf(lines)
}

async function loadRequest(token: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('soa_signature_requests')
    .select('id,agency_id,client_id,requested_by,phone,request_payload,status,expires_at,opened_at,signed_at,document_id,certificate_document_id,created_at,opened_ip,signed_ip,opened_user_agent,signed_user_agent,signed_document_sha256,certificate_sha256')
    .eq('token_hash', tokenHash(token))
    .maybeSingle()
  return { admin, data }
}

export async function GET(request: NextRequest, { params }: { params: Params }) {
  const { token } = await params
  const { admin, data } = await loadRequest(token)
  if (!data) return NextResponse.json({ error: 'This signing link is not valid.' }, { status: 404 })
  if (data.status === 'signed') return NextResponse.json({ status: 'signed', signed_at: data.signed_at })
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await admin.from('soa_signature_requests').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', data.id)
    return NextResponse.json({ error: 'This signing link has expired.' }, { status: 410 })
  }
  if (data.status === 'canceled' || data.status === 'expired') return NextResponse.json({ error: 'This signing link is no longer active.' }, { status: 410 })

  const openedAt = data.opened_at || new Date().toISOString()
  const openedIp = data.opened_ip || requestIp(request)
  const openedUserAgent = data.opened_user_agent || requestUserAgent(request)

  if (data.status === 'sent' || !data.opened_at || !data.opened_ip || !data.opened_user_agent) {
    await admin.from('soa_signature_requests').update({
      status: data.status === 'sent' ? 'opened' : data.status,
      opened_at: openedAt,
      opened_ip: openedIp,
      opened_user_agent: openedUserAgent,
      updated_at: new Date().toISOString()
    }).eq('id', data.id)
  }

  return NextResponse.json({
    status: 'ready',
    request: data.request_payload,
    expires_at: data.expires_at,
    audit: {
      request_id: data.id,
      opened_at: openedAt,
      ip_address: openedIp,
      user_agent: openedUserAgent
    }
  })
}

export async function POST(request: NextRequest, { params }: { params: Params }) {
  try {
    const { token } = await params
    const { admin, data } = await loadRequest(token)
    if (!data) return NextResponse.json({ error: 'This signing link is not valid.' }, { status: 404 })
    if (data.status === 'signed') return NextResponse.json({ ok: true, already_signed: true })
    if (data.status === 'canceled' || data.status === 'expired' || new Date(data.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'This signing link is no longer active.' }, { status: 410 })
    }

    const body = await request.json().catch(() => ({})) as { document_data_url?: string; client_user_agent?: string }
    const documentDataUrl = String(body.document_data_url || '')
    if (!documentDataUrl.startsWith('data:image/png;base64,') || documentDataUrl.length > 12_000_000) {
      return NextResponse.json({ error: 'The signed SOA could not be prepared. Please try signing again.' }, { status: 400 })
    }

    const encoded = documentDataUrl.slice('data:image/png;base64,'.length)
    const bytes = Buffer.from(encoded, 'base64')
    if (!bytes.length || bytes.length > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'The signed SOA file is too large. Please try signing again.' }, { status: 413 })
    }

    const signedAt = new Date()
    const signedIp = requestIp(request)
    const signedUserAgent = (String(body.client_user_agent || '').trim() || requestUserAgent(request)).slice(0, 1000)
    const documentSha256 = crypto.createHash('sha256').update(bytes).digest('hex')
    const payload = (data.request_payload || {}) as SoaPayload
    const safeName = String(payload.beneficiary_name || 'Client').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Client'
    const datePart = signedAt.toISOString().slice(0, 10)
    const fileName = `Signed_SOA_${safeName}_${datePart}.png`
    const storagePath = `${data.agency_id}/${data.client_id}/${crypto.randomUUID()}-${fileName}`

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType: 'image/png', upsert: false })
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

    const { data: document, error: documentError } = await admin
      .from('documents')
      .insert({
        agency_id: data.agency_id,
        client_id: data.client_id,
        uploaded_by: data.requested_by,
        storage_path: storagePath,
        file_name: fileName,
        mime_type: 'image/png',
        document_type: 'scope_of_appointment'
      })
      .select('id')
      .single()

    if (documentError || !document) {
      await admin.storage.from(BUCKET).remove([storagePath])
      return NextResponse.json({ error: documentError?.message || 'Unable to save signed SOA.' }, { status: 500 })
    }

    const certificateBytes = buildCertificatePdf({
      requestId: data.id,
      phone: data.phone,
      payload,
      createdAt: data.created_at,
      openedAt: data.opened_at,
      openedIp: data.opened_ip,
      openedUserAgent: data.opened_user_agent,
      signedAt: signedAt.toISOString(),
      signedIp,
      signedUserAgent,
      documentId: document.id,
      documentFileName: fileName,
      documentSha256
    })
    const certificateSha256 = crypto.createHash('sha256').update(certificateBytes).digest('hex')
    const certificateFileName = `SOA_Certificate_of_Completion_${safeName}_${datePart}.pdf`
    const certificateStoragePath = `${data.agency_id}/${data.client_id}/${crypto.randomUUID()}-${certificateFileName}`

    const { error: certificateUploadError } = await admin.storage
      .from(BUCKET)
      .upload(certificateStoragePath, certificateBytes, { contentType: 'application/pdf', upsert: false })
    if (certificateUploadError) {
      await admin.from('documents').delete().eq('id', document.id)
      await admin.storage.from(BUCKET).remove([storagePath])
      return NextResponse.json({ error: certificateUploadError.message }, { status: 500 })
    }

    const { data: certificateDocument, error: certificateDocumentError } = await admin
      .from('documents')
      .insert({
        agency_id: data.agency_id,
        client_id: data.client_id,
        uploaded_by: data.requested_by,
        storage_path: certificateStoragePath,
        file_name: certificateFileName,
        mime_type: 'application/pdf',
        document_type: 'soa_certificate'
      })
      .select('id')
      .single()

    if (certificateDocumentError || !certificateDocument) {
      await admin.storage.from(BUCKET).remove([certificateStoragePath])
      await admin.from('documents').delete().eq('id', document.id)
      await admin.storage.from(BUCKET).remove([storagePath])
      return NextResponse.json({ error: certificateDocumentError?.message || 'Unable to save SOA completion certificate.' }, { status: 500 })
    }

    const { error: finalizeError } = await admin
      .from('soa_signature_requests')
      .update({
        status: 'signed',
        signed_at: signedAt.toISOString(),
        signed_ip: signedIp,
        signed_user_agent: signedUserAgent,
        signed_document_sha256: documentSha256,
        certificate_sha256: certificateSha256,
        document_id: document.id,
        certificate_document_id: certificateDocument.id,
        updated_at: signedAt.toISOString()
      })
      .eq('id', data.id)

    if (finalizeError) {
      await admin.from('documents').delete().eq('id', certificateDocument.id)
      await admin.storage.from(BUCKET).remove([certificateStoragePath])
      await admin.from('documents').delete().eq('id', document.id)
      await admin.storage.from(BUCKET).remove([storagePath])
      return NextResponse.json({ error: finalizeError.message || 'Unable to finalize signed SOA.' }, { status: 500 })
    }

    await admin.from('audit_log').insert({
      agency_id: data.agency_id,
      actor_id: data.requested_by,
      client_id: data.client_id,
      action: 'soa.signed_by_text',
      details: {
        signature_request_id: data.id,
        document_id: document.id,
        certificate_document_id: certificateDocument.id,
        mime_type: 'image/png',
        opened_at: data.opened_at,
        opened_ip: data.opened_ip,
        signed_at: signedAt.toISOString(),
        signed_ip: signedIp,
        signed_user_agent: signedUserAgent,
        document_sha256: documentSha256,
        certificate_sha256: certificateSha256,
        recipient_phone: data.phone
      }
    })

    return NextResponse.json({
      ok: true,
      signed_at: signedAt.toISOString(),
      signed_ip: signedIp,
      request_id: data.id,
      document_id: document.id,
      certificate_document_id: certificateDocument.id,
      document_sha256: documentSha256,
      certificate_sha256: certificateSha256
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save the signed SOA.' }, { status: 500 })
  }
}
