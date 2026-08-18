import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'client-documents'
type Params = Promise<{ id: string }>
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const FIELDS = 'id,assigned_agent_id,first_name,last_name,date_of_birth,phone,product_type,is_medicare,is_life,is_retirement,notes,status,client_id,photo_storage_path,photo_file_name,photo_mime_type,photo_uploaded_at,created_at,updated_at'

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

function bool(value: unknown) {
  return value === true || value === 'true' || value === 1 || value === '1'
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

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params
    const { supabase, userId, profile } = await getCrmSession()
    if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

    const { data: existing } = await supabase
      .from('workspace_leads')
      .select('id,status')
      .eq('id', id)
      .eq('agency_id', profile.agency_id)
      .maybeSingle()
    if (!existing) return NextResponse.json({ error: 'Lead not found or access denied.' }, { status: 404 })
    if (existing.status === 'converted') return NextResponse.json({ error: 'This lead is already a client record.' }, { status: 400 })

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const firstName = cleanText(body.first_name, 100)
    const lastName = cleanText(body.last_name, 100)
    const dob = cleanText(body.date_of_birth, 10)
    const phone = cleanText(body.phone, 60)
    const isMedicare = bool(body.is_medicare)
    const isLife = bool(body.is_life)
    const isRetirement = bool(body.is_retirement)
    const notes = cleanText(body.notes, 5000)

    if (!firstName || !lastName) return NextResponse.json({ error: 'First and last name are required.' }, { status: 400 })
    if (dob && !validDate(dob)) return NextResponse.json({ error: 'Enter a valid date of birth.' }, { status: 400 })
    if (!isMedicare && !isLife && !isRetirement) return NextResponse.json({ error: 'Choose at least one: Life Insurance, Medicare, or Retirement.' }, { status: 400 })

    const productType = isMedicare ? 'medicare' : isLife ? 'life' : 'retirement'
    const ownerId = await resolveOwner(supabase, profile, userId, cleanText(body.assigned_agent_id, 100))
    const { data, error } = await supabase
      .from('workspace_leads')
      .update({
        assigned_agent_id: ownerId,
        first_name: firstName,
        last_name: lastName,
        date_of_birth: dob || null,
        phone: phone || null,
        product_type: productType,
        is_medicare: isMedicare,
        is_life: isLife,
        is_retirement: isRetirement,
        notes: notes || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select(FIELDS)
      .single()

    if (error || !data) return NextResponse.json({ error: error?.message || 'Unable to update lead.' }, { status: 400 })
    return NextResponse.json({ lead: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update lead.' }, { status: 400 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Params }) {
  const { id } = await params
  const { supabase, userId, profile } = await getCrmSession()
  if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const { data: existing } = await supabase
    .from('workspace_leads')
    .select('id,photo_storage_path')
    .eq('id', id)
    .eq('agency_id', profile.agency_id)
    .eq('status', 'lead')
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Lead not found or access denied.' }, { status: 404 })

  const { data, error } = await supabase
    .from('workspace_leads')
    .delete()
    .eq('id', id)
    .eq('agency_id', profile.agency_id)
    .eq('status', 'lead')
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Lead not found or access denied.' }, { status: 404 })

  if (existing.photo_storage_path) {
    await supabase.storage.from(BUCKET).remove([existing.photo_storage_path])
  }

  await supabase.from('audit_log').insert({
    agency_id: profile.agency_id,
    actor_id: userId,
    client_id: null,
    action: 'workspace.lead_deleted',
    details: { lead_id: id }
  })

  return NextResponse.json({ deleted: true })
}
