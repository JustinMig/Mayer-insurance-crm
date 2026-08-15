import 'server-only'

export type NetworkDoctor = {
  slot_id: string
  npi: string
  location_key?: string
  name: string
  address: string
  city: string
  state: string
  postal_code: string
}

export type NetworkPlan = {
  id: string
  plan_year: number
  carrier: string
  contract_id: string
  plan_id: string
  segment_id: string
  plan_name: string
}

export type LiveNetworkStatus = 'in_network' | 'out_of_network' | 'not_verified' | 'source_unavailable'

export type LiveNetworkResult = {
  status: LiveNetworkStatus
  source_url: string | null
  verified_at: string | null
  message: string | null
  carrier: string
  network_refs: string[]
  practitioner_id: string | null
  location_verified: boolean
}

type FhirReference = { reference?: string; display?: string }
type FhirIdentifier = { system?: string; value?: string }
type FhirExtension = { url?: string; valueReference?: FhirReference; extension?: FhirExtension[] }
type FhirAddress = {
  line?: string[]
  city?: string
  state?: string
  postalCode?: string
}
type FhirResource = {
  resourceType?: string
  id?: string
  identifier?: FhirIdentifier[]
  name?: string | Array<{ family?: string; given?: string[] }>
  alias?: string[]
  status?: string
  period?: { start?: string; end?: string }
  network?: FhirReference[]
  plan?: Array<{ identifier?: FhirIdentifier[]; network?: FhirReference[]; [key: string]: unknown }>
  practitioner?: FhirReference
  location?: FhirReference[]
  address?: FhirAddress
  extension?: FhirExtension[]
  [key: string]: unknown
}
type FhirEntry = { resource?: FhirResource; search?: { mode?: string } }
type FhirBundle = {
  resourceType?: string
  entry?: FhirEntry[]
  link?: Array<{ relation?: string; url?: string }>
  total?: number
}

type CarrierConfig = {
  carrier: string
  baseUrl: string | null
  publicAccess: boolean
  fallbackPlanPages: number
  sourceLabel: string
  unavailableMessage?: string
}

const PUBLIC_CARRIER_CONFIG: Record<string, CarrierConfig> = {
  Humana: {
    carrier: 'Humana',
    baseUrl: 'https://fhir.humana.com/api',
    publicAccess: true,
    fallbackPlanPages: 0,
    sourceLabel: 'Humana Provider Directory FHIR API'
  },
  Devoted: {
    carrier: 'Devoted',
    baseUrl: 'https://fhir.devoted.com/fhir',
    publicAccess: true,
    fallbackPlanPages: 6,
    sourceLabel: 'Devoted Health Provider Directory FHIR API'
  },
  HealthSpring: {
    carrier: 'HealthSpring',
    baseUrl: process.env.HEALTHSPRING_PROVIDER_DIRECTORY_BASE_URL || null,
    publicAccess: false,
    fallbackPlanPages: 4,
    sourceLabel: 'HealthSpring Provider Directory',
    unavailableMessage: 'HealthSpring live network API is not connected yet. The CRM will keep this plan unverified rather than guess.'
  },
  Aetna: {
    carrier: 'Aetna',
    baseUrl: process.env.AETNA_PROVIDER_DIRECTORY_BASE_URL || null,
    publicAccess: false,
    fallbackPlanPages: 2,
    sourceLabel: 'Aetna Provider Directory API',
    unavailableMessage: 'Aetna requires registered production API access. Add the Aetna Provider Directory connection to enable live verification.'
  },
  UnitedHealthcare: {
    carrier: 'UnitedHealthcare',
    baseUrl: process.env.UHC_PROVIDER_DIRECTORY_BASE_URL || null,
    publicAccess: false,
    fallbackPlanPages: 2,
    sourceLabel: 'UnitedHealthcare Provider Directory',
    unavailableMessage: 'UnitedHealthcare live Medicare Advantage network data is not connected yet. The CRM will keep this plan unverified rather than guess.'
  }
}

const NETWORK_EXTENSION_MARKER = 'network-reference'
const DEFAULT_TIMEOUT_MS = 12_000
const DIRECTORY_RESULT_TTL_MS = 6 * 60 * 60 * 1000
const DIRECTORY_MEMO_MAX = 750

type MemoEntry = { expiresAt: number; promise: Promise<unknown> }
const directoryMemo = new Map<string, MemoEntry>()

function memoizedDirectoryResult<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const existing = directoryMemo.get(key)
  if (existing && existing.expiresAt > now) return existing.promise as Promise<T>
  if (existing) directoryMemo.delete(key)

  if (directoryMemo.size >= DIRECTORY_MEMO_MAX) {
    for (const [memoKey, entry] of directoryMemo) {
      if (entry.expiresAt <= now) directoryMemo.delete(memoKey)
    }
    if (directoryMemo.size >= DIRECTORY_MEMO_MAX) {
      const oldestKey = directoryMemo.keys().next().value as string | undefined
      if (oldestKey) directoryMemo.delete(oldestKey)
    }
  }

  const promise = loader().catch((error) => {
    directoryMemo.delete(key)
    throw error
  })
  directoryMemo.set(key, { expiresAt: now + DIRECTORY_RESULT_TTL_MS, promise })
  return promise
}

function cleanZip(value: string | null | undefined) {
  return value?.match(/^(\d{5})/)?.[1] || ''
}

function canonicalStreet(value: string | null | undefined) {
  return (value || '')
    .toUpperCase()
    .replace(/\b(SUITE|STE|UNIT|APT|APARTMENT|ROOM|RM|FLOOR|FL)\b.*$/i, '')
    .replace(/#/g, ' ')
    .replace(/\bSTREET\b/g, 'ST')
    .replace(/\bROAD\b/g, 'RD')
    .replace(/\bAVENUE\b/g, 'AVE')
    .replace(/\bDRIVE\b/g, 'DR')
    .replace(/\bBOULEVARD\b/g, 'BLVD')
    .replace(/\bHIGHWAY\b/g, 'HWY')
    .replace(/\bPARKWAY\b/g, 'PKWY')
    .replace(/\bLANE\b/g, 'LN')
    .replace(/\bCOURT\b/g, 'CT')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeReference(reference: string | undefined) {
  if (!reference) return ''
  const withoutHistory = reference.replace(/\/_history\/[^/]+$/i, '')
  const match = withoutHistory.match(/(?:^|\/)(Organization|Practitioner|Location|InsurancePlan)\/([^/?#]+)/i)
  if (!match) return withoutHistory.toUpperCase()
  return `${match[1].toLowerCase()}/${match[2]}`
}

function referenceId(reference: string | undefined, resourceType: string) {
  if (!reference) return ''
  const match = reference.match(new RegExp(`(?:^|/)${resourceType}/([^/?#]+)`, 'i'))
  return match?.[1] || ''
}

function allStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === 'string') output.push(value)
  else if (Array.isArray(value)) value.forEach((item) => allStrings(item, output))
  else if (value && typeof value === 'object') Object.values(value as Record<string, unknown>).forEach((item) => allStrings(item, output))
  return output
}

function planIdentifierCandidates(plan: NetworkPlan) {
  const contract = plan.contract_id.trim().toUpperCase()
  const planId = plan.plan_id.trim().padStart(3, '0')
  const segmentRaw = (plan.segment_id || '0').trim()
  const segment = segmentRaw.padStart(3, '0')
  const year = String(plan.plan_year || 2026)

  return [...new Set([
    `${contract}-${planId}-${segment}-${year}`,
    `${contract}-${planId}-${segmentRaw}-${year}`,
    `${contract}-${planId}-000-${year}`,
    `${contract}-${planId}-${year}`,
    `${contract}-${planId}`,
    `${contract}${planId}`
  ])]
}

function scoreInsurancePlan(resource: FhirResource, plan: NetworkPlan) {
  const text = allStrings(resource).join(' ').toUpperCase()
  const contract = plan.contract_id.toUpperCase()
  const planId = plan.plan_id.padStart(3, '0')
  const year = String(plan.plan_year || 2026)
  let score = resourceHasExactPlanIdentifier(resource, plan) ? 50 : 0
  if (text.includes(contract)) score += 8
  if (text.includes(planId)) score += 5
  if (text.includes(`${contract}-${planId}`)) score += 12
  if (text.includes(year)) score += 3
  if (plan.plan_name && text.includes(plan.plan_name.toUpperCase())) score += 2
  if (resource.status === 'active') score += 1
  return score
}

function collectNetworkReferences(value: unknown, references: Set<string>, keyHint = '') {
  if (!value) return
  if (Array.isArray(value)) {
    value.forEach((item) => collectNetworkReferences(item, references, keyHint))
    return
  }
  if (typeof value !== 'object') return

  const record = value as Record<string, unknown>
  if (keyHint === 'network' && typeof record.reference === 'string') {
    const normalized = normalizeReference(record.reference)
    if (normalized) references.add(normalized)
  }
  if (typeof record.url === 'string' && record.url.toLowerCase().includes(NETWORK_EXTENSION_MARKER)) {
    const valueReference = record.valueReference as FhirReference | undefined
    const normalized = normalizeReference(valueReference?.reference)
    if (normalized) references.add(normalized)
  }

  for (const [key, nested] of Object.entries(record)) {
    collectNetworkReferences(nested, references, key.toLowerCase())
  }
}

function extractNetworkReferences(resource: FhirResource) {
  const references = new Set<string>()
  collectNetworkReferences(resource, references)
  return [...references]
}

function directNetworkReferences(value: { network?: FhirReference[]; extension?: FhirExtension[] } | undefined) {
  const references = new Set<string>()
  if (!value) return [] as string[]
  for (const network of value.network || []) {
    const normalized = normalizeReference(network.reference)
    if (normalized) references.add(normalized)
  }
  collectNetworkReferences(value.extension, references, 'extension')
  return [...references]
}

function exactPlanIdentifierValues(plan: NetworkPlan) {
  return new Set(planIdentifierCandidates(plan).map((value) => value.toUpperCase()))
}

function identifierValueMatches(identifier: FhirIdentifier | undefined, candidates: Set<string>) {
  return Boolean(identifier?.value && candidates.has(identifier.value.trim().toUpperCase()))
}

function resourceHasExactPlanIdentifier(resource: FhirResource, plan: NetworkPlan) {
  const candidates = exactPlanIdentifierValues(plan)
  if ((resource.identifier || []).some((identifier) => identifierValueMatches(identifier, candidates))) return true
  return (resource.plan || []).some((entry) =>
    (entry.identifier || []).some((identifier) => identifierValueMatches(identifier, candidates))
  )
}

function extractNetworkReferencesForPlan(resource: FhirResource, plan: NetworkPlan) {
  const candidates = exactPlanIdentifierValues(plan)
  const matchingPlanEntries = (resource.plan || []).filter((entry) =>
    (entry.identifier || []).some((identifier) => identifierValueMatches(identifier, candidates))
  )

  const planLevel = new Set<string>()
  for (const entry of matchingPlanEntries) {
    for (const reference of directNetworkReferences(entry as { network?: FhirReference[]; extension?: FhirExtension[] })) {
      planLevel.add(reference)
    }
  }
  if (planLevel.size) return [...planLevel]

  const root = directNetworkReferences(resource)
  if (root.length) return root

  // Some Plan-Net servers publish their network-reference extension deeper in the resource.
  // Only use that broader fallback after the exact CMS plan identifier was found in this resource.
  if (resourceHasExactPlanIdentifier(resource, plan)) {
    const recursive = new Set<string>()
    collectNetworkReferences(resource, recursive)
    return [...recursive]
  }

  return []
}

function locationMatchesDoctor(resource: FhirResource, doctor: NetworkDoctor) {
  if (resource.resourceType !== 'Location') return false
  const address = resource.address
  const zipMatches = cleanZip(address?.postalCode) === cleanZip(doctor.postal_code)
  if (!zipMatches) return false

  const selectedStreet = canonicalStreet(doctor.address)
  const directoryStreet = canonicalStreet((address?.line || []).join(' '))
  if (selectedStreet && directoryStreet) return selectedStreet === directoryStreet

  return (address?.city || '').trim().toUpperCase() === doctor.city.trim().toUpperCase()
}

function providerDirectoryHeaders(carrier: string) {
  const headers: Record<string, string> = {
    Accept: 'application/fhir+json, application/json;q=0.9',
    'User-Agent': 'MayerInsuranceCRM/1.0'
  }
  if (carrier === 'Aetna' && process.env.AETNA_PROVIDER_DIRECTORY_BEARER_TOKEN) {
    headers.Authorization = `Bearer ${process.env.AETNA_PROVIDER_DIRECTORY_BEARER_TOKEN}`
  }
  if (carrier === 'HealthSpring' && process.env.HEALTHSPRING_PROVIDER_DIRECTORY_BEARER_TOKEN) {
    headers.Authorization = `Bearer ${process.env.HEALTHSPRING_PROVIDER_DIRECTORY_BEARER_TOKEN}`
  }
  if (carrier === 'UnitedHealthcare' && process.env.UHC_PROVIDER_DIRECTORY_BEARER_TOKEN) {
    headers.Authorization = `Bearer ${process.env.UHC_PROVIDER_DIRECTORY_BEARER_TOKEN}`
  }
  return headers
}

async function fetchFhir(url: string, carrier: string) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: providerDirectoryHeaders(carrier),
      signal: controller.signal,
      next: { revalidate: 60 * 60 * 6 }
    })
    if (!response.ok) {
      return { ok: false as const, status: response.status, payload: null as FhirBundle | FhirResource | null }
    }
    const payload = await response.json() as FhirBundle | FhirResource
    return { ok: true as const, status: response.status, payload }
  } catch {
    return { ok: false as const, status: 0, payload: null as FhirBundle | FhirResource | null }
  } finally {
    clearTimeout(timer)
  }
}

async function fetchBundlePages(firstUrl: string, config: CarrierConfig, maxPages = 4) {
  const resources: FhirResource[] = []
  let currentUrl: string | null = firstUrl
  let pages = 0

  while (currentUrl && pages < maxPages) {
    const result = await fetchFhir(currentUrl, config.carrier)
    if (!result.ok || !result.payload || result.payload.resourceType !== 'Bundle') {
      return { ok: false, resources, status: result.status, lastUrl: currentUrl }
    }
    const bundle = result.payload as FhirBundle
    for (const entry of bundle.entry || []) {
      if (entry.resource) resources.push(entry.resource)
    }
    currentUrl = bundle.link?.find((link) => link.relation === 'next')?.url || null
    pages += 1
  }
  return { ok: true, resources, status: 200, lastUrl: firstUrl }
}

async function findInsurancePlanUncached(config: CarrierConfig, plan: NetworkPlan) {
  if (!config.baseUrl) return { resource: null as FhirResource | null, sourceUrl: null as string | null }
  const base = config.baseUrl.replace(/\/$/, '')
  const candidates = planIdentifierCandidates(plan)
  const contractPlan = `${plan.contract_id.trim().toUpperCase()}-${plan.plan_id.trim().padStart(3, '0')}`
  let best: { resource: FhirResource; score: number; sourceUrl: string } | null = null

  const searches: Array<{ params: URLSearchParams; maxPages: number }> = []
  const nameSearches = [
    { params: new URLSearchParams({ 'name:contains': contractPlan, status: 'active', _count: '100' }), maxPages: 4 },
    { params: new URLSearchParams({ 'name:contains': plan.contract_id.trim().toUpperCase(), status: 'active', _count: '100' }), maxPages: 6 }
  ]
  const identifierSearches = candidates.map((candidate) => ({
    params: new URLSearchParams({ identifier: candidate, _count: '50' }),
    maxPages: 2
  }))

  // Humana's public example places the CMS PlanId inside InsurancePlan.plan.identifier,
  // so use the required Plan-Net name search first. Other Plan-Net servers commonly
  // expose a top-level InsurancePlan identifier, where the token search is faster.
  if (config.carrier === 'Humana') searches.push(...nameSearches, ...identifierSearches)
  else searches.push(...identifierSearches, ...nameSearches)

  const seenUrls = new Set<string>()
  for (const search of searches) {
    const url = `${base}/InsurancePlan?${search.params.toString()}`
    if (seenUrls.has(url)) continue
    seenUrls.add(url)
    const result = await fetchBundlePages(url, config, search.maxPages)
    if (!result.ok) continue

    for (const resource of result.resources.filter((item) => item.resourceType === 'InsurancePlan')) {
      const score = scoreInsurancePlan(resource, plan)
      if (!best || score > best.score) best = { resource, score, sourceUrl: url }
      if (resourceHasExactPlanIdentifier(resource, plan)) {
        return { resource, sourceUrl: url }
      }
    }
  }

  if (config.fallbackPlanPages > 0) {
    const url = `${base}/InsurancePlan?_count=100&status=active`
    const result = await fetchBundlePages(url, config, config.fallbackPlanPages)
    if (result.ok) {
      for (const resource of result.resources.filter((item) => item.resourceType === 'InsurancePlan')) {
        const score = scoreInsurancePlan(resource, plan)
        if (!best || score > best.score) best = { resource, score, sourceUrl: url }
        if (resourceHasExactPlanIdentifier(resource, plan)) {
          return { resource, sourceUrl: url }
        }
      }
    }
  }

  // Never turn a fuzzy product-name match into a network determination.
  // If we cannot locate the exact CMS plan identifier, leave it unverified.
  return { resource: null, sourceUrl: best?.sourceUrl || null }
}

function findInsurancePlan(config: CarrierConfig, plan: NetworkPlan) {
  const key = `insurance-plan:${config.carrier}:${plan.plan_year}:${plan.contract_id}:${plan.plan_id}:${plan.segment_id || '0'}`
  return memoizedDirectoryResult(key, () => findInsurancePlanUncached(config, plan))
}

function practitionerHasNpi(resource: FhirResource, npi: string) {
  return (resource.identifier || []).some((identifier) => identifier.value === npi)
}

async function findPractitionersUncached(config: CarrierConfig, npi: string) {
  if (!config.baseUrl) return { resources: [] as FhirResource[], sourceUrl: null as string | null, querySupported: false }
  const base = config.baseUrl.replace(/\/$/, '')
  const identifiers = [
    `http://hl7.org/fhir/sid/us-npi|${npi}`,
    npi
  ]

  let querySupported = false
  for (const identifier of identifiers) {
    const params = new URLSearchParams({ identifier, _count: '20' })
    const url = `${base}/Practitioner?${params.toString()}`
    const result = await fetchBundlePages(url, config, 2)
    if (!result.ok) continue
    querySupported = true
    const matches = result.resources.filter((resource) => resource.resourceType === 'Practitioner' && practitionerHasNpi(resource, npi))
    if (matches.length) return { resources: matches, sourceUrl: url, querySupported }
  }
  return { resources: [], sourceUrl: `${base}/Practitioner`, querySupported }
}

function findPractitioners(config: CarrierConfig, npi: string) {
  return memoizedDirectoryResult(`practitioner:${config.carrier}:${npi}`, () => findPractitionersUncached(config, npi))
}

async function practitionerRoles(config: CarrierConfig, practitioner: FhirResource) {
  if (!config.baseUrl || !practitioner.id) return { roles: [] as FhirResource[], includedLocations: [] as FhirResource[], sourceUrl: null as string | null, ok: false }
  const base = config.baseUrl.replace(/\/$/, '')
  const queryValues = [`Practitioner/${practitioner.id}`, practitioner.id]

  for (const practitionerRef of queryValues) {
    const params = new URLSearchParams({
      practitioner: practitionerRef,
      _include: 'PractitionerRole:location',
      _count: '200'
    })
    const url = `${base}/PractitionerRole?${params.toString()}`
    const result = await fetchBundlePages(url, config, 5)
    if (!result.ok) continue
    const roles = result.resources.filter((resource) => resource.resourceType === 'PractitionerRole')
    const locations = result.resources.filter((resource) => resource.resourceType === 'Location')
    if (roles.length) return { roles, includedLocations: locations, sourceUrl: url, ok: true }
  }
  return { roles: [], includedLocations: [], sourceUrl: `${base}/PractitionerRole`, ok: true }
}

async function fetchLocationsForRoles(config: CarrierConfig, roles: FhirResource[], includedLocations: FhirResource[]) {
  if (!config.baseUrl) return includedLocations
  const base = config.baseUrl.replace(/\/$/, '')
  const locationsById = new Map<string, FhirResource>()
  for (const location of includedLocations) if (location.id) locationsById.set(location.id, location)

  const missingIds = new Set<string>()
  for (const role of roles) {
    for (const locationRef of role.location || []) {
      const id = referenceId(locationRef.reference, 'Location')
      if (id && !locationsById.has(id)) missingIds.add(id)
    }
  }

  await Promise.all([...missingIds].slice(0, 40).map(async (id) => {
    const result = await fetchFhir(`${base}/Location/${encodeURIComponent(id)}`, config.carrier)
    if (result.ok && result.payload?.resourceType === 'Location') locationsById.set(id, result.payload as FhirResource)
  }))

  return [...locationsById.values()]
}

function practitionerNetworkData(config: CarrierConfig, practitioner: FhirResource) {
  const practitionerKey = practitioner.id || allStrings(practitioner.identifier).join('|')
  const key = `practitioner-network:${config.carrier}:${practitionerKey}`
  return memoizedDirectoryResult(key, async () => {
    const roleResult = await practitionerRoles(config, practitioner)
    const locations = roleResult.ok
      ? await fetchLocationsForRoles(config, roleResult.roles, roleResult.includedLocations)
      : []
    return { ...roleResult, locations }
  })
}

function roleMatchesLocation(role: FhirResource, matchingLocationIds: Set<string>) {
  const refs = role.location || []
  if (!refs.length) return false
  return refs.some((ref) => matchingLocationIds.has(referenceId(ref.reference, 'Location')))
}

export function carrierLiveSupport(carrier: string) {
  const config = PUBLIC_CARRIER_CONFIG[carrier]
  return {
    carrier,
    connected: Boolean(config?.baseUrl),
    public_access: Boolean(config?.publicAccess),
    source_label: config?.sourceLabel || carrier,
    message: config?.baseUrl ? null : (config?.unavailableMessage || 'Carrier provider directory is not connected.')
  }
}

export async function verifyDoctorForPlan(doctor: NetworkDoctor, plan: NetworkPlan): Promise<LiveNetworkResult> {
  const config = PUBLIC_CARRIER_CONFIG[plan.carrier]
  if (!config?.baseUrl) {
    return {
      status: 'source_unavailable',
      source_url: null,
      verified_at: null,
      message: config?.unavailableMessage || `${plan.carrier} provider directory is not connected.`,
      carrier: plan.carrier,
      network_refs: [],
      practitioner_id: null,
      location_verified: false
    }
  }

  const [insurancePlanResult, practitionerResult] = await Promise.all([
    findInsurancePlan(config, plan),
    findPractitioners(config, doctor.npi)
  ])

  if (!insurancePlanResult.resource) {
    return {
      status: 'not_verified',
      source_url: insurancePlanResult.sourceUrl,
      verified_at: null,
      message: `${plan.carrier} directory responded, but this exact 2026 plan could not be mapped to a provider network.`,
      carrier: plan.carrier,
      network_refs: [],
      practitioner_id: null,
      location_verified: false
    }
  }

  const planNetworks = extractNetworkReferencesForPlan(insurancePlanResult.resource, plan)
  if (!planNetworks.length) {
    return {
      status: 'not_verified',
      source_url: insurancePlanResult.sourceUrl,
      verified_at: null,
      message: `${plan.carrier} returned the plan but did not publish a usable network reference for it.`,
      carrier: plan.carrier,
      network_refs: [],
      practitioner_id: null,
      location_verified: false
    }
  }

  if (!practitionerResult.querySupported) {
    return {
      status: 'not_verified',
      source_url: practitionerResult.sourceUrl,
      verified_at: null,
      message: `${plan.carrier} provider directory did not accept the NPI lookup.`,
      carrier: plan.carrier,
      network_refs: planNetworks,
      practitioner_id: null,
      location_verified: false
    }
  }

  if (!practitionerResult.resources.length) {
    return {
      status: 'out_of_network',
      source_url: practitionerResult.sourceUrl,
      verified_at: new Date().toISOString(),
      message: `NPI ${doctor.npi} was not found in the ${config.sourceLabel}.`,
      carrier: plan.carrier,
      network_refs: planNetworks,
      practitioner_id: null,
      location_verified: false
    }
  }

  let anyDirectoryRole = false
  let exactLocationFound = false
  let exactLocationInPlanNetwork = false
  let practitionerId: string | null = null
  let sourceUrl = practitionerResult.sourceUrl || insurancePlanResult.sourceUrl

  for (const practitioner of practitionerResult.resources) {
    practitionerId = practitioner.id || practitionerId
    const roleResult = await practitionerNetworkData(config, practitioner)
    sourceUrl = roleResult.sourceUrl || sourceUrl
    if (!roleResult.ok) continue
    if (roleResult.roles.length) anyDirectoryRole = true

    const matchingLocationIds = new Set(
      roleResult.locations.filter((location) => locationMatchesDoctor(location, doctor)).map((location) => location.id).filter((id): id is string => Boolean(id))
    )
    if (matchingLocationIds.size) exactLocationFound = true

    for (const role of roleResult.roles) {
      if (!roleMatchesLocation(role, matchingLocationIds)) continue
      const roleNetworks = extractNetworkReferences(role)
      if (roleNetworks.some((network) => planNetworks.includes(network))) {
        exactLocationInPlanNetwork = true
        break
      }
    }
    if (exactLocationInPlanNetwork) break
  }

  const verifiedAt = new Date().toISOString()
  if (exactLocationInPlanNetwork) {
    return {
      status: 'in_network',
      source_url: sourceUrl,
      verified_at: verifiedAt,
      message: `Verified against ${config.sourceLabel} for the selected office.`,
      carrier: plan.carrier,
      network_refs: planNetworks,
      practitioner_id: practitionerId,
      location_verified: true
    }
  }

  if (exactLocationFound && anyDirectoryRole) {
    return {
      status: 'out_of_network',
      source_url: sourceUrl,
      verified_at: verifiedAt,
      message: `The selected office was found in ${config.sourceLabel}, but it is not tied to this plan's published network.`,
      carrier: plan.carrier,
      network_refs: planNetworks,
      practitioner_id: practitionerId,
      location_verified: true
    }
  }

  return {
    status: 'not_verified',
    source_url: sourceUrl,
    verified_at: null,
    message: anyDirectoryRole
      ? `${plan.carrier} found the provider, but the selected office could not be matched exactly to the carrier location record.`
      : `${plan.carrier} found the provider, but no usable network role was returned.`,
    carrier: plan.carrier,
    network_refs: planNetworks,
    practitioner_id: practitionerId,
    location_verified: false
  }
}
