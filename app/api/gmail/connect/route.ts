import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { isJustinWebsiteLeadUser } from '@/lib/website-leads'
import { gmailAuthUrl, gmailConfigured } from '@/lib/gmail-mail'

export const dynamic = 'force-dynamic'

const CRM_ORIGIN = 'https://crm.mayerig.com'
const ALLOWED_RETURN_PATHS = new Set(['/mail-center', '/backup'])

function safeReturnPath(value: string | null) {
  return value && ALLOWED_RETURN_PATHS.has(value) ? value : '/mail-center'
}

export async function GET(request: NextRequest) {
  const { userId } = await getCrmSession()
  if (!isJustinWebsiteLeadUser(userId)) return NextResponse.redirect(new URL('/dashboard', CRM_ORIGIN))
  if (!gmailConfigured()) return NextResponse.redirect(new URL('/mail-center?setup=1', CRM_ORIGIN))

  const state = crypto.randomBytes(24).toString('hex')
  const returnTo = safeReturnPath(request.nextUrl.searchParams.get('return_to'))
  const response = NextResponse.redirect(gmailAuthUrl(CRM_ORIGIN, state))
  response.cookies.set('crm_gmail_oauth_state', `${userId}:${state}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
  response.cookies.set('crm_google_oauth_return', returnTo, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
  return response
}
