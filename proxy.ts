import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  // Public webhook/intake/signature endpoints must bypass CRM login redirects.
  // They perform their own source/token validation inside the route.
  if (
    request.nextUrl.pathname === '/api/website-leads' ||
    request.nextUrl.pathname === '/api/twilio/incoming' ||
    request.nextUrl.pathname === '/api/twilio/status' ||
    request.nextUrl.pathname.startsWith('/api/soa/sign/') ||
    request.nextUrl.pathname.startsWith('/soa/sign/')
  ) {
    return NextResponse.next()
  }

  return updateSession(request)
}

export const config = {
  matcher: [
    // Keep authenticated app/API requests protected, but do not run Proxy for
    // Next.js build assets or public PWA/image/manifest files that never need auth.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.webmanifest|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'
  ]
}
