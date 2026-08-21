import 'server-only'
import crypto from 'node:crypto'

type SupabaseLike = any

type StoredPushSubscription = {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

type RecipientProfile = {
  id: string
  agency_id: string
  role: string
}

const P256_ORDER = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551')
const VAPID_SUBJECT = 'https://crm.mayerig.com'
const PUSH_TIMEOUT_MS = 5000

function base64UrlEncode(value: Buffer | Uint8Array | string) {
  const buffer = typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value)
  return buffer.toString('base64url')
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url')
}

function bufferToBigInt(value: Buffer) {
  return BigInt(`0x${value.toString('hex') || '0'}`)
}

function bigIntTo32Bytes(value: bigint) {
  return Buffer.from(value.toString(16).padStart(64, '0'), 'hex')
}

function derivedVapidPrivateKey() {
  const masterKeyB64 = process.env.DATA_ENCRYPTION_KEY_BASE64
  if (!masterKeyB64) throw new Error('DATA_ENCRYPTION_KEY_BASE64 is required for CRM push notifications.')
  const masterKey = Buffer.from(masterKeyB64, 'base64')
  if (masterKey.length !== 32) throw new Error('DATA_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes.')

  const seed = crypto
    .createHmac('sha256', masterKey)
    .update('mayer-crm-web-push-vapid-v1', 'utf8')
    .digest()
  const scalar = (bufferToBigInt(seed) % (P256_ORDER - 1n)) + 1n
  return bigIntTo32Bytes(scalar)
}

function vapidKeyPair() {
  const explicitPrivate = String(process.env.VAPID_PRIVATE_KEY || '').trim()
  const privateKey = explicitPrivate ? base64UrlDecode(explicitPrivate) : derivedVapidPrivateKey()
  if (privateKey.length !== 32) throw new Error('VAPID_PRIVATE_KEY must be a 32-byte base64url P-256 private key.')

  const ecdh = crypto.createECDH('prime256v1')
  ecdh.setPrivateKey(privateKey)
  const publicKey = ecdh.getPublicKey(undefined, 'uncompressed')
  return { privateKey, publicKey }
}

export function getVapidPublicKey() {
  return base64UrlEncode(vapidKeyPair().publicKey)
}

function createVapidJwt(endpoint: string) {
  const { privateKey, publicKey } = vapidKeyPair()
  const x = publicKey.subarray(1, 33)
  const y = publicKey.subarray(33, 65)
  const privateJwk = {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(x),
    y: base64UrlEncode(y),
    d: base64UrlEncode(privateKey),
  } as JsonWebKey
  const signingKey = crypto.createPrivateKey({ key: privateJwk, format: 'jwk' })

  const header = base64UrlEncode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  const payload = base64UrlEncode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + (12 * 60 * 60),
    sub: VAPID_SUBJECT,
  }))
  const unsigned = `${header}.${payload}`
  const signature = crypto.sign('sha256', Buffer.from(unsigned, 'utf8'), {
    key: signingKey,
    dsaEncoding: 'ieee-p1363',
  })
  return `${unsigned}.${base64UrlEncode(signature)}`
}

function hmacSha256(key: Buffer, data: Buffer) {
  return crypto.createHmac('sha256', key).update(data).digest()
}

function hkdfExtract(salt: Buffer, inputKeyMaterial: Buffer) {
  return hmacSha256(salt, inputKeyMaterial)
}

function hkdfExpand(prk: Buffer, info: Buffer, length: number) {
  const chunks: Buffer[] = []
  let previous = Buffer.alloc(0)
  let generated = 0
  let counter = 1

  while (generated < length) {
    previous = hmacSha256(prk, Buffer.concat([previous, info, Buffer.from([counter])]))
    chunks.push(previous)
    generated += previous.length
    counter += 1
  }

  return Buffer.concat(chunks).subarray(0, length)
}

function encryptWebPushPayload(subscription: Pick<StoredPushSubscription, 'p256dh' | 'auth'>, payload: Record<string, unknown>) {
  const userPublicKey = base64UrlDecode(subscription.p256dh)
  const authSecret = base64UrlDecode(subscription.auth)
  if (userPublicKey.length !== 65 || userPublicKey[0] !== 4) throw new Error('Invalid Web Push public key.')
  if (!authSecret.length) throw new Error('Invalid Web Push auth secret.')

  const serverKeys = crypto.createECDH('prime256v1')
  serverKeys.generateKeys()
  const serverPublicKey = serverKeys.getPublicKey(undefined, 'uncompressed')
  const sharedSecret = serverKeys.computeSecret(userPublicKey)

  const prkKey = hkdfExtract(authSecret, sharedSecret)
  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'utf8'),
    userPublicKey,
    serverPublicKey,
  ])
  const inputKeyMaterial = hkdfExpand(prkKey, keyInfo, 32)

  const salt = crypto.randomBytes(16)
  const prk = hkdfExtract(salt, inputKeyMaterial)
  const contentEncryptionKey = hkdfExpand(prk, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16)
  const nonce = hkdfExpand(prk, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12)

  const plain = Buffer.concat([
    Buffer.from(JSON.stringify(payload), 'utf8'),
    Buffer.from([2]),
  ])
  const cipher = crypto.createCipheriv('aes-128-gcm', contentEncryptionKey, nonce)
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()])

  const recordSize = Buffer.alloc(4)
  recordSize.writeUInt32BE(4096, 0)
  const header = Buffer.concat([
    salt,
    recordSize,
    Buffer.from([serverPublicKey.length]),
    serverPublicKey,
  ])
  return Buffer.concat([header, encrypted])
}

async function sendOnePush(subscription: StoredPushSubscription, payload: Record<string, unknown>) {
  const body = encryptWebPushPayload(subscription, payload)
  const publicKey = getVapidPublicKey()
  const jwt = createVapidJwt(subscription.endpoint)
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt}, k=${publicKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '120',
      Urgency: 'high',
    },
    body: new Uint8Array(body),
    signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
    cache: 'no-store',
  })

  if (response.status === 404 || response.status === 410) return 'expired' as const
  if (!response.ok) throw new Error(`Push service returned ${response.status}`)
  return 'sent' as const
}

async function unreadTextCount(admin: SupabaseLike, profile: RecipientProfile) {
  if (profile.role === 'manager') {
    const { data: agencyProfiles, error: profileError } = await admin
      .from('profiles')
      .select('id')
      .eq('agency_id', profile.agency_id)
      .eq('active', true)
    if (profileError) throw new Error(profileError.message)
    const userIds = (agencyProfiles || []).map((row: { id: string }) => row.id)
    if (!userIds.length) return 0
    const { count, error } = await admin
      .from('client_sms_messages')
      .select('id', { count: 'exact', head: true })
      .in('user_id', userIds)
      .eq('direction', 'inbound')
      .is('read_at', null)
    if (error) throw new Error(error.message)
    return count || 0
  }

  const { count, error } = await admin
    .from('client_sms_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', profile.id)
    .eq('direction', 'inbound')
    .is('read_at', null)
  if (error) throw new Error(error.message)
  return count || 0
}

export async function sendCrmMessagePush(admin: SupabaseLike, userIds: string[], messageId: string) {
  const recipients = Array.from(new Set(userIds.filter(Boolean)))
  if (!recipients.length) return

  const [{ data: subscriptions, error: subscriptionError }, { data: profiles, error: profileError }] = await Promise.all([
    admin
      .from('push_subscriptions')
      .select('id,user_id,endpoint,p256dh,auth')
      .in('user_id', recipients),
    admin
      .from('profiles')
      .select('id,agency_id,role')
      .in('id', recipients)
      .eq('active', true),
  ])

  if (subscriptionError) throw new Error(subscriptionError.message)
  if (profileError) throw new Error(profileError.message)
  if (!subscriptions?.length) return

  const profileMap = new Map<string, RecipientProfile>((profiles || []).map((profile: RecipientProfile) => [profile.id, profile]))
  const badgeEntries = await Promise.all(recipients.map(async userId => {
    const profile = profileMap.get(userId)
    if (!profile) return [userId, 1] as const
    try {
      return [userId, Math.max(1, await unreadTextCount(admin, profile))] as const
    } catch {
      return [userId, 1] as const
    }
  }))
  const badgeMap = new Map(badgeEntries)
  const expiredIds: string[] = []

  await Promise.all((subscriptions as StoredPushSubscription[]).map(async subscription => {
    try {
      const result = await sendOnePush(subscription, {
        title: 'Mayer CRM',
        body: 'New client message',
        url: '/notifications?tab=text',
        tag: `crm-message-${messageId}`,
        badge: badgeMap.get(subscription.user_id) || 1,
      })
      if (result === 'expired') expiredIds.push(subscription.id)
    } catch (error) {
      console.warn('CRM Web Push delivery failed', {
        userId: subscription.user_id,
        error: error instanceof Error ? error.message : 'Unknown push error',
      })
    }
  }))

  if (expiredIds.length) {
    await admin.from('push_subscriptions').delete().in('id', expiredIds)
  }
}
