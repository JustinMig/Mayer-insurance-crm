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

    // The caller must first pass the normal CRM admin session check above. The
    // server-only client is then used strictly for read-only backup work so RLS
    // policies do not cause a partial export of agency-owned records.
    const adminSupabase = createAdminClient()
    const database = await buildAgencyDatabaseBackup(adminSupabase, profile.agency_id)
    const clients = database.tables.clients || []
    const files = await listAgencyBackupFiles(adminSupabase, profile.agency_id, clients)
    const storageSummary = summarizeStorageFiles(files)
    const folders = await createBackupFolderSet(accessToken)

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
      version: 1,
      status: 'in_progress',
      started_at: startedAt,
      agency_id: profile.agency_id,
      table_counts: database.table_counts,
      client_document_count: storageSummary.file_count,
      client_document_bytes: storageSummary.total_bytes,
      database_uncompressed_bytes: Buffer.byteLength(databaseJson, 'utf8'),
      database_compressed_bytes: compressedDatabase.byteLength,
      notes: 'Client files are copied individually after this manifest is created.',
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
      documentsFolderId: folders.documents.id,
      files,
      tableCounts: database.table_counts,
      databaseCompressedBytes: compressedDatabase.byteLength,
      ...storageSummary,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('CRM Google Drive backup start failed', error)
    if (error instanceof GoogleDriveError && (error.status === 401 || error.status === 403)) {
      return NextResponse.json({ error: 'Google Drive access needs to be reconnected', reconnect: true }, { status: 409 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to start backup' }, { status: 500 })
  }
}
