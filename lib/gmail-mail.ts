import { decryptValue, encryptValue } from '@/lib/crypto'

type SupabaseLike = any

export const CRM_GMAIL_LABEL = 'Send to CRM'
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.file',
].join(' ')
const GMAIL_DETAIL_CONCURRENCY = 8

function clientId() { return process.env.GOOGLE_GMAIL_CLIENT_ID || '' }
function clientSecret() { return process.env.GOOGLE_GMAIL_CLIENT_SECRET || '' }

export function gmailConfigured() {
  return Boolean(clientId() && clientSecret())
}

export function gmailAuthUrl(origin: string, state: string) {
  const redirectUri = `${origin}/api/gmail/callback`
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

async function exchangeCode(code: string, origin: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${origin}/api/gmail/callback`,
    }),
  })
  if (!response.ok) throw new Error(`Google token exchange failed (${response.status})`)
  return response.json() as Promise<{ access_token: string; refresh_token?: string; expires_in?: number }>
}

export async function saveGmailConnection(supabase: SupabaseLike, userId: string, code: string, origin: string) {
  const tokens = await exchangeCode(code, origin)
  if (!tokens.refresh_token) throw new Error('Google did not return a refresh token. Disconnect the app in Google and reconnect.')

  const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  if (!profileResponse.ok) throw new Error('Unable to read Gmail profile')
  const profile = await profileResponse.json() as { emailAddress?: string }

  const expiresAt = new Date(Date.now() + Math.max(60, (tokens.expires_in || 3600) - 60) * 1000).toISOString()
  const { error } = await supabase.from('gmail_connections').upsert({
    user_id: userId,
    gmail_email: profile.emailAddress || null,
    refresh_token_encrypted: encryptValue(tokens.refresh_token),
    access_token_encrypted: encryptValue(tokens.access_token),
    access_token_expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) throw new Error(error.message)
}

export async function getGoogleAccessToken(supabase: SupabaseLike, userId: string) {
  const { data, error } = await supabase.from('gmail_connections')
    .select('refresh_token_encrypted,access_token_encrypted,access_token_expires_at')
    .eq('user_id', userId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data?.refresh_token_encrypted) return null

  const stillValid = data.access_token_encrypted && data.access_token_expires_at && new Date(data.access_token_expires_at).getTime() > Date.now() + 30_000
  if (stillValid) return decryptValue(data.access_token_encrypted)

  const refreshToken = decryptValue(data.refresh_token_encrypted)
  if (!refreshToken) return null
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!response.ok) throw new Error(`Unable to refresh Gmail access (${response.status})`)
  const refreshed = await response.json() as { access_token: string; expires_in?: number }
  const expiresAt = new Date(Date.now() + Math.max(60, (refreshed.expires_in || 3600) - 60) * 1000).toISOString()
  await supabase.from('gmail_connections').update({
    access_token_encrypted: encryptValue(refreshed.access_token),
    access_token_expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId)
  return refreshed.access_token
}

function decodeBase64Url(value?: string) {
  if (!value) return ''
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

function header(headers: Array<{ name?: string; value?: string }> | undefined, name: string) {
  return headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''
}

function parseAddress(value: string) {
  const match = value.match(/^(.*?)\s*<([^>]+)>$/)
  return match ? { name: match[1].replace(/^"|"$/g, '').trim(), email: match[2].trim() } : { name: '', email: value.trim() }
}

function walkParts(part: any, result: { text: string; html: string; attachments: any[] }) {
  const mime = String(part?.mimeType || '')
  const filename = String(part?.filename || '')
  const attachmentId = part?.body?.attachmentId
  const contentId = header(part?.headers, 'Content-ID').replace(/[<>]/g, '')
  if (attachmentId) {
    result.attachments.push({ filename: filename || 'Attachment', mimeType: mime, attachmentId, size: part?.body?.size || 0, contentId: contentId || null })
  } else if (mime === 'text/plain' && part?.body?.data) {
    result.text += decodeBase64Url(part.body.data)
  } else if (mime === 'text/html' && part?.body?.data) {
    result.html += decodeBase64Url(part.body.data)
  }
  for (const child of part?.parts || []) walkParts(child, result)
}

async function fetchFullMessage(item: { id: string; threadId: string }, headers: Record<string, string>, userId: string) {
  const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=full`, { headers, cache: 'no-store' })
  if (!msgRes.ok) return null
  const msg = await msgRes.json() as any
  const parsed = { text: '', html: '', attachments: [] as any[] }
  walkParts(msg.payload, parsed)
  if (!parsed.text && msg.payload?.mimeType === 'text/plain') parsed.text = decodeBase64Url(msg.payload?.body?.data)
  if (!parsed.html && msg.payload?.mimeType === 'text/html') parsed.html = decodeBase64Url(msg.payload?.body?.data)

  const fromRaw = header(msg.payload?.headers, 'From')
  const from = parseAddress(fromRaw)
  const received = msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : new Date().toISOString()
  const now = new Date().toISOString()

  return {
    user_id: userId,
    gmail_message_id: item.id,
    gmail_thread_id: item.threadId,
    sender_name: from.name || null,
    sender_email: from.email || null,
    recipients: header(msg.payload?.headers, 'To') || null,
    cc: header(msg.payload?.headers, 'Cc') || null,
    reply_to: header(msg.payload?.headers, 'Reply-To') || null,
    message_date: header(msg.payload?.headers, 'Date') || null,
    subject: header(msg.payload?.headers, 'Subject') || '(no subject)',
    snippet: msg.snippet || null,
    body_text: parsed.text || null,
    body_html: parsed.html || null,
    received_at: received,
    attachments: parsed.attachments,
    full_synced_at: now,
    updated_at: now,
  }
}

export async function syncCrmMail(supabase: SupabaseLike, userId: string) {
  if (!gmailConfigured()) return { connected: false, configured: false, labelMissing: false, imported: 0, updated: 0 }
  const accessToken = await getGoogleAccessToken(supabase, userId)
  if (!accessToken) return { connected: false, configured: true, labelMissing: false, imported: 0, updated: 0 }
  const headers = { Authorization: `Bearer ${accessToken}` }

  const labelsRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', { headers, cache: 'no-store' })
  if (!labelsRes.ok) throw new Error('Unable to read Gmail labels')
  const labelsJson = await labelsRes.json() as { labels?: Array<{ id: string; name: string }> }
  const crmLabel = labelsJson.labels?.find(label => label.name === CRM_GMAIL_LABEL)
  if (!crmLabel) return { connected: true, configured: true, labelMissing: true, imported: 0, updated: 0 }

  const listParams = new URLSearchParams({ labelIds: crmLabel.id, maxResults: '50' })
  const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${listParams}`, { headers, cache: 'no-store' })
  if (!listRes.ok) throw new Error('Unable to list CRM Gmail messages')
  const list = await listRes.json() as { messages?: Array<{ id: string; threadId: string }> }
  const items = list.messages || []
  if (!items.length) return { connected: true, configured: true, labelMissing: false, imported: 0, updated: 0 }

  const messageIds = items.map(item => item.id)
  const { data: existingRows, error: existingError } = await supabase
    .from('crm_mail')
    .select('gmail_message_id,full_synced_at')
    .eq('user_id', userId)
    .in('gmail_message_id', messageIds)
  if (existingError) throw new Error(existingError.message)

  const existingMap = new Map((existingRows || []).map((row: any) => [String(row.gmail_message_id), row.full_synced_at]))
  const pendingItems = items.filter(item => !existingMap.get(item.id))
  if (!pendingItems.length) return { connected: true, configured: true, labelMissing: false, imported: 0, updated: 0 }

  const rows: any[] = []
  for (let index = 0; index < pendingItems.length; index += GMAIL_DETAIL_CONCURRENCY) {
    const batch = pendingItems.slice(index, index + GMAIL_DETAIL_CONCURRENCY)
    const fetched = await Promise.all(batch.map(item => fetchFullMessage(item, headers, userId)))
    rows.push(...fetched.filter(Boolean))
  }

  if (!rows.length) return { connected: true, configured: true, labelMissing: false, imported: 0, updated: 0 }

  const imported = rows.filter(row => !existingMap.has(String(row.gmail_message_id))).length
  const updated = rows.length - imported
  const { error: upsertError } = await supabase
    .from('crm_mail')
    .upsert(rows, { onConflict: 'user_id,gmail_message_id' })
  if (upsertError) throw new Error(upsertError.message)

  return { connected: true, configured: true, labelMissing: false, imported, updated }
}

export async function gmailAttachment(supabase: SupabaseLike, userId: string, messageId: string, attachmentId: string) {
  const accessToken = await getGoogleAccessToken(supabase, userId)
  if (!accessToken) return null
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store'
  })
  if (!response.ok) return null
  const data = await response.json() as { data?: string }
  if (!data.data) return null
  return Buffer.from(data.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}
