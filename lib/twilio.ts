import 'server-only'
import crypto from 'node:crypto'

export function normalizeUsPhone(value: string) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (String(value || '').startsWith('+') && digits.length >= 10) return `+${digits}`
  return ''
}

export function twilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || ''
  const authToken = process.env.TWILIO_AUTH_TOKEN || ''
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || ''
  const phoneNumber = normalizeUsPhone(process.env.TWILIO_PHONE_NUMBER || '')

  if (!accountSid || !authToken || !messagingServiceSid) {
    throw new Error('Twilio is not fully configured in Vercel.')
  }

  return { accountSid, authToken, messagingServiceSid, phoneNumber }
}

export async function sendTwilioSms(to: string, body: string) {
  const { accountSid, authToken, messagingServiceSid } = twilioConfig()
  const form = new URLSearchParams()
  form.set('To', normalizeUsPhone(to))
  form.set('Body', body)
  form.set('MessagingServiceSid', messagingServiceSid)
  form.set('StatusCallback', 'https://crm.mayerig.com/api/twilio/status')

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form.toString(),
    cache: 'no-store'
  })

  const data = await response.json() as Record<string, unknown>
  if (!response.ok) {
    throw new Error(String(data.message || data.error_message || 'Twilio could not send the message.'))
  }
  return data
}

export function validateTwilioRequest(url: string, params: URLSearchParams, signature: string | null) {
  const authToken = process.env.TWILIO_AUTH_TOKEN || ''
  if (!authToken || !signature) return false

  const keys = Array.from(new Set(Array.from(params.keys()))).sort()
  let payload = url
  for (const key of keys) {
    const values = params.getAll(key).sort()
    for (const value of values) payload += `${key}${value}`
  }

  const expected = crypto.createHmac('sha1', authToken).update(payload, 'utf8').digest('base64')
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}
