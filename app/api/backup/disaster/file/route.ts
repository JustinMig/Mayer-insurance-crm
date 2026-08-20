import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

const BUCKET = 'client-documents'

export async function POST(request: NextRequest) {
  const { profile } = await getCrmSession()

  if (!profile?.agency_id || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => ({})) as { storagePath?: string }
    const storagePath = String(body.storagePath || '')

    if (!storagePath) {
      return NextResponse.json({ error: 'Missing storage path' }, { status: 400 })
    }
    if (!storagePath.startsWith(`${profile.agency_id}/`)) {
      return NextResponse.json({ error: 'Invalid storage path' }, { status: 403 })
    }

    const adminSupabase = createAdminClient()
    const { data: fileBlob, error } = await adminSupabase.storage
      .from(BUCKET)
      .download(storagePath, {}, { cache: 'no-store' })

    if (error || !fileBlob) {
      return NextResponse.json({
        error: `Unable to read ${storagePath}: ${error?.message || 'file missing'}`,
      }, { status: 404 })
    }

    return new Response(fileBlob.stream(), {
      status: 200,
      headers: {
        'Content-Type': fileBlob.type || 'application/octet-stream',
        'Content-Length': String(fileBlob.size),
        'Cache-Control': 'no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('CRM external-drive backup file read failed', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to read backup file',
    }, { status: 500 })
  }
}
