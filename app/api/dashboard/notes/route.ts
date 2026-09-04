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

export async function GET(request: NextRequest) {
  try {
    const session = await getCrmSession()
    const access = await resolveDashboardNoteAccess(session.userId, session.profile)
    if (!access) return noStoreJson({ error: 'Not authorized.' }, 403)

    const accessPayload = {
      viewer: { id: access.viewerId, name: access.viewerName },
      owners: access.owners
    }

    if (request.nextUrl.searchParams.get('access') === '1') {
      return noStoreJson(accessPayload)
    }

    const ownerIds = access.owners.map((owner) => owner.id)
    if (!ownerIds.length) return noStoreJson({ ...accessPayload, notes: [] })

    const { data, error } = await access.admin
      .from('dashboard_notes')
      .select('id,owner_id,title,body,created_at,updated_at')
      .eq('agency_id', access.agencyId)
      .in('owner_id', ownerIds)
      .order('created_at', { ascending: false })
      .limit(1000)

    if (error) return noStoreJson({ error: error.message }, 500)

    const ownerNames = new Map(access.owners.map((owner) => [owner.id, owner.name]))
    const notes = (data || []).map((note) => ({
      id: String(note.id),
      owner_id: String(note.owner_id),
      owner_name: ownerNames.get(String(note.owner_id)) || 'CRM User',
      title: String(note.title || ''),
      body: String(note.body || ''),
      created_at: String(note.created_at || ''),
      updated_at: String(note.updated_at || ''),
      can_edit: String(note.owner_id) === access.viewerId
    }))

    return noStoreJson({ ...accessPayload, notes })
  } catch (error) {
    return noStoreJson({ error: error instanceof Error ? error.message : 'Unable to load notes.' }, 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getCrmSession()
    const access = await resolveDashboardNoteAccess(session.userId, session.profile)
    if (!access) return noStoreJson({ error: 'Not authorized.' }, 403)

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const title = cleanText(body.title, 180)
    const noteBody = cleanText(body.body, 20000)

    if (!title) return noStoreJson({ error: 'Give the note a name.' }, 400)
    if (!noteBody) return noStoreJson({ error: 'Enter a note.' }, 400)

    const { data, error } = await session.supabase
      .from('dashboard_notes')
      .insert({
        agency_id: access.agencyId,
        owner_id: access.viewerId,
        title,
        body: noteBody
      })
      .select('id,owner_id,title,body,created_at,updated_at')
      .single()

    if (error || !data) return noStoreJson({ error: error?.message || 'Unable to save note.' }, 400)

    return noStoreJson({
      note: {
        ...data,
        owner_name: access.viewerName,
        can_edit: true
      }
    })
  } catch (error) {
    return noStoreJson({ error: error instanceof Error ? error.message : 'Unable to save note.' }, 500)
  }
}
