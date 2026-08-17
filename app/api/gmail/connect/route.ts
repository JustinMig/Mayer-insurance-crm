import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { gmailAuthUrl, gmailConfigured } from '@/lib/gmail-mail'

export const dynamic = 'force-dynamic'

const CRM_ORIGIN = 'https://crm.mayerig.com'

export async function GET(request: NextRequest) {
  const { userId } = await getCrmSession()
  if (!gmailConfigured()) return NextResponse.redirect(new URL('/mail-center?setup=1', request.url))

  const state = crypto.randomBytes(24).toString('hex')
  const response = NextResponse.redirect(gmailAuthUrl(CRM_ORIGIN, state))
  response.cookies.set('crm_gmail_oauth_state', `${userId}:${state}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
  return response
}
