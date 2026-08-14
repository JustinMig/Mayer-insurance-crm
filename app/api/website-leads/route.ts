import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { WEBSITE_LEADS_AGENCY_ID, WEBSITE_LEADS_JUSTIN_ID, interestList } from '@/lib/website-leads'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Payload = Record<string, unknown>

function text(value: unknown) {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map((item) => String(item)).join(', ').trim()
  return String(value).trim()
}

function normalizedKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function field(payload: Payload, names: string[]) {
  const wanted = new Set(names.map(normalizedKey))
  for (const [key, value] of Object.entries(payload)) {
    if (wanted.has(normalizedKey(key))) return text(value)
  }
  return ''
}

function flattenPayload(input: unknown): Payload {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const root = input as Payload
  const candidates = ['data', 'fields', 'submission', 'form', 'payload']
  for (const key of candidates) {
    const nested = root[key]
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      return { ...root, ...(nested as Payload) }
    }
  }
  return root
}

function splitName(payload: Payload) {
  const first = field(payload, ['first_name', 'first name', 'firstname'])
  const last = field(payload, ['last_name', 'last name', 'lastname'])
  if (first || last) return { firstName: first, lastName: last }

  const fullName = field(payload, ['name', 'full_name', 'full name', 'fullname'])
  const parts = fullName.split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: 'Website Lead' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

function authorized(request: NextRequest) {
  const expected = process.env.WEBSITE_FORM_INGEST_SECRET || ''
  const provided = request.headers.get('x-form-bridge-secret') || ''
  if (!expected || !provided) return false

  const left = Buffer.from(expected)
  const right = Buffer.from(provided)
  return left.length === right.length && timingSafeEqual(left, right)
}

async function readPayload(request: NextRequest): Promise<Payload> {
  const contentType = request.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return flattenPayload(await request.json())
  }

  const formData = await request.formData()
  const payload: Payload = {}
  for (const [key, value] of formData.entries()) {
    const nextValue = typeof value === 'string' ? value : value.name
    if (payload[key] === undefined) payload[key] = nextValue
    else payload[key] = `${text(payload[key])}, ${nextValue}`
  }
  return flattenPayload(payload)
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const payload = await readPayload(request)
    const { firstName, lastName } = splitName(payload)
    const phone = field(payload, ['phone', 'phone number', 'mobile', 'mobile phone', 'telephone'])
    const email = field(payload, ['email', 'email address'])
    const coverageInterest = field(payload, ['coverage interest', 'coverage_interest', 'coverageinterest', 'interest', 'interests'])
    const message = field(payload, ['message', 'comments', 'comment', 'notes', 'note'])

    if (!firstName || !lastName || !phone || !email) {
      return NextResponse.json(
        { ok: false, error: 'Name, phone, and email are required.' },
        { status: 400 }
      )
    }

    const interests = interestList(coverageInterest)
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('website_leads')
      .insert({
        agency_id: WEBSITE_LEADS_AGENCY_ID,
        assigned_agent_id: WEBSITE_LEADS_JUSTIN_ID,
        first_name: firstName,
        last_name: lastName,
        phone,
        email,
        interests,
        comments: message || null,
        status: 'new',
        source: 'squarespace'
      })
      .select('id, created_at')
      .single()

    if (error) {
      console.error('Website lead insert failed', error)
      return NextResponse.json({ ok: false, error: 'Unable to save submission.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, id: data.id, created_at: data.created_at }, { status: 201 })
  } catch (error) {
    console.error('Website lead intake failed', error)
    return NextResponse.json({ ok: false, error: 'Invalid submission.' }, { status: 400 })
  }
}
