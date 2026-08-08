import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decryptValue } from '@/lib/crypto'

type Params = Promise<{ id: string }>

type SensitiveField = 'ssn' | 'drivers_license' | 'medicare_number' | 'medicaid_number' | 'health_member_id' | 'bank_routing_number' | 'bank_account_number' | 'bank_debit_card_number'

const allowedFields = new Set<SensitiveField>([
  'ssn',
  'drivers_license',
  'medicare_number',
  'medicaid_number',
  'health_member_id',
  'bank_routing_number',
  'bank_account_number',
  'bank_debit_card_number'
])

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
      Expires: '0',
      'X-Content-Type-Options': 'nosniff'
    }
  })
}

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const { id: clientId } = await params
  const supabase = await createClient()

  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return noStoreJson({ error: 'Unauthorized' }, 401)

  const userId = String(claimsData.claims.sub)
  let body: { field?: string } = {}
  try {
    body = await request.json()
  } catch {
    return noStoreJson({ error: 'Invalid request' }, 400)
  }

  const field = body.field as SensitiveField
  if (!allowedFields.has(field)) return noStoreJson({ error: 'Unknown sensitive field' }, 400)

  const { data: profile } = await supabase
    .from('profiles')
    .select('agency_id')
    .eq('id', userId)
    .single()

  if (!profile?.agency_id) return noStoreJson({ error: 'CRM profile not found' }, 403)

  // This query is intentionally performed with the signed-in user's Supabase client.
  // RLS decides whether this user is allowed to view the client before anything is decrypted.
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, agency_id, ssn_ciphertext, drivers_license_ciphertext')
    .eq('id', clientId)
    .maybeSingle()

  if (clientError || !client) return noStoreJson({ error: 'Client not found or access denied' }, 404)

  let ciphertext: string | null = null

  if (field === 'ssn') ciphertext = client.ssn_ciphertext
  if (field === 'drivers_license') ciphertext = client.drivers_license_ciphertext

  if (field === 'medicare_number' || field === 'medicaid_number') {
    const { data: medicare, error: medicareError } = await supabase
      .from('medicare_info')
      .select('medicare_number_ciphertext, medicaid_number_ciphertext')
      .eq('client_id', clientId)
      .maybeSingle()

    if (medicareError) return noStoreJson({ error: 'Unable to access Medicare information' }, 403)
    ciphertext = field === 'medicare_number'
      ? medicare?.medicare_number_ciphertext ?? null
      : medicare?.medicaid_number_ciphertext ?? null
  }

  if (field === 'health_member_id') {
    const { data: healthPlan, error: healthPlanError } = await supabase
      .from('client_health_plan_info')
      .select('member_id_ciphertext')
      .eq('client_id', clientId)
      .maybeSingle()
    if (healthPlanError) return noStoreJson({ error: 'Unable to access health plan information' }, 403)
    ciphertext = healthPlan?.member_id_ciphertext ?? null
  }

  if (field === 'bank_routing_number' || field === 'bank_account_number' || field === 'bank_debit_card_number') {
    const { data: banking, error: bankingError } = await supabase
      .from('client_banking_info')
      .select('routing_number_ciphertext, account_number_ciphertext, debit_card_number_ciphertext')
      .eq('client_id', clientId)
      .maybeSingle()
    if (bankingError) return noStoreJson({ error: 'Unable to access banking information' }, 403)
    if (field === 'bank_routing_number') ciphertext = banking?.routing_number_ciphertext ?? null
    if (field === 'bank_account_number') ciphertext = banking?.account_number_ciphertext ?? null
    if (field === 'bank_debit_card_number') ciphertext = banking?.debit_card_number_ciphertext ?? null
  }

  if (!ciphertext) return noStoreJson({ value: null })

  try {
    const value = decryptValue(ciphertext)

    // Record each successful reveal so administrators can review access to sensitive identifiers.
    await supabase.from('audit_log').insert({
      agency_id: profile.agency_id,
      actor_id: userId,
      client_id: clientId,
      action: 'sensitive.revealed',
      details: { field }
    })

    return noStoreJson({ value })
  } catch {
    return noStoreJson({ error: 'Unable to decrypt this value' }, 500)
  }
}
