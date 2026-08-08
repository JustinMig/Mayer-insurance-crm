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
}

type ImportResult = {
  source_id: string | null
  name: string
  status: 'imported' | 'duplicate' | 'failed'
  client_id?: string
  reason?: string
  skipped_sensitive_fields?: string[]
}

function duplicateKey(client: Pick<NormalizedImportClient, 'first_name' | 'last_name' | 'date_of_birth'>) {
  if (!client.date_of_birth) return ''
  return `${normalizedName(client.first_name)}|${normalizedName(client.last_name)}|${client.date_of_birth}`
}

function displayName(client: NormalizedImportClient) {
  return `${client.first_name} ${client.last_name}`.trim() || 'Unnamed client'
}

async function findExistingCandidates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clients: NormalizedImportClient[]
): Promise<ExistingClient[]> {
  const emails = Array.from(new Set(clients.map((client) => client.email).filter((item): item is string => Boolean(item))))
  const phones = Array.from(new Set(clients.map((client) => client.phone).filter((item): item is string => Boolean(item))))
  const dates = Array.from(new Set(clients.map((client) => client.date_of_birth).filter((item): item is string => Boolean(item))))

  const queries: PromiseLike<{ data: ExistingClient[] | null; error: { message: string } | null }>[] = []
  const select = 'id,first_name,last_name,date_of_birth,phone,email'

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

function buildDuplicateSets(existing: ExistingClient[]) {
  const emailSet = new Set(existing.map((item) => normalizedEmail(item.email)).filter(Boolean))
  const phoneSet = new Set(existing.map((item) => normalizedPhone(item.phone)).filter(Boolean))
  const nameDobSet = new Set(existing.map((item) => duplicateKey({
    first_name: item.first_name || '',
    last_name: item.last_name || '',
    date_of_birth: item.date_of_birth
  })).filter(Boolean))
  return { emailSet, phoneSet, nameDobSet }
}

function isDuplicate(client: NormalizedImportClient, sets: ReturnType<typeof buildDuplicateSets>) {
  const email = normalizedEmail(client.email)
  const phone = normalizedPhone(client.phone)
  const nameDob = duplicateKey(client)
  return Boolean((email && sets.emailSet.has(email)) || (phone && sets.phoneSet.has(phone)) || (nameDob && sets.nameDobSet.has(nameDob)))
}

function rememberImported(client: NormalizedImportClient, sets: ReturnType<typeof buildDuplicateSets>) {
  const email = normalizedEmail(client.email)
  const phone = normalizedPhone(client.phone)
  const nameDob = duplicateKey(client)
  if (email) sets.emailSet.add(email)
  if (phone) sets.phoneSet.add(phone)
  if (nameDob) sets.nameDobSet.add(nameDob)
}

async function insertRelatedRecords(
  supabase: Awaited<ReturnType<typeof createClient>>,
  agencyId: string,
  clientId: string,
  client: NormalizedImportClient
) {
  const operations: PromiseLike<{ error: { message: string } | null }>[] = []

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

  if (client.care) {
    operations.push(supabase.from('client_care_info').insert({
      agency_id: agencyId,
      client_id: clientId,
      ...client.care
    }))
  }

  if (client.specialists.length) {
    operations.push(supabase.from('client_specialists').insert(client.specialists.map((specialist) => ({
      agency_id: agencyId,
      client_id: clientId,
      ...specialist
    }))))
  }

  if (client.medications.length) {
    operations.push(supabase.from('client_medications').insert(client.medications.map((medication) => ({
      agency_id: agencyId,
      client_id: clientId,
      ...medication
    }))))
  }

  if (client.life) {
    operations.push(supabase.from('client_life_insurance').insert({
      agency_id: agencyId,
      client_id: clientId,
      ...client.life
    }))
  }

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

  if (client.hospital) {
    operations.push(supabase.from('client_hospital_indemnity').insert({
      agency_id: agencyId,
      client_id: clientId,
      ...client.hospital
    }))
  }

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

async function importOne(
  supabase: Awaited<ReturnType<typeof createClient>>,
  agencyId: string,
  actorId: string,
  assignedAgentId: string,
  client: NormalizedImportClient
): Promise<ImportResult> {
  const name = displayName(client)
  if (!client.first_name || !client.last_name) {
    return { source_id: client.source_id, name, status: 'failed', reason: 'First and last name are required.' }
  }

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

  if (error || !inserted?.id) {
    return { source_id: client.source_id, name, status: 'failed', reason: error?.message || 'Client could not be created.' }
  }

  try {
    await insertRelatedRecords(supabase, agencyId, inserted.id, client)
    await supabase.from('audit_log').insert({
      agency_id: agencyId,
      actor_id: actorId,
      client_id: inserted.id,
      action: 'import_client_csv',
      details: {
        source_id: client.source_id,
        assigned_agent_id: assignedAgentId,
        skipped_sensitive_fields: client.skipped_sensitive_fields
      }
    })
    return {
      source_id: client.source_id,
      name,
      status: 'imported',
      client_id: inserted.id,
      skipped_sensitive_fields: client.skipped_sensitive_fields
    }
  } catch (relatedError) {
    await supabase.from('clients').delete().eq('id', inserted.id)
    return {
      source_id: client.source_id,
      name,
      status: 'failed',
      reason: relatedError instanceof Error ? relatedError.message : 'A related client section could not be imported.'
    }
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 })

  const userId = String(claimsData.claims.sub)
  const { data: profile } = await supabase
    .from('profiles')
    .select('agency_id, role')
    .eq('id', userId)
    .maybeSingle()

  if (!profile?.agency_id || !['admin', 'manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Only an Admin or Manager can bulk import clients.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const assignedAgentId = String(body?.assigned_agent_id || '').trim()
  const rawRows: CsvRow[] = Array.isArray(body?.rows) ? body.rows : []

  if (!UUID_PATTERN.test(assignedAgentId)) return NextResponse.json({ error: 'Choose an agent for the imported clients.' }, { status: 400 })
  if (rawRows.length === 0 || rawRows.length > MAX_BATCH_SIZE) {
    return NextResponse.json({ error: `Import batches must contain between 1 and ${MAX_BATCH_SIZE} clients.` }, { status: 400 })
  }

  const { data: assignedAgent } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', assignedAgentId)
    .eq('agency_id', profile.agency_id)
    .eq('active', true)
    .in('role', ['admin', 'agent'])
    .maybeSingle()

  if (!assignedAgent) return NextResponse.json({ error: 'The selected agent is not available for client assignment.' }, { status: 400 })

  const normalized = rawRows.map((row) => normalizeImportRow(row))
  let existing: ExistingClient[] = []
  try {
    existing = await findExistingCandidates(supabase, normalized)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Duplicate check failed.' }, { status: 500 })
  }

  const duplicateSets = buildDuplicateSets(existing)
  const results: ImportResult[] = []

  for (const client of normalized) {
    if (!client.first_name || !client.last_name) {
      results.push({ source_id: client.source_id, name: displayName(client), status: 'failed', reason: 'First and last name are required.' })
      continue
    }

    if (isDuplicate(client, duplicateSets)) {
      results.push({ source_id: client.source_id, name: displayName(client), status: 'duplicate', reason: 'A matching client already exists (email, phone, or name + DOB).' })
      continue
    }

    const result = await importOne(supabase, profile.agency_id, userId, assignedAgent.id, client)
    results.push(result)
    if (result.status === 'imported') rememberImported(client, duplicateSets)
  }

  return NextResponse.json({
    assigned_agent: assignedAgent.full_name,
    imported: results.filter((item) => item.status === 'imported').length,
    duplicates: results.filter((item) => item.status === 'duplicate').length,
    failed: results.filter((item) => item.status === 'failed').length,
    results
  }, {
    headers: { 'Cache-Control': 'private, no-store' }
  })
}
