export type DocumentCategory =
  | 'unclassified'
  | 'medicare_document'
  | 'card_information'
  | 'scope_of_appointment'
  | 'medications'
  | 'life_insurance'
  | 'health_plan'
  | 'hospital_indemnity'
  | 'aca'
  | 'dental'
  | 'hearing'
  | 'vision'
  | 'retirement'

export type MedicationDraft = {
  name: string
  dosage: string
  times_per_day: string
  quantity_filled: string
  refill_count: string
}

export type ClientDocumentDraft = {
  first_name: string
  last_name: string
  date_of_birth: string
  height_feet: string
  height_in: string
  weight_lbs: string
  gender: string
  email: string
  phone: string
  address_line1: string
  city: string
  state: string
  zip_code: string
  county: string
  ssn: string
  drivers_license: string
  drivers_license_state: string
  drivers_license_expiration: string
  is_veteran: string
  is_smoker: string
  medicare_number: string
  part_a_date: string
  part_b_date: string
  medicaid_number: string
  medicaid_level: string
  primary_doctor_name: string
  primary_doctor_city: string
  primary_doctor_state: string
  pharmacy_name: string
  pharmacy_city: string
  pharmacy_state: string
  life_company_choice: string
  life_face_amount_choice: string
  life_face_amount_custom: string
  life_premium_amount: string
  life_policy_type: string
  life_effective_date: string
  health_company_choice: string
  health_company_custom: string
  health_member_id: string
  health_plan_id: string
  health_effective_date: string
  hospital_indemnity_company: string
  hospital_indemnity_premium: string
  hospital_indemnity_effective_date: string
  notes: string
  medications: MedicationDraft[]
}

export function emptyClientDocumentDraft(): ClientDocumentDraft {
  return {
    first_name: '', last_name: '', date_of_birth: '', height_feet: '', height_in: '', weight_lbs: '', gender: '', email: '', phone: '',
    address_line1: '', city: '', state: '', zip_code: '', county: '', ssn: '', drivers_license: '', drivers_license_state: '', drivers_license_expiration: '',
    is_veteran: '', is_smoker: '', medicare_number: '', part_a_date: '', part_b_date: '', medicaid_number: '', medicaid_level: '', primary_doctor_name: '',
    primary_doctor_city: '', primary_doctor_state: '', pharmacy_name: '', pharmacy_city: '', pharmacy_state: '', life_company_choice: '', life_face_amount_choice: '',
    life_face_amount_custom: '', life_premium_amount: '', life_policy_type: '', life_effective_date: '', health_company_choice: '', health_company_custom: '',
    health_member_id: '', health_plan_id: '', health_effective_date: '', hospital_indemnity_company: '', hospital_indemnity_premium: '', hospital_indemnity_effective_date: '',
    notes: '', medications: []
  }
}

function cleanText(value: string) {
  return value.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim()
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  return ''
}

function normalizedDate(value: string) {
  const input = value.trim()
  const slash = input.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/)
  if (slash) {
    const year = slash[3].length === 2 ? Number(slash[3]) + (Number(slash[3]) > 40 ? 1900 : 2000) : Number(slash[3])
    return `${String(Number(slash[1])).padStart(2, '0')}/${String(Number(slash[2])).padStart(2, '0')}/${year}`
  }
  const monthNames: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' }
  const word = input.match(/^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(\d{4})$/i)
  if (word) return `${monthNames[word[1].slice(0, 3).toLowerCase()]}/${String(Number(word[2])).padStart(2, '0')}/${word[3]}`
  return input
}

function splitName(value: string) {
  const cleaned = value.replace(/\s+/g, ' ').replace(/[^A-Za-zÀ-ÿ'., -]/g, '').trim()
  if (!cleaned) return { first_name: '', last_name: '' }
  if (cleaned.includes(',')) {
    const [last, first] = cleaned.split(',').map(item => item.trim())
    return { first_name: first?.split(' ')[0] || '', last_name: last || '' }
  }
  const parts = cleaned.split(' ').filter(Boolean)
  if (parts.length < 2) return { first_name: parts[0] || '', last_name: '' }
  return { first_name: parts[0], last_name: parts[parts.length - 1] }
}

function extractMedicationDrafts(text: string): MedicationDraft[] {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
  const results: MedicationDraft[] = []
  const seen = new Set<string>()
  const dosePattern = /\b(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|mL|units?|iu|%|tablet(?:s)?|capsule(?:s)?))\b/i
  const skip = /medicare|medicaid|insurance|member|policy|effective|address|phone|doctor|pharmacy|benefit|coverage|plan id|member id/i

  for (const line of lines) {
    if (line.length > 100 || skip.test(line)) continue
    const dose = line.match(dosePattern)
    if (!dose) continue
    const before = line.slice(0, dose.index).replace(/^[-•*\d. )]+/, '').trim()
    const name = before.split(/\s{2,}|\s+-\s+/)[0].trim()
    if (!name || name.length < 2 || name.length > 45 || /\d/.test(name[0])) continue
    const key = `${name.toLowerCase()}|${dose[1].toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    const times = firstMatch(line, [/(?:take|use)\s+[^\n]*?\b(once|twice|three times|four times|\d+\s*times?)\s+(?:daily|a day|per day)/i, /\b(\d+)\s*x\s*(?:daily|day)/i])
    results.push({ name, dosage: dose[1], times_per_day: times, quantity_filled: '', refill_count: '' })
    if (results.length >= 15) break
  }
  return results
}

export function classifyDocument(fileName: string, text: string): DocumentCategory {
  const haystack = `${fileName}\n${text}`.toLowerCase()
  if (/scope of appointment|soa\b/.test(haystack)) return 'scope_of_appointment'
  if (/hospital indemnity/.test(haystack)) return 'hospital_indemnity'
  if (/dental/.test(haystack)) return 'dental'
  if (/hearing aid|hearing coverage|hearing plan/.test(haystack)) return 'hearing'
  if (/vision plan|vision coverage|eye care/.test(haystack)) return 'vision'
  if (/retirement|annuity|ira\b|401\s*\(?k\)?/.test(haystack)) return 'retirement'
  if (/marketplace|affordable care act|healthcare\.gov|\baca\b/.test(haystack)) return 'aca'
  if (/life insurance|death benefit|face amount|beneficiary/.test(haystack)) return 'life_insurance'
  if (/medication|prescription|rx\b|pharmacy/.test(haystack)) return 'medications'
  if (/hospital indemnity/.test(haystack)) return 'hospital_indemnity'
  if (/member id|group number|plan id|health plan|medical plan/.test(haystack) && !/medicare/.test(haystack)) return 'health_plan'
  if (/medicare health insurance|medicare number|medicare beneficiary|part a|part b|cms/.test(haystack)) {
    if (/medicare health insurance|medicare card|beneficiary identifier|medicare number/.test(haystack)) return 'card_information'
    return 'medicare_document'
  }
  return 'unclassified'
}

export function extractClientDataFromText(rawText: string): Partial<ClientDocumentDraft> {
  const text = cleanText(rawText)
  const nameText = firstMatch(text, [
    /(?:member|beneficiary|patient|insured|client)\s+name\s*[:#-]?\s*([^\n]{4,70})/i,
    /\bname\s*[:#-]\s*([^\n]{4,70})/i,
    /(?:last name\s*[:#-]?\s*([A-Za-z' -]+)\s+(?:first name|first)\s*[:#-]?\s*([A-Za-z' -]+))/i
  ])
  let names = splitName(nameText)
  const reversed = text.match(/last name\s*[:#-]?\s*([A-Za-z' -]+)\s*[\n ]+first name\s*[:#-]?\s*([A-Za-z' -]+)/i)
  if (reversed) names = { first_name: reversed[2].trim().split(' ')[0], last_name: reversed[1].trim().split(' ')[0] }

  const dob = firstMatch(text, [/(?:date of birth|dob|birth date)\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-](?:\d{2}|\d{4}))/i, /(?:date of birth|dob|birth date)\s*[:#-]?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i])
  const phone = firstMatch(text, [/(?:phone|mobile|cell)\s*[:#-]?\s*(\+?1?[ .-]?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4})/i, /(\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4})/])
  const email = firstMatch(text, [/\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i])
  const ssn = firstMatch(text, [/(?:ssn|social security(?: number)?)\s*[:#-]?\s*(\d{3}[- ]?\d{2}[- ]?\d{4})/i])
  const dl = firstMatch(text, [/(?:driver'?s? license|dl(?: number| no\.?)?)\s*[:#-]?\s*([A-Z0-9-]{5,20})/i])
  const dlState = firstMatch(text, [/(?:driver'?s? license state|dl state)\s*[:#-]?\s*([A-Z]{2})\b/i])
  const dlExp = firstMatch(text, [/(?:expiration|expires|exp(?:iration)? date)\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-](?:\d{2}|\d{4}))/i])
  const mbi = firstMatch(text, [/(?:medicare(?: number| no\.?| id)?|mbi|beneficiary identifier)\s*[:#-]?\s*([A-Z0-9 -]{11,17})/i])
    .replace(/[^A-Z0-9]/gi, '').slice(0, 11)
  const partA = firstMatch(text, [/(?:part\s*a(?: effective| coverage)?(?: date)?)\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-](?:\d{2}|\d{4}))/i])
  const partB = firstMatch(text, [/(?:part\s*b(?: effective| coverage)?(?: date)?)\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-](?:\d{2}|\d{4}))/i])
  const medicaid = firstMatch(text, [/(?:medicaid(?: number| no\.?| id)?)\s*[:#-]?\s*([A-Z0-9-]{5,20})/i])
  const medicaidLevel = firstMatch(text, [/\b(QMB|SLMB|QI|FBDE)\b/i]).toUpperCase()
  const height = text.match(/(?:height|ht)\s*[:#-]?\s*(\d)\s*(?:ft|feet|'|′)\s*(\d{1,2})?\s*(?:in|inches|"|″)?/i)
  const weight = firstMatch(text, [/(?:weight|wt)\s*[:#-]?\s*(\d{2,3})\s*(?:lb|lbs|pounds)?/i])
  const gender = firstMatch(text, [/(?:gender|sex)\s*[:#-]?\s*(male|female|m|f)\b/i])
  const address = firstMatch(text, [/(?:address|street address)\s*[:#-]?\s*([^\n]{5,90})/i])
  const cityStateZip = text.match(/\b([A-Za-z .'-]{2,40}),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b/)
  const county = firstMatch(text, [/(?:county)\s*[:#-]?\s*([A-Za-z .'-]{2,40})/i])
  const doctor = firstMatch(text, [/(?:primary care (?:physician|doctor)|primary doctor|pcp)\s*[:#-]?\s*([^\n]{3,70})/i])
  const pharmacy = firstMatch(text, [/(?:preferred pharmacy|pharmacy)\s*[:#-]?\s*([^\n]{3,70})/i])
  const healthMember = firstMatch(text, [/(?:member id|member number|subscriber id)\s*[:#-]?\s*([A-Z0-9-]{4,30})/i])
  const healthPlanId = firstMatch(text, [/(?:plan id|plan number|group number)\s*[:#-]?\s*([A-Z0-9-]{3,30})/i])
  const effective = firstMatch(text, [/(?:effective date|coverage effective)\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-](?:\d{2}|\d{4}))/i])
  const faceAmount = firstMatch(text, [/(?:face amount|death benefit|coverage amount)\s*[:$#-]?\s*\$?([\d,]+(?:\.\d{2})?)/i])
  const premium = firstMatch(text, [/(?:premium(?: amount)?|monthly premium)\s*[:$#-]?\s*\$?([\d,]+(?:\.\d{2})?)/i])
  const policyType = firstMatch(text, [/(?:policy type|product)\s*[:#-]?\s*([^\n]{3,60})/i])
  const lifeCompany = firstMatch(text, [/(?:insurance company|carrier|company)\s*[:#-]?\s*([^\n]{3,60})/i])
  const medications = extractMedicationDrafts(text)

  return {
    ...names,
    date_of_birth: dob ? normalizedDate(dob) : '',
    phone: phone.replace(/[^\d+]/g, ''),
    email,
    ssn,
    drivers_license: dl,
    drivers_license_state: dlState.toUpperCase(),
    drivers_license_expiration: dlExp ? normalizedDate(dlExp) : '',
    medicare_number: mbi,
    part_a_date: partA ? normalizedDate(partA) : '',
    part_b_date: partB ? normalizedDate(partB) : '',
    medicaid_number: medicaid,
    medicaid_level: medicaidLevel,
    height_feet: height?.[1] || '',
    height_in: height?.[2] || '',
    weight_lbs: weight,
    gender: /^m(?:ale)?$/i.test(gender) ? 'Male' : /^f(?:emale)?$/i.test(gender) ? 'Female' : gender,
    address_line1: address,
    city: cityStateZip?.[1]?.trim() || '',
    state: cityStateZip?.[2] || '',
    zip_code: cityStateZip?.[3] || '',
    county,
    primary_doctor_name: doctor,
    pharmacy_name: pharmacy,
    health_member_id: healthMember,
    health_plan_id: healthPlanId,
    health_effective_date: effective ? normalizedDate(effective) : '',
    life_company_choice: lifeCompany,
    life_face_amount_choice: faceAmount ? '__custom__' : '',
    life_face_amount_custom: faceAmount.replace(/,/g, ''),
    life_premium_amount: premium.replace(/,/g, ''),
    life_policy_type: policyType,
    life_effective_date: effective ? normalizedDate(effective) : '',
    hospital_indemnity_premium: premium.replace(/,/g, ''),
    hospital_indemnity_effective_date: effective ? normalizedDate(effective) : '',
    medications
  }
}

export function mergeClientDocumentDraft(base: ClientDocumentDraft, next: Partial<ClientDocumentDraft>): ClientDocumentDraft {
  const merged = { ...base }
  for (const [key, value] of Object.entries(next)) {
    if (key === 'medications') continue
    if (typeof value === 'string' && value.trim() && !(merged as unknown as Record<string, string>)[key]?.trim()) {
      ;(merged as unknown as Record<string, string>)[key] = value.trim()
    }
  }
  const nextMeds = next.medications || []
  if (nextMeds.length) {
    const seen = new Set(merged.medications.map(item => `${item.name}|${item.dosage}`.toLowerCase()))
    merged.medications = [...merged.medications]
    for (const med of nextMeds) {
      const key = `${med.name}|${med.dosage}`.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        merged.medications.push(med)
      }
    }
  }
  return merged
}
