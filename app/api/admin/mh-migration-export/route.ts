import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decryptValue } from '@/lib/crypto'

const JUSTIN_AGENT_ID = '9c9b6c8a-add4-475d-bda5-c27169f117a1'
const DOCUMENT_BUCKET = 'client-documents'
const SIGNED_URL_SECONDS = 60 * 60

type Row = Record<string, any>

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
      Expires: '0',
      'X-Content-Type-Options': 'nosniff',
      ...headers
    }
  })
}

function safeDecrypt(value: string | null | undefined, clientId: string, field: string, warnings: Row[]) {
  if (!value) return null
  try {
    return decryptValue(value)
  } catch {
    warnings.push({ client_id: clientId, field, warning: 'Unable to decrypt source value' })
    return null
  }
}

function groupByClient(rows: Row[] | null | undefined) {
  const out = new Map<string, Row[]>()
  for (const row of rows || []) {
    const key = String(row.client_id || '')
    if (!key) continue
    const list = out.get(key) || []
    list.push(row)
    out.set(key, list)
  }
  return out
}

function oneByClient(rows: Row[] | null | undefined) {
  const out = new Map<string, Row>()
  for (const row of rows || []) if (row.client_id) out.set(String(row.client_id), row)
  return out
}

async function signedDocuments(supabase: Awaited<ReturnType<typeof createClient>>, documents: Row[], warnings: Row[]) {
  const result: Row[] = []
  const size = 20
  for (let i = 0; i < documents.length; i += size) {
    const batch = documents.slice(i, i + size)
    const resolved = await Promise.all(batch.map(async document => {
      const { data, error } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(document.storage_path, SIGNED_URL_SECONDS)
      if (error || !data?.signedUrl) {
        warnings.push({ client_id: document.client_id, document_id: document.id, field: 'document', warning: error?.message || 'Unable to create document link' })
        return { ...document, signed_url: null }
      }
      return { ...document, signed_url: data.signedUrl }
    }))
    result.push(...resolved)
  }
  return result
}

export async function GET() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims?.sub) return json({ error: 'Unauthorized' }, 401)

  const userId = String(claimsData.claims.sub)
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id,full_name,role,active')
    .eq('id', userId)
    .maybeSingle()
  if (profileError) return json({ error: profileError.message }, 500)
  if (!profile?.active || !['owner', 'admin'].includes(String(profile.role).toLowerCase())) {
    return json({ error: 'Only an Owner or Admin can export M&H migration data.' }, 403)
  }

  const { data: clients, error: clientsError } = await supabase
    .from('clients')
    .select('*')
    .eq('assigned_agent_id', JUSTIN_AGENT_ID)
    .order('last_name')
    .order('first_name')
  if (clientsError) return json({ error: clientsError.message }, 500)

  const ids = (clients || []).map(client => client.id)
  if (!ids.length) return json({ error: 'No Justin Mayer clients were found.' }, 404)

  const [medicareRes, careRes, specialistsRes, medicationsRes, lifeRes, healthRes, indemnityRes, bankingRes, documentsRes] = await Promise.all([
    supabase.from('medicare_info').select('*').in('client_id', ids),
    supabase.from('client_care_info').select('*').in('client_id', ids),
    supabase.from('client_specialists').select('*').in('client_id', ids).order('slot'),
    supabase.from('client_medications').select('*').in('client_id', ids).order('sort_order'),
    supabase.from('client_life_insurance').select('*').in('client_id', ids),
    supabase.from('client_health_plan_info').select('*').in('client_id', ids),
    supabase.from('client_hospital_indemnity').select('*').in('client_id', ids),
    supabase.from('client_banking_info').select('*').in('client_id', ids),
    supabase.from('documents').select('*').in('client_id', ids).order('created_at')
  ])

  const failed = [medicareRes, careRes, specialistsRes, medicationsRes, lifeRes, healthRes, indemnityRes, bankingRes, documentsRes].find(result => result.error)
  if (failed?.error) return json({ error: failed.error.message }, 500)

  const warnings: Row[] = []
  const signedDocs = await signedDocuments(supabase, documentsRes.data || [], warnings)

  const medicare = oneByClient(medicareRes.data)
  const care = oneByClient(careRes.data)
  const specialists = groupByClient(specialistsRes.data)
  const medications = groupByClient(medicationsRes.data)
  const life = groupByClient(lifeRes.data)
  const health = groupByClient(healthRes.data)
  const indemnity = groupByClient(indemnityRes.data)
  const banking = oneByClient(bankingRes.data)
  const documents = groupByClient(signedDocs)

  const records = (clients || []).map(client => {
    const clientId = String(client.id)
    const m = medicare.get(clientId) || null
    const b = banking.get(clientId) || null
    const healthRows = (health.get(clientId) || []).map(row => ({
      ...row,
      member_id: safeDecrypt(row.member_id_ciphertext, clientId, 'health_member_id', warnings),
      member_id_ciphertext: undefined
    }))

    const medicareData = m ? {
      ...m,
      medicare_number: safeDecrypt(m.medicare_number_ciphertext, clientId, 'medicare_number', warnings),
      medicaid_number: safeDecrypt(m.medicaid_number_ciphertext, clientId, 'medicaid_number', warnings),
      medicare_gov_username: safeDecrypt(m.medicare_gov_username_ciphertext, clientId, 'medicare_gov_username', warnings),
      medicare_gov_password: safeDecrypt(m.medicare_gov_password_ciphertext, clientId, 'medicare_gov_password', warnings),
      medicare_gov_security_answer: safeDecrypt(m.medicare_gov_secret_answer_ciphertext, clientId, 'medicare_gov_security_answer', warnings),
      medicare_gov_verification_destination: safeDecrypt(m.medicare_gov_security_code_destination_ciphertext, clientId, 'medicare_gov_verification_destination', warnings),
      medicare_number_ciphertext: undefined,
      medicaid_number_ciphertext: undefined,
      medicare_gov_username_ciphertext: undefined,
      medicare_gov_password_ciphertext: undefined,
      medicare_gov_secret_answer_ciphertext: undefined,
      medicare_gov_security_code_destination_ciphertext: undefined
    } : null

    const bankingData = b ? {
      id: b.id,
      client_id: b.client_id,
      bank_name: b.bank_name,
      routing_number: safeDecrypt(b.routing_number_ciphertext, clientId, 'bank_routing_number', warnings),
      account_number: safeDecrypt(b.account_number_ciphertext, clientId, 'bank_account_number', warnings),
      card_number: safeDecrypt(b.debit_card_number_ciphertext, clientId, 'bank_debit_card_number', warnings),
      card_expiration: b.debit_card_expiration,
      created_at: b.created_at,
      updated_at: b.updated_at
    } : null

    const cleanClient = { ...client }
    delete cleanClient.ssn_ciphertext
    delete cleanClient.drivers_license_ciphertext

    return {
      client: cleanClient,
      sensitive: {
        ssn: safeDecrypt(client.ssn_ciphertext, clientId, 'ssn', warnings),
        drivers_license: safeDecrypt(client.drivers_license_ciphertext, clientId, 'drivers_license', warnings)
      },
      medicare: medicareData,
      care: care.get(clientId) || null,
      specialists: specialists.get(clientId) || [],
      medications: medications.get(clientId) || [],
      life_insurance: life.get(clientId) || [],
      health_plans: healthRows,
      hospital_indemnity: indemnity.get(clientId) || [],
      banking: bankingData,
      documents: documents.get(clientId) || []
    }
  })

  const manifest = {
    format: 'mayer-to-mh-migration-v1',
    generated_at: new Date().toISOString(),
    document_links_expire_at: new Date(Date.now() + SIGNED_URL_SECONDS * 1000).toISOString(),
    source: { crm: 'Mayer CRM', agent_id: JUSTIN_AGENT_ID, agent_name: 'Justin Mayer' },
    counts: {
      clients: records.length,
      medicare: medicareRes.data?.length || 0,
      care: careRes.data?.length || 0,
      specialists: specialistsRes.data?.length || 0,
      medications: medicationsRes.data?.length || 0,
      life_insurance: lifeRes.data?.length || 0,
      health_plans: healthRes.data?.length || 0,
      hospital_indemnity: indemnityRes.data?.length || 0,
      banking: bankingRes.data?.length || 0,
      documents: documentsRes.data?.length || 0,
      warnings: warnings.length
    },
    warnings,
    records
  }

  return json(manifest, 200, {
    'Content-Disposition': `attachment; filename="mayer-justin-to-mh-${new Date().toISOString().slice(0, 10)}.json"`
  })
}
