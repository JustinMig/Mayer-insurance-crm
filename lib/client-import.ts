import type { CsvRow } from './csv'

type Specialist = { slot: number; specialty: string | null; doctor_name: string | null; city: string | null; state: string | null }
type Medication = { medication_name: string; dosage: string | null; times_per_day: string | null; quantity_filled: string | null; refill_count: string | null; sort_order: number }

export type NormalizedImportClient = {
  source_id: string | null
  first_name: string
  last_name: string
  date_of_birth: string | null
  gender: string | null
  email: string | null
  phone: string | null
  address_line1: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  county: string | null
  ssn: string | null
  drivers_license: string | null
  drivers_license_state: string | null
  drivers_license_expiration: string | null
  is_medicare: boolean
  is_life: boolean
  is_retirement: boolean
  is_veteran: boolean | null
  is_smoker: boolean | null
  notes: string | null
  medicare: {
    medicare_number: string | null
    part_a_date: string | null
    part_b_date: string | null
    medicaid_number: string | null
    medicaid_level: string | null
  } | null
  care: {
    primary_doctor_name: string | null
    primary_doctor_city: string | null
    primary_doctor_state: string | null
    pharmacy_name: string | null
    pharmacy_city: string | null
    pharmacy_state: string | null
  } | null
  specialists: Specialist[]
  medications: Medication[]
  life: {
    company_name: string | null
    face_amount: number | null
    premium_amount: number | null
    policy_type: 'Term' | 'Whole Life' | 'IUL' | null
    effective_date: string | null
  } | null
  health: {
    company_name: string | null
    member_id: string | null
    plan_id: string | null
    effective_date: string | null
  } | null
  hospital: {
    company_name: string | null
    premium_amount: number | null
    effective_date: string | null
  } | null
  banking: {
    bank_name: string | null
    routing_number: string | null
    account_number: string | null
    debit_card_number: string | null
    debit_card_expiration: string | null
  } | null
  skipped_sensitive_fields: string[]
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Only columns that map to fields currently available on the Mayer CRM client intake form
// are sent to the import API. Legacy-only fields are intentionally ignored rather than
// being copied into Notes or another unrelated field.
const ALLOWED_IMPORT_HEADERS = new Set([
  'mayerinsurancegroupid',
  'firstname', 'lastname', 'dateofbirthdob2', 'dateofbirth', 'dob', 'gender', 'smoking', 'smoker',
  'phone2', 'phone', 'email', 'address2', 'address', 'mailingaddress', 'city', 'state', 'zipcode', 'zip', 'county2', 'county',
  'notesappointmentstodos', 'notes',
  'medicareclient', 'lifeinsuranceclient', 'retirementinformation',
  'ssn2', 'ssn', 'driverslicensenumber2', 'driverslicensenumber', 'expirationdate2', 'driverslicenseexpiration', 'stateissued2', 'driverslicensestate',
  'bankname', 'routing', 'accountnumber', 'debitcardnumber', 'debitcardexpdate',
  'areyouaveteran', 'veteran',
  'medicarenumberredwhitebluecard', 'medicarenumber', 'partaeffectivedate', 'partadate', 'partbeffectivedate', 'partbdate', 'medicaidnumber', 'level', 'medicaidlevel',
  'medicareadvantageplan', 'neweffectivedate', 'planid2', 'memberid2',
  'pcpdoctor', 'primarydoctorname', 'cityd', 'primarydoctorcity', 'stated', 'primarydoctorstate',
  'specialistname', 'specialty', 'citys5', 'states4',
  'specialistname1', 'specialty2', 'citys4', 'states3',
  'specialistname2', 'specialty3', 'citys3', 'states2',
  'specialistname3', 'specialty4', 'citys2', 'states',
  'specialistname4', 'specialty5', 'citys', 'statess',
  'pharmacy12', 'pharmacy1', 'city5', 'state5',
  'medicationslist2', 'medicationslist',
  'hipplancompany2', 'hipstartdate2', 'hipplanprice2',
  'lifecompany', 'faceamount', 'effectivedate', 'premiumamount', 'policytype'
])

const BLOCKED_SENSITIVE_HEADERS = new Set([
  'debitcardcvv',
  'medicaregovlogininfo',
  'registrationinfomedicaregov'
])

export function sanitizeImportRowForTransport(row: CsvRow): CsvRow {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => ALLOWED_IMPORT_HEADERS.has(normalizeHeader(key)))
  )
}

export function restrictedImportFields(row: CsvRow): string[] {
  const names: string[] = []
  for (const [key, value] of Object.entries(row)) {
    if (!String(value ?? '').trim()) continue
    const normalized = normalizeHeader(key)
    if (BLOCKED_SENSITIVE_HEADERS.has(normalized)) names.push(key)
  }
  return names
}

export function looksLikeClientDataHeaders(headers: string[]) {
  const normalized = new Set(headers.map(normalizeHeader))
  const hasFirst = normalized.has('firstname')
  const hasLast = normalized.has('lastname')
  return hasFirst && hasLast
}

export function looksLikeRelatedExportHeaders(headers: string[]) {
  const normalized = new Set(headers.map(normalizeHeader))
  return normalized.has('mayerinsurancegroupid') && !looksLikeClientDataHeaders(headers)
}

function clean(value: unknown): string | null {
  const text = String(value ?? '').trim()
  return text || null
}

function pick(row: CsvRow, ...keys: string[]): string | null {
  for (const key of keys) {
    const direct = clean(row[key])
    if (direct) return direct
    const keyNormalized = normalizeHeader(key)
    const found = Object.keys(row).find((candidate) => normalizeHeader(candidate) === keyNormalized)
    const value = found ? clean(row[found]) : null
    if (value) return value
  }
  return null
}

export function parseImportDate(value: string | null): string | null {
  const raw = clean(value)
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  const match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/)
  if (!match) return null
  let year = Number(match[3])
  if (year < 100) year += year >= 50 ? 1900 : 2000
  const month = Number(match[1])
  const day = Number(match[2])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}


function normalizeMedicaidLevel(value: string | null): string | null {
  const raw = clean(value)
  if (!raw) return null
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (compact === 'QMB') return 'QMB'
  if (compact === 'SLMB') return 'SLMB'
  if (compact === 'QI' || compact === 'QI1') return 'QI'
  if (compact === 'FBDE' || compact === 'FULLBENEFITDUALELIGIBLE') return 'FBDE'
  return 'Other'
}

function yesNo(value: string | null): boolean | null {
  const raw = clean(value)?.toLowerCase()
  if (!raw) return null
  if (['yes', 'y', 'true', '1', 'smoker'].includes(raw)) return true
  if (['no', 'n', 'false', '0', 'non-smoker', 'nonsmoker'].includes(raw)) return false
  return null
}

function money(value: string | null): number | null {
  const raw = clean(value)?.replace(/[$,\s]/g, '')
  if (!raw) return null
  const number = Number(raw)
  return Number.isFinite(number) && number >= 0 ? number : null
}

function policyType(value: string | null): 'Term' | 'Whole Life' | 'IUL' | null {
  const raw = clean(value)?.toLowerCase()
  if (!raw) return null
  if (raw.includes('iul') || raw.includes('indexed universal')) return 'IUL'
  if (raw.includes('whole')) return 'Whole Life'
  if (raw.includes('term')) return 'Term'
  return null
}

function hasAny(values: unknown[]) {
  return values.some((item) => item !== null && item !== '' && item !== false && item !== undefined)
}

function splitMedications(value: string | null): Medication[] {
  const raw = clean(value)
  if (!raw) return []
  return raw
    .split(/\r?\n|;|\|/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 100)
    .map((medication_name, sort_order) => ({ medication_name, dosage: null, times_per_day: null, quantity_filled: null, refill_count: null, sort_order }))
}

export function normalizeImportRow(row: CsvRow): NormalizedImportClient {
  const isLegacyMayerExport = Object.keys(row).some((key) => normalizeHeader(key) === 'mayerinsurancegroupid')
  // Only the old general Notes field is mapped into the current Notes field. Legacy
  // fields that do not have a matching current intake field are deliberately ignored.
  const originalNotes = pick(row, 'NotesAppointmentsToDos', 'Notes', 'notes')

  const primaryPharmacy = pick(row, 'Pharmacy12', 'Pharmacy1')
  const primaryPharmacyCity = primaryPharmacy ? pick(row, 'City5') : null
  const primaryPharmacyState = primaryPharmacy ? pick(row, 'State5') : null

  const specialists: Specialist[] = [
    [1, 'SpecialistName', 'Specialty', 'Citys5', 'States4'],
    [2, 'SpecialistName1', 'Specialty2', 'Citys4', 'States3'],
    [3, 'SpecialistName2', 'Specialty3', 'Citys3', 'States2'],
    [4, 'SpecialistName3', 'Specialty4', 'Citys2', 'States'],
    [5, 'SpecialistName4', 'Specialty5', 'Citys', 'Statess']
  ].map(([slot, doctor, specialty, city, state]) => ({
    slot: Number(slot),
    doctor_name: pick(row, String(doctor)),
    specialty: pick(row, String(specialty)),
    city: pick(row, String(city)),
    state: pick(row, String(state))
  })).filter((item) => hasAny([item.doctor_name, item.specialty, item.city, item.state]))

  const medicareNumber = pick(row, 'MedicareNumberRedWhiteBlueCard', 'MedicareNumber')
  const partADate = parseImportDate(pick(row, 'PartAEffectiveDate', 'PartADate'))
  const partBDate = parseImportDate(pick(row, 'PartBEffectiveDate', 'PartBDate'))
  const medicaidNumber = pick(row, 'MedicaidNumber')
  const medicaidLevel = normalizeMedicaidLevel(pick(row, 'Level', 'MedicaidLevel'))
  const medicare = hasAny([medicareNumber, partADate, partBDate, medicaidNumber, medicaidLevel]) ? {
    medicare_number: medicareNumber,
    part_a_date: partADate,
    part_b_date: partBDate,
    medicaid_number: medicaidNumber,
    medicaid_level: medicaidLevel
  } : null

  const careValues = {
    primary_doctor_name: pick(row, 'PCPDoctor', 'PrimaryDoctorName'),
    primary_doctor_city: pick(row, 'Cityd', 'PrimaryDoctorCity'),
    primary_doctor_state: pick(row, 'Stated', 'PrimaryDoctorState'),
    pharmacy_name: primaryPharmacy,
    pharmacy_city: primaryPharmacyCity,
    pharmacy_state: primaryPharmacyState
  }
  const care = hasAny(Object.values(careValues)) ? careValues : null

  const lifeCompany = pick(row, 'LifeCompany')
  const lifeFace = money(pick(row, 'FaceAmount'))
  const lifePremium = money(pick(row, 'PremiumAmount'))
  const lifePolicyType = policyType(pick(row, 'PolicyType'))
  const lifeEffective = parseImportDate(pick(row, 'EffectiveDate'))
  const life = hasAny([lifeCompany, lifeFace, lifePremium, lifePolicyType, lifeEffective]) ? {
    company_name: lifeCompany,
    face_amount: lifeFace,
    premium_amount: lifePremium,
    policy_type: lifePolicyType,
    effective_date: lifeEffective
  } : null

  const healthCompany = pick(row, 'MedicareAdvantagePlan')
  const healthMember = pick(row, 'MemberId2')
  const healthPlan = pick(row, 'PlanID2')
  const healthEffective = parseImportDate(pick(row, 'NewEffectiveDate'))
  const health = hasAny([healthCompany, healthMember, healthPlan, healthEffective]) ? {
    company_name: healthCompany,
    member_id: healthMember,
    plan_id: healthPlan,
    effective_date: healthEffective
  } : null

  const hospitalCompany = pick(row, 'HipPlanCompany2')
  const hospitalPremium = money(pick(row, 'HipPlanPrice2'))
  const hospitalEffective = parseImportDate(pick(row, 'HipStartDate2'))
  const hospital = hasAny([hospitalCompany, hospitalPremium, hospitalEffective]) ? {
    company_name: hospitalCompany,
    premium_amount: hospitalPremium,
    effective_date: hospitalEffective
  } : null

  const bankName = pick(row, 'BankName')
  const bankRouting = pick(row, 'Routing')
  const bankAccount = pick(row, 'AccountNumber')
  const debitCard = pick(row, 'DebitCardNumber')
  const debitCardExp = pick(row, 'DebitCardExpDate')
  const banking = hasAny([bankName, bankRouting, bankAccount, debitCard, debitCardExp]) ? {
    bank_name: bankName,
    routing_number: bankRouting,
    account_number: bankAccount,
    debit_card_number: debitCard,
    debit_card_expiration: debitCardExp
  } : null

  const retirementInfo = pick(row, 'RetirementInformation')
  const lifeFlag = yesNo(pick(row, 'LifeInsuranceClient')) === true || Boolean(life)
  const medicareFlag = yesNo(pick(row, 'MedicareClient')) === true || Boolean(medicare || health)
  const retirementFlag = yesNo(retirementInfo) === true || Boolean(retirementInfo && !['no', 'none', 'n/a', 'na'].includes(retirementInfo.toLowerCase()))

  return {
    source_id: pick(row, 'MayerInsuranceGroup_Id'),
    first_name: pick(row, 'FirstName', 'First Name', 'first_name') || '',
    last_name: pick(row, 'LastName', 'Last Name', 'last_name') || '',
    date_of_birth: parseImportDate(pick(row, 'DateOfBirthDOB2', 'DateOfBirth', 'DOB', 'date_of_birth')),
    gender: pick(row, 'Gender'),
    email: pick(row, 'Email', 'email'),
    phone: pick(row, 'Phone2', 'Phone', 'phone'),
    address_line1: pick(row, 'Address2', 'Address', 'MailingAddress', 'address_line1'),
    city: pick(row, 'City', 'city'),
    state: pick(row, 'State', 'state'),
    zip_code: pick(row, 'ZipCode', 'Zip', 'ZIP', 'zip_code'),
    county: isLegacyMayerExport ? pick(row, 'County2') : pick(row, 'County', 'county'),
    ssn: pick(row, 'SSN2', 'SSN'),
    drivers_license: pick(row, 'DriversLicenseNumber2', 'DriversLicenseNumber'),
    drivers_license_state: pick(row, 'StateIssued2', 'DriversLicenseState'),
    drivers_license_expiration: parseImportDate(pick(row, 'ExpirationDate2', 'DriversLicenseExpiration')),
    is_medicare: medicareFlag,
    is_life: lifeFlag,
    is_retirement: retirementFlag,
    is_veteran: yesNo(pick(row, 'AreYouAVeteran', 'Veteran')),
    is_smoker: yesNo(pick(row, 'Smoking', 'Smoker')),
    notes: originalNotes,
    medicare,
    care,
    specialists,
    medications: splitMedications(pick(row, 'MedicationsList2', 'MedicationsList')),
    life,
    health,
    hospital,
    banking,
    skipped_sensitive_fields: restrictedImportFields(row)
  }
}

export function importRowSummary(row: CsvRow) {
  const client = normalizeImportRow(row)
  const products = [client.is_life ? 'Life' : '', client.is_medicare ? 'Medicare' : '', client.is_retirement ? 'Retirement' : ''].filter(Boolean)
  return {
    first_name: client.first_name,
    last_name: client.last_name,
    date_of_birth: client.date_of_birth,
    phone: client.phone,
    city: client.city,
    state: client.state,
    county: client.county,
    products: products.join(', '),
    valid: Boolean(client.first_name && client.last_name),
    skipped_sensitive_count: client.skipped_sensitive_fields.length
  }
}

export function normalizedEmail(value: string | null) {
  return (value || '').trim().toLowerCase()
}

export function normalizedPhone(value: string | null) {
  return (value || '').replace(/\D/g, '')
}

export function normalizedName(value: string | null) {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}
