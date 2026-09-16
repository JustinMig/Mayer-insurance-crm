import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptValue } from '@/lib/crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const JUSTIN_MM_ID = '9c9b6c8a-add4-475d-bda5-c27169f117a1'
const MIG_FULL_URL = 'https://bogusfmvdrlvxscopgaw.supabase.co/functions/v1/mm-full-client-sync'
const MIG_DOC_URL = 'https://bogusfmvdrlvxscopgaw.supabase.co/functions/v1/mm-document-sync'
const DOC_BUCKET = 'client-documents'

function clean(value: unknown) {
  return value == null ? '' : String(value)
}
function dec(value: unknown) {
  if (!value) return ''
  try { return decryptValue(String(value)) || '' } catch { return '' }
}

async function bridgeKey(admin: ReturnType<typeof createAdminClient>) {
  const { data, error } = await admin.rpc('mh_get_mig_bridge_key_for_service')
  if (error || !data) throw new Error('MIG bridge credential is unavailable.')
  return String(data)
}

export async function POST(request: NextRequest) {
  const admin = createAdminClient()
  try {
    const expected = await bridgeKey(admin)
    if ((request.headers.get('x-mm-internal-key') || '') !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({})) as { client_id?: string }
    const clientId = String(body.client_id || '')
    if (!/^[0-9a-f-]{36}$/i.test(clientId)) return NextResponse.json({ error: 'Invalid client ID.' }, { status: 400 })

    const { data: client, error: clientError } = await admin.from('clients').select('*').eq('id', clientId).maybeSingle()
    if (clientError) throw clientError
    if (!client || client.assigned_agent_id !== JUSTIN_MM_ID) return NextResponse.json({ ok: true, skipped: true })

    const [medicareRes, healthRes, bankRes, careRes, specialistsRes, medsRes, lifeRes, hospitalRes, docsRes] = await Promise.all([
      admin.from('medicare_info').select('*').eq('client_id', clientId).maybeSingle(),
      admin.from('client_health_plan_info').select('*').eq('client_id', clientId).maybeSingle(),
      admin.from('client_banking_info').select('*').eq('client_id', clientId).maybeSingle(),
      admin.from('client_care_info').select('*').eq('client_id', clientId).maybeSingle(),
      admin.from('client_specialists').select('*').eq('client_id', clientId).order('slot'),
      admin.from('client_medications').select('*').eq('client_id', clientId).order('sort_order'),
      admin.from('client_life_insurance').select('*').eq('client_id', clientId).maybeSingle(),
      admin.from('client_hospital_indemnity').select('*').eq('client_id', clientId).maybeSingle(),
      admin.from('documents').select('id,storage_path,file_name,mime_type,document_type,created_at').eq('client_id', clientId).order('created_at')
    ])

    const errors = [medicareRes.error, healthRes.error, bankRes.error, careRes.error, specialistsRes.error, medsRes.error, lifeRes.error, hospitalRes.error, docsRes.error].filter(Boolean)
    if (errors.length) throw errors[0]

    const medicare = medicareRes.data
    const health = healthRes.data
    const bank = bankRes.data

    const sensitive = {
      ssn: dec(client.ssn_ciphertext),
      drivers_license_number: dec(client.drivers_license_ciphertext),
      medicare_number: dec(medicare?.medicare_number_ciphertext),
      medicaid_number: dec(medicare?.medicaid_number_ciphertext)
    }

    const govDestination = dec(medicare?.medicare_gov_security_code_destination_ciphertext)
    const medicareGov = {
      username: dec(medicare?.medicare_gov_username_ciphertext),
      password: dec(medicare?.medicare_gov_password_ciphertext),
      security_answer: dec(medicare?.medicare_gov_secret_answer_ciphertext),
      verification_destination: govDestination,
      verification_type: govDestination ? (govDestination.includes('@') ? 'email' : 'text') : ''
    }

    const routing = dec(bank?.routing_number_ciphertext)
    const account = dec(bank?.account_number_ciphertext)
    const card = dec(bank?.debit_card_number_ciphertext)
    const banking = bank ? (routing || account || bank.bank_name ? {
      payment_method: 'bank',
      bank_name: clean(bank.bank_name),
      routing_number: routing,
      account_number: account,
      account_name: '',
      payment_notes: '',
      card_number: card,
      card_expiration: clean(bank.debit_card_expiration),
      card_notes: ''
    } : card ? {
      payment_method: 'card',
      bank_name: clean(bank.bank_name),
      routing_number: routing,
      account_number: account,
      card_number: card,
      card_expiration: clean(bank.debit_card_expiration),
      card_notes: ''
    } : { payment_method: '' }) : null

    const payload = {
      source_client_id: clientId,
      client: {
        first_name: client.first_name,
        last_name: client.last_name,
        date_of_birth: client.date_of_birth,
        gender: client.gender,
        email: client.email,
        phone: client.phone,
        address_line1: client.address_line1,
        city: client.city,
        state: client.state,
        zip_code: client.zip_code,
        county: client.county,
        drivers_license_state: client.drivers_license_state,
        drivers_license_expiration: client.drivers_license_expiration,
        is_medicare: client.is_medicare,
        is_life: client.is_life,
        is_retirement: client.is_retirement,
        is_deceased: client.is_deceased,
        is_veteran: client.is_veteran,
        is_smoker: client.is_smoker,
        height_inches: client.height_inches ?? undefined,
        weight_lbs: client.weight_lbs ?? undefined,
        notes: client.notes
      },
      medicare: medicare ? {
        part_a_date: medicare.part_a_date,
        part_b_date: medicare.part_b_date,
        medicaid_level: medicare.medicaid_level
      } : null,
      sensitive,
      medicare_gov: medicareGov,
      health_plan: health ? {
        company_name: health.company_name,
        plan_id: health.plan_id,
        member_id: dec(health.member_id_ciphertext),
        effective_date: health.effective_date
      } : null,
      banking,
      care: careRes.data,
      specialists: specialistsRes.data || [],
      medications: medsRes.data || [],
      life: lifeRes.data,
      hospital: hospitalRes.data
    }

    const fullResponse = await fetch(MIG_FULL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bridge-key': expected },
      body: JSON.stringify(payload),
      cache: 'no-store'
    })
    const fullResult = await fullResponse.json().catch(() => ({})) as { error?: string; client_id?: string }
    if (!fullResponse.ok || !fullResult.client_id) throw new Error(fullResult.error || 'Mayer MIG full-client sync failed.')

    let copied = 0
    const documentErrors: string[] = []
    for (const doc of docsRes.data || []) {
      try {
        const download = await admin.storage.from(DOC_BUCKET).download(doc.storage_path)
        if (download.error || !download.data) throw download.error || new Error('Unable to download M&M document.')
        const form = new FormData()
        form.set('source_client_id', clientId)
        form.set('source_document_id', doc.id)
        form.set('category', doc.document_type || 'document')
        form.set('file', new File([await download.data.arrayBuffer()], doc.file_name, { type: doc.mime_type || 'application/octet-stream' }))
        const response = await fetch(MIG_DOC_URL, { method: 'POST', headers: { 'x-bridge-key': expected }, body: form, cache: 'no-store' })
        const result = await response.json().catch(() => ({})) as { error?: string }
        if (!response.ok) throw new Error(result.error || `Unable to copy ${doc.file_name}.`)
        copied += 1
      } catch (error) {
        documentErrors.push(error instanceof Error ? `${doc.file_name}: ${error.message}` : `${doc.file_name}: sync failed`)
      }
    }

    return NextResponse.json({ ok: true, mig_client_id: fullResult.client_id, documents_checked: (docsRes.data || []).length, documents_copied_or_present: copied, document_errors: documentErrors })
  } catch (error) {
    console.error('mig-full-sync', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Full client synchronization failed.' }, { status: 500 })
  }
}
