import { gzipSync } from 'node:zlib'
import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildAgencyDisasterRecoveryBackup,
  listAgencyBackupFiles,
  summarizeStorageFiles,
} from '@/lib/crm-backup'
import {
  disasterRecoveryReadmeText,
  encryptCriticalRecoveryVault,
  externalRecoveryArchivePath,
  externalRecoveryFileName,
  recoveryEnvironmentReference,
  recoveryVaultDecryptTool,
} from '@/lib/disaster-recovery'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const { profile } = await getCrmSession()

  if (!profile?.agency_id || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => ({})) as { passphrase?: string }
    const passphrase = String(body.passphrase || '')
    if (passphrase.trim().length < 12) {
      return NextResponse.json({ error: 'Recovery passphrase must be at least 12 characters.' }, { status: 400 })
    }

    const startedAt = new Date().toISOString()
    const sourceCommit = process.env.VERCEL_GIT_COMMIT_SHA || 'main'
    const adminSupabase = createAdminClient()
    const database = await buildAgencyDisasterRecoveryBackup(adminSupabase, profile.agency_id)
    const clients = database.tables.clients || []
    const storageFiles = await listAgencyBackupFiles(adminSupabase, profile.agency_id, clients)
    const storageSummary = summarizeStorageFiles(storageFiles)
    const files = storageFiles.map((file, index) => ({
      storagePath: file.storagePath,
      size: file.size,
      mimeType: file.mimeType,
      updatedAt: file.updatedAt,
      versionKey: file.versionKey,
      archivePath: externalRecoveryArchivePath(file, index),
    }))

    const databaseJson = JSON.stringify(database)
    const compressedDatabase = gzipSync(Buffer.from(databaseJson, 'utf8'), { level: 9 })
    const secretVault = encryptCriticalRecoveryVault(passphrase, sourceCommit)
    const environmentReference = recoveryEnvironmentReference(sourceCommit)
    const schemaReference = JSON.stringify({
      generated_at: database.generated_at,
      format: 'mayer-crm-schema-reference',
      postgres_version_reference: 17,
      storage_bucket: {
        name: 'client-documents',
        public: false,
        current_file_size_limit_bytes: 10485760,
      },
      tables: database.schema_reference,
      notes: [
        'This reference is captured from the exported rows and current CRM backup configuration.',
        'The exact application source code is also included in Source Code/source-code.zip.',
        'RLS, functions, triggers and policies should be recreated and security-reviewed during a full rebuild before production use.',
      ],
    }, null, 2)

    const manifest = {
      format: 'mayer-crm-full-disaster-recovery-manifest',
      version: 1,
      started_at: startedAt,
      agency_id: profile.agency_id,
      source_repository: 'JustinMig/Mayer-insurance-crm',
      source_commit: sourceCommit,
      production_domain: 'crm.mayerig.com',
      database: {
        path: 'Database/database.json.gz',
        format: database.format,
        table_counts: database.table_counts,
        uncompressed_bytes: Buffer.byteLength(databaseJson, 'utf8'),
        compressed_bytes: compressedDatabase.byteLength,
        auth_user_reference_count: database.auth_users_reference?.length || 0,
        auth_users_warning: database.auth_users_warning || null,
      },
      storage: {
        bucket: 'client-documents',
        file_count: storageSummary.file_count,
        total_bytes: storageSummary.total_bytes,
        files,
      },
      source_code: {
        path: 'Source Code/source-code.zip',
        repository: 'JustinMig/Mayer-insurance-crm',
        commit: sourceCommit,
      },
      security: {
        encrypted_vault_path: 'Security/critical-recovery-secrets.enc.json',
        passphrase_stored_in_backup: false,
        note: 'The vault includes DATA_ENCRYPTION_KEY_BASE64 and other configured CRM service credentials. The passphrase is not stored.',
      },
    }

    return NextResponse.json({
      startedAt,
      fileName: externalRecoveryFileName(),
      sourceCommit,
      files,
      fileCount: storageSummary.file_count,
      totalBytes: storageSummary.total_bytes,
      databaseBase64: compressedDatabase.toString('base64'),
      databaseCompressedBytes: compressedDatabase.byteLength,
      secretVault,
      environmentReference,
      schemaReference,
      readme: disasterRecoveryReadmeText({
        startedAt,
        sourceCommit,
        fileCount: storageSummary.file_count,
        totalBytes: storageSummary.total_bytes,
      }),
      decryptTool: recoveryVaultDecryptTool(),
      manifest: JSON.stringify(manifest, null, 2),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('CRM external-drive recovery backup start failed', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to prepare the disaster recovery backup',
    }, { status: 500 })
  }
}
