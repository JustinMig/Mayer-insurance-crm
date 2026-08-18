import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
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

async function buildCertificatePdf(input: {
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
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([612, 792])
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const dark = rgb(0.08, 0.15, 0.25)
  const muted = rgb(0.28, 0.34, 0.42)
  let y = 744

  const drawLine = (text: string, size = 10, isBold = false, indent = 0) => {
    page.drawText(text, { x: 54 + indent, y, size, font: isBold ? bold : regular, color: dark })
    y -= size + 6
  }
  const drawWrapped = (text: string, size = 10, isBold = false, indent = 0, max = 90) => {
    for (const line of wrapText(text, max)) drawLine(line, size, isBold, indent)
  }
  const gap = (amount = 8) => { y -= amount }

  drawLine('MAYER INSURANCE GROUP', 15, true)
  drawLine('SOA Certificate of Completion', 20, true)
  drawLine('Electronic Signature Audit Record', 11, false)
  gap(8)

  page.drawLine({ start: { x: 54, y }, end: { x: 558, y }, thickness: 1, color: rgb(0.82, 0.85, 0.89) })
  gap(18)

  drawLine('Envelope / Request Details', 12, true)
  drawWrapped(`SOA Request ID: ${input.requestId}`)
  drawWrapped(`Beneficiary: ${input.payload.beneficiary_name || 'Client'}`)
  drawWrapped(`Recipient phone: ${input.phone || input.payload.beneficiary_phone || 'Not provided'}`)
  drawWrapped(`Beneficiary address: ${input.payload.beneficiary_address || 'Not provided'}`)
  drawWrapped(`Agent: ${input.payload.agent_name || 'Agent'}`)
  if (input.payload.agent_email) drawWrapped(`Agent email: ${input.payload.agent_email}`)
  gap(8)

  drawLine('Event History', 12, true)
  drawWrapped(`Created / sent: ${input.createdAt ? new Date(input.createdAt).toLocaleString('en-US') : 'Recorded in CRM message history'}`)
  drawWrapped(`Opened: ${input.openedAt ? new Date(input.openedAt).toLocaleString('en-US') : 'Not separately recorded'}`)
  drawWrapped(`Opened IP: ${input.openedIp || 'Unavailable'}`)
  drawWrapped(`Signed / submitted: ${new Date(input.signedAt).toLocaleString('en-US')}`)
  drawWrapped(`Signed IP: ${input.signedIp}`)
  gap(8)

  drawLine('Device / Browser Evidence', 12, true)
  drawWrapped(`Opened device/browser: ${shortUserAgent(input.openedUserAgent || 'Unavailable')}`, 9, false, 0, 100)
  drawWrapped(`Signing device/browser: ${shortUserAgent(input.signedUserAgent)}`, 9, false, 0, 100)
  gap(8)

  drawLine('Signed Document Integrity', 12, true)
  drawWrapped(`Signed SOA document ID: ${input.documentId}`, 9)
  drawWrapped(`Signed SOA file: ${input.documentFileName}`, 9)
  drawWrapped(`SHA-256 fingerprint: ${input.documentSha256}`, 9, false, 0, 76)
  gap(8)

  drawLine('Record Statement', 12, true)
  drawWrapped('This certificate was generated automatically by Mayer Insurance Group CRM when the beneficiary submitted the electronic signature. The signed SOA and this certificate are locked as immutable CRM records after completion.', 9, false, 0, 98)
  gap(6)
  drawWrapped('IP addresses identify the network connection observed by the CRM and are not a guarantee of an exact physical or GPS location.', 9, false, 0, 98)

  page.drawText('Certificate generated by Mayer Insurance Group CRM', { x: 54, y: 38, size: 8, font: regular, color: muted })
  page.drawText(`Generated: ${new Date(input.signedAt).toLocaleString('en-US')}`, { x: 356, y: 38, size: 8, font: regular, color: muted })

  return Buffer.from(await pdf.save())
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

    const certificateBytes = await buildCertificatePdf({
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
