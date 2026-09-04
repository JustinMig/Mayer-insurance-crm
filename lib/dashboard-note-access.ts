import 'server-only'
import type { CrmProfile } from '@/lib/crm-session'
import { createAdminClient } from '@/lib/supabase/admin'

export type DashboardNoteOwner = {
  id: string
  name: string
  is_self: boolean
}

const DISPLAY_NAMES = {
  'justin mayer': 'Justin Mayer',
  'isaiah hernandez': 'Isaiah Hernandez',
  'sheena hester': 'Sheena Hester'
} as const

const ACCESS_BY_VIEWER = {
  'justin mayer': ['justin mayer', 'sheena hester'],
  'isaiah hernandez': ['isaiah hernandez', 'sheena hester'],
  'sheena hester': ['sheena hester', 'justin mayer', 'isaiah hernandez']
} as const

type SupportedViewer = keyof typeof ACCESS_BY_VIEWER

function normalizedName(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

export async function resolveDashboardNoteAccess(userId: string, profile: CrmProfile | null) {
  if (!profile?.agency_id || profile.active === false) return null

  const viewerKey = normalizedName(profile.full_name) as SupportedViewer
  const allowedNames = ACCESS_BY_VIEWER[viewerKey]
  if (!allowedNames) return null

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('id,full_name')
    .eq('agency_id', profile.agency_id)
    .eq('active', true)

  if (error) throw new Error(`Unable to load dashboard note access: ${error.message}`)

  const profilesByName = new Map<string, { id: string; full_name: string }>()
  for (const row of data || []) {
    const key = normalizedName(row.full_name)
    if (!key || profilesByName.has(key)) continue
    profilesByName.set(key, {
      id: String(row.id),
      full_name: String(row.full_name || '')
    })
  }

  const owners: DashboardNoteOwner[] = []
  for (const allowedName of allowedNames) {
    if (allowedName === viewerKey) {
      owners.push({
        id: userId,
        name: profile.full_name?.trim() || DISPLAY_NAMES[allowedName],
        is_self: true
      })
      continue
    }

    const matched = profilesByName.get(allowedName)
    if (!matched) continue
    owners.push({
      id: matched.id,
      name: matched.full_name || DISPLAY_NAMES[allowedName],
      is_self: false
    })
  }

  return {
    admin,
    agencyId: profile.agency_id,
    viewerId: userId,
    viewerName: profile.full_name?.trim() || DISPLAY_NAMES[viewerKey],
    owners
  }
}
