import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeUsPhone, sendTwilioSms } from '@/lib/twilio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

export async function POST(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id: clientId } = await params
    const { supabase, userId, profile } = await getCrmSession()
    if (!profile?.agency_id) return NextResponse.json({ error: 'CRM profile not found.' }, { status: 403 })

    const payload = await request.json().catch(() => ({})) as {
      phone?: string
      products?: string[]
      other_product?: string
    }

    const { data: client } = await supabase
      .from('clients')
      .select('id,agency_id,assigned_agent_id,first_name,last_name,phone,address_line1,city,state,zip_code')
      .eq('id', clientId)
      .maybeSingle()

    if (!client) return NextResponse.json({ error: 'Client not found or access denied.' }, { status: 404 })

    const phone = normalizeUsPhone(String(payload.phone || client.phone || ''))
    if (!phone) return NextResponse.json({ error: 'Enter a valid U.S. mobile number.' }, { status: 400 })

    const admin = createAdminClient()
    const { data: assignedAgent } = client.assigned_agent_id
      ? await admin.from('profiles').select('id,full_name,email').eq('id', client.assigned_agent_id).maybeSingle()
      : { data: null }

    const token = crypto.randomBytes(32).toString('base64url')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const clientName = [client.first_name, client.last_name].filter(Boolean).join(' ') || 'Client'
    const address = [client.address_line1, client.city, client.state, client.zip_code].filter(Boolean).join(', ')
    const products = Array.isArray(payload.products) ? payload.products.map(String).filter(Boolean).slice(0, 12) : []
    const otherProduct = String(payload.other_product || '').trim().slice(0, 200)

    const { data: signatureRequest, error: requestError } = await admin
      .from('soa_signature_requests')
      .insert({
        agency_id: client.agency_id,
        client_id: client.id,
        requested_by: userId,
        token_hash: tokenHash,
        phone,
        request_payload: {
          beneficiary_name: clientName,
          beneficiary_phone: client.phone || phone,
          beneficiary_address: address,
          agent_name: assignedAgent?.full_name || profile.full_name || 'Agent',
          agent_email: assignedAgent?.email || '',
          products,
          other_product: otherProduct
        }
      })
      .select('id')
      .single()

    if (requestError || !signatureRequest) {
      return NextResponse.json({ error: requestError?.message || 'Unable to create signing request.' }, { status: 500 })
    }

    const signUrl = `https://crm.mayerig.com/soa/sign/${token}`
    const smsBody = `Mayer Insurance Group: ${clientName}, please review and sign your Scope of Appointment here: ${signUrl}`

    const { data: pending, error: pendingError } = await supabase
      .from('client_sms_messages')
      .insert({
        client_id: client.id,
        user_id: userId,
        direction: 'outbound',
        body: smsBody,
        to_number: phone,
        status: 'sending',
        read_at: new Date().toISOString()
      })
      .select('id')
      .single()

    if (pendingError || !pending) {
      await admin.from('soa_signature_requests').delete().eq('id', signatureRequest.id)
      return NextResponse.json({ error: pendingError?.message || 'Unable to create the text message.' }, { status: 500 })
    }

    try {
      const sent = await sendTwilioSms(phone, smsBody)
      await supabase
        .from('client_sms_messages')
        .update({
          twilio_message_sid: String(sent.sid || '') || null,
          status: String(sent.status || 'queued'),
          from_number: String(sent.from || '') || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', pending.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to send SOA text.'
      await supabase.from('client_sms_messages').update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() }).eq('id', pending.id)
      await admin.from('soa_signature_requests').update({ status: 'canceled', updated_at: new Date().toISOString() }).eq('id', signatureRequest.id)
      return NextResponse.json({ error: message }, { status: 502 })
    }

    await admin.from('audit_log').insert({
      agency_id: client.agency_id,
      actor_id: userId,
      client_id: client.id,
      action: 'soa.text_sent',
      details: { signature_request_id: signatureRequest.id, phone }
    })

    return NextResponse.json({ ok: true, phone })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to text the SOA.' }, { status: 500 })
  }
}
