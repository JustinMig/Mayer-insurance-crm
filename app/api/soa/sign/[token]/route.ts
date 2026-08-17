import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'client-documents'

type Params = Promise<{ token: string }>

function tokenHash(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
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

    const body = await request.json().catch(() => ({})) as { document_data_url?: string }
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
    const payload = (data.request_payload || {}) as { beneficiary_name?: string }
    const safeName = String(payload.beneficiary_name || 'Client').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Client'
    const fileName = `Signed_SOA_${safeName}_${signedAt.toISOString().slice(0, 10)}.png`
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

    await admin
      .from('soa_signature_requests')
      .update({ status: 'signed', signed_at: signedAt.toISOString(), document_id: document.id, updated_at: signedAt.toISOString() })
      .eq('id', data.id)

    await admin.from('audit_log').insert({
      agency_id: data.agency_id,
      actor_id: data.requested_by,
      client_id: data.client_id,
      action: 'soa.signed_by_text',
      details: { signature_request_id: data.id, document_id: document.id, mime_type: 'image/png' }
    })

    return NextResponse.json({ ok: true, signed_at: signedAt.toISOString() })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save the signed SOA.' }, { status: 500 })
  }
}
