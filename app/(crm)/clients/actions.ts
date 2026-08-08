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

function checked(form: FormData, key: string) {
  return form.get(key) === 'on'
}

function optionalMoney(form: FormData, key: string) {
  const raw = value(form, key).replace(/[$,]/g, '')
  if (!raw) return null
  const number = Number(raw)
  if (!Number.isFinite(number) || number < 0) throw new Error('Enter a valid non-negative dollar amount.')
  return number
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
    policy_type: nullable(form, 'life_policy_type'),
    effective_date: nullable(form, 'life_effective_date')
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
      date_of_birth: nullable(form, 'date_of_birth'),
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
      drivers_license_expiration: nullable(form, 'drivers_license_expiration'),
      is_medicare: checked(form, 'is_medicare'),
      is_life: checked(form, 'is_life'),
      is_retirement: checked(form, 'is_retirement'),
      notes: nullable(form, 'notes')
    })
    .select('id')
    .single()

  if (clientError || !client) throw new Error(clientError?.message || 'Unable to save client.')

  const hasMedicareData = checked(form, 'is_medicare') || value(form, 'medicare_number') || value(form, 'part_a_date') || value(form, 'part_b_date') || value(form, 'medicaid_number') || value(form, 'medicaid_level')
  if (hasMedicareData) {
    const { error: medicareError } = await supabase.from('medicare_info').insert({
      agency_id: profile.agency_id,
      client_id: client.id,
      medicare_number_ciphertext: encryptValue(nullable(form, 'medicare_number')),
      part_a_date: nullable(form, 'part_a_date'),
      part_b_date: nullable(form, 'part_b_date'),
      medicaid_number_ciphertext: encryptValue(nullable(form, 'medicaid_number')),
      medicaid_level: nullable(form, 'medicaid_level')
    })
    if (medicareError) throw new Error(medicareError.message)
  }

  await saveDoctorsAndMedications(supabase, profile.agency_id, client.id, form)
  await saveLifeInsurance(supabase, profile.agency_id, client.id, form)

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
    date_of_birth: nullable(form, 'date_of_birth'),
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
    drivers_license_expiration: nullable(form, 'drivers_license_expiration'),
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

  const { data: currentMedicare } = await supabase
    .from('medicare_info')
    .select('id, medicare_number_ciphertext, medicaid_number_ciphertext')
    .eq('client_id', clientId)
    .maybeSingle()

  let medicareCiphertext = currentMedicare?.medicare_number_ciphertext || null
  if (checked(form, 'clear_medicare_number')) medicareCiphertext = null
  else if (value(form, 'medicare_number')) medicareCiphertext = encryptValue(nullable(form, 'medicare_number'))

  let medicaidCiphertext = currentMedicare?.medicaid_number_ciphertext || null
  if (checked(form, 'clear_medicaid_number')) medicaidCiphertext = null
  else if (value(form, 'medicaid_number')) medicaidCiphertext = encryptValue(nullable(form, 'medicaid_number'))

  const hasMedicareData = checked(form, 'is_medicare') || medicareCiphertext || medicaidCiphertext || value(form, 'part_a_date') || value(form, 'part_b_date') || value(form, 'medicaid_level')

  if (currentMedicare) {
    const { error: medicareError } = await supabase
      .from('medicare_info')
      .update({
        medicare_number_ciphertext: medicareCiphertext,
        part_a_date: nullable(form, 'part_a_date'),
        part_b_date: nullable(form, 'part_b_date'),
        medicaid_number_ciphertext: medicaidCiphertext,
        medicaid_level: nullable(form, 'medicaid_level')
      })
      .eq('client_id', clientId)
    if (medicareError) throw new Error(medicareError.message)
  } else if (hasMedicareData) {
    const { error: medicareError } = await supabase.from('medicare_info').insert({
      agency_id: profile.agency_id,
      client_id: clientId,
      medicare_number_ciphertext: medicareCiphertext,
      part_a_date: nullable(form, 'part_a_date'),
      part_b_date: nullable(form, 'part_b_date'),
      medicaid_number_ciphertext: medicaidCiphertext,
      medicaid_level: nullable(form, 'medicaid_level')
    })
    if (medicareError) throw new Error(medicareError.message)
  }

  await saveDoctorsAndMedications(supabase, profile.agency_id, clientId, form)
  await saveLifeInsurance(supabase, profile.agency_id, clientId, form)

  await supabase.from('audit_log').insert({
    agency_id: profile.agency_id,
    actor_id: userId,
    client_id: clientId,
    action: 'client.updated',
    details: { source: 'crm' }
  })

  redirect(`/clients/${clientId}?updated=1`)
}
