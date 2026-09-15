import 'server-only'

const MH_SUPABASE_URL = 'https://bogusfmvdrlvxscopgaw.supabase.co'
const MH_PUBLISHABLE_KEY = 'sb_publishable_0g4-uBS_I8wJnBdLbtbriA_vFngXi46'

export const OFFICE_RINGCENTRAL_OWNER_ID = '9c9b6c8a-add4-475d-bda5-c27169f117a1'

export function normalizeMhPhone(value?: string | null) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(-10) : ''
}

function bridgeError(message: string, status: number) {
  return Object.assign(new Error(message), { status })
}

export async function getAuthorizedMhClients(request: Request) {
  const authorization = request.headers.get('authorization') || ''
  const token = authorization.replace(/^Bearer\s+/i, '').trim()
  if (!token) throw bridgeError('M&H CRM sign-in is required.', 401)

  const authHeaders = {
    apikey: MH_PUBLISHABLE_KEY,
    Authorization: `Bearer ${token}`,
    Accept: 'application/json'
  }

  const userResponse = await fetch(`${MH_SUPABASE_URL}/auth/v1/user`, {
    headers: authHeaders,
    cache: 'no-store'
  })
  const user = await userResponse.json().catch(() => ({})) as { id?: string }
  if (!userResponse.ok || !user?.id) throw bridgeError('The M&H CRM session is not valid.', 401)

  const profileResponse = await fetch(
    `${MH_SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&active=eq.true&select=id,active&limit=1`,
    { headers: authHeaders, cache: 'no-store' }
  )
  const profiles = await profileResponse.json().catch(() => []) as Array<{ id?: string; active?: boolean }>
  if (!profileResponse.ok || !profiles[0]?.active) throw bridgeError('This M&H CRM user is not active.', 403)

  const clients: Array<{ id: string; phone: string | null }> = []
  for (let offset = 0; offset < 10000; offset += 1000) {
    const response = await fetch(
      `${MH_SUPABASE_URL}/rest/v1/clients?select=id,phone&phone=not.is.null&order=created_at.desc`,
      {
        headers: { ...authHeaders, Range: `${offset}-${offset + 999}` },
        cache: 'no-store'
      }
    )
    const page = await response.json().catch(() => []) as Array<{ id: string; phone: string | null }>
    if (!response.ok) throw bridgeError('Unable to verify M&H client access.', response.status || 500)
    clients.push(...page)
    if (page.length < 1000) break
  }

  // Only match a RingCentral call when exactly one saved M&H client owns the
  // phone number. Duplicate client phone numbers are intentionally skipped so
  // call recordings can never be attached to the wrong client record.
  const matches = new Map<string, string[]>()
  for (const client of clients) {
    const phone = normalizeMhPhone(client.phone)
    if (!phone) continue
    const ids = matches.get(phone) || []
    ids.push(client.id)
    matches.set(phone, ids)
  }
  const clientByPhone = new Map<string, string>()
  for (const [phone, ids] of matches) if (ids.length === 1) clientByPhone.set(phone, ids[0])

  return { userId: user.id, clientByPhone }
}
