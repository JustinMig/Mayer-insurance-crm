import crypto from 'node:crypto'
import type { BackupStorageFile } from '@/lib/crm-backup'

const RECOVERY_SECRET_KEYS = [
  'DATA_ENCRYPTION_KEY_BASE64',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GOOGLE_GMAIL_CLIENT_ID',
  'GOOGLE_GMAIL_CLIENT_SECRET',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_MESSAGING_SERVICE_SID',
  'TWILIO_PHONE_NUMBER',
] as const

function centralParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  return Object.fromEntries(parts.map(part => [part.type, part.value]))
}

export function externalRecoveryFileName(date = new Date()) {
  const p = centralParts(date)
  return `Mayer-CRM-Full-Recovery-${p.year}-${p.month}-${p.day}-${p.hour}${p.minute}${p.second}-CT.tar`
}

function asciiSafeName(value: string) {
  const safe = String(value || '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/[\\/\u0000-\u001f\u007f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return safe || 'client-file'
}

export function externalRecoveryArchivePath(file: BackupStorageFile, index: number) {
  const number = String(index + 1).padStart(4, '0')
  const base = asciiSafeName(file.driveName).slice(0, 72)
  return `Client Documents/${number} - ${base}`
}

export function recoveryEnvironmentReference(sourceCommit: string) {
  const lines = [
    'Mayer Insurance Group CRM - Environment / Service Reference',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Production domain: crm.mayerig.com`,
    `GitHub repository: JustinMig/Mayer-insurance-crm`,
    `Source commit captured by this backup: ${sourceCommit || 'unknown'}`,
    '',
    'The values below are NOT printed here. Sensitive configured values are stored inside',
    'Security/critical-recovery-secrets.enc.json and require the recovery passphrase.',
    '',
    'Required / known CRM environment variables:',
  ]

  for (const key of RECOVERY_SECRET_KEYS) {
    lines.push(`- ${key}: ${process.env[key] ? 'configured at backup time' : 'not configured at backup time'}`)
  }

  lines.push(
    '',
    'Other platform items that must be reconnected during a full rebuild:',
    '- Supabase project/database and private Storage bucket: client-documents',
    '- Vercel project and crm.mayerig.com domain',
    '- Google OAuth consent/client configuration for Gmail + Drive',
    '- Twilio messaging service/webhooks',
    '- User login passwords (passwords and active sessions are intentionally never backed up)',
  )

  return lines.join('\n')
}

export function encryptCriticalRecoveryVault(passphrase: string, sourceCommit: string) {
  const clean = passphrase.trim()
  if (clean.length < 12) throw new Error('Recovery passphrase must be at least 12 characters.')

  const encryptionKey = process.env.DATA_ENCRYPTION_KEY_BASE64
  if (!encryptionKey) {
    throw new Error('DATA_ENCRYPTION_KEY_BASE64 is not configured, so a restorable encrypted-data backup cannot be created.')
  }

  const secrets = Object.fromEntries(
    RECOVERY_SECRET_KEYS
      .map(key => [key, process.env[key] || null] as const)
      .filter(([, value]) => Boolean(value)),
  )

  const payload = Buffer.from(JSON.stringify({
    format: 'mayer-crm-critical-recovery-secrets',
    version: 1,
    generated_at: new Date().toISOString(),
    source_commit: sourceCommit || null,
    secrets,
  }, null, 2), 'utf8')

  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12)
  const key = crypto.scryptSync(clean, salt, 32)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()])
  const tag = cipher.getAuthTag()

  return JSON.stringify({
    format: 'mayer-crm-encrypted-recovery-vault',
    version: 1,
    kdf: 'scrypt',
    cipher: 'aes-256-gcm',
    salt_base64: salt.toString('base64'),
    iv_base64: iv.toString('base64'),
    auth_tag_base64: tag.toString('base64'),
    ciphertext_base64: ciphertext.toString('base64'),
    note: 'The passphrase is not stored anywhere in this file. Keep it separately.',
  }, null, 2)
}

export function disasterRecoveryReadmeText(input: {
  startedAt: string
  sourceCommit: string
  fileCount: number
  totalBytes: number
}) {
  return [
    'MAYER INSURANCE GROUP CRM - FULL DISASTER RECOVERY BACKUP',
    '',
    `Backup started: ${input.startedAt}`,
    `GitHub source commit: ${input.sourceCommit || 'unknown'}`,
    `Client/storage files included: ${input.fileCount}`,
    `Client/storage bytes expected: ${input.totalBytes}`,
    '',
    'WHAT THIS ONE TAR FILE CONTAINS',
    '- Database/database.json.gz: point-in-time export of agency CRM data plus CRM reference datasets.',
    '- Client Documents/: every file currently stored under the agency path in the private Supabase bucket.',
    '- Source Code/source-code.zip: exact CRM GitHub source archive for the deployment commit.',
    '- Security/critical-recovery-secrets.enc.json: encrypted recovery vault containing the CRM data-encryption key and configured service credentials.',
    '- Configuration/environment-reference.txt: service/environment checklist without plaintext secrets.',
    '- Configuration/schema-reference.json: table/column observations and counts captured with the database export.',
    '- recovery-manifest.json: map between archived client files and original Supabase storage paths.',
    '- Tools/decrypt-recovery-vault.mjs: standalone Node.js helper for decrypting the secret vault with your passphrase.',
    '',
    'MOST IMPORTANT RECOVERY ITEM',
    'The DATA_ENCRYPTION_KEY_BASE64 inside the encrypted vault is required to decrypt protected CRM fields such as SSNs, Medicare IDs, banking data and stored OAuth tokens. Do not lose the recovery passphrase.',
    '',
    'FULL REBUILD OUTLINE',
    '1. Preserve this TAR file and make a second copy before attempting a restore.',
    '2. Extract the TAR file on a trusted computer.',
    '3. Decrypt Security/critical-recovery-secrets.enc.json with the passphrase and the included helper tool.',
    '4. Create or reconnect a Supabase project, rebuild the database/security structure, and create the private client-documents bucket.',
    '5. Recreate CRM login users. Passwords and live sessions are intentionally not backed up; users may need password resets.',
    '6. Restore the database rows from Database/database.json.gz.',
    '7. Restore every Client Documents file to the original storagePath recorded in recovery-manifest.json.',
    '8. Deploy Source Code/source-code.zip to Vercel and restore the required environment values, especially DATA_ENCRYPTION_KEY_BASE64.',
    '9. Reconnect crm.mayerig.com, Google OAuth/Gmail/Drive, Twilio and any other external services.',
    '10. Verify client search, protected fields, documents, SOAs, mail, SMS and calendar before returning the CRM to normal use.',
    '',
    'SECURITY',
    '- Client documents inside this TAR are normal files, not separately encrypted by the CRM backup process.',
    '- Keep the external drive encrypted (for example, BitLocker on Windows) and physically secured.',
    '- The secret vault is separately AES-256-GCM encrypted with a scrypt-derived key.',
    '- Never store the recovery passphrase in the same folder as this backup.',
    '',
    'If this CRM ever needs to be rebuilt, preserve the original TAR unchanged and work from a copy.',
  ].join('\n')
}

export function recoveryVaultDecryptTool() {
  return `import fs from 'node:fs'\nimport crypto from 'node:crypto'\n\nconst vaultPath = process.argv[2] || 'Security/critical-recovery-secrets.enc.json'\nconst passphrase = process.env.RECOVERY_PASSPHRASE\nif (!passphrase) {\n  console.error('Set RECOVERY_PASSPHRASE in the shell before running this tool.');\n  process.exit(1);\n}\nconst vault = JSON.parse(fs.readFileSync(vaultPath, 'utf8'))\nconst salt = Buffer.from(vault.salt_base64, 'base64')\nconst iv = Buffer.from(vault.iv_base64, 'base64')\nconst tag = Buffer.from(vault.auth_tag_base64, 'base64')\nconst encrypted = Buffer.from(vault.ciphertext_base64, 'base64')\nconst key = crypto.scryptSync(passphrase, salt, 32)\nconst decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)\ndecipher.setAuthTag(tag)\nconst plain = Buffer.concat([decipher.update(encrypted), decipher.final()])\nprocess.stdout.write(plain.toString('utf8') + '\\n')\n`
}
