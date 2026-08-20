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
  updatedAt: string
  versionKey: string
}

type ArchivedFile = {
  storagePath: string
  versionKey: string
  size: number
  mimeType: string
  updatedAt: string
  driveFileId: string
  driveName: string
  archivedAt: string
}

type StartBackupResponse = {
  startedAt: string
  folderId: string
  folderUrl: string
  backupRootId: string
  archiveFolderId: string
  files: BackupFile[]
  allFiles: BackupFile[]
  tableCounts: Record<string, number>
  file_count: number
  total_bytes: number
  pendingFileCount: number
  pendingBytes: number
  unchangedCount: number
  databaseCompressedBytes: number
}

type FailedFile = { storagePath: string; error: string }

type Progress = {
  processed: number
  copied: number
  failed: number
  total: number
  copiedBytes: number
  totalBytes: number
  currentFiles: number
  unchanged: number
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

const emptyProgress: Progress = {
  processed: 0,
  copied: 0,
  failed: 0,
  total: 0,
  copiedBytes: 0,
  totalBytes: 0,
  currentFiles: 0,
  unchanged: 0,
}

export default function BackupDrivePanel({ lastBackupAt }: { lastBackupAt?: string | null }) {
  const [status, setStatus] = useState<DriveStatus | null>(null)
  const [statusError, setStatusError] = useState('')
  const [running, setRunning] = useState(false)
  const [stage, setStage] = useState('')
  const [error, setError] = useState('')
  const [folderUrl, setFolderUrl] = useState('')
  const [lastCompleted, setLastCompleted] = useState(lastBackupAt || '')
  const [progress, setProgress] = useState<Progress>(emptyProgress)

  const percent = useMemo(() => {
    if (!progress.total) return running ? 0 : 100
    return Math.min(100, Math.round((progress.processed / progress.total) * 100))
  }, [progress, running])

  async function loadStatus() {
    setStatusError('')
    try {
      const response = await fetch('/api/backup/drive/status', { cache: 'no-store' })
      setStatus(await readJson(response) as DriveStatus)
    } catch (statusFailure) {
      setStatusError(statusFailure instanceof Error ? statusFailure.message : 'Unable to check Google Drive')
    }
  }

  useEffect(() => { void loadStatus() }, [])

  async function transferOneFile(file: BackupFile, archiveFolderId: string) {
    let lastError = 'Unable to copy file'
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch('/api/backup/drive/file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            archiveFolderId,
            storagePath: file.storagePath,
            driveName: file.driveName,
            versionKey: file.versionKey,
            size: file.size,
            mimeType: file.mimeType,
            updatedAt: file.updatedAt,
          }),
        })
        const data = await readJson(response) as { bytes?: number; archivedFile?: ArchivedFile }
        if (!data.archivedFile?.driveFileId) throw new Error('Google Drive did not return the archived file ID.')
        return { bytes: Number(data.bytes || file.size || 0), archivedFile: data.archivedFile }
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
    setStage('Creating a fresh database snapshot and checking client-file versions…')
    setProgress(emptyProgress)

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
        totalBytes: Number(start.pendingBytes || 0),
        currentFiles: Number(start.file_count || 0),
        unchanged: Number(start.unchangedCount || 0),
      })

      setStage(files.length
        ? `Copying ${files.length} new or changed client file${files.length === 1 ? '' : 's'} to the archive. Keep this page open until it says Complete.`
        : `No client files changed. ${start.unchangedCount || 0} existing file${start.unchangedCount === 1 ? '' : 's'} already match the archive. Finishing the fresh database snapshot…`)

      let cursor = 0
      let processed = 0
      let copied = 0
      let copiedBytes = 0
      let fatalError: Error | null = null
      const failures: FailedFile[] = []
      const archivedFiles: ArchivedFile[] = []
      const workerCount = Math.min(2, Math.max(1, files.length))

      async function worker() {
        while (!fatalError) {
          const index = cursor
          cursor += 1
          if (index >= files.length) return
          const file = files[index]
          try {
            const result = await transferOneFile(file, start.archiveFolderId)
            copied += 1
            copiedBytes += result.bytes
            archivedFiles.push(result.archivedFile)
          } catch (fileFailure) {
            const typed = fileFailure as Error & { reconnect?: boolean; status?: number }
            if (typed.reconnect || typed.status === 403) fatalError = typed
            failures.push({ storagePath: file.storagePath, error: typed.message || 'Copy failed' })
          } finally {
            processed += 1
            setProgress({
              processed,
              copied,
              failed: failures.length,
              total: files.length,
              copiedBytes,
              totalBytes: Number(start.pendingBytes || 0),
              currentFiles: Number(start.file_count || 0),
              unchanged: Number(start.unchangedCount || 0),
            })
          }
        }
      }

      await Promise.all(Array.from({ length: workerCount }, () => worker()))
      if (fatalError) throw fatalError

      setStage('Updating the archive index and writing the point-in-time restore map…')
      const finishResponse = await fetch('/api/backup/drive/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderId: start.folderId,
          folderUrl: start.folderUrl,
          startedAt: start.startedAt,
          sourceFiles: start.allFiles || [],
          archivedFiles,
          failedFiles: failures,
          copiedBytes,
          totalBytes: Number(start.total_bytes || 0),
          pendingFiles: files.length,
          unchangedFiles: Number(start.unchangedCount || 0),
          tableCounts: start.tableCounts,
        }),
      })
      const finished = await readJson(finishResponse)
      setLastCompleted(finished.completedAt || new Date().toISOString())
      setStage(finished.status === 'complete'
        ? files.length
          ? `Complete — fresh database snapshot saved. ${copied} new/changed file${copied === 1 ? '' : 's'} copied; ${start.unchangedCount || 0} unchanged file${start.unchangedCount === 1 ? '' : 's'} skipped.`
          : `Complete — fresh database snapshot saved. All ${start.unchangedCount || 0} client files were unchanged and safely skipped.`
        : `Backup finished with file errors. The database snapshot was saved, but review the failed-file count before relying on this run.`)
    } catch (backupError) {
      const typed = backupError as Error & { reconnect?: boolean }
      setError(typed.message || 'Backup failed')
      if (typed.reconnect) setStatus(current => current ? { ...current, driveReady: false, needsReconnect: true } : current)
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
            <p className="subtle">Every run saves a fresh database snapshot. Client documents are incremental: only new or changed file versions are copied again.</p>
          </div>
          <div className={`backup-connection ${status?.driveReady ? 'ready' : ''}`}>
            {status?.driveReady ? 'Drive Ready' : status ? 'Drive Setup Needed' : 'Checking…'}
          </div>
        </div>

        {statusError ? <div className="backup-alert error">{statusError}</div> : null}
        {status && !status.configured ? <div className="backup-alert error">Google OAuth is not configured in the CRM hosting settings.</div> : null}
        {status?.driveApiError ? <div className="backup-alert error">The Google Drive API needs to be enabled for the same Google Cloud project already used by the CRM.</div> : null}

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
              <div className="subtle">Snapshots and the permanent Client File Archive are stored under “Mayer Insurance Group CRM Backups.”</div>
            </div>
            <button className="btn btn-primary backup-main-button" type="button" onClick={startBackup} disabled={running}>
              {running ? 'BACKUP RUNNING…' : 'BACK UP CRM NOW'}
            </button>
          </div>
        ) : null}

        <div className="backup-last-run">{lastCompleted ? <>Last completed backup: <strong>{new Date(lastCompleted).toLocaleString()}</strong></> : 'No completed Google Drive backup is recorded yet.'}</div>
      </section>

      {(running || stage || error || progress.currentFiles > 0) ? (
        <section className="card card-pad backup-progress-card">
          <div className="backup-progress-heading">
            <strong>{stage || 'Backup status'}</strong>
            {progress.total > 0 ? <span>{percent}%</span> : null}
          </div>
          {progress.total > 0 ? (
            <div className="backup-progress-track" aria-label={`Backup ${percent}% complete`}>
              <div className="backup-progress-fill" style={{ width: `${percent}%` }} />
            </div>
          ) : null}
          <div className="backup-progress-grid">
            <div><span>Current client files</span><strong>{progress.currentFiles}</strong></div>
            <div><span>New / changed</span><strong>{progress.total}</strong></div>
            <div><span>Unchanged skipped</span><strong>{progress.unchanged}</strong></div>
            <div><span>Copied this run</span><strong>{progress.copied}{progress.totalBytes ? ` · ${formatBytes(progress.copiedBytes)} / ${formatBytes(progress.totalBytes)}` : ''}</strong></div>
          </div>
          {progress.failed > 0 ? <div className="backup-alert error">{progress.failed} client file{progress.failed === 1 ? '' : 's'} could not be copied.</div> : null}
          {error ? <div className="backup-alert error">{error}</div> : null}
          {folderUrl ? <a className="btn" href={folderUrl} target="_blank" rel="noreferrer">Open This Backup in Google Drive</a> : null}
        </section>
      ) : null}

      <section className="card card-pad backup-safety-card">
        <h3>How the backup works now</h3>
        <div className="backup-includes-grid">
          <div><strong>Fresh CRM data every run</strong><span>Clients, Medicare, life, banking, doctors, medications, appointments, leads, notes, messages, SOAs and audit history are freshly exported each time.</span></div>
          <div><strong>Incremental client files</strong><span>Unchanged documents are skipped. New files and changed file versions are copied to the permanent archive.</span></div>
          <div><strong>Older versions preserved</strong><span>Changed documents create a new archived version instead of overwriting the version referenced by an older backup.</span></div>
          <div><strong>Encrypted sensitive fields</strong><span>SSNs, Medicare numbers, banking values and other protected fields remain encrypted. OAuth tokens, passwords, sessions and the CRM encryption key are excluded.</span></div>
        </div>
      </section>

      <style jsx>{`
        .backup-drive-panel{display:grid;gap:18px;max-width:1040px}.backup-status-card,.backup-progress-card,.backup-safety-card{border:1px solid #dbe3ec}
        .backup-card-heading{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.backup-card-heading h2{margin:4px 0 6px;font-size:1.35rem}
        .backup-eyebrow{font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;font-weight:900;color:#65778a}.backup-connection{white-space:nowrap;border-radius:999px;padding:7px 11px;background:#fff4df;color:#8b5d14;font-size:.78rem;font-weight:900;border:1px solid #edd3a6}.backup-connection.ready{background:#e8f5ec;color:#23643a;border-color:#b9dfc4}
        .backup-connect-box,.backup-action-row{margin-top:18px;padding:15px;border-radius:13px;background:#f7f9fb;border:1px solid #e1e7ed;display:flex;align-items:center;justify-content:space-between;gap:16px}.backup-connect-box p{margin:4px 0 0}.backup-main-button{min-width:190px;font-weight:900}.backup-last-run{margin-top:14px;font-size:.88rem;color:#64748b}
        .backup-progress-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.backup-progress-heading span{font-weight:900;font-size:1.05rem}.backup-progress-track{height:12px;border-radius:999px;overflow:hidden;background:#e7edf3}.backup-progress-fill{height:100%;background:#18324a;transition:width .2s ease}
        .backup-progress-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:14px}.backup-progress-grid>div{padding:11px;border-radius:10px;background:#f7f9fb;border:1px solid #e6ebf0;display:grid;gap:3px}.backup-progress-grid span{font-size:.76rem;color:#64748b;font-weight:700}.backup-progress-grid strong{font-size:.95rem;color:#24384b}
        .backup-alert{margin-top:14px;padding:11px 12px;border-radius:10px;font-weight:700}.backup-alert.error{background:#fff0f0;color:#8a3434;border:1px solid #edc7c7}.backup-progress-card>.btn{margin-top:14px;display:inline-flex}
        .backup-safety-card h3{margin:0 0 12px}.backup-includes-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.backup-includes-grid>div{padding:13px;border-radius:11px;background:#f8fafc;border:1px solid #e5eaf0;display:grid;gap:5px}.backup-includes-grid strong{color:#24384b}.backup-includes-grid span{font-size:.83rem;color:#64748b;line-height:1.45}
        @media(max-width:720px){.backup-card-heading,.backup-action-row,.backup-connect-box{align-items:stretch;flex-direction:column}.backup-main-button,.backup-connect-box .btn{width:100%}.backup-progress-grid,.backup-includes-grid{grid-template-columns:1fr 1fr}.backup-connection{align-self:flex-start}}
        @media(max-width:460px){.backup-progress-grid,.backup-includes-grid{grid-template-columns:1fr}}
      `}</style>
    </div>
  )
}
