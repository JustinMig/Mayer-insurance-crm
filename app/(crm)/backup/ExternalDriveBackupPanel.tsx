'use client'

import { useMemo, useState } from 'react'

type RecoveryFile = {
  storagePath: string
  size: number
  mimeType: string
  updatedAt: string
  versionKey: string
  archivePath: string
}

type StartResponse = {
  startedAt: string
  fileName: string
  sourceCommit: string
  files: RecoveryFile[]
  fileCount: number
  totalBytes: number
  databaseBase64: string
  databaseCompressedBytes: number
  secretVault: string
  environmentReference: string
  schemaReference: string
  readme: string
  decryptTool: string
  manifest: string
}

type SavePickerWindow = Window & {
  showSaveFilePicker?: (options?: Record<string, unknown>) => Promise<any>
}

const textEncoder = new TextEncoder()

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let amount = value
  let unit = 0
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024
    unit += 1
  }
  return `${amount >= 10 || unit === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unit]}`
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function writeTarString(block: Uint8Array, value: string, offset: number, length: number) {
  const bytes = textEncoder.encode(value)
  if (bytes.byteLength > length) throw new Error(`Backup archive path is too long: ${value}`)
  block.set(bytes, offset)
}

function writeTarOctal(block: Uint8Array, value: number, offset: number, length: number) {
  const octal = Math.max(0, Math.floor(value)).toString(8).padStart(length - 1, '0').slice(-(length - 1))
  writeTarString(block, `${octal}\0`, offset, length)
}

function createTarHeader(name: string, size: number) {
  const header = new Uint8Array(512)
  writeTarString(header, name, 0, 100)
  writeTarOctal(header, 0o600, 100, 8)
  writeTarOctal(header, 0, 108, 8)
  writeTarOctal(header, 0, 116, 8)
  writeTarOctal(header, size, 124, 12)
  writeTarOctal(header, Math.floor(Date.now() / 1000), 136, 12)
  header.fill(32, 148, 156)
  header[156] = '0'.charCodeAt(0)
  writeTarString(header, 'ustar\0', 257, 6)
  writeTarString(header, '00', 263, 2)
  writeTarString(header, 'crm', 265, 32)
  writeTarString(header, 'crm', 297, 32)

  let checksum = 0
  for (const byte of header) checksum += byte
  const checksumText = checksum.toString(8).padStart(6, '0').slice(-6)
  writeTarString(header, `${checksumText}\0 `, 148, 8)
  return header
}

async function writeTarEntry(writable: any, name: string, bytes: Uint8Array) {
  await writable.write(createTarHeader(name, bytes.byteLength))
  if (bytes.byteLength) await writable.write(bytes)
  const padding = (512 - (bytes.byteLength % 512)) % 512
  if (padding) await writable.write(new Uint8Array(padding))
}

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`)
  return data
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchBinaryWithRetry(url: string, init?: RequestInit) {
  let lastError = 'Unable to download backup item.'
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, cache: 'no-store' })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error || `Request failed (${response.status})`)
      }
      return new Uint8Array(await response.arrayBuffer())
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError
      if (attempt < 3) await delay(700 * attempt)
    }
  }
  throw new Error(lastError)
}

function suggestedFileName() {
  const date = new Date().toISOString().slice(0, 10)
  return `Mayer-CRM-Full-Recovery-${date}.tar`
}

export default function ExternalDriveBackupPanel({ lastBackupAt }: { lastBackupAt?: string | null }) {
  const [passphrase, setPassphrase] = useState('')
  const [confirmPassphrase, setConfirmPassphrase] = useState('')
  const [running, setRunning] = useState(false)
  const [stage, setStage] = useState('')
  const [error, setError] = useState('')
  const [processed, setProcessed] = useState(0)
  const [totalFiles, setTotalFiles] = useState(0)
  const [writtenBytes, setWrittenBytes] = useState(0)
  const [expectedBytes, setExpectedBytes] = useState(0)
  const [lastCompleted, setLastCompleted] = useState(lastBackupAt || '')

  const percent = useMemo(() => totalFiles > 0 ? Math.min(100, Math.round((processed / totalFiles) * 100)) : 0, [processed, totalFiles])

  async function saveFullRecoveryFile() {
    if (running) return
    setError('')

    const cleanPassphrase = passphrase.trim()
    if (cleanPassphrase.length < 12) {
      setError('Use a recovery passphrase of at least 12 characters.')
      return
    }
    if (cleanPassphrase !== confirmPassphrase.trim()) {
      setError('The two recovery passphrases do not match.')
      return
    }

    const pickerWindow = window as SavePickerWindow
    if (typeof pickerWindow.showSaveFilePicker !== 'function') {
      setError('Full external-drive backup requires a desktop Chromium browser such as Microsoft Edge or Google Chrome so the CRM can write the large backup directly to your selected drive.')
      return
    }

    let writable: any = null
    let wakeLock: any = null

    try {
      const handle = await pickerWindow.showSaveFilePicker({
        suggestedName: suggestedFileName(),
        types: [{
          description: 'Mayer CRM disaster recovery archive',
          accept: { 'application/x-tar': ['.tar'] },
        }],
      })

      writable = await handle.createWritable()
      setRunning(true)
      setStage('Creating a fresh full database snapshot and inventorying every CRM file…')
      setProcessed(0)
      setTotalFiles(0)
      setWrittenBytes(0)
      setExpectedBytes(0)

      try {
        wakeLock = await (navigator as any).wakeLock?.request?.('screen')
      } catch {
        wakeLock = null
      }

      const startResponse = await fetch('/api/backup/disaster/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase: cleanPassphrase }),
        cache: 'no-store',
      })
      const start = await readJson(startResponse) as StartResponse
      const files = start.files || []
      setTotalFiles(files.length)
      setExpectedBytes(Number(start.totalBytes || 0))

      setStage('Writing recovery instructions, database, encrypted recovery key vault, and configuration…')
      await writeTarEntry(writable, 'READ ME FIRST - FULL CRM RESTORE.txt', textEncoder.encode(start.readme))
      await writeTarEntry(writable, 'recovery-manifest.json', textEncoder.encode(start.manifest))
      await writeTarEntry(writable, 'Database/database.json.gz', base64ToBytes(start.databaseBase64))
      await writeTarEntry(writable, 'Security/critical-recovery-secrets.enc.json', textEncoder.encode(start.secretVault))
      await writeTarEntry(writable, 'Configuration/environment-reference.txt', textEncoder.encode(start.environmentReference))
      await writeTarEntry(writable, 'Configuration/schema-reference.json', textEncoder.encode(start.schemaReference))
      await writeTarEntry(writable, 'Tools/decrypt-recovery-vault.mjs', textEncoder.encode(start.decryptTool))

      setStage('Adding the exact CRM source code used by this deployment…')
      const sourceBytes = await fetchBinaryWithRetry('/api/backup/disaster/source')
      await writeTarEntry(writable, 'Source Code/source-code.zip', sourceBytes)

      let copiedBytes = 0
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index]
        setStage(`Copying CRM file ${index + 1} of ${files.length}: ${file.archivePath}`)
        const bytes = await fetchBinaryWithRetry('/api/backup/disaster/file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storagePath: file.storagePath }),
        })
        await writeTarEntry(writable, file.archivePath, bytes)
        copiedBytes += bytes.byteLength
        setProcessed(index + 1)
        setWrittenBytes(copiedBytes)
      }

      setStage('Finalizing the recovery archive…')
      await writable.write(new Uint8Array(1024))
      await writable.close()
      writable = null

      const finishResponse = await fetch('/api/backup/disaster/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startedAt: start.startedAt,
          fileName: start.fileName,
          fileCount: start.fileCount,
          totalBytes: start.totalBytes,
          sourceCommit: start.sourceCommit,
        }),
      })
      if (finishResponse.ok) {
        const finished = await finishResponse.json().catch(() => null)
        setLastCompleted(finished?.completedAt || new Date().toISOString())
      } else {
        setLastCompleted(new Date().toISOString())
      }

      setStage(`Complete — the full disaster recovery file was saved. ${files.length} CRM file${files.length === 1 ? '' : 's'} copied (${formatBytes(copiedBytes)}). Keep the recovery passphrase somewhere separate and secure.`)
      setPassphrase('')
      setConfirmPassphrase('')
    } catch (backupError) {
      if (writable) {
        try { await writable.abort() } catch { /* ignore cleanup failure */ }
      }
      const message = backupError instanceof Error ? backupError.message : 'Unable to create full recovery backup.'
      if (message.toLowerCase().includes('abort') || message.toLowerCase().includes('cancel')) {
        setStage('Backup canceled. The live CRM was not changed.')
      } else {
        setError(message)
        setStage('Backup stopped. The live CRM was not changed. Run it again to create a complete recovery file.')
      }
    } finally {
      try { await wakeLock?.release?.() } catch { /* ignore */ }
      setRunning(false)
    }
  }

  return (
    <section className="card card-pad external-recovery-card">
      <div className="external-recovery-heading">
        <div>
          <span className="external-recovery-eyebrow">External hard drive</span>
          <h2>Full Disaster Recovery File</h2>
          <p className="subtle">Creates one complete TAR archive containing CRM data, client files, source code, recovery instructions, and an encrypted vault with the critical encryption key/service settings.</p>
        </div>
        <span className="external-recovery-badge">Admin only</span>
      </div>

      <div className="external-recovery-warning">
        <strong>Use this from Microsoft Edge or Google Chrome on a desktop.</strong>
        <span>The Save window lets you choose the external hard drive directly. Keep this page open until the CRM says Complete.</span>
      </div>

      <div className="external-recovery-grid">
        <label>
          <span>Recovery passphrase</span>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={passphrase}
            disabled={running}
            onChange={event => setPassphrase(event.target.value)}
            placeholder="At least 12 characters"
          />
        </label>
        <label>
          <span>Confirm passphrase</span>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={confirmPassphrase}
            disabled={running}
            onChange={event => setConfirmPassphrase(event.target.value)}
            placeholder="Enter it again"
          />
        </label>
      </div>

      <p className="external-recovery-passphrase-note">
        The passphrase is <strong>not saved anywhere in the CRM or backup</strong>. Write it down and keep it somewhere separate from the external drive. Without it, the encrypted recovery-key vault cannot be opened.
      </p>

      <div className="external-recovery-actions">
        <button className="btn btn-primary external-recovery-button" type="button" disabled={running} onClick={saveFullRecoveryFile}>
          {running ? 'CREATING FULL RECOVERY FILE…' : 'SAVE FULL RECOVERY FILE TO EXTERNAL DRIVE'}
        </button>
        <div className="subtle">Client documents are copied into this file in full; unlike the Google Drive backup, this disaster-recovery archive is intentionally self-contained.</div>
      </div>

      {(stage || error || running || totalFiles > 0) ? (
        <div className="external-recovery-progress">
          <div className="external-recovery-progress-title">
            <strong>{stage || 'Recovery backup status'}</strong>
            {totalFiles > 0 ? <span>{percent}%</span> : null}
          </div>
          {totalFiles > 0 ? (
            <div className="external-recovery-track">
              <div className="external-recovery-fill" style={{ width: `${percent}%` }} />
            </div>
          ) : null}
          <div className="external-recovery-stats">
            <div><span>Files copied</span><strong>{processed} / {totalFiles || '—'}</strong></div>
            <div><span>Client-file data</span><strong>{formatBytes(writtenBytes)}{expectedBytes ? ` / ${formatBytes(expectedBytes)}` : ''}</strong></div>
          </div>
          {error ? <div className="backup-alert error">{error}</div> : null}
        </div>
      ) : null}

      <div className="external-recovery-last">
        {lastCompleted ? <>Last completed external-drive recovery backup: <strong>{new Date(lastCompleted).toLocaleString()}</strong></> : 'No completed external-drive disaster recovery backup is recorded yet.'}
      </div>

      <div className="external-recovery-security">
        <strong>Security:</strong> the critical key/service vault inside the TAR is encrypted, but the client documents themselves are normal files. Store the backup on an encrypted external drive (such as a BitLocker-protected Windows drive) and keep it physically secured.
      </div>

      <style jsx>{`
        .external-recovery-card{margin-top:18px;border:1px solid #cfd9e5;display:grid;gap:16px}.external-recovery-heading{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.external-recovery-heading h2{margin:4px 0 6px;font-size:1.35rem}.external-recovery-eyebrow{font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;font-weight:900;color:#65778a}.external-recovery-badge{white-space:nowrap;border-radius:999px;padding:7px 11px;background:#eef4fb;color:#2e5d8a;border:1px solid #c8d9ea;font-size:.78rem;font-weight:900}.external-recovery-warning{padding:13px 15px;border-radius:12px;background:#fff7e7;border:1px solid #ecd7a7;display:grid;gap:4px;color:#6f511b}.external-recovery-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.external-recovery-grid label{display:grid;gap:6px;font-weight:800}.external-recovery-passphrase-note{margin:0;color:#526273;font-size:.9rem;line-height:1.5}.external-recovery-actions{display:flex;align-items:center;gap:14px;flex-wrap:wrap}.external-recovery-button{font-weight:900;min-height:44px}.external-recovery-actions .subtle{flex:1;min-width:260px}.external-recovery-progress{padding:14px;border:1px solid #dce4ec;border-radius:12px;background:#f8fafc;display:grid;gap:12px}.external-recovery-progress-title{display:flex;justify-content:space-between;gap:12px}.external-recovery-track{height:10px;background:#e2e8ef;border-radius:999px;overflow:hidden}.external-recovery-fill{height:100%;background:#1f6f43;transition:width .2s ease}.external-recovery-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.external-recovery-stats>div{display:grid;gap:2px}.external-recovery-stats span{font-size:.78rem;color:#6c7b8a;text-transform:uppercase;letter-spacing:.04em;font-weight:800}.external-recovery-last{font-size:.88rem;color:#647386}.external-recovery-security{padding-top:4px;font-size:.88rem;color:#5b6672;line-height:1.5}@media(max-width:700px){.external-recovery-grid,.external-recovery-stats{grid-template-columns:1fr}.external-recovery-heading{display:grid}.external-recovery-actions{align-items:stretch}.external-recovery-button{width:100%}}
      `}</style>
    </section>
  )
}
