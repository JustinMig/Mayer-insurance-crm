import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { normalizeUsPhone, sendTwilioSms } from '@/lib/twilio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

async function loadClient(supabase: Awaited<ReturnType<typeof getCrmSession>>['supabase'], id: string) {
  return supabase.from('clients').select('id, first_name, last_name, phone, assigned_agent_id').eq('id', id).maybeSingle()
}

export async function GET(_request: NextRequest, { params }: { params: Params }) {
  const { id } = await params
  const { supabase } = await getCrmSession()
  const { data: client } = await loadClient(supabase, id)
  if (!client) return NextResponse.json({ error: 'Client not found.' }, { status: 404 })

  const { data, error } = await supabase
    .from('client_sms_messages')
    .select('id,direction,body,from_number,to_number,twilio_message_sid,status,error_code,error_message,created_at,updated_at')
    .eq('client_id', id)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ messages: data || [], phone: client.phone || '' })
}

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const { id } = await params
  const { supabase, userId } = await getCrmSession()
  const { data: client } = await loadClient(supabase, id)
  if (!client) return NextResponse.json({ error: 'Client not found.' }, { status: 404 })

  const payload = await request.json().catch(() => ({})) as { body?: string }
  const body = String(payload.body || '').trim()
  const to = normalizeUsPhone(String(client.phone || ''))

  if (!to) return NextResponse.json({ error: 'This client does not have a valid U.S. mobile number.' }, { status: 400 })
  if (!body) return NextResponse.json({ error: 'Enter a message.' }, { status: 400 })
  if (body.length > 1500) return NextResponse.json({ error: 'Message is too long.' }, { status: 400 })

  const { data: pending, error: pendingError } = await supabase
    .from('client_sms_messages')
    .insert({
      client_id: id,
      user_id: userId,
      direction: 'outbound',
      body,
      to_number: to,
      status: 'sending'
    })
    .select('id')
    .single()

  if (pendingError || !pending) return NextResponse.json({ error: pendingError?.message || 'Unable to create message.' }, { status: 500 })

  try {
    const sent = await sendTwilioSms(to, body)
    const sid = String(sent.sid || '')
    const status = String(sent.status || 'queued')
    const from = String(sent.from || '')

    await supabase
      .from('client_sms_messages')
      .update({ twilio_message_sid: sid || null, status, from_number: from || null, updated_at: new Date().toISOString() })
      .eq('id', pending.id)

    return NextResponse.json({ ok: true, id: pending.id, sid, status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send message.'
    await supabase
      .from('client_sms_messages')
      .update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() })
      .eq('id', pending.id)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
