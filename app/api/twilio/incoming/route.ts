import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeUsPhone, validateTwilioRequest } from '@/lib/twilio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const raw = await request.text()
  const params = new URLSearchParams(raw)
  const signature = request.headers.get('x-twilio-signature')

  if (!validateTwilioRequest(request.url, params, signature)) {
    return new NextResponse('Invalid Twilio signature', { status: 403 })
  }

  const from = normalizeUsPhone(params.get('From') || '')
  const to = normalizeUsPhone(params.get('To') || '')
  const body = String(params.get('Body') || '').trim()
  const sid = String(params.get('MessageSid') || params.get('SmsMessageSid') || '').trim()
  if (!from || !sid) return new NextResponse('<Response></Response>', { status: 200, headers: { 'Content-Type': 'text/xml' } })

  const admin = createAdminClient()
  let client: { id: string; assigned_agent_id: string | null; phone: string | null } | null = null

  // Prefer the client thread that most recently sent a message to this exact number.
  // This makes replies to individual and mass texts return to the same CRM conversation.
  const { data: recentOutbound } = await admin
    .from('client_sms_messages')
    .select('client_id')
    .eq('direction', 'outbound')
    .eq('to_number', from)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (recentOutbound?.client_id) {
    const { data: recentClient } = await admin
      .from('clients')
      .select('id, assigned_agent_id, phone')
      .eq('id', recentOutbound.client_id)
      .maybeSingle()
    client = recentClient || null
  }

  // Fallback for a client who texts before any CRM outbound message exists.
  if (!client) {
    const digits = from.replace(/\D/g, '')
    const last10 = digits.slice(-10)
    const last7 = digits.slice(-7)

    const { data: candidates } = await admin
      .from('clients')
      .select('id, assigned_agent_id, phone')
      .not('phone', 'is', null)
      .ilike('phone', `%${last7}%`)
      .limit(25)

    client = (candidates || []).find((row) => normalizeUsPhone(String(row.phone || '')).replace(/\D/g, '').slice(-10) === last10) || null
  }

  if (client?.assigned_agent_id) {
    await admin.from('client_sms_messages').upsert({
      client_id: client.id,
      user_id: client.assigned_agent_id,
      direction: 'inbound',
      body,
      from_number: from,
      to_number: to || null,
      twilio_message_sid: sid,
      status: String(params.get('SmsStatus') || 'received'),
      updated_at: new Date().toISOString()
    }, { onConflict: 'twilio_message_sid', ignoreDuplicates: true })
  } else {
    console.warn('Inbound Twilio SMS could not be matched to a CRM client', { from })
  }

  return new NextResponse('<Response></Response>', { status: 200, headers: { 'Content-Type': 'text/xml' } })
}
