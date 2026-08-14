import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        }
      }
    }
  )

  const { data, error } = await supabase.auth.getClaims()
  const loggedIn = Boolean(data?.claims)
  const path = request.nextUrl.pathname
  const publicPath = path === '/login' || path.startsWith('/auth/') || path === '/manifest.webmanifest' || path === '/sw.js' || path === '/icon.png' || path === '/mayer-bear.png' || path === '/icon.svg'

  // A stale/invalid refresh token can otherwise be retried on every request,
  // which is especially noticeable in Safari. Clear only Supabase auth cookies
  // and send the browser to a clean login state.
  const staleRefreshToken = Boolean(
    error && (
      error.code === 'refresh_token_not_found' ||
      error.message?.toLowerCase().includes('refresh token')
    )
  )

  if (staleRefreshToken) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = ''
    const cleanResponse = path === '/login' ? NextResponse.next({ request }) : NextResponse.redirect(loginUrl)

    request.cookies.getAll().forEach(({ name }) => {
      if (name.startsWith('sb-') && name.includes('-auth-token')) {
        cleanResponse.cookies.set(name, '', { path: '/', maxAge: 0, sameSite: 'lax' })
      }
    })

    cleanResponse.headers.set('Cache-Control', 'private, no-store')
    return cleanResponse
  }

  if (!loggedIn && !publicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (loggedIn && path === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
