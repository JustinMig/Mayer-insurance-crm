import { NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRingCentralAccessToken, isRingCentralConfigured } from '@/lib/ringcentral'
import { RingCentralContactsError, syncCrmClientsToAllRingCentralUsers } from '@/lib/ringcentral-contacts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

let contactSyncPromise: Promise<Record<string, unknown>> | null = null

async function runContactSync(agencyId: string) {
  const admin = createAdminClient()
  const { data: clients, error } = await admin
    .from('clients')
    .select('id,first_name,last_name,phone')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Unable to load CRM clients for RingCentral contact sync: ${error.message}`)

  const accessToken = await getRingCentralAccessToken()
  return syncCrmClientsToAllRingCentralUsers(accessToken, clients || [])
}

export async function GET() {
  const { profile } = await getCrmSession()
  if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  return NextResponse.json({
    configured: isRingCentralConfigured(),
    automatic: true,
    scope_required: 'Contacts',
    user_permission_required: 'EditPersonalContacts'
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST() {
  const { profile } = await getCrmSession()
  if (!profile?.agency_id) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  if (!isRingCentralConfigured()) {
    return NextResponse.json({ configured: false, error: 'RingCentral credentials are not configured.' }, { status: 409 })
  }

  if (contactSyncPromise) {
    return NextResponse.json({
      configured: true,
      already_syncing: true,
      message: 'RingCentral client contact sync is already running.'
    }, { status: 202, headers: { 'Cache-Control': 'private, no-store' } })
  }

  contactSyncPromise = runContactSync(profile.agency_id)
  try {
    const result = await contactSyncPromise
    return NextResponse.json({ configured: true, synced: true, ...result }, {
      headers: { 'Cache-Control': 'private, no-store' }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'RingCentral contact sync failed.'
    const permissionFailure = error instanceof RingCentralContactsError && [401, 403].includes(error.status)
    return NextResponse.json({
      configured: true,
      permission_required: permissionFailure,
      required_scope: permissionFailure ? 'Contacts' : undefined,
      required_user_permission: permissionFailure ? 'EditPersonalContacts' : undefined,
      error: permissionFailure
        ? `RingCentral Contacts permission is required before CRM clients can be saved to every RingCentral user's address book. ${message}`
        : message
    }, { status: permissionFailure ? 409 : 502, headers: { 'Cache-Control': 'private, no-store' } })
  } finally {
    contactSyncPromise = null
  }
}
