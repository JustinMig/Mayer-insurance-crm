import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  // These endpoints are intentionally public only during FEX integration testing.
  if (
    request.nextUrl.pathname === '/api/website-leads' ||
    request.nextUrl.pathname === '/api/fex-debug' ||
    request.nextUrl.pathname === '/api/fex-embed'
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
