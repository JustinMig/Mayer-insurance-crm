import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  WEBSITE_LEADS_AGENCY_ID,
  WEBSITE_LEADS_JUSTIN_ID,
} from '@/lib/website-leads'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Payload = Record<string, unknown>

const ALLOWED_ORIGINS = new Set([
  'https://mayerig.com',
  'https://www.mayerig.com',
])

function corsHeaders(origin: string | null): HeadersInit {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return {}
  }

  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
  }
}

function text(value: unknown) {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(', ').trim()
  }
  return String(value).trim()
}

function normalizedKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function field(payload: Payload, names: string[]) {
  const wanted = new Set(names.map(normalizedKey))

  for (const [key, value] of Object.entries(payload)) {
    if (wanted.has(normalizedKey(key))) {
      return text(value)
    }
  }

  return ''
}

async function readPayload(request: NextRequest): Promise<Payload> {
  const contentType = request.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const value = await request.json()

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {}
    }

    return value as Payload
  }

  const formData = await request.formData()
  const payload: Payload = {}

  for (const [key, value] of formData.entries()) {
    const nextValue = typeof value === 'string' ? value : value.name

    if (payload[key] === undefined) {
      payload[key] = nextValue
    } else if (Array.isArray(payload[key])) {
      ;(payload[key] as unknown[]).push(nextValue)
    } else {
      payload[key] = [payload[key], nextValue]
    }
  }

  return payload
}

function getInterests(payload: Payload) {
  const interests: string[] = []

  const interestFields: Array<[string[], string]> = [
    [['Interest - Medicare', 'interestMedicare'], 'Medicare'],
    [['Interest - Life Insurance', 'interestLifeInsurance'], 'Life Insurance'],
    [['Interest - Final Expense', 'interestFinalExpense'], 'Final Expense'],
    [['Interest - Burial Insurance', 'interestBurialInsurance'], 'Burial Insurance'],
    [['Interest - Retirement', 'interestRetirement'], 'Retirement'],
    [['Interest - Dental', 'interestDental'], 'Dental'],
    [['Interest - Vision', 'interestVision'], 'Vision'],
    [['Interest - Cancer Insurance', 'interestCancerInsurance'], 'Cancer Insurance'],
    [['Interest - Hospital Indemnity', 'interestHospitalIndemnity'], 'Hospital Indemnity'],
    [['Interest - Critical Illness', 'interestCriticalIllness'], 'Critical Illness'],
    [
      ['Interest - Prescription Drug Coverage', 'interestPrescriptionDrugCoverage'],
      'Prescription Drug Coverage',
    ],
    [['Interest - Policy Review', 'interestPolicyReview'], 'Policy Review'],
    [['Interest - Other', 'interestOther'], 'Other'],
  ]

  for (const [names, label] of interestFields) {
    const value = field(payload, names)

    if (value && !['false', 'no', '0', 'off'].includes(value.toLowerCase())) {
      interests.push(label)
    }
  }

  return interests
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

function originIsAllowed(request: NextRequest) {
  const origin = request.headers.get('origin')

  if (origin) {
    return ALLOWED_ORIGINS.has(origin)
  }

  const referer = request.headers.get('referer')

  if (!referer) return false

  try {
    const url = new URL(referer)
    return ALLOWED_ORIGINS.has(url.origin)
  } catch {
    return false
  }
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin')

  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return new NextResponse(null, { status: 403 })
  }

  return new NextResponse(null, {
    status: 204,
    headers: {
      ...corsHeaders(origin),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  if (!originIsAllowed(request)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid submission source.' },
      { status: 403, headers: corsHeaders(origin) }
    )
  }

  try {
    const payload = await readPayload(request)

    const honey = field(payload, ['_honey', 'website', 'company_website'])

    if (honey) {
      return NextResponse.json(
        { ok: true },
        { status: 200, headers: corsHeaders(origin) }
      )
    }

    const firstName = field(payload, ['firstName', 'first_name', 'First Name'])
    const lastName = field(payload, ['lastName', 'last_name', 'Last Name'])
    const addressLine1 = field(payload, ['address', 'addressLine1', 'Street Address'])
    const city = field(payload, ['city', 'City'])
    const state = field(payload, ['state', 'State'])
    const zipCode = field(payload, ['zip', 'zipCode', 'ZIP Code'])
    const phone = field(payload, ['phone', 'phoneNumber', 'Phone Number'])
    const email = field(payload, ['email', 'emailAddress', 'Email Address'])
    const preferredContactMethod = field(payload, [
      'preferredContactMethod',
      'Preferred Contact Method',
    ])
    const comments = field(payload, ['comments', 'message', 'Questions or Comments'])

    if (!firstName || !lastName || !phone || !email) {
      return NextResponse.json(
        { ok: false, error: 'First name, last name, phone, and email are required.' },
        { status: 400, headers: corsHeaders(origin) }
      )
    }

    if (firstName.length > 100 || lastName.length > 100) {
      return NextResponse.json(
        { ok: false, error: 'Invalid name.' },
        { status: 400, headers: corsHeaders(origin) }
      )
    }

    if (email.length > 254 || phone.length > 40) {
      return NextResponse.json(
        { ok: false, error: 'Invalid contact information.' },
        { status: 400, headers: corsHeaders(origin) }
      )
    }

    if (comments.length > 5000) {
      return NextResponse.json(
        { ok: false, error: 'Message is too long.' },
        { status: 400, headers: corsHeaders(origin) }
      )
    }

    const interests = getInterests(payload)
    const normalizedPhone = normalizePhone(phone)
    const normalizedEmail = email.toLowerCase()

    const supabase = createAdminClient()

    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()

    const { data: recentLeads, error: duplicateCheckError } = await supabase
      .from('website_leads')
      .select('id, phone, email')
      .eq('assigned_agent_id', WEBSITE_LEADS_JUSTIN_ID)
      .gte('created_at', twoMinutesAgo)
      .limit(25)

    if (duplicateCheckError) {
      console.error('Website lead duplicate check failed', duplicateCheckError)
    }

    const duplicate = (recentLeads || []).some((lead) => {
      const existingPhone = normalizePhone(String(lead.phone || ''))
      const existingEmail = String(lead.email || '').toLowerCase()

      return (
        (normalizedPhone && existingPhone === normalizedPhone) ||
        (normalizedEmail && existingEmail === normalizedEmail)
      )
    })

    if (duplicate) {
      return NextResponse.json(
        { ok: true, duplicate: true },
        { status: 200, headers: corsHeaders(origin) }
      )
    }

    const { data, error } = await supabase
      .from('website_leads')
      .insert({
        agency_id: WEBSITE_LEADS_AGENCY_ID,
        assigned_agent_id: WEBSITE_LEADS_JUSTIN_ID,
        first_name: firstName,
        last_name: lastName,
        address_line1: addressLine1 || null,
        city: city || null,
        state: state || null,
        zip_code: zipCode || null,
        phone,
        email,
        preferred_contact_method: preferredContactMethod || null,
        interests,
        comments: comments || null,
        status: 'new',
        source: 'mayerig.com',
      })
      .select('id, created_at')
      .single()

    if (error) {
      console.error('Website lead insert failed', error)
      return NextResponse.json(
        { ok: false, error: 'Unable to save submission.' },
        { status: 500, headers: corsHeaders(origin) }
      )
    }

    return NextResponse.json(
      { ok: true, id: data.id, created_at: data.created_at },
      { status: 201, headers: corsHeaders(origin) }
    )
  } catch (error) {
    console.error('Website lead intake failed', error)
    return NextResponse.json(
      { ok: false, error: 'Invalid submission.' },
      { status: 400, headers: corsHeaders(origin) }
    )
  }
}
