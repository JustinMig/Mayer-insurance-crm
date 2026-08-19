import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function cleanText(value: unknown, max: number) {
  return String(value || '').trim().slice(0, max)
}

function isJustin(value: unknown) {
  return String(value || '').trim().toLowerCase() === 'justin mayer'
}

async function requireJustin() {
  const session = await getCrmSession()
  if (!session.profile?.agency_id || !isJustin(session.profile.full_name)) return null
  return session
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireJustin()
  if (!session) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const title = cleanText(body.title, 180)
  const noteBody = cleanText(body.body, 20000)

  if (!title) return NextResponse.json({ error: 'Give the note a name.' }, { status: 400 })
  if (!noteBody) return NextResponse.json({ error: 'Enter a note.' }, { status: 400 })

  const { data, error } = await session.supabase
    .from('dashboard_notes')
    .update({ title, body: noteBody, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('owner_id', session.userId)
    .select('id,title,body,created_at,updated_at')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Note not found.' }, { status: 404 })
  return NextResponse.json({ note: data })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireJustin()
  if (!session) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const { id } = await params
  const { error, count } = await session.supabase
    .from('dashboard_notes')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('owner_id', session.userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!count) return NextResponse.json({ error: 'Note not found.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
