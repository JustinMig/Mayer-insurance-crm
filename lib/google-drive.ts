import crypto from 'node:crypto'

export type DriveFile = {
  id: string
  name?: string
  webViewLink?: string
}

export type ArchiveIndexEntry = {
  versionKey: string
  size: number
  mimeType: string
  updatedAt: string
  driveFileId: string
  driveName: string
  archivedAt: string
}

export type ArchiveIndex = {
  version: 1
  updated_at: string
  files: Record<string, ArchiveIndexEntry>
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
const CLIENT_ARCHIVE_FOLDER = 'Client File Archive'
const ARCHIVE_INDEX_FILE = 'client-file-archive-index.json'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

function driveHeaders(accessToken: string, extra?: Record<string, string>) {
  return { Authorization: `Bearer ${accessToken}`, ...extra }
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
  const params = new URLSearchParams({ pageSize: '1', spaces: 'drive', fields: 'files(id)' })
  await driveJson<{ files?: Array<{ id: string }> }>(`${DRIVE_API}/files?${params}`, accessToken)
}

function escapeDriveQuery(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

async function findNamedFile(accessToken: string, name: string, parentId: string, mimeType?: string) {
  const clauses = [
    `name = '${escapeDriveQuery(name)}'`,
    `'${escapeDriveQuery(parentId)}' in parents`,
    'trashed = false',
  ]
  if (mimeType) clauses.push(`mimeType = '${escapeDriveQuery(mimeType)}'`)
  const params = new URLSearchParams({
    q: clauses.join(' and '),
    spaces: 'drive',
    pageSize: '10',
    fields: 'files(id,name,webViewLink)',
  })
  const result = await driveJson<{ files?: DriveFile[] }>(`${DRIVE_API}/files?${params}`, accessToken)
  return result.files?.[0] || null
}

async function findFolder(accessToken: string, name: string, parentId?: string) {
  const parent = parentId || 'root'
  return findNamedFile(accessToken, name, parent, FOLDER_MIME)
}

export async function createDriveFolder(accessToken: string, name: string, parentId?: string) {
  return driveJson<DriveFile>(`${DRIVE_API}/files?fields=id,name,webViewLink`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) }),
  })
}

export async function findOrCreateBackupRoot(accessToken: string) {
  const existing = await findFolder(accessToken, BACKUP_ROOT_FOLDER)
  if (existing) return existing
  return createDriveFolder(accessToken, BACKUP_ROOT_FOLDER)
}

async function findOrCreateFolder(accessToken: string, name: string, parentId: string) {
  const existing = await findFolder(accessToken, name, parentId)
  if (existing) return existing
  return createDriveFolder(accessToken, name, parentId)
}

function centralTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || ''
  return `${value('year')}-${value('month')}-${value('day')} - ${value('hour')}${value('minute')} CT`
}

export async function createBackupFolderSet(accessToken: string) {
  const root = await findOrCreateBackupRoot(accessToken)
  const archive = await findOrCreateFolder(accessToken, CLIENT_ARCHIVE_FOLDER, root.id)
  const backup = await createDriveFolder(accessToken, `CRM Backup - ${centralTimestamp()}`, root.id)
  return {
    root,
    backup,
    archive,
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
  const metadata = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [parentId] })}\r\n`, 'utf8')
  const fileHeader = Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`, 'utf8')
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

async function replaceDriveFileContent(
  accessToken: string,
  fileId: string,
  mimeType: string,
  content: string | Uint8Array | Buffer,
) {
  const body = toBuffer(content)
  const response = await fetch(`${DRIVE_UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,webViewLink`, {
    method: 'PATCH',
    headers: driveHeaders(accessToken, {
      'Content-Type': mimeType,
      'Content-Length': String(body.byteLength),
    }),
    body: new Uint8Array(body),
    cache: 'no-store',
  })
  if (!response.ok) {
    const text = await response.text()
    throw new GoogleDriveError(`Google Drive update failed (${response.status})`, response.status, text)
  }
  return response.json() as Promise<DriveFile>
}

export async function loadArchiveIndex(accessToken: string, rootId: string): Promise<ArchiveIndex> {
  const file = await findNamedFile(accessToken, ARCHIVE_INDEX_FILE, rootId)
  if (!file) return { version: 1, updated_at: new Date(0).toISOString(), files: {} }

  const response = await fetch(`${DRIVE_API}/files/${encodeURIComponent(file.id)}?alt=media`, {
    headers: driveHeaders(accessToken),
    cache: 'no-store',
  })
  if (!response.ok) {
    const text = await response.text()
    throw new GoogleDriveError(`Unable to read backup archive index (${response.status})`, response.status, text)
  }
  const parsed = await response.json().catch(() => null) as ArchiveIndex | null
  if (!parsed || parsed.version !== 1 || typeof parsed.files !== 'object') {
    throw new Error('The Google Drive client-file archive index is invalid.')
  }
  return parsed
}

export async function saveArchiveIndex(accessToken: string, rootId: string, index: ArchiveIndex) {
  const content = JSON.stringify({ ...index, version: 1, updated_at: new Date().toISOString() }, null, 2)
  const existing = await findNamedFile(accessToken, ARCHIVE_INDEX_FILE, rootId)
  if (existing) {
    await replaceDriveFileContent(accessToken, existing.id, 'application/json; charset=utf-8', content)
    return existing.id
  }
  const created = await uploadDriveFile(accessToken, rootId, ARCHIVE_INDEX_FILE, 'application/json; charset=utf-8', content)
  return created.id
}
