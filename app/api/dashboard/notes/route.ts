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

export async function GET() {
  const session = await requireJustin()
  if (!session) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const { data, error } = await session.supabase
    .from('dashboard_notes')
    .select('id,title,body,created_at,updated_at')
    .eq('owner_id', session.userId)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ notes: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: NextRequest) {
  const session = await requireJustin()
  if (!session) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const title = cleanText(body.title, 180)
  const noteBody = cleanText(body.body, 20000)

  if (!title) return NextResponse.json({ error: 'Give the note a name.' }, { status: 400 })
  if (!noteBody) return NextResponse.json({ error: 'Enter a note.' }, { status: 400 })

  const { data, error } = await session.supabase
    .from('dashboard_notes')
    .insert({
      agency_id: session.profile!.agency_id,
      owner_id: session.userId,
      title,
      body: noteBody
    })
    .select('id,title,body,created_at,updated_at')
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message || 'Unable to save note.' }, { status: 400 })
  return NextResponse.json({ note: data })
}
