import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  // Public webhook/intake endpoints must bypass CRM login redirects.
  // They perform their own source/signature validation inside the route.
  if (
    request.nextUrl.pathname === '/api/website-leads' ||
    request.nextUrl.pathname === '/api/twilio/incoming' ||
    request.nextUrl.pathname === '/api/twilio/status'
  ) {
    return NextResponse.next()
  }

  return updateSession(request)
}

export const config = {
  matcher: [
    // Keep authenticated app/API requests protected, but do not run Proxy for
    // Next.js build assets or public PWA/image files that never need auth.
    '/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'
  ]
}
