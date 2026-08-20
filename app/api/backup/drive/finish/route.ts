import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { getGoogleAccessToken } from '@/lib/gmail-mail'
import type { BackupStorageFile } from '@/lib/crm-backup'
import {
  findOrCreateBackupRoot,
  GoogleDriveError,
  loadArchiveIndex,
  saveArchiveIndex,
  uploadDriveFile,
  type ArchiveIndexEntry,
} from '@/lib/google-drive'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 30

type ArchivedFile = ArchiveIndexEntry & { storagePath: string }

export async function POST(request: NextRequest) {
  const { supabase, userId, profile } = await getCrmSession()

  if (!profile?.agency_id || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  try {
    const body = await request.json() as {
      folderId?: string
      folderUrl?: string
      startedAt?: string
      sourceFiles?: BackupStorageFile[]
      archivedFiles?: ArchivedFile[]
      failedFiles?: Array<{ storagePath: string; error: string }>
      copiedBytes?: number
      totalBytes?: number
      pendingFiles?: number
      unchangedFiles?: number
      tableCounts?: Record<string, number>
    }

    const folderId = String(body.folderId || '')
    if (!folderId) return NextResponse.json({ error: 'Missing backup folder' }, { status: 400 })

    const sourceFiles = Array.isArray(body.sourceFiles) ? body.sourceFiles.slice(0, 10000) : []
    const archivedFiles = Array.isArray(body.archivedFiles) ? body.archivedFiles.slice(0, 10000) : []
    const failedFiles = Array.isArray(body.failedFiles) ? body.failedFiles.slice(0, 1000) : []

    const accessToken = await getGoogleAccessToken(supabase, userId)
    if (!accessToken) {
      return NextResponse.json({ error: 'Google account is not connected', reconnect: true }, { status: 409 })
    }

    const root = await findOrCreateBackupRoot(accessToken)
    const archiveIndex = await loadArchiveIndex(accessToken, root.id)

    for (const archived of archivedFiles) {
      const source = sourceFiles.find(file => file.storagePath === archived.storagePath)
      if (!source || source.versionKey !== archived.versionKey || !archived.driveFileId) continue
      archiveIndex.files[archived.storagePath] = {
        versionKey: archived.versionKey,
        size: Number(archived.size || source.size || 0),
        mimeType: archived.mimeType || source.mimeType,
        updatedAt: archived.updatedAt || source.updatedAt,
        driveFileId: archived.driveFileId,
        driveName: archived.driveName || source.driveName,
        archivedAt: archived.archivedAt || new Date().toISOString(),
      }
    }

    await saveArchiveIndex(accessToken, root.id, archiveIndex)

    const mapFailures: Array<{ storagePath: string; error: string }> = []
    const currentFileMap = sourceFiles.flatMap(file => {
      const archived = archiveIndex.files[file.storagePath]
      if (!archived || archived.versionKey !== file.versionKey || !archived.driveFileId) {
        mapFailures.push({ storagePath: file.storagePath, error: 'Current file version is not present in the Google Drive archive.' })
        return []
      }
      return [{
        storagePath: file.storagePath,
        versionKey: file.versionKey,
        size: file.size,
        mimeType: file.mimeType,
        updatedAt: file.updatedAt,
        driveName: archived.driveName,
        driveFileId: archived.driveFileId,
        archivedAt: archived.archivedAt,
      }]
    })

    const combinedFailures = [...failedFiles]
    for (const missing of mapFailures) {
      if (!combinedFailures.some(item => item.storagePath === missing.storagePath)) combinedFailures.push(missing)
    }

    await uploadDriveFile(
      accessToken,
      folderId,
      'client-file-map.json',
      'application/json; charset=utf-8',
      JSON.stringify({
        version: 1,
        generated_at: new Date().toISOString(),
        archive_folder_name: 'Client File Archive',
        files: currentFileMap,
      }, null, 2),
    )

    const completedAt = new Date().toISOString()
    const status = combinedFailures.length ? 'partial' : 'complete'
    const manifest = {
      version: 2,
      status,
      backup_mode: 'incremental-files-full-database',
      agency_id: profile.agency_id,
      started_at: body.startedAt || null,
      completed_at: completedAt,
      table_counts: body.tableCounts || {},
      client_documents: {
        current_files: sourceFiles.length,
        new_or_changed_files: Number(body.pendingFiles || 0),
        copied_new_or_changed_files: archivedFiles.length,
        unchanged_files_skipped: Number(body.unchangedFiles || 0),
        failed_files: combinedFailures.length,
        copied_bytes_this_run: Number(body.copiedBytes || 0),
        current_total_bytes: Number(body.totalBytes || 0),
        mapped_archive_files: currentFileMap.length,
      },
      failures: combinedFailures.slice(0, 1000),
      restore_note: 'database.json.gz is a fresh full database snapshot. client-file-map.json identifies the exact archived client-file version for this point in time. Sensitive database values remain encrypted and the application encryption key is intentionally not included.',
    }

    await uploadDriveFile(
      accessToken,
      folderId,
      status === 'complete' ? 'backup-complete.json' : 'backup-partial.json',
      'application/json; charset=utf-8',
      JSON.stringify(manifest, null, 2),
    )

    const { error: auditError } = await supabase.from('audit_log').insert({
      agency_id: profile.agency_id,
      actor_id: userId,
      action: status === 'complete' ? 'backup.google_drive.completed' : 'backup.google_drive.partial',
      details: {
        drive_folder_id: folderId,
        drive_folder_url: body.folderUrl || null,
        current_files: sourceFiles.length,
        new_or_changed_files: Number(body.pendingFiles || 0),
        unchanged_files_skipped: Number(body.unchangedFiles || 0),
        copied_files: archivedFiles.length,
        failed_files: combinedFailures.length,
        copied_bytes: Number(body.copiedBytes || 0),
        total_bytes: Number(body.totalBytes || 0),
      },
    })

    if (auditError) console.error('Unable to write backup audit record', auditError)

    return NextResponse.json({
      ok: true,
      status,
      completedAt,
      unchangedFiles: Number(body.unchangedFiles || 0),
      copiedFiles: archivedFiles.length,
      folderUrl: body.folderUrl || `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('CRM Google Drive backup finish failed', error)
    if (error instanceof GoogleDriveError && (error.status === 401 || error.status === 403)) {
      return NextResponse.json({ error: 'Google Drive access needs to be reconnected', reconnect: true }, { status: 409 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to finish backup' }, { status: 500 })
  }
}
