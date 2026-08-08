import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encryptValue } from '@/lib/crypto'
import { normalizeImportRow, normalizedEmail, normalizedName, normalizedPhone, type NormalizedImportClient } from '@/lib/client-import'
import type { CsvRow } from '@/lib/csv'

const MAX_BATCH_SIZE = 20
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type ExistingClient = {
  id: string
  first_name: string | null
  last_name: string | null
  date_of_birth: string | null
  phone: string | null
  email: string | null
  gender: string | null
  address_line1: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  county: string | null
  ssn_ciphertext: string | null
  drivers_license_ciphertext: string | null
  drivers_license_state: string | null
  drivers_license_expiration: string | null
  is_medicare: boolean
  is_life: boolean
  is_retirement: boolean
  is_veteran: boolean | null
  is_smoker: boolean | null
  notes: string | null
}

type ImportResult = {
  source_id: string | null
  name: string
  status: 'imported' | 'merged' | 'failed'
  client_id?: string
  reason?: string
  fields_added?: string[]
  skipped_sensitive_fields?: string[]
}

type MatchResult = { client: ExistingClient | null; ambiguous: boolean }

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

function isBlank(value: unknown) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
}

function duplicateKey(client: { first_name: string | null; last_name: string | null; date_of_birth: string | null }) {
  if (!client.date_of_birth) return ''
  return `${normalizedName(client.first_name || '')}|${normalizedName(client.last_name || '')}|${client.date_of_birth}`
}

function displayName(client: NormalizedImportClient) {
  return `${client.first_name} ${client.last_name}`.trim() || 'Unnamed client'
}

async function findExistingCandidates(supabase: SupabaseClient, clients: NormalizedImportClient[]): Promise<ExistingClient[]> {
  const emails = Array.from(new Set(clients.map((client) => client.email).filter((item): item is string => Boolean(item))))
  const phones = Array.from(new Set(clients.map((client) => client.phone).filter((item): item is string => Boolean(item))))
  const dates = Array.from(new Set(clients.map((client) => client.date_of_birth).filter((item): item is string => Boolean(item))))

  const queries: Array<PromiseLike<{ data: ExistingClient[] | null; error: { message: string } | null }>> = []
  const select = 'id,first_name,last_name,date_of_birth,phone,email,gender,address_line1,city,state,zip_code,county,ssn_ciphertext,drivers_license_ciphertext,drivers_license_state,drivers_license_expiration,is_medicare,is_life,is_retirement,is_veteran,is_smoker,notes'

  if (emails.length) queries.push(supabase.from('clients').select(select).in('email', emails))
  if (phones.length) queries.push(supabase.from('clients').select(select).in('phone', phones))
  if (dates.length) queries.push(supabase.from('clients').select(select).in('date_of_birth', dates))

  if (!queries.length) return []
  const results = await Promise.all(queries)
  const all = new Map<string, ExistingClient>()
  for (const result of results) {
    if (result.error) throw new Error(result.error.message)
    for (const client of result.data || []) all.set(client.id, client)
  }
  return Array.from(all.values())
}

function matchExistingClient(imported: NormalizedImportClient, existing: ExistingClient[]): MatchResult {
  const ids = new Set<string>()
  const email = normalizedEmail(imported.email)
  const phone = normalizedPhone(imported.phone)
  const nameDob = duplicateKey({ first_name: imported.first_name, last_name: imported.last_name, date_of_birth: imported.date_of_birth })

  for (const client of existing) {
    if (email && normalizedEmail(client.email) === email) ids.add(client.id)
    if (phone && normalizedPhone(client.phone) === phone) ids.add(client.id)
    if (nameDob && duplicateKey(client) === nameDob) ids.add(client.id)
  }

  if (ids.size === 0) return { client: null, ambiguous: false }
  if (ids.size > 1) return { client: null, ambiguous: true }
  const id = Array.from(ids)[0]
  return { client: existing.find((client) => client.id === id) || null, ambiguous: false }
}

async function insertRelatedRecords(supabase: SupabaseClient, agencyId: string, clientId: string, client: NormalizedImportClient) {
  const operations: Array<PromiseLike<{ error: { message: string } | null }>> = []

  if (client.medicare) {
    operations.push(supabase.from('medicare_info').insert({
      agency_id: agencyId,
      client_id: clientId,
      medicare_number_ciphertext: encryptValue(client.medicare.medicare_number),
      part_a_date: client.medicare.part_a_date,
      part_b_date: client.medicare.part_b_date,
      medicaid_number_ciphertext: encryptValue(client.medicare.medicaid_number),
      medicaid_level: client.medicare.medicaid_level
    }))
  }

  if (client.care) operations.push(supabase.from('client_care_info').insert({ agency_id: agencyId, client_id: clientId, ...client.care }))
  if (client.specialists.length) operations.push(supabase.from('client_specialists').insert(client.specialists.map((specialist) => ({ agency_id: agencyId, client_id: clientId, ...specialist }))))
  if (client.medications.length) operations.push(supabase.from('client_medications').insert(client.medications.map((medication) => ({ agency_id: agencyId, client_id: clientId, ...medication }))))
  if (client.life) operations.push(supabase.from('client_life_insurance').insert({ agency_id: agencyId, client_id: clientId, ...client.life }))

  if (client.health) {
    operations.push(supabase.from('client_health_plan_info').insert({
      agency_id: agencyId,
      client_id: clientId,
      company_name: client.health.company_name,
      member_id_ciphertext: encryptValue(client.health.member_id),
      plan_id: client.health.plan_id,
      effective_date: client.health.effective_date
    }))
  }

  if (client.hospital) operations.push(supabase.from('client_hospital_indemnity').insert({ agency_id: agencyId, client_id: clientId, ...client.hospital }))

  if (client.banking) {
    operations.push(supabase.from('client_banking_info').insert({
      agency_id: agencyId,
      client_id: clientId,
      bank_name: client.banking.bank_name,
      routing_number_ciphertext: encryptValue(client.banking.routing_number),
      account_number_ciphertext: encryptValue(client.banking.account_number),
      debit_card_number_ciphertext: encryptValue(client.banking.debit_card_number),
      debit_card_expiration: client.banking.debit_card_expiration
    }))
  }

  const results = await Promise.all(operations)
  const failure = results.find((result) => result.error)
  if (failure?.error) throw new Error(failure.error.message)
}

function addMissing(updates: Record<string, unknown>, added: string[], existingValue: unknown, incomingValue: unknown, column: string, label: string) {
  if (isBlank(existingValue) && !isBlank(incomingValue)) {
    updates[column] = incomingValue
    added.push(label)
  }
}

async function mergeOneToOne(
  supabase: SupabaseClient,
  table: string,
  agencyId: string,
  clientId: string,
  incoming: Record<string, unknown> | null,
  labels: Record<string, string>,
  encryptedColumns: Record<string, string> = {},
  canonicalizeColumns: string[] = []
): Promise<string[]> {
  if (!incoming) return []
  const { data: existing, error: readError } = await supabase.from(table).select('*').eq('client_id', clientId).maybeSingle()
  if (readError) throw new Error(readError.message)

  if (!existing) {
    const payload: Record<string, unknown> = { agency_id: agencyId, client_id: clientId }
    for (const [key, value] of Object.entries(incoming)) {
      if (isBlank(value)) continue
      const encryptedTarget = encryptedColumns[key]
      payload[encryptedTarget || key] = encryptedTarget ? encryptValue(String(value)) : value
    }
    if (Object.keys(payload).length === 2) return []
    const { error } = await supabase.from(table).insert(payload)
    if (error) throw new Error(error.message)
    return Object.entries(incoming).filter(([, value]) => !isBlank(value)).map(([key]) => labels[key] || key)
  }

  const updates: Record<string, unknown> = {}
  const added: string[] = []
  for (const [key, value] of Object.entries(incoming)) {
    if (isBlank(value)) continue
    const encryptedTarget = encryptedColumns[key]
    const target = encryptedTarget || key
    if (isBlank(existing[target])) {
      updates[target] = encryptedTarget ? encryptValue(String(value)) : value
      added.push(labels[key] || key)
    } else if (!encryptedTarget && canonicalizeColumns.includes(key) && typeof existing[target] === 'string' && typeof value === 'string') {
      const oldCanonical = existing[target].toUpperCase().replace(/[^A-Z0-9]/g, '')
      const newCanonical = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
      if (oldCanonical === newCanonical && existing[target] !== value) {
        updates[target] = value
        added.push(`${labels[key] || key} standardized`)
      }
    }
  }

  if (Object.keys(updates).length) {
    const { error } = await supabase.from(table).update(updates).eq('id', existing.id)
    if (error) throw new Error(error.message)
  }
  return added
}

async function mergeSpecialists(supabase: SupabaseClient, agencyId: string, clientId: string, imported: NormalizedImportClient['specialists']): Promise<string[]> {
  if (!imported.length) return []
  const { data: existingRows, error } = await supabase.from('client_specialists').select('id,slot,specialty,doctor_name,city,state').eq('client_id', clientId)
  if (error) throw new Error(error.message)
  const existingBySlot = new Map<number, any>((existingRows || []).map((row: any) => [Number(row.slot), row]))
  const added: string[] = []

  for (const specialist of imported) {
    const existing = existingBySlot.get(specialist.slot)
    if (!existing) {
      const { error: insertError } = await supabase.from('client_specialists').insert({ agency_id: agencyId, client_id: clientId, ...specialist })
      if (insertError) throw new Error(insertError.message)
      added.push(`Specialist ${specialist.slot}`)
      continue
    }
    const updates: Record<string, unknown> = {}
    addMissing(updates, added, existing.doctor_name, specialist.doctor_name, 'doctor_name', `Specialist ${specialist.slot} doctor`)
    addMissing(updates, added, existing.specialty, specialist.specialty, 'specialty', `Specialist ${specialist.slot} specialty`)
    addMissing(updates, added, existing.city, specialist.city, 'city', `Specialist ${specialist.slot} city`)
    addMissing(updates, added, existing.state, specialist.state, 'state', `Specialist ${specialist.slot} state`)
    if (Object.keys(updates).length) {
      const { error: updateError } = await supabase.from('client_specialists').update(updates).eq('id', existing.id)
      if (updateError) throw new Error(updateError.message)
    }
  }
  return added
}

async function mergeMedications(supabase: SupabaseClient, agencyId: string, clientId: string, imported: NormalizedImportClient['medications']): Promise<string[]> {
  if (!imported.length) return []
  const { data: existingRows, error } = await supabase.from('client_medications').select('medication_name,sort_order').eq('client_id', clientId)
  if (error) throw new Error(error.message)
  const existingNames = new Set((existingRows || []).map((row: any) => normalizedName(String(row.medication_name || ''))).filter(Boolean))
  let nextSort = (existingRows || []).reduce((max: number, row: any) => Math.max(max, Number(row.sort_order || 0)), -1) + 1
  const additions = imported.filter((medication) => {
    const key = normalizedName(medication.medication_name)
    if (!key || existingNames.has(key)) return false
    existingNames.add(key)
    return true
  }).map((medication) => ({ agency_id: agencyId, client_id: clientId, ...medication, sort_order: nextSort++ }))

  if (additions.length) {
    const { error: insertError } = await supabase.from('client_medications').insert(additions)
    if (insertError) throw new Error(insertError.message)
  }
  return additions.map((item) => `Medication: ${item.medication_name}`)
}

async function mergeExistingClient(supabase: SupabaseClient, agencyId: string, actorId: string, existing: ExistingClient, client: NormalizedImportClient): Promise<ImportResult> {
  const added: string[] = []
  const updates: Record<string, unknown> = {}

  addMissing(updates, added, existing.date_of_birth, client.date_of_birth, 'date_of_birth', 'Date of birth')
  addMissing(updates, added, existing.gender, client.gender, 'gender', 'Gender')
  addMissing(updates, added, existing.email, client.email, 'email', 'Email')
  addMissing(updates, added, existing.phone, client.phone, 'phone', 'Phone')
  addMissing(updates, added, existing.address_line1, client.address_line1, 'address_line1', 'Street address')
  addMissing(updates, added, existing.city, client.city, 'city', 'City')
  addMissing(updates, added, existing.state, client.state, 'state', 'State')
  addMissing(updates, added, existing.zip_code, client.zip_code, 'zip_code', 'ZIP code')
  addMissing(updates, added, existing.county, client.county, 'county', 'County')
  addMissing(updates, added, existing.drivers_license_state, client.drivers_license_state, 'drivers_license_state', 'Driver license state')
  addMissing(updates, added, existing.drivers_license_expiration, client.drivers_license_expiration, 'drivers_license_expiration', 'Driver license expiration')
  addMissing(updates, added, existing.notes, client.notes, 'notes', 'Notes')

  if (!existing.ssn_ciphertext && client.ssn) { updates.ssn_ciphertext = encryptValue(client.ssn); added.push('SSN') }
  if (!existing.drivers_license_ciphertext && client.drivers_license) { updates.drivers_license_ciphertext = encryptValue(client.drivers_license); added.push('Driver license number') }
  if (client.is_medicare && !existing.is_medicare) { updates.is_medicare = true; added.push('Medicare product') }
  if (client.is_life && !existing.is_life) { updates.is_life = true; added.push('Life product') }
  if (client.is_retirement && !existing.is_retirement) { updates.is_retirement = true; added.push('Retirement product') }
  if (existing.is_veteran === null && client.is_veteran !== null) { updates.is_veteran = client.is_veteran; added.push('Veteran status') }
  if (existing.is_smoker === null && client.is_smoker !== null) { updates.is_smoker = client.is_smoker; added.push('Smoking status') }

  if (Object.keys(updates).length) {
    const { error } = await supabase.from('clients').update(updates).eq('id', existing.id)
    if (error) throw new Error(error.message)
  }

  if (client.medicare) {
    added.push(...await mergeOneToOne(supabase, 'medicare_info', agencyId, existing.id, {
      medicare_number: client.medicare.medicare_number,
      part_a_date: client.medicare.part_a_date,
      part_b_date: client.medicare.part_b_date,
      medicaid_number: client.medicare.medicaid_number,
      medicaid_level: client.medicare.medicaid_level
    }, {
      medicare_number: 'Medicare number', part_a_date: 'Part A date', part_b_date: 'Part B date', medicaid_number: 'Medicaid number', medicaid_level: 'Medicaid level'
    }, { medicare_number: 'medicare_number_ciphertext', medicaid_number: 'medicaid_number_ciphertext' }, ['medicaid_level']))
  }

  if (client.care) {
    added.push(...await mergeOneToOne(supabase, 'client_care_info', agencyId, existing.id, client.care, {
      primary_doctor_name: 'Primary doctor', primary_doctor_city: 'Primary doctor city', primary_doctor_state: 'Primary doctor state', pharmacy_name: 'Pharmacy', pharmacy_city: 'Pharmacy city', pharmacy_state: 'Pharmacy state'
    }))
  }

  added.push(...await mergeSpecialists(supabase, agencyId, existing.id, client.specialists))
  added.push(...await mergeMedications(supabase, agencyId, existing.id, client.medications))

  if (client.life) {
    added.push(...await mergeOneToOne(supabase, 'client_life_insurance', agencyId, existing.id, client.life, {
      company_name: 'Life company', face_amount: 'Life face amount', premium_amount: 'Life premium', policy_type: 'Life policy type', effective_date: 'Life effective date'
    }))
  }

  if (client.health) {
    added.push(...await mergeOneToOne(supabase, 'client_health_plan_info', agencyId, existing.id, {
      company_name: client.health.company_name,
      member_id: client.health.member_id,
      plan_id: client.health.plan_id,
      effective_date: client.health.effective_date
    }, {
      company_name: 'Health plan company', member_id: 'Health member ID', plan_id: 'Health plan ID', effective_date: 'Health effective date'
    }, { member_id: 'member_id_ciphertext' }))
  }

  if (client.hospital) {
    added.push(...await mergeOneToOne(supabase, 'client_hospital_indemnity', agencyId, existing.id, client.hospital, {
      company_name: 'Hospital indemnity company', premium_amount: 'Hospital indemnity premium', effective_date: 'Hospital indemnity effective date'
    }))
  }

  if (client.banking) {
    added.push(...await mergeOneToOne(supabase, 'client_banking_info', agencyId, existing.id, {
      bank_name: client.banking.bank_name,
      routing_number: client.banking.routing_number,
      account_number: client.banking.account_number,
      debit_card_number: client.banking.debit_card_number,
      debit_card_expiration: client.banking.debit_card_expiration
    }, {
      bank_name: 'Bank name', routing_number: 'Routing number', account_number: 'Account number', debit_card_number: 'Debit card number', debit_card_expiration: 'Debit card expiration'
    }, {
      routing_number: 'routing_number_ciphertext', account_number: 'account_number_ciphertext', debit_card_number: 'debit_card_number_ciphertext'
    }))
  }

  await supabase.from('audit_log').insert({
    agency_id: agencyId,
    actor_id: actorId,
    client_id: existing.id,
    action: 'import_client_csv_merge',
    details: {
      source_id: client.source_id,
      fields_added: added,
      overwrite_existing: false,
      skipped_sensitive_fields: client.skipped_sensitive_fields
    }
  })

  return {
    source_id: client.source_id,
    name: displayName(client),
    status: 'merged',
    client_id: existing.id,
    reason: added.length ? `${added.length} missing field${added.length === 1 ? '' : 's'} added to the existing client.` : 'Existing client found. No blank intake fields needed to be filled.',
    fields_added: added,
    skipped_sensitive_fields: client.skipped_sensitive_fields
  }
}

async function importNewClient(supabase: SupabaseClient, agencyId: string, actorId: string, assignedAgentId: string, client: NormalizedImportClient): Promise<ImportResult> {
  const name = displayName(client)
  const { data: inserted, error } = await supabase
    .from('clients')
    .insert({
      agency_id: agencyId,
      assigned_agent_id: assignedAgentId,
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
      ssn_ciphertext: encryptValue(client.ssn),
      drivers_license_ciphertext: encryptValue(client.drivers_license),
      drivers_license_state: client.drivers_license_state,
      drivers_license_expiration: client.drivers_license_expiration,
      is_medicare: client.is_medicare,
      is_life: client.is_life,
      is_retirement: client.is_retirement,
      is_veteran: client.is_veteran,
      is_smoker: client.is_smoker,
      notes: client.notes
    })
    .select('id')
    .single()

  if (error || !inserted?.id) return { source_id: client.source_id, name, status: 'failed', reason: error?.message || 'Client could not be created.' }

  try {
    await insertRelatedRecords(supabase, agencyId, inserted.id, client)
    await supabase.from('audit_log').insert({
      agency_id: agencyId,
      actor_id: actorId,
      client_id: inserted.id,
      action: 'import_client_csv',
      details: { source_id: client.source_id, assigned_agent_id: assignedAgentId, skipped_sensitive_fields: client.skipped_sensitive_fields }
    })
    return { source_id: client.source_id, name, status: 'imported', client_id: inserted.id, skipped_sensitive_fields: client.skipped_sensitive_fields }
  } catch (relatedError) {
    await supabase.from('clients').delete().eq('id', inserted.id)
    return { source_id: client.source_id, name, status: 'failed', reason: relatedError instanceof Error ? relatedError.message : 'A related client section could not be imported.' }
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 })

  const userId = String(claimsData.claims.sub)
  const { data: profile } = await supabase.from('profiles').select('agency_id, role').eq('id', userId).maybeSingle()
  if (!profile?.agency_id || !['admin', 'manager'].includes(profile.role)) return NextResponse.json({ error: 'Only an Admin or Manager can bulk import clients.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const assignedAgentId = String(body?.assigned_agent_id || '').trim()
  const rawRows: CsvRow[] = Array.isArray(body?.rows) ? body.rows : []

  if (!UUID_PATTERN.test(assignedAgentId)) return NextResponse.json({ error: 'Choose an agent for newly created clients.' }, { status: 400 })
  if (rawRows.length === 0 || rawRows.length > MAX_BATCH_SIZE) return NextResponse.json({ error: `Import batches must contain between 1 and ${MAX_BATCH_SIZE} clients.` }, { status: 400 })

  const { data: assignedAgent } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', assignedAgentId)
    .eq('agency_id', profile.agency_id)
    .eq('active', true)
    .in('role', ['admin', 'agent'])
    .maybeSingle()
  if (!assignedAgent) return NextResponse.json({ error: 'The selected agent is not available for new client assignment.' }, { status: 400 })

  const normalized = rawRows.map((row) => normalizeImportRow(row))
  let existing: ExistingClient[] = []
  try {
    existing = await findExistingCandidates(supabase, normalized)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Existing-client check failed.' }, { status: 500 })
  }

  const results: ImportResult[] = []
  for (const client of normalized) {
    if (!client.first_name || !client.last_name) {
      results.push({ source_id: client.source_id, name: displayName(client), status: 'failed', reason: 'First and last name are required.' })
      continue
    }

    const match = matchExistingClient(client, existing)
    if (match.ambiguous) {
      results.push({ source_id: client.source_id, name: displayName(client), status: 'failed', reason: 'More than one existing CRM client matched this import row. Review the duplicates manually before importing it.' })
      continue
    }

    try {
      if (match.client) {
        results.push(await mergeExistingClient(supabase, profile.agency_id, userId, match.client, client))
      } else {
        const result = await importNewClient(supabase, profile.agency_id, userId, assignedAgent.id, client)
        results.push(result)
        if (result.status === 'imported' && result.client_id) {
          existing.push({
            id: result.client_id,
            first_name: client.first_name,
            last_name: client.last_name,
            date_of_birth: client.date_of_birth,
            phone: client.phone,
            email: client.email,
            gender: client.gender,
            address_line1: client.address_line1,
            city: client.city,
            state: client.state,
            zip_code: client.zip_code,
            county: client.county,
            ssn_ciphertext: client.ssn ? 'imported' : null,
            drivers_license_ciphertext: client.drivers_license ? 'imported' : null,
            drivers_license_state: client.drivers_license_state,
            drivers_license_expiration: client.drivers_license_expiration,
            is_medicare: client.is_medicare,
            is_life: client.is_life,
            is_retirement: client.is_retirement,
            is_veteran: client.is_veteran,
            is_smoker: client.is_smoker,
            notes: client.notes
          })
        }
      }
    } catch (error) {
      results.push({ source_id: client.source_id, name: displayName(client), status: 'failed', reason: error instanceof Error ? error.message : 'Client import failed.' })
    }
  }

  return NextResponse.json({
    assigned_agent_for_new_clients: assignedAgent.full_name,
    imported: results.filter((item) => item.status === 'imported').length,
    merged: results.filter((item) => item.status === 'merged').length,
    failed: results.filter((item) => item.status === 'failed').length,
    results
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}
