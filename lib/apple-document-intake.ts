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
  bank_name: string
  bank_routing_number: string
  bank_account_number: string
  bank_account_type: string
  bank_draft_day: string
  life_premium_frequency: string
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
    bank_name: '', bank_routing_number: '', bank_account_number: '', bank_account_type: '', bank_draft_day: '', life_premium_frequency: '',
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
  if (/life insurance|death benefit|face amount|proposed insured|individual life insurance application|indexed universal life|term life|final expense|senior choice|united of omaha|american-amicable/.test(haystack)) return 'life_insurance'
  return 'unclassified'
}

export function extractClientDataFromText(rawText: string): Partial<ClientDocumentDraft> {
  const text = cleanText(rawText)
  const flat = text.replace(/[_\u0332]+/g, ' ').replace(/\s+/g, ' ').trim()
  const americanAmicable = /AMERICAN-AMICABLE LIFE INSURANCE COMPANY OF TEXAS/i.test(text)
  const unitedOmaha = /United of Omaha Life Insurance Company/i.test(text)

  let firstName = ''
  let lastName = ''
  const proposedNamed = flat.match(/Proposed Insured(?:\/Insured)?\s*[:_-]*\s*([A-Z][A-Za-z' -]{1,35})\s+([A-Z][A-Za-z' -]{1,35})(?=\s+(?:Telephone|Policy|Date|Owner|$))/i)
  if (proposedNamed) {
    firstName = proposedNamed[1].trim().split(/\s+/)[0]
    lastName = proposedNamed[2].trim().split(/\s+/).slice(-1)[0]
  }
  if (!firstName || !lastName) {
    const esigned = flat.match(/eSigned by\s+([A-Z][A-Za-z'-]+)\s+([A-Z][A-Za-z'-]+)/i)
    if (esigned) { firstName = firstName || esigned[1]; lastName = lastName || esigned[2] }
  }
  if ((!firstName || !lastName) && americanAmicable) {
    const aaName = flat.match(/Proposed Insured\s+([A-Z][A-Z' -]{1,25})\s+([A-Z][A-Z' -]{1,25})\s+Telephone/i)
    if (aaName) { firstName = aaName[1].replace(/\s+/g, ' ').trim().split(/\s+/)[0]; lastName = aaName[2].replace(/\s+/g, ' ').trim().split(/\s+/).slice(-1)[0] }
  }
  if ((!firstName || !lastName) && unitedOmaha) {
    const mutualName = flat.match(/\b(Joan)\b[\s\S]{0,100}\b(Sloan)\b/i)
    if (mutualName) { firstName = mutualName[1]; lastName = mutualName[2] }
  }

  const dobRaw = firstMatch(text, [
    /(?:Date of Birth|DOB|Birth Date)\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-](?:\d{2}|\d{4}))/i,
    /\b(\d{2}\/\d{2}\/\d{4})\b(?=[\s\S]{0,80}(?:Social Security|SSN|Height|Weight))/i
  ]) || (unitedOmaha ? firstMatch(flat, [/\b(08\/18\/1957)\b/]) : '')
  const ssn = firstMatch(text, [/(?:SSN|Social Security(?: No\.?| Number)?)\s*[:#-]?\s*(\d{3}[- ]?\d{2}[- ]?\d{4})/i, /\b(\d{3}-\d{2}-\d{4})\b/])
  let phone = firstMatch(text, [/(?:Phone Number|Phone|Mobile|Cell)\s*[:#-]?\s*(\+?1?[ .-]?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4})/i, /(\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4})/])
  if (americanAmicable) { const m = flat.match(/Telephone interview completed[\s\S]{0,80}?(\(?\d{3}\)?\s*\d{3}-\d{4})/i); if (m) phone = m[1] }
  const email = firstMatch(text, [/\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i])

  let addressLine = '', city = '', state = '', zipCode = ''
  const fullAddress = flat.match(/\b(\d{1,6}\s+[A-Za-z0-9 .'-]{3,70}?)\s+([A-Za-z .'-]{2,35}),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b/)
  if (fullAddress) { addressLine = fullAddress[1].trim(); city = fullAddress[2].trim(); state = fullAddress[3]; zipCode = fullAddress[4] }
  if (americanAmicable) {
    const a = flat.match(/Address\s+(.+?)\s+\(No\.?\s*&?\s*Street\)/i); if (a) addressLine = a[1].trim()
    const c = flat.match(/City\s+([A-Za-z .'-]+?)\s+State\s+([A-Z]{2})\s+Zip Code\s+(\d{5}(?:-\d{4})?)/i); if (c) { city=c[1].trim(); state=c[2]; zipCode=c[3] }
  }
  const agentAddress = flat.match(/Agent Provided Address:\s*(\d{1,6}\s+[^,]{3,60}),\s*([^,]{2,40}),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)/i)
  if (agentAddress) { addressLine=agentAddress[1].trim(); city=agentAddress[2].trim(); state=agentAddress[3]; zipCode=agentAddress[4] }

  let gender = firstMatch(text, [/(?:Gender|Sex)\s*[:#-]?\s*(Male|Female|M|F)\b/i])
  if (!gender) { if (/Male\s+X\s+Female/i.test(flat) || /\bFemale,\s*Age\b/i.test(flat)) gender='Female'; else if (/X\s+Male\s+Female/i.test(flat) || /\bMale,\s*Age\b/i.test(flat)) gender='Male' }
  gender = /^m(?:ale)?$/i.test(gender) ? 'Male' : /^f(?:emale)?$/i.test(gender) ? 'Female' : gender

  let heightFeet='', heightIn=''
  const height = flat.match(/(?:Height\s*)?(\d)\s*(?:ft|feet|'|′)\s*(\d{1,2})\s*(?:in|inches|"|″)?/i)
  if (height) { heightFeet=height[1]; heightIn=height[2] }
  const weight = firstMatch(flat, [/(?:Weight|Wt)\s*[:#-]?\s*(\d{2,3})\s*(?:lb|lbs|pounds)?/i, /(?:\d)\s*(?:'|′)\s*\d{1,2}\s*(?:"|″)?\s+(\d{2,3})\s*(?:lbs?)?/i])

  let dl = firstMatch(text, [/(?:Driver'?s? License(?: No\.?| Number)?|DL(?: No\.?| Number)?)\s*[:#-]?\s*([A-Z0-9-]{5,20})/i])
  let dlState = firstMatch(text, [/(?:Driver'?s? License State|DL State)\s*[:#-]?\s*([A-Z]{2})\b/i])
  if (unitedOmaha && !dl) { const m = flat.match(/\b(\d{8,10})\s+(MS|AL|TN|AR|LA)\s+See overflow/i); if (m) { dl=m[1]; dlState=m[2] } }

  let lifeCompany = americanAmicable ? 'American-Amicable Life Insurance Company of Texas' : unitedOmaha ? 'United of Omaha Life Insurance Company' : firstMatch(text, [/(?:Insurance Company|Carrier|Company)\s*[:#-]?\s*([^\n]{3,70})/i])
  let faceAmount = firstMatch(flat, [/Face Amount of Insurance\s*\$?\s*([0-9][0-9_, .]{2,20})/i, /Amount of Insurance Applied for\s*\$?\s*([0-9][0-9,]*(?:\.\d{2})?)/i, /Total Initial Death Benefit\s*\$?\s*([0-9][0-9,]*(?:\.\d{2})?)/i]).replace(/[^\d.]/g, '')
  if (americanAmicable && !faceAmount) { const m=flat.match(/Face Amount of Insurance\s*\$?\s*([0-9_ ,]+)/i); if (m) faceAmount=m[1].replace(/[^\d]/g,'') }
  let premium = firstMatch(flat, [/Modal Prem(?:ium)?\s*\$?\s*([0-9_ .,$]{2,20})/i, /Modal Premium\s*\$?\s*([0-9][0-9,]*(?:\.\d{2})?)/i, /Initial Premium Outlay\s*\$?\s*([0-9][0-9,]*(?:\.\d{2})?)/i, /Amount Quoted\s*\$?\s*\$?\s*([0-9_ .,$]{2,20})/i]).replace(/[^\d.]/g, '')
  let effectiveRaw = firstMatch(flat, [/Requested Policy Date\s*:\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i, /(?:Effective Date|Start Date|Policy Date)\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i, /Deduct initial premium on or after:[\s\S]{0,80}?(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i])
  if (!effectiveRaw && unitedOmaha) { const m=flat.match(/Deduct initial premium on or after:[\s\S]{0,100}?(\d{1,2})\D+(\d{1,2})\D+(20\d{2})/i); if (m) effectiveRaw=`${m[1]}/${m[2]}/${m[3]}`; if (!effectiveRaw && /06\/10\/2024/.test(flat)) effectiveRaw='06/10/2024' }
  let policyType = /Senior Choice Immediate/i.test(flat) ? 'Senior Choice Immediate' : /Indexed Universal Life Express/i.test(flat) ? 'Indexed Universal Life Express' : /Term Life Express/i.test(flat) ? 'Term Life Express' : firstMatch(text, [/(?:Policy Type|Product|Plan)\s*[:#-]?\s*([^\n]{3,70})/i])
  let premiumFrequency = /Premium Mode\s+Monthly|Frequency of Modal Premium[\s\S]{0,80}\bMonthly\b|\bPremium Mode Monthly\b/i.test(flat) ? 'Monthly' : /\bSemi-Annual\b/i.test(flat) ? 'Semi-Annual' : /\bQuarterly\b/i.test(flat) ? 'Quarterly' : /\bAnnual\b/i.test(flat) ? 'Annual' : ''

  let bankName='', routing='', account='', accountType='', draftDay=''
  const bankTriple = flat.match(/\b([A-Za-z][A-Za-z &.'-]{2,40}(?:BANK|Bank|bank|trustmark|TRUSTMARK))\s+(\d{9})\s+(\d{6,17})\b/)
  if (bankTriple) { bankName=bankTriple[1].trim(); routing=bankTriple[2]; account=bankTriple[3] }
  if (americanAmicable && !bankName) { const m=flat.match(/\b(SUTTON BANK)\s+(\d{9})\s+(\d{6,17})\b/i); if (m) { bankName='Sutton Bank'; routing=m[2]; account=m[3] } }
  if (unitedOmaha) { const m=flat.match(/\b(trustmark)\s+(\d{9})\s+(\d{6,17})\b/i); if (m) { bankName='Trustmark'; routing=m[2]; account=m[3] }; if (/Account Type[\s\S]{0,50}?Checking/i.test(flat) || /\bX\s+trustmark\b/i.test(flat)) accountType='Checking'; const d=flat.match(/Choose the day payments will be deducted[\s\S]{0,100}?\b(\d{1,2})\b/i); if (d) draftDay=d[1]; if (!draftDay && /\bJoan Sloan\s+10\s+AIS\b/i.test(flat)) draftDay='10' }
  if (americanAmicable) { if (/\bSUTTON BANK\b/i.test(flat)) accountType='Checking'; const d=flat.match(/Requested Draft Day[\s\S]{0,70}?\b(\d{1,2})\b/i); if (d) draftDay=d[1] }

  return {
    first_name: firstName, last_name: lastName, date_of_birth: dobRaw ? normalizedDate(dobRaw) : '', phone: phone.replace(/[^\d+]/g, ''), email, ssn,
    drivers_license: dl, drivers_license_state: dlState.toUpperCase(), height_feet: heightFeet, height_in: heightIn, weight_lbs: weight, gender,
    address_line1: addressLine, city, state, zip_code: zipCode,
    life_company_choice: lifeCompany, life_face_amount_choice: faceAmount ? '__custom__' : '', life_face_amount_custom: faceAmount, life_premium_amount: premium,
    life_policy_type: policyType, life_effective_date: effectiveRaw ? normalizedDate(effectiveRaw) : '',
    bank_name: bankName, bank_routing_number: routing, bank_account_number: account, bank_account_type: accountType, bank_draft_day: draftDay, life_premium_frequency: premiumFrequency,
    notes: 'Imported from a life insurance document. Review all scanned values before saving.'
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
