import crypto from 'node:crypto'

type DriveFile = {
  id: string
  name?: string
  webViewLink?: string
}

export class GoogleDriveError extends Error {
  status: number
  responseText: string

  constructor(message: string, status: number, responseText = '') {
    super(message)
    this.name = 'GoogleDriveError'
    this.status = status
    this.responseText = responseText
  }
}

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const BACKUP_ROOT_FOLDER = 'Mayer Insurance Group CRM Backups'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

function driveHeaders(accessToken: string, extra?: Record<string, string>) {
  return {
    Authorization: `Bearer ${accessToken}`,
    ...extra,
  }
}

async function driveJson<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: driveHeaders(accessToken, {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers as Record<string, string> | undefined),
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    const text = await response.text()
    throw new GoogleDriveError(`Google Drive request failed (${response.status})`, response.status, text)
  }

  return response.json() as Promise<T>
}

export async function assertGoogleDriveAccess(accessToken: string) {
  const params = new URLSearchParams({
    pageSize: '1',
    spaces: 'drive',
    fields: 'files(id)',
  })
  await driveJson<{ files?: Array<{ id: string }> }>(`${DRIVE_API}/files?${params}`, accessToken)
}

function escapeDriveQuery(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

async function findFolder(accessToken: string, name: string, parentId?: string) {
  const escapedName = escapeDriveQuery(name)
  const parentClause = parentId ? `'${escapeDriveQuery(parentId)}' in parents` : `'root' in parents`
  const q = `name = '${escapedName}' and mimeType = '${FOLDER_MIME}' and trashed = false and ${parentClause}`
  const params = new URLSearchParams({
    q,
    spaces: 'drive',
    pageSize: '10',
    fields: 'files(id,name,webViewLink)',
  })
  const result = await driveJson<{ files?: DriveFile[] }>(`${DRIVE_API}/files?${params}`, accessToken)
  return result.files?.[0] || null
}

export async function createDriveFolder(accessToken: string, name: string, parentId?: string) {
  const result = await driveJson<DriveFile>(`${DRIVE_API}/files?fields=id,name,webViewLink`, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  })
  return result
}

export async function findOrCreateBackupRoot(accessToken: string) {
  const existing = await findFolder(accessToken, BACKUP_ROOT_FOLDER)
  if (existing) return existing
  return createDriveFolder(accessToken, BACKUP_ROOT_FOLDER)
}

function centralTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || ''
  return `${value('year')}-${value('month')}-${value('day')} - ${value('hour')}${value('minute')} CT`
}

export async function createBackupFolderSet(accessToken: string) {
  const root = await findOrCreateBackupRoot(accessToken)
  const backup = await createDriveFolder(accessToken, `CRM Backup - ${centralTimestamp()}`, root.id)
  const documents = await createDriveFolder(accessToken, 'Client Documents', backup.id)

  return {
    root,
    backup,
    documents,
    folderUrl: backup.webViewLink || `https://drive.google.com/drive/folders/${encodeURIComponent(backup.id)}`,
  }
}

function toBuffer(content: string | Uint8Array | Buffer) {
  if (typeof content === 'string') return Buffer.from(content, 'utf8')
  return Buffer.from(content)
}

export async function uploadDriveFile(
  accessToken: string,
  parentId: string,
  name: string,
  mimeType: string,
  content: string | Uint8Array | Buffer,
) {
  const boundary = `crm_backup_${crypto.randomBytes(12).toString('hex')}`
  const metadata = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [parentId] })}\r\n`,
    'utf8',
  )
  const fileHeader = Buffer.from(
    `--${boundary}\r\nContent-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`,
    'utf8',
  )
  const fileContent = toBuffer(content)
  const closing = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
  const body = Buffer.concat([metadata, fileHeader, fileContent, closing])

  const response = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,webViewLink`, {
    method: 'POST',
    headers: driveHeaders(accessToken, {
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(body.byteLength),
    }),
    body: new Uint8Array(body),
    cache: 'no-store',
  })

  if (!response.ok) {
    const text = await response.text()
    throw new GoogleDriveError(`Google Drive upload failed (${response.status})`, response.status, text)
  }

  return response.json() as Promise<DriveFile>
}
