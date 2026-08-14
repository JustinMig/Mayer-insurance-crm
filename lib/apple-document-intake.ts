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
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
  const flat = lines.join(' ')
  const americanAmicable = /AMERICAN-AMICABLE LIFE INSURANCE COMPANY OF TEXAS/i.test(text)
  const unitedOmaha = /United of Omaha Life Insurance Company/i.test(text)

  function section(start: RegExp, end?: RegExp) {
    const startMatch = text.match(start)
    if (!startMatch || startMatch.index == null) return ''
    const from = startMatch.index
    const rest = text.slice(from)
    if (!end) return rest
    const endMatch = rest.match(end)
    return endMatch?.index != null && endMatch.index > 0 ? rest.slice(0, endMatch.index) : rest
  }

  function digits(value: string) { return value.replace(/\D/g, '') }
  function money(value: string) { return value.replace(/[^\d.]/g, '') }
  function allPhones(value: string) {
    return Array.from(value.matchAll(/(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}/g)).map(m => m[0])
  }
  function near(label: RegExp, value: string, radius = 220) {
    const m = value.match(label)
    if (!m || m.index == null) return ''
    return value.slice(Math.max(0, m.index - radius), Math.min(value.length, m.index + m[0].length + radius))
  }
  function nearestNineDigits(label: RegExp, value: string) {
    const window = near(label, value, 180)
    const matches = Array.from(window.matchAll(/\b\d{9}\b/g))
    if (!matches.length) return ''
    const labelMatch = window.match(label)
    const labelIndex = labelMatch?.index ?? Math.floor(window.length / 2)
    matches.sort((a, b) => Math.abs((a.index ?? 0) - labelIndex) - Math.abs((b.index ?? 0) - labelIndex))
    return matches[0][0]
  }
  function nearestAccount(label: RegExp, value: string, exclude = '') {
    const window = near(label, value, 220)
    const matches = Array.from(window.matchAll(/\b\d{6,17}\b/g)).map(m => m[0]).filter(v => v !== exclude && v.length !== 8)
    if (!matches.length) return ''
    const labelMatch = window.match(label)
    const labelIndex = labelMatch?.index ?? Math.floor(window.length / 2)
    const located = Array.from(window.matchAll(/\b\d{6,17}\b/g)).filter(m => matches.includes(m[0]))
    located.sort((a, b) => Math.abs((a.index ?? 0) - labelIndex) - Math.abs((b.index ?? 0) - labelIndex))
    return located[0]?.[0] || ''
  }

  // Only use the Proposed Insured portion for identity/contact fields. This prevents producer/agent data later in a PDF from being imported.
  const proposed = americanAmicable
    ? section(/Proposed Insured/i, /HEALTH INFORMATION/i)
    : unitedOmaha
      ? section(/Proposed Insured/i, /Plan Information/i)
      : section(/Proposed Insured/i, /(?:Plan Information|Policy Information|Beneficiary|Underwriting)/i)
  const proposedFlat = proposed.replace(/\s+/g, ' ')
  const proposedLines = proposed.split('\n').map(line => line.trim()).filter(Boolean)

  let firstName = ''
  let lastName = ''

  // Mutual/United: the filled name and SSN are on the same visual row.
  for (const line of proposedLines) {
    const m = line.match(/^([A-Za-z][A-Za-z'’-]{1,30})\s+([A-Za-z][A-Za-z'’-]{1,30})\s+(\d{3}-\d{2}-\d{4})\b/)
    if (m) { firstName = m[1]; lastName = m[2]; break }
  }

  // American-Amicable: the name is printed immediately above / beside the Proposed Insured line.
  if (!firstName || !lastName) {
    const proposedIndex = lines.findIndex(line => /Proposed Insured/i.test(line))
    const nearby = proposedIndex >= 0 ? lines.slice(Math.max(0, proposedIndex - 3), proposedIndex + 5) : proposedLines.slice(0, 8)
    const blocked = /proposed|insured|first|middle|last|telephone|interview|completed|address|phone|individual|life|insurance|application|male|female|senior|choice|immediate|final|expense/i
    for (const line of nearby) {
      if (blocked.test(line)) continue
      // American-Amicable prints the insured name in all caps immediately above the Proposed Insured label.
      const m = line.match(/^([A-Z][A-Z'’-]{1,30})\s+([A-Z][A-Z'’-]{1,30})(?:\s|$)/)
      if (m) { firstName = m[1][0] + m[1].slice(1).toLowerCase(); lastName = m[2][0] + m[2].slice(1).toLowerCase(); break }
    }
  }

  // Last structured fallback: a two-name row close to SSN/DOB/height in the Proposed Insured section only.
  if (!firstName || !lastName) {
    const m = proposedFlat.match(/\b([A-Z][A-Za-z'’-]{1,30})\s+([A-Z][A-Za-z'’-]{1,30})\s+(?:\d{3}-\d{2}-\d{4}|\d{1,2}\/\d{1,2}\/\d{4})\b/)
    if (m && !/^(Is|The|First|Last|Male|Female)$/i.test(m[1]) && !/^(Is|The|First|Last|Male|Female)$/i.test(m[2])) {
      firstName = m[1]; lastName = m[2]
    }
  }

  // American-Amicable repeats the actual insured name in its bank authorization / receipt pages.
  // This is a safe fallback when PDF text coordinates place the filled name outside the Proposed Insured row.
  if (americanAmicable && (!firstName || !lastName)) {
    const insuredFallback = text.match(/(?:^|\n)\s*Insured[^\n]*\n\s*([A-Z][A-Z'’-]{1,30})\s+([A-Z][A-Z'’-]{1,30})\b/im)
      || text.match(/(?:^|\n)\s*([A-Z][A-Z'’-]{1,30})\s+([A-Z][A-Z'’-]{1,30})\s*\n\s*Received of/im)
      || text.match(/Received of[^\n]*?([A-Z][A-Z'’-]{1,30})\s+([A-Z][A-Z'’-]{1,30})\b/im)
      || text.match(/\bM\d{6,10}\s+([A-Z][A-Z'’-]{1,30})\s+([A-Z][A-Z'’-]{1,30})\b/)
    if (insuredFallback) {
      const formatName = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
      firstName = firstName || formatName(insuredFallback[1])
      lastName = lastName || formatName(insuredFallback[2])
    }
  }

  const dobRaw = firstMatch(proposed, [
    /(?:Date of Birth|DOB|Birth Date)[^\n]*\n?[^\n]*?(\d{1,2}[\/-]\d{1,2}[\/-](?:\d{2}|\d{4}))/i,
    /\b(\d{2}\/\d{2}\/\d{4})\b/
  ])
  const ssn = firstMatch(proposed, [
    /(?:SSN|Social Security(?: No\.?| Number)?)[^\n]*\n?[^\n]*?(\d{3}[- ]?\d{2}[- ]?\d{4})/i,
    /\b(\d{3}-\d{2}-\d{4})\b/
  ])

  // First phone in the Proposed Insured block is the applicant's phone; producer/physician phones occur later and are ignored.
  let phone = ''
  if (unitedOmaha) {
    const w = near(/Phone Number/i, proposed, 240)
    const phones = allPhones(w)
    if (phones.length) phone = phones[0]
  }
  if (!phone && americanAmicable) {
    const w = near(/Telephone interview completed/i, proposed, 260)
    const phones = allPhones(w)
    if (phones.length) phone = phones[0]
  }
  if (!phone) phone = allPhones(proposed)[0] || ''

  // Email must be physically in the Proposed Insured block. If the applicant field is blank, leave it blank rather than grabbing the agent email later in the PDF.
  const email = firstMatch(proposed, [/\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i])

  let addressLine = '', city = '', state = '', zipCode = ''
  if (americanAmicable) {
    const addressWindow = near(/Address \(No\.?\s*&?\s*Street\)/i, proposed, 260)
    const addressMatch = addressWindow.match(/\b(\d{1,6}\s+[A-Za-z0-9 .'-]{3,70}?)(?=\s+(?:Address|City|Phone|State|Zip|$))/i)
    if (addressMatch) addressLine = addressMatch[1].trim()
    const cityMatch = proposedFlat.match(/City\s+([A-Za-z .'-]+?)\s+State\s+([A-Z]{2})\s+Zip Code\s+(\d{5}(?:-\d{4})?)/i)
    if (cityMatch) { city = cityMatch[1].trim(); state = cityMatch[2]; zipCode = cityMatch[3] }
  } else {
    // Filled Mutual/United forms commonly render the full street/city/state/ZIP on one row.
    const m = proposedFlat.match(/\b(\d{1,6}\s+[A-Za-z0-9 .'-]{2,60}?)\s+([A-Za-z .'-]{2,35}),\s*([A-Z]{2})\s+(\d{5})(?:-?(\d{4}))?\b/)
    if (m) { addressLine = m[1].trim(); city = m[2].trim(); state = m[3]; zipCode = m[5] ? `${m[4]}-${m[5]}` : m[4] }
  }
  const agentProvided = text.match(/Agent Provided Address:\s*(\d{1,6}\s+[^,]{3,60}),\s*([^,]{2,40}),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)/i)
  if (agentProvided && americanAmicable) { addressLine = agentProvided[1].trim(); city = agentProvided[2].trim(); state = agentProvided[3]; zipCode = agentProvided[4] }

  let gender = ''
  if (/\bFemale\b/i.test(proposed) && (/\bX\s*(?:Female|Q\s*Female)/i.test(proposed) || /Female,\s*Age/i.test(text))) gender = 'Female'
  if (!gender && /\bMale\b/i.test(proposed) && /\bX\s*(?:Male|Q\s*Male)/i.test(proposed)) gender = 'Male'
  if (!gender && americanAmicable) {
    const sexRow = proposedFlat.match(/Male\s+(?:X\s+)?Female/i)?.[0] || ''
    if (/Male\s+X\s+Female/i.test(sexRow)) gender = 'Female'
  }

  let heightFeet = '', heightIn = '', weight = ''
  const hw = proposedFlat.match(/\b(\d)\s*['′]\s*(\d{1,2})\s*(?:["″])?\s+(\d{2,3})\b/)
  if (hw) { heightFeet = hw[1]; heightIn = hw[2]; weight = hw[3] }
  if (!weight) weight = firstMatch(proposed, [/(?:Weight|Wt)[^\n]*\n?[^\n]*?\b(\d{2,3})\s*(?:lb|lbs|pounds)?\b/i])

  let dl = '', dlState = ''
  const dlHeading = /Driver['’]s License No\.?/i
  const dlWindow = near(dlHeading, proposed, 420)
  if (dlWindow) {
    // Mutual/United layout: the number and state are the first two filled values on the row immediately following the DL headings.
    const rowPair = dlWindow.match(/Driver['’]s License No\.?[^\n]*Driver['’]s License State[^\n]*\n\s*([A-Z0-9-]{5,20})\s+([A-Z]{2})\b/i)
      || dlWindow.match(/\b(\d{7,12})\s+([A-Z]{2})\s+(?:See overflow|[A-Za-z][A-Za-z /-]{2,40})/i)
    if (rowPair) { dl = rowPair[1]; dlState = rowPair[2].toUpperCase() }
  }
  if (!dl) {
    dl = firstMatch(proposed, [
      /(?:Driver['’]s? License(?: No\.?| Number)?|DL(?: No\.?| Number)?)[^\n]*\n\s*([A-Z0-9-]{5,20})\b/i,
      /(?:Driver['’]s? License(?: No\.?| Number)?|DL(?: No\.?| Number)?)[^\n]{0,120}?\b([A-Z0-9-]{5,20})\b/i
    ])
  }
  if (!dlState) {
    dlState = firstMatch(proposed, [
      /Driver['’]s License State[^\n]*\n\s*(?:[A-Z0-9-]{5,20}\s+)?([A-Z]{2})\b/i,
      /Driver['’]s License State[^\n]{0,120}?\b([A-Z]{2})\b/i
    ]).toUpperCase()
  }


  const lifeCompany = americanAmicable
    ? 'American-Amicable Life Insurance Company of Texas'
    : unitedOmaha
      ? 'United of Omaha Life Insurance Company'
      : firstMatch(text, [/(?:Insurance Company|Carrier|Company)\s*[:#-]?\s*([^\n]{3,70})/i])

  let faceAmount = ''
  if (unitedOmaha) {
    const iul = near(/Indexed Universal Life Express Amount of Insurance Applied for/i, text, 220)
    const term = near(/Term Life Express Amount of Insurance Applied for/i, text, 220)
    const candidates = [iul, term].filter(Boolean)
    for (const w of candidates) {
      const amounts = Array.from(w.matchAll(/\$\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,7})(?:\.\d{2})?/g)).map(m => m[1])
      if (amounts.length) { faceAmount = money(amounts[0]); break }
    }
    if (!faceAmount) faceAmount = money(firstMatch(text, [/Total Initial Death Benefit\s*\$\s*([0-9,]+(?:\.\d{2})?)/i]))
  } else if (americanAmicable) {
    const w = near(/Face Amount of Insurance/i, text, 180)
    const amounts = Array.from(w.matchAll(/\b([1-9]\d{3,6})\b/g)).map(m => m[1]).filter(v => !/^20\d{2}$/.test(v))
    if (amounts.length) faceAmount = money(amounts[0])
  }

  let premium = ''
  if (unitedOmaha) {
    const premiumSection = section(/Premium Information/i, /(?:Owner \(|Beneficiary|Underwriting)/i)
    const amounts = Array.from(premiumSection.matchAll(/\$\s*([0-9]{1,5}(?:\.\d{2}))/g)).map(m => m[1])
    if (amounts.length) premium = money(amounts[0])
    if (!premium) {
      const quoted = section(/PAYMENT AUTHORIZATION FORM/i, /Payment Information For Ongoing Payments/i)
      premium = money(firstMatch(quoted, [/Amount Quoted[^\n]*\$?[^\n]*?([0-9]{1,5}\.\d{2})/i, /\$\s*([0-9]{1,5}\.\d{2})/]))
    }
    if (!premium) premium = money(firstMatch(text, [/Initial Premium Outlay\s*\$\s*([0-9,]+\.\d{2})/i]))
  } else {
    const premiumWindow = near(/Modal Prem(?:ium)?/i, text, 220)
    const m = premiumWindow.match(/\$\s*([0-9]{1,5}(?:\.\d{2}))/) || premiumWindow.match(/\b([0-9]{1,5}\.\d{2})\b/)
    if (m) premium = money(m[1])
  }

  let effectiveRaw = firstMatch(text, [
    /Requested Policy Date\s*:\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i,
    /(?:Effective Date|Start Date|Policy Date)\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i
  ])
  if (unitedOmaha) {
    // Mutual/United places the selected date on the next visual row under this label.
    const mutualInitialDate = text.match(/Deduct initial premium on or after:[^\n]*\n\s*(\d{1,2}\/\d{1,2}\/20\d{2})\b/i)
      || text.match(/Deduct initial premium on or after:[\s\S]{0,180}?\b(\d{1,2}\/\d{1,2}\/20\d{2})\b/i)
    if (mutualInitialDate) effectiveRaw = mutualInitialDate[1]
  }

  let policyType = ''
  if (/Senior Choice Immediate/i.test(text)) policyType = 'Senior Choice Immediate'
  else if (/Indexed Universal Life Express/i.test(text)) policyType = 'Indexed Universal Life Express'
  else if (/Term Life Express/i.test(text)) policyType = 'Term Life Express'

  let premiumFrequency = ''
  const premiumInfo = near(/Frequency of Modal Premium/i, text, 250)
  if (/\bX\s*Monthly|Monthly\s*\(Bank Draft Only\)/i.test(premiumInfo) || /Premium Mode\s+Monthly/i.test(text)) premiumFrequency = 'Monthly'
  else if (/\bX\s*Annual/i.test(premiumInfo)) premiumFrequency = 'Annual'
  else if (/\bX\s*Semi-Annual/i.test(premiumInfo)) premiumFrequency = 'Semi-Annual'
  else if (/\bX\s*Quarterly/i.test(premiumInfo)) premiumFrequency = 'Quarterly'

  // Banking uses form-layout-aware rules instead of relying on text-section order.
  // PDF text streams often emit the filled value on a row above or beside its printed label.
  let bankName = '', routing = '', account = '', accountType = '', draftDay = ''

  if (unitedOmaha) {
    const paymentAnchor = text.search(/PAYMENT AUTHORIZATION FORM/i)
    const paymentText = paymentAnchor >= 0 ? text.slice(paymentAnchor, Math.min(text.length, paymentAnchor + 12000)) : text

    // Sample layout: "trustmark" is the filled institution value adjacent to / immediately above the institution label.
    const institution = paymentText.match(/\b([A-Za-z][A-Za-z .&'-]{2,45})\s*\n\s*2\.\s*Name of Financial Institution/i)
      || paymentText.match(/2\.\s*Name of Financial Institution[^\n]*\n\s*([A-Za-z][A-Za-z .&'-]{2,45})\b/i)
      || paymentText.match(/\b(trustmark)\b/i)
    if (institution) bankName = institution[1].replace(/\s+/g, ' ').trim().replace(/\b\w/g, ch => ch.toUpperCase())

    // Mutual sample layout:
    // 065300279
    // Bank Routing Number: _______        8403321436
    //                                  Bank Account Number: _______
    const bankPair = paymentText.match(/\b(\d{9})\b[\s\S]{0,140}?Bank Routing Number[^\n]*?\b(\d{6,17})\b[\s\S]{0,100}?Bank Account Number/i)
      || paymentText.match(/Bank Routing Number[^\n]*\n\s*(\d{9})\b[\s\S]{0,180}?Bank Account Number[^\n]*\n\s*(\d{6,17})\b/i)
    if (bankPair) { routing = bankPair[1]; account = bankPair[2] }

    if (!routing) {
      const routingMatch = paymentText.match(/\b(\d{9})\b\s*\n\s*Bank Routing Number/i)
        || paymentText.match(/Bank Routing Number[\s\S]{0,120}?\b(\d{9})\b/i)
      if (routingMatch) routing = routingMatch[1]
    }
    if (!account) {
      const accountMatch = paymentText.match(/Bank Routing Number[^\n]*?\b\d{9}\b[^\n]*?\b(\d{6,17})\b/i)
        || paymentText.match(/\b(\d{6,17})\b\s*\n\s*Bank Account Number/i)
        || paymentText.match(/Bank Account Number[\s\S]{0,120}?\b(\d{6,17})\b/i)
      if (accountMatch && accountMatch[1] !== routing && accountMatch[1] !== '12345678' && accountMatch[1] !== '123456789') account = accountMatch[1]
    }

    if (/1\.\s*Account Type[^\n]*(?:X|☒)[^\n]*Checking/i.test(paymentText)) accountType = 'Checking'
    else if (/1\.\s*Account Type[^\n]*(?:X|☒)[^\n]*Savings/i.test(paymentText)) accountType = 'Savings'

    const selectedDay = paymentText.match(/Choose the day payments will be deducted every month from your bank account:[^\n]*\n\s*(\d{1,2})\b/i)
      || paymentText.match(/Choose the day payments will be deducted every month from your bank account:[\s\S]{0,100}?\n\s*(\d{1,2})\b/i)
    if (selectedDay && Number(selectedDay[1]) >= 1 && Number(selectedDay[1]) <= 28) draftDay = selectedDay[1]
  }

  if (americanAmicable) {
    const preauthAnchor = text.search(/PREAUTHORIZATION CHECK PLAN/i)
    const bankDraftAnchor = text.search(/Bank Draft Authorization/i)
    const anchor = preauthAnchor >= 0 ? preauthAnchor : bankDraftAnchor
    const paymentText = anchor >= 0 ? text.slice(anchor, Math.min(text.length, anchor + 9000)) : text

    const institution = paymentText.match(/Financial Institution[^\n]*\n\s*([A-Z][A-Z .&'-]{2,45}(?:BANK|CREDIT UNION))\b/i)
      || paymentText.match(/Bank Name[^\n]*\n\s*([A-Z][A-Z .&'-]{2,45}(?:BANK|CREDIT UNION))\b/i)
      || paymentText.match(/\b([A-Z][A-Z .&'-]{2,45}(?:BANK|CREDIT UNION))\b/)
    if (institution) bankName = institution[1].replace(/\s+/g, ' ').trim().toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase())

    const aaPair = paymentText.match(/Transit\/ABA Number[^\n]*\n?\s*(\d{9})\b[\s\S]{0,120}?\b(\d{6,17})\b/i)
      || paymentText.match(/\b(\d{9})\b[\s\S]{0,90}?Number[_\s]*\b(\d{6,17})\b[\s\S]{0,160}?Checking/i)
    if (aaPair) { routing = aaPair[1]; account = aaPair[2] }

    if (/\bX\s*Checking\b/i.test(paymentText) || /\bChecking\s+Savings\b/i.test(paymentText)) accountType = 'Checking'
    else if (/\bX\s*Savings\b/i.test(paymentText)) accountType = 'Savings'

    const aaDay = paymentText.match(/Requested Draft Day\s*\(1st-28th\)[^\n]*?\b([1-9]|1\d|2[0-8])\b/i)
      || paymentText.match(/Requested Draft Day\s*\(1st-28th\)[^\n]*\n\s*([1-9]|1\d|2[0-8])\b/i)
    if (aaDay) draftDay = aaDay[1]
  }


  return {
    first_name: firstName,
    last_name: lastName,
    date_of_birth: dobRaw ? normalizedDate(dobRaw) : '',
    phone: digits(phone),
    email,
    ssn,
    drivers_license: dl,
    drivers_license_state: dlState,
    height_feet: heightFeet,
    height_in: heightIn,
    weight_lbs: weight,
    gender,
    address_line1: addressLine,
    city,
    state,
    zip_code: zipCode,
    life_company_choice: lifeCompany,
    life_face_amount_choice: faceAmount ? '__custom__' : '',
    life_face_amount_custom: faceAmount,
    life_premium_amount: premium,
    life_policy_type: policyType,
    life_effective_date: effectiveRaw ? normalizedDate(effectiveRaw) : '',
    bank_name: bankName,
    bank_routing_number: routing,
    bank_account_number: account,
    bank_account_type: accountType,
    bank_draft_day: draftDay,
    life_premium_frequency: premiumFrequency,
    notes: 'Imported from a life insurance document. Proposed Insured, life-policy, and banking sections are scanned separately. Review all values before saving.'
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
