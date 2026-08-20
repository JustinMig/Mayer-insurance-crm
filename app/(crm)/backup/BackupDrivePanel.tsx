'use client'

import { useEffect, useMemo, useState } from 'react'

type DriveStatus = {
  configured: boolean
  connected: boolean
  driveReady: boolean
  needsReconnect?: boolean
  driveApiError?: boolean
  email?: string | null
}

type BackupFile = {
  storagePath: string
  size: number
  mimeType: string
  driveName: string
}

type StartBackupResponse = {
  startedAt: string
  folderId: string
  folderUrl: string
  documentsFolderId: string
  files: BackupFile[]
  tableCounts: Record<string, number>
  file_count: number
  total_bytes: number
  databaseCompressedBytes: number
}

type FailedFile = {
  storagePath: string
  error: string
}

type Progress = {
  processed: number
  copied: number
  failed: number
  total: number
  copiedBytes: number
  totalBytes: number
}

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

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data?.error || `Request failed (${response.status})`) as Error & { reconnect?: boolean; status?: number }
    error.reconnect = Boolean(data?.reconnect)
    error.status = response.status
    throw error
  }
  return data
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export default function BackupDrivePanel({ lastBackupAt }: { lastBackupAt?: string | null }) {
  const [status, setStatus] = useState<DriveStatus | null>(null)
  const [statusError, setStatusError] = useState('')
  const [running, setRunning] = useState(false)
  const [stage, setStage] = useState('')
  const [error, setError] = useState('')
  const [folderUrl, setFolderUrl] = useState('')
  const [lastCompleted, setLastCompleted] = useState(lastBackupAt || '')
  const [progress, setProgress] = useState<Progress>({
    processed: 0,
    copied: 0,
    failed: 0,
    total: 0,
    copiedBytes: 0,
    totalBytes: 0,
  })

  const percent = useMemo(() => {
    if (!progress.total) return 0
    return Math.min(100, Math.round((progress.processed / progress.total) * 100))
  }, [progress])

  async function loadStatus() {
    setStatusError('')
    try {
      const response = await fetch('/api/backup/drive/status', { cache: 'no-store' })
      const data = await readJson(response) as DriveStatus
      setStatus(data)
    } catch (statusFailure) {
      setStatusError(statusFailure instanceof Error ? statusFailure.message : 'Unable to check Google Drive')
    }
  }

  useEffect(() => {
    void loadStatus()
  }, [])

  async function transferOneFile(
    file: BackupFile,
    documentsFolderId: string,
  ) {
    let lastError = 'Unable to copy file'

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch('/api/backup/drive/file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentsFolderId,
            storagePath: file.storagePath,
            driveName: file.driveName,
          }),
        })
        const data = await readJson(response)
        return Number(data.bytes || file.size || 0)
      } catch (fileError) {
        const typed = fileError as Error & { reconnect?: boolean; status?: number }
        lastError = typed.message || lastError
        if (typed.reconnect || typed.status === 403) throw typed
        if (attempt < 3) await delay(700 * attempt)
      }
    }

    throw new Error(lastError)
  }

  async function startBackup() {
    if (running) return
    setRunning(true)
    setError('')
    setFolderUrl('')
    setStage('Preparing database backup and checking private client files…')
    setProgress({ processed: 0, copied: 0, failed: 0, total: 0, copiedBytes: 0, totalBytes: 0 })

    try {
      const startResponse = await fetch('/api/backup/drive/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const start = await readJson(startResponse) as StartBackupResponse
      const files = start.files || []
      setFolderUrl(start.folderUrl)
      setProgress({
        processed: 0,
        copied: 0,
        failed: 0,
        total: files.length,
        copiedBytes: 0,
        totalBytes: Number(start.total_bytes || 0),
      })

      if (!files.length) {
        setStage('Finishing backup…')
      } else {
        setStage('Copying private client documents to Google Drive. Keep this page open until it says Complete.')
      }

      let cursor = 0
      let processed = 0
      let copied = 0
      let copiedBytes = 0
      let fatalError: Error | null = null
      const failures: FailedFile[] = []
      const workerCount = Math.min(2, Math.max(1, files.length))

      async function worker() {
        while (!fatalError) {
          const index = cursor
          cursor += 1
          if (index >= files.length) return

          const file = files[index]
          try {
            const bytes = await transferOneFile(file, start.documentsFolderId)
            copied += 1
            copiedBytes += bytes
          } catch (fileFailure) {
            const typed = fileFailure as Error & { reconnect?: boolean; status?: number }
            if (typed.reconnect || typed.status === 403) {
              fatalError = typed
            }
            failures.push({
              storagePath: file.storagePath,
              error: typed.message || 'Copy failed',
            })
          } finally {
            processed += 1
            setProgress({
              processed,
              copied,
              failed: failures.length,
              total: files.length,
              copiedBytes,
              totalBytes: Number(start.total_bytes || 0),
            })
          }
        }
      }

      await Promise.all(Array.from({ length: workerCount }, () => worker()))

      if (fatalError) throw fatalError

      setStage('Writing final backup manifest…')
      const finishResponse = await fetch('/api/backup/drive/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderId: start.folderId,
          folderUrl: start.folderUrl,
          startedAt: start.startedAt,
          totalFiles: files.length,
          copiedFiles: copied,
          failedFiles: failures,
          copiedBytes,
          totalBytes: Number(start.total_bytes || 0),
          tableCounts: start.tableCounts,
        }),
      })
      const finished = await readJson(finishResponse)
      setLastCompleted(finished.completedAt || new Date().toISOString())
      setStage(finished.status === 'complete'
        ? 'Complete — the CRM database and client files were copied to Google Drive.'
        : `Backup finished with ${failures.length} file${failures.length === 1 ? '' : 's'} that could not be copied.`)
    } catch (backupError) {
      const typed = backupError as Error & { reconnect?: boolean }
      setError(typed.message || 'Backup failed')
      if (typed.reconnect) {
        setStatus(current => current ? { ...current, driveReady: false, needsReconnect: true } : current)
      }
      setStage('Backup stopped. Nothing in the live CRM was deleted or changed.')
    } finally {
      setRunning(false)
    }
  }

  const reconnectUrl = '/api/gmail/connect?return_to=%2Fbackup'

  return (
    <div className="backup-drive-panel">
      <section className="card card-pad backup-status-card">
        <div className="backup-card-heading">
          <div>
            <span className="backup-eyebrow">Google Drive</span>
            <h2>Manual CRM Backup</h2>
            <p className="subtle">One click copies the CRM database and private client files to your Google Drive. No computer needs to stay on overnight.</p>
          </div>
          <div className={`backup-connection ${status?.driveReady ? 'ready' : ''}`}>
            {status?.driveReady ? 'Drive Ready' : status ? 'Drive Setup Needed' : 'Checking…'}
          </div>
        </div>

        {statusError ? <div className="backup-alert error">{statusError}</div> : null}

        {status && !status.configured ? (
          <div className="backup-alert error">Google OAuth is not configured in the CRM hosting settings.</div>
        ) : null}

        {status?.driveApiError ? (
          <div className="backup-alert error">The Google Drive API needs to be enabled for the same Google Cloud project already used by the CRM.</div>
        ) : null}

        {status && !status.driveReady ? (
          <div className="backup-connect-box">
            <div>
              <strong>{status.email ? `Reconnect ${status.email}` : 'Connect your Google account'}</strong>
              <p className="subtle">This keeps the existing Gmail connection and adds permission for the CRM to create its own backup files in Drive.</p>
            </div>
            <a className="btn btn-primary" href={reconnectUrl}>Connect Google Drive</a>
          </div>
        ) : null}

        {status?.driveReady ? (
          <div className="backup-action-row">
            <div>
              <strong>{status.email || 'Google account connected'}</strong>
              <div className="subtle">Backups are stored under “Mayer Insurance Group CRM Backups.”</div>
            </div>
            <button className="btn btn-primary backup-main-button" type="button" onClick={startBackup} disabled={running}>
              {running ? 'BACKUP RUNNING…' : 'BACK UP CRM NOW'}
            </button>
          </div>
        ) : null}

        {lastCompleted ? (
          <div className="backup-last-run">Last completed backup: <strong>{new Date(lastCompleted).toLocaleString()}</strong></div>
        ) : (
          <div className="backup-last-run">No completed Google Drive backup is recorded yet.</div>
        )}
      </section>

      {(running || stage || error || progress.total > 0) ? (
        <section className="card card-pad backup-progress-card">
          <div className="backup-progress-heading">
            <strong>{stage || 'Backup status'}</strong>
            {progress.total > 0 ? <span>{percent}%</span> : null}
          </div>
          {progress.total > 0 ? (
            <>
              <div className="backup-progress-track" aria-label={`Backup ${percent}% complete`}>
                <div className="backup-progress-fill" style={{ width: `${percent}%` }} />
              </div>
              <div className="backup-progress-grid">
                <div><span>Processed</span><strong>{progress.processed} / {progress.total}</strong></div>
                <div><span>Copied</span><strong>{progress.copied}</strong></div>
                <div><span>Failed</span><strong>{progress.failed}</strong></div>
                <div><span>Data copied</span><strong>{formatBytes(progress.copiedBytes)} / {formatBytes(progress.totalBytes)}</strong></div>
              </div>
            </>
          ) : null}
          {error ? <div className="backup-alert error">{error}</div> : null}
          {folderUrl ? <a className="btn" href={folderUrl} target="_blank" rel="noreferrer">Open Backup Folder in Google Drive</a> : null}
        </section>
      ) : null}

      <section className="card card-pad backup-safety-card">
        <h3>What this backup includes</h3>
        <div className="backup-includes-grid">
          <div><strong>CRM records</strong><span>Clients, Medicare, life, banking, doctors, medications, appointments, leads, notes, messages, SOAs and audit history.</span></div>
          <div><strong>Private client files</strong><span>Copies of the documents and photos stored in the CRM’s private Supabase storage.</span></div>
          <div><strong>Encrypted sensitive fields</strong><span>SSNs, Medicare numbers, banking values and other protected fields stay encrypted inside the database backup.</span></div>
          <div><strong>Security exclusions</strong><span>Google OAuth tokens, login passwords, sessions and the CRM encryption key are intentionally not copied to Drive.</span></div>
        </div>
      </section>

      <style jsx>{`
        .backup-drive-panel{display:grid;gap:18px;max-width:1040px}
        .backup-status-card,.backup-progress-card,.backup-safety-card{border:1px solid #dbe3ec}
        .backup-card-heading{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}
        .backup-card-heading h2{margin:4px 0 6px;font-size:1.35rem}
        .backup-eyebrow{font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;font-weight:900;color:#65778a}
        .backup-connection{white-space:nowrap;border-radius:999px;padding:7px 11px;background:#fff4df;color:#8b5d14;font-size:.78rem;font-weight:900;border:1px solid #edd3a6}
        .backup-connection.ready{background:#e8f5ec;color:#23643a;border-color:#b9dfc4}
        .backup-connect-box,.backup-action-row{margin-top:18px;padding:15px;border-radius:13px;background:#f7f9fb;border:1px solid #e1e7ed;display:flex;align-items:center;justify-content:space-between;gap:16px}
        .backup-connect-box p{margin:4px 0 0}
        .backup-main-button{min-width:190px;font-weight:900}
        .backup-last-run{margin-top:14px;font-size:.88rem;color:#64748b}
        .backup-progress-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
        .backup-progress-heading span{font-weight:900;font-size:1.05rem}
        .backup-progress-track{height:12px;border-radius:999px;overflow:hidden;background:#e7edf3}
        .backup-progress-fill{height:100%;background:#18324a;transition:width .2s ease}
        .backup-progress-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:14px}
        .backup-progress-grid>div{padding:11px;border-radius:10px;background:#f7f9fb;border:1px solid #e6ebf0;display:grid;gap:3px}
        .backup-progress-grid span{font-size:.76rem;color:#64748b;font-weight:700}
        .backup-progress-grid strong{font-size:.95rem;color:#24384b}
        .backup-alert{margin-top:14px;padding:11px 12px;border-radius:10px;font-weight:700}
        .backup-alert.error{background:#fff0f0;color:#8a3434;border:1px solid #edc7c7}
        .backup-progress-card>.btn{margin-top:14px;display:inline-flex}
        .backup-safety-card h3{margin:0 0 12px}
        .backup-includes-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .backup-includes-grid>div{padding:13px;border-radius:11px;background:#f8fafc;border:1px solid #e5eaf0;display:grid;gap:5px}
        .backup-includes-grid strong{color:#24384b}
        .backup-includes-grid span{font-size:.86rem;line-height:1.45;color:#64748b}
        @media(max-width:720px){
          .backup-card-heading,.backup-connect-box,.backup-action-row{align-items:stretch;flex-direction:column}
          .backup-connection{align-self:flex-start}
          .backup-main-button,.backup-connect-box .btn{width:100%}
          .backup-progress-grid,.backup-includes-grid{grid-template-columns:1fr 1fr}
        }
        @media(max-width:470px){.backup-progress-grid,.backup-includes-grid{grid-template-columns:1fr}}
      `}</style>
    </div>
  )
}
