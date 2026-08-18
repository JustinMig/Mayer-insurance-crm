import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PRODUCTS = new Set(['medicare', 'life', 'retirement'])
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function cleanText(value: unknown, max: number) {
  return String(value || '').trim().slice(0, max)
}

function validDate(value: string) {
  if (!value) return true
  if (!DATE_PATTERN.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

async function resolveOwner(
  supabase: Awaited<ReturnType<typeof getCrmSession>>['supabase'],
  profile: NonNullable<Awaited<ReturnType<typeof getCrmSession>>['profile']>,
  userId: string,
  requestedOwner: string
) {
  if (profile.role !== 'manager') return userId
  if (!requestedOwner) throw new Error('Choose Justin or Isaiah for this lead.')

  const { data: target } = await supabase
    .from('profiles')
    .select('id,full_name')
    .eq('id', requestedOwner)
    .eq('agency_id', profile.agency_id)
    .eq('active', true)
    .in('role', ['admin', 'agent'])
    .maybeSingle()

  const allowed = target && ['justin mayer', 'isaiah hernandez'].includes(String(target.full_name || '').trim().toLowerCase())
  if (!allowed) throw new Error('Choose Justin or Isaiah for this lead.')
  return target.id
}

export async function GET() {
  const { supabase, profile } = await getCrmSession()
  if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const { data, error } = await supabase
    .from('workspace_leads')
    .select('id,assigned_agent_id,first_name,last_name,date_of_birth,product_type,notes,status,client_id,created_at,updated_at')
    .eq('agency_id', profile.agency_id)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leads: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, userId, profile } = await getCrmSession()
    if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const firstName = cleanText(body.first_name, 100)
    const lastName = cleanText(body.last_name, 100)
    const dob = cleanText(body.date_of_birth, 10)
    const product = cleanText(body.product_type, 30).toLowerCase()
    const notes = cleanText(body.notes, 5000)

    if (!firstName || !lastName) return NextResponse.json({ error: 'First and last name are required.' }, { status: 400 })
    if (dob && !validDate(dob)) return NextResponse.json({ error: 'Enter a valid date of birth.' }, { status: 400 })
    if (!PRODUCTS.has(product)) return NextResponse.json({ error: 'Choose Medicare, Life, or Retirement.' }, { status: 400 })

    const ownerId = await resolveOwner(supabase, profile, userId, cleanText(body.assigned_agent_id, 100))
    const { data, error } = await supabase
      .from('workspace_leads')
      .insert({
        agency_id: profile.agency_id,
        assigned_agent_id: ownerId,
        created_by: userId,
        first_name: firstName,
        last_name: lastName,
        date_of_birth: dob || null,
        product_type: product,
        notes: notes || null
      })
      .select('id,assigned_agent_id,first_name,last_name,date_of_birth,product_type,notes,status,client_id,created_at,updated_at')
      .single()

    if (error || !data) return NextResponse.json({ error: error?.message || 'Unable to save lead.' }, { status: 400 })

    await supabase.from('audit_log').insert({
      agency_id: profile.agency_id,
      actor_id: userId,
      client_id: null,
      action: 'workspace.lead_created',
      details: { lead_id: data.id, assigned_agent_id: ownerId, product_type: product }
    })

    return NextResponse.json({ lead: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save lead.' }, { status: 400 })
  }
}
