import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { getGoogleAccessToken } from '@/lib/gmail-mail'
import { GoogleDriveError, uploadDriveFile } from '@/lib/google-drive'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 30

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
      totalFiles?: number
      copiedFiles?: number
      failedFiles?: Array<{ storagePath: string; error: string }>
      copiedBytes?: number
      totalBytes?: number
      tableCounts?: Record<string, number>
    }

    const folderId = String(body.folderId || '')
    if (!folderId) {
      return NextResponse.json({ error: 'Missing backup folder' }, { status: 400 })
    }

    const failedFiles = Array.isArray(body.failedFiles) ? body.failedFiles.slice(0, 1000) : []
    const completedAt = new Date().toISOString()
    const status = failedFiles.length ? 'partial' : 'complete'
    const manifest = {
      version: 1,
      status,
      agency_id: profile.agency_id,
      started_at: body.startedAt || null,
      completed_at: completedAt,
      table_counts: body.tableCounts || {},
      client_documents: {
        total_files: Number(body.totalFiles || 0),
        copied_files: Number(body.copiedFiles || 0),
        failed_files: failedFiles.length,
        copied_bytes: Number(body.copiedBytes || 0),
        total_bytes: Number(body.totalBytes || 0),
      },
      failures: failedFiles,
      restore_note: 'Sensitive database values remain encrypted. The application encryption key is intentionally not included in this backup.',
    }

    const accessToken = await getGoogleAccessToken(supabase, userId)
    if (!accessToken) {
      return NextResponse.json({ error: 'Google account is not connected', reconnect: true }, { status: 409 })
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
        total_files: Number(body.totalFiles || 0),
        copied_files: Number(body.copiedFiles || 0),
        failed_files: failedFiles.length,
        copied_bytes: Number(body.copiedBytes || 0),
        total_bytes: Number(body.totalBytes || 0),
      },
    })

    if (auditError) console.error('Unable to write backup audit record', auditError)

    return NextResponse.json({
      ok: true,
      status,
      completedAt,
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
