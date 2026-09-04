import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { resolveDashboardNoteAccess } from '@/lib/dashboard-note-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function cleanText(value: unknown, max: number) {
  return String(value || '').trim().slice(0, max)
}

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0'
    }
  })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getCrmSession()
    const access = await resolveDashboardNoteAccess(session.userId, session.profile)
    if (!access) return noStoreJson({ error: 'Not authorized.' }, 403)

    const { id } = await params
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const title = cleanText(body.title, 180)
    const noteBody = cleanText(body.body, 20000)

    if (!title) return noStoreJson({ error: 'Give the note a name.' }, 400)
    if (!noteBody) return noStoreJson({ error: 'Enter a note.' }, 400)

    const { data, error } = await session.supabase
      .from('dashboard_notes')
      .update({ title, body: noteBody, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('agency_id', access.agencyId)
      .eq('owner_id', access.viewerId)
      .select('id,owner_id,title,body,created_at,updated_at')
      .maybeSingle()

    if (error) return noStoreJson({ error: error.message }, 400)
    if (!data) return noStoreJson({ error: 'You can edit only your own notes.' }, 404)

    return noStoreJson({
      note: {
        ...data,
        owner_name: access.viewerName,
        can_edit: true
      }
    })
  } catch (error) {
    return noStoreJson({ error: error instanceof Error ? error.message : 'Unable to update note.' }, 500)
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getCrmSession()
    const access = await resolveDashboardNoteAccess(session.userId, session.profile)
    if (!access) return noStoreJson({ error: 'Not authorized.' }, 403)

    const { id } = await params
    const { error, count } = await session.supabase
      .from('dashboard_notes')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('agency_id', access.agencyId)
      .eq('owner_id', access.viewerId)

    if (error) return noStoreJson({ error: error.message }, 400)
    if (!count) return noStoreJson({ error: 'You can delete only your own notes.' }, 404)
    return noStoreJson({ ok: true })
  } catch (error) {
    return noStoreJson({ error: error instanceof Error ? error.message : 'Unable to delete note.' }, 500)
  }
}
