import { NextRequest, NextResponse } from 'next/server'
import { getCrmSession } from '@/lib/crm-session'
import { saveGmailConnection } from '@/lib/gmail-mail'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { supabase, userId } = await getCrmSession()
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const cookie = request.cookies.get('crm_gmail_oauth_state')?.value || ''
  const expected = `${userId}:${state || ''}`
  const responseUrl = new URL('/mail-center', request.url)

  if (!code || !state || cookie !== expected) {
    responseUrl.searchParams.set('gmail_error', 'state')
    const response = NextResponse.redirect(responseUrl)
    response.cookies.delete('crm_gmail_oauth_state')
    return response
  }

  try {
    await saveGmailConnection(supabase, userId, code, request.nextUrl.origin)
    responseUrl.searchParams.set('connected', '1')
  } catch {
    responseUrl.searchParams.set('gmail_error', 'connect')
  }

  const response = NextResponse.redirect(responseUrl)
  response.cookies.delete('crm_gmail_oauth_state')
  return response
}
