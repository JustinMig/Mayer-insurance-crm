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

function tokenHash(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function xml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function wrap(value: string, max = 82) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (next.length > max && line) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

function textLines(lines: string[], x: number, y: number, size = 24, gap = 34, weight = 400) {
  return lines.map((line, index) => `<text x="${x}" y="${y + index * gap}" font-size="${size}" font-weight="${weight}" font-family="Arial, Helvetica, sans-serif" fill="#0f172a">${xml(line)}</text>`).join('')
}

function buildSignedSoaSvg(payload: SoaPayload, signatureDataUrl: string, signedAt: Date) {
  const products = [...(Array.isArray(payload.products) ? payload.products : [])]
  if (payload.other_product) products.push(payload.other_product)
  let y = 250
  const chunks: string[] = []
  const add = (lines: string[], size = 24, gap = 34, weight = 400, spaceAfter = 20) => {
    chunks.push(textLines(lines, 90, y, size, gap, weight))
    y += Math.max(1, lines.length) * gap + spaceAfter
  }

  add(['Mayer Insurance Group'], 44, 50, 700, 8)
  add(['Scope of Sales Appointment Confirmation'], 32, 42, 700, 18)
  add([`Appointment date: ${signedAt.toLocaleDateString('en-US')}`], 22, 30, 400, 8)
  add([`SOA signed: ${signedAt.toLocaleString('en-US')}`], 19, 28, 400, 28)
  add(wrap('This Scope of Appointment documents the health-related Medicare product types the beneficiary has requested to discuss with the agent named below.'), 22, 31, 400, 10)
  add(wrap('Signing this form does not obligate the beneficiary to enroll, does not affect current or future Medicare enrollment status, and does not automatically enroll the beneficiary in any plan.'), 22, 31, 400, 28)

  add(['Beneficiary'], 27, 36, 700, 6)
  add([`Name: ${payload.beneficiary_name || 'Not provided'}`, `Phone: ${payload.beneficiary_phone || 'Not provided'}`], 23, 33, 400, 4)
  add(wrap(`Address: ${payload.beneficiary_address || 'Not provided'}`), 23, 33, 400, 26)

  add(['Agent'], 27, 36, 700, 6)
  add([`Name: ${payload.agent_name || 'Agent'}`, `Email: ${payload.agent_email || 'Not provided'}`], 23, 33, 400, 26)

  add(['Products requested for discussion'], 27, 36, 700, 8)
  for (const product of products.length ? products : ['Medicare-related health products requested by beneficiary']) {
    add(wrap(`• ${product}`, 78), 22, 31, 400, 2)
  }
  y += 18

  add(['Beneficiary acknowledgement'], 27, 36, 700, 8)
  add(wrap('By signing below, I confirm that I requested discussion of the health-related product types selected above. I understand that I am under no obligation to enroll in a plan, my current or future Medicare enrollment status will not be affected by signing this form, and I will not be automatically enrolled in any plan.'), 21, 30, 400, 8)
  add(wrap('The agent may discuss only the product types agreed to on this Scope of Appointment. If I request discussion of a different product type, an updated or new Scope of Appointment must be documented before that additional product type is discussed.'), 21, 30, 400, 8)
  add(wrap('For scheduled individual Medicare marketing appointments, CMS timing requirements may require the Scope of Appointment to be documented at least 48 hours in advance, subject to applicable exceptions.'), 21, 30, 400, 26)

  add(['Beneficiary signature'], 26, 36, 700, 8)
  const sigY = y
  chunks.push(`<rect x="90" y="${sigY}" width="1210" height="300" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>`)
  chunks.push(`<image href="${xml(signatureDataUrl)}" x="110" y="${sigY + 20}" width="1170" height="260" preserveAspectRatio="xMidYMid meet"/>`)
  y += 340
  add([`Signed electronically: ${signedAt.toLocaleString('en-US')}`], 21, 30, 400, 8)
  add(wrap('Generated and stored by Mayer Insurance Group CRM. Retain according to applicable carrier and CMS requirements.'), 18, 27, 400, 0)

  const height = Math.max(2300, y + 100)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="${height}" viewBox="0 0 1400 ${height}"><rect width="1400" height="${height}" fill="#ffffff"/>${chunks.join('')}</svg>`
}

async function loadRequest(token: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('soa_signature_requests')
    .select('id,agency_id,client_id,requested_by,phone,request_payload,status,expires_at,signed_at,document_id')
    .eq('token_hash', tokenHash(token))
    .maybeSingle()
  return { admin, data }
}

export async function GET(_request: NextRequest, { params }: { params: Params }) {
  const { token } = await params
  const { admin, data } = await loadRequest(token)
  if (!data) return NextResponse.json({ error: 'This signing link is not valid.' }, { status: 404 })
  if (data.status === 'signed') return NextResponse.json({ status: 'signed', signed_at: data.signed_at })
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await admin.from('soa_signature_requests').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', data.id)
    return NextResponse.json({ error: 'This signing link has expired.' }, { status: 410 })
  }
  if (data.status === 'canceled' || data.status === 'expired') return NextResponse.json({ error: 'This signing link is no longer active.' }, { status: 410 })

  if (data.status === 'sent') {
    await admin.from('soa_signature_requests').update({ status: 'opened', opened_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', data.id)
  }

  return NextResponse.json({ status: 'ready', request: data.request_payload, expires_at: data.expires_at })
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

    const body = await request.json().catch(() => ({})) as { signature_data_url?: string }
    const signature = String(body.signature_data_url || '')
    if (!signature.startsWith('data:image/png;base64,') || signature.length > 3_000_000) {
      return NextResponse.json({ error: 'Please provide a valid signature.' }, { status: 400 })
    }

    const signedAt = new Date()
    const payload = (data.request_payload || {}) as SoaPayload
    const svg = buildSignedSoaSvg(payload, signature, signedAt)
    const safeName = String(payload.beneficiary_name || 'Client').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Client'
    const fileName = `Signed_SOA_${safeName}_${signedAt.toISOString().slice(0, 10)}.svg`
    const storagePath = `${data.agency_id}/${data.client_id}/${crypto.randomUUID()}-${fileName}`

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, Buffer.from(svg, 'utf8'), { contentType: 'image/svg+xml', upsert: false })
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

    const { data: document, error: documentError } = await admin
      .from('documents')
      .insert({
        agency_id: data.agency_id,
        client_id: data.client_id,
        uploaded_by: data.requested_by,
        storage_path: storagePath,
        file_name: fileName,
        mime_type: 'image/svg+xml',
        document_type: 'scope_of_appointment'
      })
      .select('id')
      .single()

    if (documentError || !document) {
      await admin.storage.from(BUCKET).remove([storagePath])
      return NextResponse.json({ error: documentError?.message || 'Unable to save signed SOA.' }, { status: 500 })
    }

    await admin
      .from('soa_signature_requests')
      .update({ status: 'signed', signed_at: signedAt.toISOString(), document_id: document.id, updated_at: signedAt.toISOString() })
      .eq('id', data.id)

    await admin.from('audit_log').insert({
      agency_id: data.agency_id,
      actor_id: data.requested_by,
      client_id: data.client_id,
      action: 'soa.signed_by_text',
      details: { signature_request_id: data.id, document_id: document.id }
    })

    return NextResponse.json({ ok: true, signed_at: signedAt.toISOString() })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save the signed SOA.' }, { status: 500 })
  }
}
