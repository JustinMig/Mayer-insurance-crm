import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { getGoogleAccessToken } from '@/lib/gmail-mail'
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
      documentsFolderId?: string
      storagePath?: string
      driveName?: string
    }

    const documentsFolderId = String(body.documentsFolderId || '')
    const storagePath = String(body.storagePath || '')
    const driveName = safeName(body.driveName)

    if (!documentsFolderId || !storagePath || !driveName) {
      return NextResponse.json({ error: 'Missing backup file information' }, { status: 400 })
    }

    if (!storagePath.startsWith(`${profile.agency_id}/`)) {
      return NextResponse.json({ error: 'Invalid storage path' }, { status: 403 })
    }

    const { data: fileBlob, error: downloadError } = await supabase.storage
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
    const mimeType = fileBlob.type || 'application/octet-stream'
    const driveFile = await uploadDriveFile(
      accessToken,
      documentsFolderId,
      driveName,
      mimeType,
      bytes,
    )

    return NextResponse.json({
      ok: true,
      bytes: bytes.byteLength,
      driveFileId: driveFile.id,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('CRM Google Drive file backup failed', error)
    if (error instanceof GoogleDriveError && (error.status === 401 || error.status === 403)) {
      return NextResponse.json({ error: 'Google Drive access needs to be reconnected', reconnect: true }, { status: 409 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to copy file' }, { status: 500 })
  }
}
