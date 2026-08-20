import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(request: NextRequest) {
  const { supabase, userId, profile } = await getCrmSession()

  if (!profile?.agency_id || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => ({})) as {
      startedAt?: string
      fileName?: string
      fileCount?: number
      totalBytes?: number
      sourceCommit?: string
    }
    const completedAt = new Date().toISOString()

    const { error } = await supabase.from('audit_log').insert({
      agency_id: profile.agency_id,
      actor_id: userId,
      action: 'backup.external_drive.completed',
      details: {
        started_at: body.startedAt || null,
        completed_at: completedAt,
        file_name: body.fileName || null,
        file_count: Number(body.fileCount || 0),
        total_bytes: Number(body.totalBytes || 0),
        source_commit: body.sourceCommit || null,
        format: 'tar',
      },
    })

    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, completedAt }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('CRM external-drive backup audit write failed', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to record completed backup',
    }, { status: 500 })
  }
}
