import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { isJustinWebsiteLeadUser } from '@/lib/website-leads'
import { saveGmailConnection } from '@/lib/gmail-mail'

export const dynamic = 'force-dynamic'

const CRM_ORIGIN = 'https://crm.mayerig.com'
const ALLOWED_RETURN_PATHS = new Set(['/mail-center', '/backup'])

function safeReturnPath(value: string | undefined) {
  return value && ALLOWED_RETURN_PATHS.has(value) ? value : '/mail-center'
}

export async function GET(request: NextRequest) {
  const { supabase, userId } = await getCrmSession()
  if (!isJustinWebsiteLeadUser(userId)) return NextResponse.redirect(new URL('/dashboard', CRM_ORIGIN))

  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const cookie = request.cookies.get('crm_gmail_oauth_state')?.value || ''
  const expected = `${userId}:${state || ''}`
  const returnTo = safeReturnPath(request.cookies.get('crm_google_oauth_return')?.value)
  const responseUrl = new URL(returnTo, CRM_ORIGIN)

  if (!code || !state || cookie !== expected) {
    console.error('Google OAuth state validation failed', {
      hasCode: Boolean(code),
      hasState: Boolean(state),
      hasCookie: Boolean(cookie),
      stateMatches: cookie === expected,
    })
    responseUrl.searchParams.set('gmail_error', 'state')
    const response = NextResponse.redirect(responseUrl)
    response.cookies.delete('crm_gmail_oauth_state')
    response.cookies.delete('crm_google_oauth_return')
    return response
  }

  try {
    await saveGmailConnection(supabase, userId, code, CRM_ORIGIN)
    responseUrl.searchParams.set('connected', '1')
  } catch (error) {
    console.error('Google OAuth connection failed', error)
    responseUrl.searchParams.set('gmail_error', 'connect')
  }

  const response = NextResponse.redirect(responseUrl)
  response.cookies.delete('crm_gmail_oauth_state')
  response.cookies.delete('crm_google_oauth_return')
  return response
}
