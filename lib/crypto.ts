import crypto from 'node:crypto'

function key(): Buffer {
  const raw = process.env.DATA_ENCRYPTION_KEY_BASE64
  if (!raw) throw new Error('DATA_ENCRYPTION_KEY_BASE64 is not configured')
  const decoded = Buffer.from(raw, 'base64')
  if (decoded.length !== 32) throw new Error('DATA_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes')
  return decoded
}

export function encryptValue(value: string | null | undefined): string | null {
  const clean = value?.trim()
  if (!clean) return null
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const encrypted = Buffer.concat([cipher.update(clean, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1.${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`
}

export function decryptValue(payload: string | null | undefined): string | null {
  if (!payload) return null
  const [version, ivB64, tagB64, encryptedB64] = payload.split('.')
  if (version !== 'v1' || !ivB64 || !tagB64 || !encryptedB64) throw new Error('Unsupported encrypted payload')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const plain = Buffer.concat([decipher.update(Buffer.from(encryptedB64, 'base64')), decipher.final()])
  return plain.toString('utf8')
}

export function last4(value: string | null | undefined): string {
  if (!value) return '—'
  const compact = value.replace(/\s+/g, '')
  return compact.length <= 4 ? compact : `••••${compact.slice(-4)}`
}
