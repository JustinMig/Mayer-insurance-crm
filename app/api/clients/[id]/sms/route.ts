import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeUsPhone, sendTwilioSms } from '@/lib/twilio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

type SmsRow = {
  id: string
  direction: string
  body?: string | null
  from_number: string | null
  to_number: string | null
  twilio_message_sid?: string | null
  status?: string | null
  error_code?: string | null
  error_message?: string | null
  read_at?: string | null
  created_at?: string | null
  updated_at?: string | null
}

function phone10(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(-10) : ''
}

function messageMatchesClient(row: SmsRow, clientPhone: string) {
  if (!clientPhone) return false
  const participant = String(row.direction || '').toLowerCase() === 'inbound' ? row.from_number : row.to_number
  return phone10(participant) === clientPhone
}

async function loadAccessibleClient(id: string) {
  const { supabase, userId } = await getCrmSession()
  const { data: client } = await supabase
    .from('clients')
    .select('id, first_name, last_name, phone, assigned_agent_id')
    .eq('id', id)
    .maybeSingle()
  return { client, userId }
}

export async function GET(request: NextRequest, { params }: { params: Params }) {
  const { id } = await params
  const { client } = await loadAccessibleClient(id)
  if (!client) return NextResponse.json({ error: 'Client not found.' }, { status: 404 })

  const notificationScope = request.nextUrl.searchParams.get('scope') === 'notifications'
  const admin = createAdminClient()
  let query = admin
    .from('client_sms_messages')
    .select('id,direction,body,from_number,to_number,twilio_message_sid,status,error_code,error_message,read_at,created_at,updated_at')
    .eq('client_id', id)

  if (notificationScope) query = query.is('notification_hidden_at', null)

  const { data, error } = await query
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const clientPhone = phone10(client.phone)
  const messages = ((data || []) as SmsRow[]).filter((row) => messageMatchesClient(row, clientPhone))

  return NextResponse.json({
    messages,
    phone: client.phone || '',
    client_name: [client.first_name, client.last_name].filter(Boolean).join(' ') || 'Client'
  })
}

export async function PATCH(_request: NextRequest, { params }: { params: Params }) {
  const { id } = await params
  const { client } = await loadAccessibleClient(id)
  if (!client) return NextResponse.json({ error: 'Client not found.' }, { status: 404 })

  const admin = createAdminClient()
  const clientPhone = phone10(client.phone)
  if (!clientPhone) return NextResponse.json({ ok: true })

  const { data: unreadRows, error: unreadError } = await admin
    .from('client_sms_messages')
    .select('id,direction,from_number,to_number')
    .eq('client_id', id)
    .eq('direction', 'inbound')
    .is('read_at', null)
    .limit(500)

  if (unreadError) return NextResponse.json({ error: unreadError.message }, { status: 500 })

  const matchingIds = ((unreadRows || []) as SmsRow[])
    .filter((row) => messageMatchesClient(row, clientPhone))
    .map((row) => row.id)

  if (!matchingIds.length) return NextResponse.json({ ok: true })

  const now = new Date().toISOString()
  const { error } = await admin
    .from('client_sms_messages')
    .update({ read_at: now, updated_at: now })
    .in('id', matchingIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const { id } = await params
  const { client, userId } = await loadAccessibleClient(id)
  if (!client) return NextResponse.json({ error: 'Client not found.' }, { status: 404 })

  const payload = await request.json().catch(() => ({})) as { body?: string }
  const body = String(payload.body || '').trim()
  const to = normalizeUsPhone(String(client.phone || ''))

  if (!to) return NextResponse.json({ error: 'This client does not have a valid U.S. mobile number.' }, { status: 400 })
  if (!body) return NextResponse.json({ error: 'Enter a message.' }, { status: 400 })
  if (body.length > 1500) return NextResponse.json({ error: 'Message is too long.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: pending, error: pendingError } = await admin
    .from('client_sms_messages')
    .insert({
      client_id: id,
      user_id: userId,
      direction: 'outbound',
      body,
      to_number: to,
      status: 'sending',
      read_at: new Date().toISOString()
    })
    .select('id')
    .single()

  if (pendingError || !pending) return NextResponse.json({ error: pendingError?.message || 'Unable to create message.' }, { status: 500 })

  try {
    const sent = await sendTwilioSms(to, body)
    const sid = String(sent.sid || '')
    const status = String(sent.status || 'queued')
    const from = String(sent.from || '')

    await admin
      .from('client_sms_messages')
      .update({ twilio_message_sid: sid || null, status, from_number: from || null, updated_at: new Date().toISOString() })
      .eq('id', pending.id)

    return NextResponse.json({ ok: true, id: pending.id, sid, status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send message.'
    await admin
      .from('client_sms_messages')
      .update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() })
      .eq('id', pending.id)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
