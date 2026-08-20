import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { getGoogleAccessToken } from '@/lib/gmail-mail'
import { createAdminClient } from '@/lib/supabase/admin'
import { GoogleDriveError, uploadDriveFile } from '@/lib/google-drive'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

const BUCKET = 'client-documents'

function safeName(value: unknown) {
  return String(value || '')
    .replace(/[\\/\u0000-\u001f\u007f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 230)
}

export async function POST(request: NextRequest) {
  const { supabase, userId, profile } = await getCrmSession()

  if (!profile?.agency_id || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  try {
    const body = await request.json() as {
      archiveFolderId?: string
      storagePath?: string
      driveName?: string
      versionKey?: string
      size?: number
      mimeType?: string
      updatedAt?: string
    }

    const archiveFolderId = String(body.archiveFolderId || '')
    const storagePath = String(body.storagePath || '')
    const driveName = safeName(body.driveName)
    const versionKey = String(body.versionKey || '')

    if (!archiveFolderId || !storagePath || !driveName || !versionKey) {
      return NextResponse.json({ error: 'Missing backup file information' }, { status: 400 })
    }

    if (!storagePath.startsWith(`${profile.agency_id}/`)) {
      return NextResponse.json({ error: 'Invalid storage path' }, { status: 403 })
    }

    const adminSupabase = createAdminClient()
    const { data: fileBlob, error: downloadError } = await adminSupabase.storage
      .from(BUCKET)
      .download(storagePath, {}, { cache: 'no-store' })

    if (downloadError || !fileBlob) {
      throw new Error(`Unable to read ${storagePath}: ${downloadError?.message || 'file missing'}`)
    }

    const accessToken = await getGoogleAccessToken(supabase, userId)
    if (!accessToken) {
      return NextResponse.json({ error: 'Google account is not connected', reconnect: true }, { status: 409 })
    }

    const bytes = Buffer.from(await fileBlob.arrayBuffer())
    const mimeType = fileBlob.type || String(body.mimeType || 'application/octet-stream')
    const driveFile = await uploadDriveFile(
      accessToken,
      archiveFolderId,
      driveName,
      mimeType,
      bytes,
    )

    return NextResponse.json({
      ok: true,
      bytes: bytes.byteLength,
      archivedFile: {
        storagePath,
        versionKey,
        size: bytes.byteLength,
        mimeType,
        updatedAt: String(body.updatedAt || ''),
        driveFileId: driveFile.id,
        driveName,
        archivedAt: new Date().toISOString(),
      },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('CRM Google Drive file backup failed', error)
    if (error instanceof GoogleDriveError && (error.status === 401 || error.status === 403)) {
      return NextResponse.json({ error: 'Google Drive access needs to be reconnected', reconnect: true }, { status: 409 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to copy file' }, { status: 500 })
  }
}
