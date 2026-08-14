export const WEBSITE_LEADS_AGENCY_ID = 'dbc6d057-3ab4-42aa-aa36-cf3e0314c1c5'
export const WEBSITE_LEADS_JUSTIN_ID = '9c9b6c8a-add4-475d-bda5-c27169f117a1'

export type WebsiteLead = {
  id: string
  first_name: string
  last_name: string
  phone: string
  email: string
  interests: unknown
  comments: string | null
  status: string
  source: string
  read_at: string | null
  created_at: string
  updated_at: string
  sms_consent: boolean
  sms_consent_at?: string | null
  sms_consent_source?: string | null
  sms_consent_text?: string | null
}

export function isJustinWebsiteLeadUser(userId: string) {
  return userId === WEBSITE_LEADS_JUSTIN_ID
}

export function interestList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean)
    } catch {
      // Fall through to comma/newline parsing.
    }
    return trimmed.split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean)
  }
  return []
}
