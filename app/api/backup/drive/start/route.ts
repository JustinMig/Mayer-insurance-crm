import { gzipSync } from 'node:zlib'
import { NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { getGoogleAccessToken } from '@/lib/gmail-mail'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  backupReadmeText,
  buildAgencyDatabaseBackup,
  listAgencyBackupFiles,
  summarizeStorageFiles,
} from '@/lib/crm-backup'
import {
  assertGoogleDriveAccess,
  createBackupFolderSet,
  GoogleDriveError,
  loadArchiveIndex,
  uploadDriveFile,
} from '@/lib/google-drive'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

export async function POST() {
  const { supabase, userId, profile } = await getCrmSession()

  if (!profile?.agency_id || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  try {
    const accessToken = await getGoogleAccessToken(supabase, userId)
    if (!accessToken) {
      return NextResponse.json({ error: 'Google account is not connected', reconnect: true }, { status: 409 })
    }

    await assertGoogleDriveAccess(accessToken)

    const adminSupabase = createAdminClient()
    const database = await buildAgencyDatabaseBackup(adminSupabase, profile.agency_id)
    const clients = database.tables.clients || []
    const allFiles = await listAgencyBackupFiles(adminSupabase, profile.agency_id, clients)
    const storageSummary = summarizeStorageFiles(allFiles)
    const folders = await createBackupFolderSet(accessToken)
    const archiveIndex = await loadArchiveIndex(accessToken, folders.root.id)

    const files = allFiles.filter(file => archiveIndex.files[file.storagePath]?.versionKey !== file.versionKey)
    const pendingSummary = summarizeStorageFiles(files)
    const unchangedCount = allFiles.length - files.length

    const databaseJson = JSON.stringify(database)
    const compressedDatabase = gzipSync(Buffer.from(databaseJson, 'utf8'), { level: 9 })

    await uploadDriveFile(
      accessToken,
      folders.backup.id,
      'database.json.gz',
      'application/gzip',
      compressedDatabase,
    )

    await uploadDriveFile(
      accessToken,
      folders.backup.id,
      'README - RESTORE INFORMATION.txt',
      'text/plain; charset=utf-8',
      backupReadmeText(),
    )

    const startedAt = new Date().toISOString()
    const initialManifest = {
      version: 2,
      status: 'in_progress',
      backup_mode: 'incremental-files-full-database',
      started_at: startedAt,
      agency_id: profile.agency_id,
      table_counts: database.table_counts,
      client_documents: {
        current_file_count: storageSummary.file_count,
        current_file_bytes: storageSummary.total_bytes,
        unchanged_files: unchangedCount,
        new_or_changed_files: pendingSummary.file_count,
        new_or_changed_bytes: pendingSummary.total_bytes,
      },
      database_uncompressed_bytes: Buffer.byteLength(databaseJson, 'utf8'),
      database_compressed_bytes: compressedDatabase.byteLength,
      notes: 'The database is a fresh full snapshot. Only new or changed client files are copied to the permanent Client File Archive.',
    }

    await uploadDriveFile(
      accessToken,
      folders.backup.id,
      'backup-start.json',
      'application/json; charset=utf-8',
      JSON.stringify(initialManifest, null, 2),
    )

    return NextResponse.json({
      startedAt,
      folderId: folders.backup.id,
      folderUrl: folders.folderUrl,
      backupRootId: folders.root.id,
      archiveFolderId: folders.archive.id,
      files,
      allFiles,
      tableCounts: database.table_counts,
      databaseCompressedBytes: compressedDatabase.byteLength,
      unchangedCount,
      pendingFileCount: pendingSummary.file_count,
      pendingBytes: pendingSummary.total_bytes,
      file_count: storageSummary.file_count,
      total_bytes: storageSummary.total_bytes,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('CRM Google Drive backup start failed', error)
    if (error instanceof GoogleDriveError && (error.status === 401 || error.status === 403)) {
      return NextResponse.json({ error: 'Google Drive access needs to be reconnected', reconnect: true }, { status: 409 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to start backup' }, { status: 500 })
  }
}
