import 'server-only'

import { normalizePhone, ringCentralServer } from '@/lib/ringcentral'

export type CrmRingCentralContact = {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
}

type RingCentralExtension = {
  id: string | number
  name?: string
  type?: string
  status?: string
}

type RingCentralContact = {
  id?: string | number
  uri?: string
  url?: string
  availability?: string
  firstName?: string
  lastName?: string
  notes?: string
  mobilePhone?: string
  businessPhone?: string
  businessPhone2?: string
  homePhone?: string
  homePhone2?: string
  otherPhone?: string
  companyPhone?: string
  callbackPhone?: string
  assistantPhone?: string
  carPhone?: string
  [key: string]: unknown
}

type RingCentralListResponse<T> = {
  records?: T[]
  paging?: { page?: number; totalPages?: number; totalElements?: number }
}

type RingCentralBulkUploadResponse = {
  id?: string
  status?: string
  uri?: string
}

const CRM_MARKER = /\[MAYER_CRM:([0-9a-f-]{36})\]/i
const PHONE_FIELDS = [
  'mobilePhone', 'businessPhone', 'businessPhone2', 'homePhone', 'homePhone2',
  'otherPhone', 'companyPhone', 'callbackPhone', 'assistantPhone', 'carPhone'
] as const

export class RingCentralContactsError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'RingCentralContactsError'
    this.status = status
  }
}

async function rcRequest<T>(
  accessToken: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(`${ringCentralServer()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: 'no-store'
  })

  const payload = response.status === 204 ? {} : await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = String(
      (payload as { message?: string; error_description?: string }).message ||
      (payload as { error_description?: string }).error_description ||
      `RingCentral contact request failed (${response.status}).`
    )
    throw new RingCentralContactsError(response.status, message)
  }
  return payload as T
}

function toE164(value: string | null | undefined) {
  const rawDigits = String(value || '').replace(/\D/g, '')
  if (rawDigits.length === 10) return `+1${rawDigits}`
  if (rawDigits.length >= 11 && rawDigits.length <= 15 && !rawDigits.startsWith('0')) return `+${rawDigits}`
  return ''
}

function markerFor(clientId: string) {
  return `[MAYER_CRM:${clientId}]`
}

function markerClientId(contact: RingCentralContact) {
  return String(contact.notes || '').match(CRM_MARKER)?.[1] || ''
}

function contactPhone(contact: RingCentralContact) {
  for (const field of PHONE_FIELDS) {
    const phone = normalizePhone(String(contact[field] || ''))
    if (phone) return phone
  }
  return ''
}

function withMarker(notes: unknown, clientId: string) {
  const current = String(notes || '').trim()
  const wanted = markerFor(clientId)
  if (CRM_MARKER.test(current)) return current.replace(CRM_MARKER, wanted)
  return current ? `${current}\n${wanted}` : wanted
}

function cleanContactForUpdate(contact: RingCentralContact, client: CrmRingCentralContact) {
  const payload: Record<string, unknown> = { ...contact }
  delete payload.id
  delete payload.uri
  delete payload.url
  delete payload.availability

  const newPhone = toE164(client.phone)
  const oldPrimary = contactPhone(contact)
  let replacedPhone = false
  for (const field of PHONE_FIELDS) {
    const existing = String(contact[field] || '')
    if (existing && normalizePhone(existing) === oldPrimary) {
      payload[field] = newPhone
      replacedPhone = true
    }
  }
  if (!replacedPhone) payload.mobilePhone = newPhone

  payload.firstName = client.first_name || ''
  payload.lastName = client.last_name || ''
  payload.notes = withMarker(contact.notes, client.id)
  return payload
}

function newContact(client: CrmRingCentralContact) {
  return {
    firstName: client.first_name || '',
    lastName: client.last_name || '',
    mobilePhone: toE164(client.phone),
    notes: markerFor(client.id)
  }
}

async function listEnabledUserExtensions(accessToken: string) {
  const records: RingCentralExtension[] = []
  let page = 1
  while (page <= 100) {
    const result = await rcRequest<RingCentralListResponse<RingCentralExtension>>(
      accessToken,
      'GET',
      `/restapi/v1.0/account/~/extension?page=${page}&perPage=100`
    )
    records.push(...(result.records || []))
    const totalPages = Math.max(1, Number(result.paging?.totalPages || 1))
    if (page >= totalPages) break
    page += 1
  }
  return records.filter((record) => record.type === 'User' && record.status !== 'Disabled' && record.status !== 'NotActivated')
}

async function listPersonalContacts(accessToken: string, extensionId: string) {
  const records: RingCentralContact[] = []
  let page = 1
  while (page <= 200) {
    const result = await rcRequest<RingCentralListResponse<RingCentralContact>>(
      accessToken,
      'GET',
      `/restapi/v1.0/account/~/extension/${encodeURIComponent(extensionId)}/address-book/contact?page=${page}&perPage=100`
    )
    records.push(...(result.records || []))
    const totalPages = Math.max(1, Number(result.paging?.totalPages || 1))
    if (page >= totalPages) break
    page += 1
  }
  return records
}

async function updateContact(accessToken: string, extensionId: string, contactId: string, payload: unknown) {
  return rcRequest<RingCentralContact>(
    accessToken,
    'PUT',
    `/restapi/v1.0/account/~/extension/${encodeURIComponent(extensionId)}/address-book/contact/${encodeURIComponent(contactId)}`,
    payload
  )
}

async function deleteContact(accessToken: string, extensionId: string, contactId: string) {
  await rcRequest<unknown>(
    accessToken,
    'DELETE',
    `/restapi/v1.0/account/~/extension/${encodeURIComponent(extensionId)}/address-book/contact/${encodeURIComponent(contactId)}`
  )
}

async function bulkCreateContacts(
  accessToken: string,
  records: Array<{ extensionId: string; contacts: Array<Record<string, unknown>> }>
) {
  if (!records.length) return null
  return rcRequest<RingCentralBulkUploadResponse>(
    accessToken,
    'POST',
    '/restapi/v1.0/account/~/address-book-bulk-upload',
    { records }
  )
}

async function runLimited<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      await worker(items[index])
    }
  })
  await Promise.all(runners)
}

export async function syncCrmClientsToAllRingCentralUsers(
  accessToken: string,
  clients: CrmRingCentralContact[]
) {
  const validClients: CrmRingCentralContact[] = []
  const seenPhones = new Set<string>()
  let skippedInvalid = 0
  let skippedDuplicatePhone = 0

  for (const client of clients) {
    const normalized = normalizePhone(client.phone)
    if (!client.id || !normalized || !toE164(client.phone)) {
      skippedInvalid += 1
      continue
    }
    if (seenPhones.has(normalized)) {
      skippedDuplicatePhone += 1
      continue
    }
    seenPhones.add(normalized)
    validClients.push(client)
  }

  const validIds = new Set(validClients.map((client) => client.id))
  const extensions = await listEnabledUserExtensions(accessToken)
  if (!extensions.length) {
    throw new RingCentralContactsError(404, 'No enabled RingCentral user extensions were found.')
  }

  const createRecords: Array<{ extensionId: string; contacts: Array<Record<string, unknown>> }> = []
  const updates: Array<{ extensionId: string; contactId: string; contact: RingCentralContact; client: CrmRingCentralContact }> = []
  const removals: Array<{ extensionId: string; contactId: string }> = []
  let alreadyCurrent = 0

  for (const extension of extensions) {
    const extensionId = String(extension.id)
    const contacts = await listPersonalContacts(accessToken, extensionId)
    const byClientId = new Map<string, RingCentralContact>()
    const byPhone = new Map<string, RingCentralContact>()

    for (const contact of contacts) {
      const markedClientId = markerClientId(contact)
      if (markedClientId) byClientId.set(markedClientId, contact)
      const phone = contactPhone(contact)
      if (phone && !byPhone.has(phone)) byPhone.set(phone, contact)
    }

    const missing: Array<Record<string, unknown>> = []
    for (const client of validClients) {
      const phone = normalizePhone(client.phone)
      const existing = byClientId.get(client.id) || byPhone.get(phone)
      if (!existing || !existing.id) {
        missing.push(newContact(client))
        continue
      }

      const desiredFirst = client.first_name || ''
      const desiredLast = client.last_name || ''
      const sameName = String(existing.firstName || '') === desiredFirst && String(existing.lastName || '') === desiredLast
      const samePhone = contactPhone(existing) === phone
      const correctlyMarked = markerClientId(existing) === client.id
      if (sameName && samePhone && correctlyMarked) {
        alreadyCurrent += 1
      } else {
        updates.push({ extensionId, contactId: String(existing.id), contact: existing, client })
      }
    }

    for (const contact of contacts) {
      const markedClientId = markerClientId(contact)
      if (markedClientId && !validIds.has(markedClientId) && contact.id) {
        removals.push({ extensionId, contactId: String(contact.id) })
      }
    }

    if (missing.length) {
      if (contacts.length + missing.length > 10000) {
        throw new RingCentralContactsError(409, `RingCentral user ${extension.name || extensionId} would exceed the 10,000 personal-contact limit.`)
      }
      createRecords.push({ extensionId, contacts: missing })
    }
  }

  let updated = 0
  let removed = 0
  await runLimited(updates, 4, async (item) => {
    try {
      await updateContact(accessToken, item.extensionId, item.contactId, cleanContactForUpdate(item.contact, item.client))
      updated += 1
    } catch (error) {
      if (error instanceof RingCentralContactsError && error.status === 404) return
      throw error
    }
  })

  await runLimited(removals, 4, async (item) => {
    try {
      await deleteContact(accessToken, item.extensionId, item.contactId)
      removed += 1
    } catch (error) {
      if (error instanceof RingCentralContactsError && error.status === 404) return
      throw error
    }
  })

  const createTotal = createRecords.reduce((sum, record) => sum + record.contacts.length, 0)
  const bulkTask = await bulkCreateContacts(accessToken, createRecords)

  return {
    ringcentral_users: extensions.length,
    crm_clients: validClients.length,
    contacts_already_current: alreadyCurrent,
    contacts_updated: updated,
    contacts_removed: removed,
    contacts_queued_for_create: createTotal,
    bulk_task_id: bulkTask?.id || null,
    bulk_task_status: bulkTask?.status || null,
    skipped_invalid_phone: skippedInvalid,
    skipped_duplicate_phone: skippedDuplicatePhone
  }
}
