import { NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { getGoogleAccessToken, gmailConfigured } from '@/lib/gmail-mail'
import { assertGoogleDriveAccess, GoogleDriveError } from '@/lib/google-drive'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const { supabase, userId, profile } = await getCrmSession()

  if (!profile?.agency_id || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { data: connection } = await supabase
    .from('gmail_connections')
    .select('gmail_email')
    .eq('user_id', userId)
    .maybeSingle()

  if (!gmailConfigured()) {
    return NextResponse.json({
      configured: false,
      connected: false,
      driveReady: false,
      email: connection?.gmail_email || null,
    }, { headers: { 'Cache-Control': 'no-store' } })
  }

  try {
    const accessToken = await getGoogleAccessToken(supabase, userId)
    if (!accessToken) {
      return NextResponse.json({
        configured: true,
        connected: false,
        driveReady: false,
        email: connection?.gmail_email || null,
      }, { headers: { 'Cache-Control': 'no-store' } })
    }

    await assertGoogleDriveAccess(accessToken)
    return NextResponse.json({
      configured: true,
      connected: true,
      driveReady: true,
      email: connection?.gmail_email || null,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const driveError = error instanceof GoogleDriveError ? error : null
    return NextResponse.json({
      configured: true,
      connected: Boolean(connection),
      driveReady: false,
      needsReconnect: driveError?.status === 401 || driveError?.status === 403,
      driveApiError: driveError?.responseText?.includes('accessNotConfigured') || driveError?.responseText?.includes('SERVICE_DISABLED'),
      email: connection?.gmail_email || null,
    }, { headers: { 'Cache-Control': 'no-store' } })
  }
}
