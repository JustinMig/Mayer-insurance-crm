import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateTwilioRequest } from '@/lib/twilio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const raw = await request.text()
  const params = new URLSearchParams(raw)
  const signature = request.headers.get('x-twilio-signature')

  if (!validateTwilioRequest(request.url, params, signature)) {
    return new NextResponse('Invalid Twilio signature', { status: 403 })
  }

  const sid = String(params.get('MessageSid') || '').trim()
  if (!sid) return new NextResponse('ok')

  const status = String(params.get('MessageStatus') || params.get('SmsStatus') || 'unknown')
  const errorCode = String(params.get('ErrorCode') || '') || null
  const admin = createAdminClient()

  await admin
    .from('client_sms_messages')
    .update({
      status,
      error_code: errorCode,
      error_message: errorCode ? `Twilio error ${errorCode}` : null,
      updated_at: new Date().toISOString()
    })
    .eq('twilio_message_sid', sid)

  return new NextResponse('ok')
}
