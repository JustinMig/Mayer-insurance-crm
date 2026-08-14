'use server'

import { redirect } from 'next/navigation'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import { encryptValue } from '@/lib/crypto'

function value(form: FormData, key: string) {
  return String(form.get(key) || '').trim()
}

function nullable(form: FormData, key: string) {
  const v = value(form, key)
  return v || null
}


function normalizedDate(form: FormData, key: string, label: string) {
  const raw = value(form, key)
  if (!raw) return null

  let year: number
  let month: number
  let day: number

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (slashMatch) {
    month = Number(slashMatch[1])
    day = Number(slashMatch[2])
    year = Number(slashMatch[3])
  } else if (isoMatch) {
    year = Number(isoMatch[1])
    month = Number(isoMatch[2])
    day = Number(isoMatch[3])
  } else {
    throw new Error(`Enter ${label} as MM/DD/YYYY.`)
  }

  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Enter a valid ${label}.`)
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function normalizedDateOfBirth(form: FormData) {
  return normalizedDate(form, 'date_of_birth', 'date of birth')
}

function checked(form: FormData, key: string) {
  return form.get(key) === 'on'
}

function optionalYesNo(form: FormData, key: string) {
  const raw = value(form, key).toLowerCase()
  if (raw === 'yes') return true
  if (raw === 'no') return false
  return null
}

function optionalMoney(form: FormData, key: string) {
  const raw = value(form, key).replace(/[$,]/g, '')
  if (!raw) return null
  const number = Number(raw)
  if (!Number.isFinite(number) || number < 0) throw new Error('Enter a valid non-negative dollar amount.')
  return number
}

function clientHeightInches(form: FormData) {
  const feetRaw = value(form, 'height_feet')
  const inchesRaw = value(form, 'height_in')
  if (!feetRaw && !inchesRaw) return null
  if (!feetRaw) throw new Error('Enter the feet portion of the client height.')

  const feet = Number(feetRaw)
  const inches = inchesRaw ? Number(inchesRaw) : 0
  if (!Number.isInteger(feet) || feet < 1 || feet > 8) throw new Error('Enter a valid height in feet.')
  if (!Number.isInteger(inches) || inches < 0 || inches > 11) throw new Error('Height inches must be between 0 and 11.')
  return feet * 12 + inches
}

function clientWeightLbs(form: FormData) {
  const raw = value(form, 'weight_lbs')
  if (!raw) return null
  const weight = Number(raw)
  if (!Number.isInteger(weight) || weight < 1 || weight > 999) throw new Error('Enter a valid weight in pounds.')
  return weight
}

function resolvedLifeCompany(form: FormData) {
  const choice = value(form, 'life_company_choice')
  if (choice === '__other__') return nullable(form, 'life_company_custom')
  return choice || null
}

function resolvedLifeFaceAmount(form: FormData) {
  const choice = value(form, 'life_face_amount_choice')
  if (!choice) return null
  if (choice === '__custom__') return optionalMoney(form, 'life_face_amount_custom')
  const number = Number(choice)
  if (!Number.isFinite(number) || number < 0) throw new Error('Enter a valid face amount.')
  return number
}

function resolvedHealthCompany(form: FormData) {
  const choice = value(form, 'health_company_choice')
  if (choice === '__other__') return nullable(form, 'health_company_custom')
  return choice || null
}

async function getProfile() {
  const supabase = await createSupabaseClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) redirect('/login')

  const userId = String(data.claims.sub)
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('agency_id, role')
    .eq('id', userId)
    .single()

  if (profileError || !profile?.agency_id) throw new Error('Your CRM profile is not connected to an agency.')
  return { supabase, userId, profile }
}


async function saveDoctorsAndMedications(
  supabase: Awaited<ReturnType<typeof createSupabaseClient>>,
  agencyId: string,
  clientId: string,
  form: FormData
) {
  const careInfo = {
    agency_id: agencyId,
    client_id: clientId,
    primary_doctor_name: nullable(form, 'primary_doctor_name'),
    primary_doctor_city: nullable(form, 'primary_doctor_city'),
    primary_doctor_state: nullable(form, 'primary_doctor_state'),
    pharmacy_name: nullable(form, 'pharmacy_name'),
    pharmacy_city: nullable(form, 'pharmacy_city'),
    pharmacy_state: nullable(form, 'pharmacy_state')
  }

  const hasCareInfo = Object.entries(careInfo).some(([key, item]) => !['agency_id', 'client_id'].includes(key) && Boolean(item))
  if (hasCareInfo) {
    const { error } = await supabase
      .from('client_care_info')
      .upsert(careInfo, { onConflict: 'client_id' })
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('client_care_info').delete().eq('client_id', clientId)
    if (error) throw new Error(error.message)
  }

  const specialists = []
  for (let slot = 1; slot <= 5; slot += 1) {
    const specialty = nullable(form, `specialist_${slot}_specialty`)
    const doctorName = nullable(form, `specialist_${slot}_name`)
    const city = nullable(form, `specialist_${slot}_city`)
    const state = nullable(form, `specialist_${slot}_state`)
    if (specialty || doctorName || city || state) {
      specialists.push({
        agency_id: agencyId,
        client_id: clientId,
        slot,
        specialty,
        doctor_name: doctorName,
        city,
        state
      })
    }
  }

  const { error: clearSpecialistsError } = await supabase.from('client_specialists').delete().eq('client_id', clientId)
  if (clearSpecialistsError) throw new Error(clearSpecialistsError.message)
  if (specialists.length) {
    const { error } = await supabase.from('client_specialists').insert(specialists)
    if (error) throw new Error(error.message)
  }

  const names = form.getAll('medication_name').map(item => String(item || '').trim())
  const dosages = form.getAll('medication_dosage').map(item => String(item || '').trim())
  const timesPerDay = form.getAll('medication_times_per_day').map(item => String(item || '').trim())
  const quantities = form.getAll('medication_quantity_filled').map(item => String(item || '').trim())
  const refills = form.getAll('medication_refill_count').map(item => String(item || '').trim())

  const medications = names.map((name, index) => ({
    agency_id: agencyId,
    client_id: clientId,
    medication_name: name,
    dosage: dosages[index] || null,
    times_per_day: timesPerDay[index] || null,
    quantity_filled: quantities[index] || null,
    refill_count: refills[index] || null,
    sort_order: index
  })).filter(item => item.medication_name)

  const { error: clearMedicationsError } = await supabase.from('client_medications').delete().eq('client_id', clientId)
  if (clearMedicationsError) throw new Error(clearMedicationsError.message)
  if (medications.length) {
    const { error } = await supabase.from('client_medications').insert(medications)
    if (error) throw new Error(error.message)
  }
}


function normalizedLifePolicyType(form: FormData): 'Term' | 'Whole Life' | 'IUL' | null {
  const raw = String(form.get('life_policy_type') || '').trim()
  if (!raw) return null

  if (/^Term$/i.test(raw) || /Term Life/i.test(raw)) return 'Term'
  if (/^IUL$/i.test(raw) || /Indexed Universal Life/i.test(raw)) return 'IUL'
  if (/^Whole Life$/i.test(raw) || /Senior Choice/i.test(raw) || /Final Expense/i.test(raw) || /Whole Life/i.test(raw)) return 'Whole Life'

  // Never send an unsupported value into the database check constraint.
  return null
}


async function saveLifeInsurance(
  supabase: Awaited<ReturnType<typeof createSupabaseClient>>,
  agencyId: string,
  clientId: string,
  form: FormData
) {
  const record = {
    agency_id: agencyId,
    client_id: clientId,
    company_name: resolvedLifeCompany(form),
    face_amount: resolvedLifeFaceAmount(form),
    premium_amount: optionalMoney(form, 'life_premium_amount'),
    policy_type: normalizedLifePolicyType(form),
    effective_date: normalizedDate(form, 'life_effective_date', 'Life effective date')
  }

  const hasLifeInsuranceData = Object.entries(record).some(
    ([key, item]) => !['agency_id', 'client_id'].includes(key) && item !== null && item !== ''
  )

  if (hasLifeInsuranceData) {
    const { error } = await supabase.from('client_life_insurance').upsert(record, { onConflict: 'client_id' })
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('client_life_insurance').delete().eq('client_id', clientId)
    if (error) throw new Error(error.message)
  }
}

async function saveHealthPlan(
  supabase: Awaited<ReturnType<typeof createSupabaseClient>>,
  agencyId: string,
  clientId: string,
  form: FormData,
  existingMemberCiphertext: string | null = null
) {
  let memberCiphertext = existingMemberCiphertext
  if (checked(form, 'clear_health_member_id')) memberCiphertext = null
  else if (value(form, 'health_member_id')) memberCiphertext = encryptValue(nullable(form, 'health_member_id'))

  const record = {
    agency_id: agencyId,
    client_id: clientId,
    company_name: resolvedHealthCompany(form),
    member_id_ciphertext: memberCiphertext,
    plan_id: nullable(form, 'health_plan_id'),
    effective_date: normalizedDate(form, 'health_effective_date', 'Health effective date')
  }

  const hasData = Boolean(record.company_name || record.member_id_ciphertext || record.plan_id || record.effective_date)
  if (hasData) {
    const { error } = await supabase.from('client_health_plan_info').upsert(record, { onConflict: 'client_id' })
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('client_health_plan_info').delete().eq('client_id', clientId)
    if (error) throw new Error(error.message)
  }
}

async function saveHospitalIndemnity(
  supabase: Awaited<ReturnType<typeof createSupabaseClient>>,
  agencyId: string,
  clientId: string,
  form: FormData
) {
  const record = {
    agency_id: agencyId,
    client_id: clientId,
    company_name: nullable(form, 'hospital_indemnity_company'),
    premium_amount: optionalMoney(form, 'hospital_indemnity_premium'),
    effective_date: normalizedDate(form, 'hospital_indemnity_effective_date', 'Hospital Indemnity effective date')
  }
  const hasData = Boolean(record.company_name || record.premium_amount !== null || record.effective_date)
  if (hasData) {
    const { error } = await supabase.from('client_hospital_indemnity').upsert(record, { onConflict: 'client_id' })
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('client_hospital_indemnity').delete().eq('client_id', clientId)
    if (error) throw new Error(error.message)
  }
}

async function saveBankingInfo(
  supabase: Awaited<ReturnType<typeof createSupabaseClient>>,
  agencyId: string,
  clientId: string,
  form: FormData,
  existing: { routing_number_ciphertext?: string | null; account_number_ciphertext?: string | null; debit_card_number_ciphertext?: string | null } | null = null
) {
  let routingCiphertext = existing?.routing_number_ciphertext || null
  let accountCiphertext = existing?.account_number_ciphertext || null
  let debitCardCiphertext = existing?.debit_card_number_ciphertext || null

  if (checked(form, 'clear_bank_routing_number')) routingCiphertext = null
  else if (value(form, 'bank_routing_number')) routingCiphertext = encryptValue(nullable(form, 'bank_routing_number'))

  if (checked(form, 'clear_bank_account_number')) accountCiphertext = null
  else if (value(form, 'bank_account_number')) accountCiphertext = encryptValue(nullable(form, 'bank_account_number'))

  if (checked(form, 'clear_bank_debit_card_number')) debitCardCiphertext = null
  else if (value(form, 'bank_debit_card_number')) debitCardCiphertext = encryptValue(nullable(form, 'bank_debit_card_number'))

  const record = {
    agency_id: agencyId,
    client_id: clientId,
    bank_name: nullable(form, 'bank_name'),
    routing_number_ciphertext: routingCiphertext,
    account_number_ciphertext: accountCiphertext,
    debit_card_number_ciphertext: debitCardCiphertext,
    debit_card_expiration: nullable(form, 'bank_debit_card_expiration')
  }

  const hasData = Boolean(record.bank_name || record.routing_number_ciphertext || record.account_number_ciphertext || record.debit_card_number_ciphertext || record.debit_card_expiration)
  if (hasData) {
    const { error } = await supabase.from('client_banking_info').upsert(record, { onConflict: 'client_id' })
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('client_banking_info').delete().eq('client_id', clientId)
    if (error) throw new Error(error.message)
  }
}

async function createClientRecord(form: FormData) {
  const { supabase, userId, profile } = await getProfile()

  const firstName = value(form, 'first_name')
  const lastName = value(form, 'last_name')
  if (!firstName || !lastName) throw new Error('First and last name are required.')

  let assignedAgentId = userId
  if (profile.role === 'admin' || profile.role === 'manager') {
    const requestedAgentId = value(form, 'assigned_agent_id')
    if (!requestedAgentId) throw new Error('Select an agent for this client.')

    const { data: targetAgent, error: targetAgentError } = await supabase
      .from('profiles')
      .select('id, role, active')
      .eq('id', requestedAgentId)
      .eq('agency_id', profile.agency_id)
      .eq('active', true)
      .in('role', ['admin', 'agent'])
      .maybeSingle()

    if (targetAgentError || !targetAgent) {
      throw new Error('The selected agent is not an active agent in your agency.')
    }
    assignedAgentId = targetAgent.id
  }

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .insert({
      agency_id: profile.agency_id,
      assigned_agent_id: assignedAgentId,
      first_name: firstName,
      last_name: lastName,
      date_of_birth: normalizedDateOfBirth(form),
      height_inches: clientHeightInches(form),
      weight_lbs: clientWeightLbs(form),
      gender: nullable(form, 'gender'),
      email: nullable(form, 'email'),
      phone: nullable(form, 'phone'),
      address_line1: nullable(form, 'address_line1'),
      city: nullable(form, 'city'),
      state: nullable(form, 'state'),
      zip_code: nullable(form, 'zip_code'),
      county: nullable(form, 'county'),
      ssn_ciphertext: encryptValue(nullable(form, 'ssn')),
      drivers_license_ciphertext: encryptValue(nullable(form, 'drivers_license')),
      drivers_license_state: nullable(form, 'drivers_license_state'),
      drivers_license_expiration: normalizedDate(form, 'drivers_license_expiration', "driver's license expiration date"),
      is_veteran: optionalYesNo(form, 'is_veteran'),
      is_smoker: optionalYesNo(form, 'is_smoker'),
      is_medicare: checked(form, 'is_medicare'),
      is_life: checked(form, 'is_life'),
      is_retirement: checked(form, 'is_retirement'),
      notes: nullable(form, 'notes')
    })
    .select('id')
    .single()

  if (clientError || !client) throw new Error(clientError?.message || 'Unable to save client.')

  const hasMedicareData = checked(form, 'is_medicare') || value(form, 'medicare_number') || value(form, 'part_a_date') || value(form, 'part_b_date') || value(form, 'medicaid_number') || value(form, 'medicaid_level')
  const saveMedicare = async () => {
    if (!hasMedicareData) return
    const { error: medicareError } = await supabase.from('medicare_info').insert({
      agency_id: profile.agency_id,
      client_id: client.id,
      medicare_number_ciphertext: encryptValue(nullable(form, 'medicare_number')),
      part_a_date: normalizedDate(form, 'part_a_date', 'Medicare Part A date'),
      part_b_date: normalizedDate(form, 'part_b_date', 'Medicare Part B date'),
      medicaid_number_ciphertext: encryptValue(nullable(form, 'medicaid_number')),
      medicaid_level: nullable(form, 'medicaid_level')
    })
    if (medicareError) throw new Error(medicareError.message)
  }

  await Promise.all([
    saveMedicare(),
    saveDoctorsAndMedications(supabase, profile.agency_id, client.id, form),
    saveLifeInsurance(supabase, profile.agency_id, client.id, form),
    saveHealthPlan(supabase, profile.agency_id, client.id, form),
    saveHospitalIndemnity(supabase, profile.agency_id, client.id, form),
    saveBankingInfo(supabase, profile.agency_id, client.id, form)
  ])

  await supabase.from('audit_log').insert({
    agency_id: profile.agency_id,
    actor_id: userId,
    client_id: client.id,
    action: 'client.created',
    details: { source: 'crm', assigned_agent_id: assignedAgentId }
  })

  return client.id as string
}

export async function createClient(form: FormData) {
  const clientId = await createClientRecord(form)
  redirect(`/clients/${clientId}?created=1`)
}

export async function createClientIntake(form: FormData): Promise<{ clientId: string | null; error: string | null }> {
  try {
    const clientId = await createClientRecord(form)
    return { clientId, error: null }
  } catch (error) {
    return { clientId: null, error: error instanceof Error ? error.message : 'Unable to save client.' }
  }
}

export async function saveImportedLifeInsurance(
  clientId: string,
  input: {
    company_name?: string
    face_amount?: string
    premium_amount?: string
    policy_type?: string
    effective_date?: string
  }
): Promise<{ error: string | null }> {
  try {
    const { supabase, profile } = await getProfile()

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, agency_id')
      .eq('id', clientId)
      .eq('agency_id', profile.agency_id)
      .maybeSingle()

    if (clientError || !client) throw new Error('Client could not be loaded or you do not have permission to edit it.')

    const moneyValue = (raw?: string) => {
      const cleaned = String(raw || '').replace(/[$,\s]/g, '').trim()
      if (!cleaned) return null
      const number = Number(cleaned)
      if (!Number.isFinite(number) || number < 0) throw new Error('Enter a valid non-negative dollar amount.')
      return number
    }

    const policyRaw = String(input.policy_type || '').trim()
    let policyType: 'Term' | 'Whole Life' | 'IUL' | null = null
    if (/^Term$/i.test(policyRaw) || /Term Life/i.test(policyRaw)) policyType = 'Term'
    else if (/^IUL$/i.test(policyRaw) || /Indexed Universal Life/i.test(policyRaw)) policyType = 'IUL'
    else if (/^Whole Life$/i.test(policyRaw) || /Senior Choice/i.test(policyRaw) || /Final Expense/i.test(policyRaw) || /Whole Life/i.test(policyRaw)) policyType = 'Whole Life'

    const dateForm = new FormData()
    if (String(input.effective_date || '').trim()) dateForm.set('life_effective_date', String(input.effective_date).trim())

    const record = {
      agency_id: profile.agency_id,
      client_id: clientId,
      company_name: String(input.company_name || '').trim() || null,
      face_amount: moneyValue(input.face_amount),
      premium_amount: moneyValue(input.premium_amount),
      policy_type: policyType,
      effective_date: normalizedDate(dateForm, 'life_effective_date', 'Life effective date')
    }

    const { error } = await supabase
      .from('client_life_insurance')
      .upsert(record, { onConflict: 'client_id' })

    if (error) throw new Error(error.message)

    // Keep the client's Life flag in sync with the explicitly imported policy record.
    await supabase.from('clients').update({ is_life: true }).eq('id', clientId).eq('agency_id', profile.agency_id)

    return { error: null }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to save imported life insurance information.' }
  }
}

export async function updateClient(form: FormData) {
  const { supabase, userId, profile } = await getProfile()
  const clientId = value(form, 'client_id')
  if (!clientId) throw new Error('Client ID is missing.')

  const firstName = value(form, 'first_name')
  const lastName = value(form, 'last_name')
  if (!firstName || !lastName) throw new Error('First and last name are required.')

  const { data: currentClient, error: currentError } = await supabase
    .from('clients')
    .select('id, ssn_ciphertext, drivers_license_ciphertext, assigned_agent_id')
    .eq('id', clientId)
    .single()

  if (currentError || !currentClient) throw new Error('Client could not be loaded or you do not have permission to edit it.')

  let ssnCiphertext = currentClient.ssn_ciphertext
  if (checked(form, 'clear_ssn')) ssnCiphertext = null
  else if (value(form, 'ssn')) ssnCiphertext = encryptValue(nullable(form, 'ssn'))

  let dlCiphertext = currentClient.drivers_license_ciphertext
  if (checked(form, 'clear_drivers_license')) dlCiphertext = null
  else if (value(form, 'drivers_license')) dlCiphertext = encryptValue(nullable(form, 'drivers_license'))

  const clientUpdates: Record<string, unknown> = {
    first_name: firstName,
    last_name: lastName,
    date_of_birth: normalizedDateOfBirth(form),
    height_inches: clientHeightInches(form),
    weight_lbs: clientWeightLbs(form),
    gender: nullable(form, 'gender'),
    email: nullable(form, 'email'),
    phone: nullable(form, 'phone'),
    address_line1: nullable(form, 'address_line1'),
    city: nullable(form, 'city'),
    state: nullable(form, 'state'),
    zip_code: nullable(form, 'zip_code'),
    county: nullable(form, 'county'),
    ssn_ciphertext: ssnCiphertext,
    drivers_license_ciphertext: dlCiphertext,
    drivers_license_state: nullable(form, 'drivers_license_state'),
    drivers_license_expiration: normalizedDate(form, 'drivers_license_expiration', "driver's license expiration date"),
    is_veteran: optionalYesNo(form, 'is_veteran'),
    is_smoker: optionalYesNo(form, 'is_smoker'),
    is_medicare: checked(form, 'is_medicare'),
    is_life: checked(form, 'is_life'),
    is_retirement: checked(form, 'is_retirement'),
    notes: nullable(form, 'notes')
  }

  if (profile.role === 'admin' || profile.role === 'manager') {
    clientUpdates.assigned_agent_id = nullable(form, 'assigned_agent_id') || currentClient.assigned_agent_id
  }

  const { error: updateError } = await supabase
    .from('clients')
    .update(clientUpdates)
    .eq('id', clientId)

  if (updateError) throw new Error(updateError.message)

  const [
    { data: currentMedicare },
    { data: currentHealthPlan },
    { data: currentBanking }
  ] = await Promise.all([
    supabase
      .from('medicare_info')
      .select('id, medicare_number_ciphertext, medicaid_number_ciphertext')
      .eq('client_id', clientId)
      .maybeSingle(),
    supabase
      .from('client_health_plan_info')
      .select('member_id_ciphertext')
      .eq('client_id', clientId)
      .maybeSingle(),
    supabase
      .from('client_banking_info')
      .select('routing_number_ciphertext, account_number_ciphertext, debit_card_number_ciphertext')
      .eq('client_id', clientId)
      .maybeSingle()
  ])

  let medicareCiphertext = currentMedicare?.medicare_number_ciphertext || null
  if (checked(form, 'clear_medicare_number')) medicareCiphertext = null
  else if (value(form, 'medicare_number')) medicareCiphertext = encryptValue(nullable(form, 'medicare_number'))

  let medicaidCiphertext = currentMedicare?.medicaid_number_ciphertext || null
  if (checked(form, 'clear_medicaid_number')) medicaidCiphertext = null
  else if (value(form, 'medicaid_number')) medicaidCiphertext = encryptValue(nullable(form, 'medicaid_number'))

  const hasMedicareData = checked(form, 'is_medicare') || medicareCiphertext || medicaidCiphertext || value(form, 'part_a_date') || value(form, 'part_b_date') || value(form, 'medicaid_level')

  const saveMedicare = async () => {
    if (currentMedicare) {
      const { error: medicareError } = await supabase
        .from('medicare_info')
        .update({
          medicare_number_ciphertext: medicareCiphertext,
          part_a_date: normalizedDate(form, 'part_a_date', 'Medicare Part A date'),
          part_b_date: normalizedDate(form, 'part_b_date', 'Medicare Part B date'),
          medicaid_number_ciphertext: medicaidCiphertext,
          medicaid_level: nullable(form, 'medicaid_level')
        })
        .eq('client_id', clientId)
      if (medicareError) throw new Error(medicareError.message)
      return
    }

    if (hasMedicareData) {
      const { error: medicareError } = await supabase.from('medicare_info').insert({
        agency_id: profile.agency_id,
        client_id: clientId,
        medicare_number_ciphertext: medicareCiphertext,
        part_a_date: normalizedDate(form, 'part_a_date', 'Medicare Part A date'),
        part_b_date: normalizedDate(form, 'part_b_date', 'Medicare Part B date'),
        medicaid_number_ciphertext: medicaidCiphertext,
        medicaid_level: nullable(form, 'medicaid_level')
      })
      if (medicareError) throw new Error(medicareError.message)
    }
  }

  await Promise.all([
    saveMedicare(),
    saveDoctorsAndMedications(supabase, profile.agency_id, clientId, form),
    saveLifeInsurance(supabase, profile.agency_id, clientId, form),
    saveHealthPlan(supabase, profile.agency_id, clientId, form, currentHealthPlan?.member_id_ciphertext || null),
    saveHospitalIndemnity(supabase, profile.agency_id, clientId, form),
    saveBankingInfo(supabase, profile.agency_id, clientId, form, currentBanking || null)
  ])

  await supabase.from('audit_log').insert({
    agency_id: profile.agency_id,
    actor_id: userId,
    client_id: clientId,
    action: 'client.updated',
    details: { source: 'crm' }
  })

  redirect(`/clients/${clientId}?updated=1`)
}
