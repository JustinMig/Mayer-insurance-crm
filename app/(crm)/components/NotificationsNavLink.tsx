'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type Props = {
  mobile?: boolean
  dashboard?: boolean
}

type Listener = (total: number) => void
type BadgeNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

const POLL_INTERVAL_MS = 5 * 60_000
const FOCUS_REFRESH_MIN_MS = 60_000

let sharedTotal = 0
let pollTimer: number | null = null
let inFlight: Promise<void> | null = null
let eventsAttached = false
let lastRefreshAt = 0
let pollingSuspended = false
const listeners = new Set<Listener>()

function syncAppBadge(total: number) {
  if (typeof navigator === 'undefined') return
  const badgeNavigator = navigator as BadgeNavigator
  try {
    if (total > 0) void badgeNavigator.setAppBadge?.(total).catch(() => undefined)
    else void badgeNavigator.clearAppBadge?.().catch(() => undefined)
  } catch {
    // Badge support is optional; never interfere with CRM navigation.
  }
}

function publish(total: number) {
  sharedTotal = total
  syncAppBadge(total)
  listeners.forEach((listener) => listener(total))
}

function suspendPolling() {
  pollingSuspended = true
  if (typeof window !== 'undefined' && pollTimer) window.clearInterval(pollTimer)
  pollTimer = null
}

async function refreshUnread(force = false) {
  if (pollingSuspended) return
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  if (!force && Date.now() - lastRefreshAt < FOCUS_REFRESH_MIN_MS) return
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const response = await fetch('/api/notifications/unread', { cache: 'no-store', redirect: 'follow' })
      const finalUrl = response.url || ''
      if (response.redirected || response.status === 401 || response.status === 403 || finalUrl.includes('/login')) {
        suspendPolling()
        return
      }
      if (!response.ok) return
      const result = await response.json().catch(() => ({}))
      lastRefreshAt = Date.now()
      publish(Number(result.total || 0))
    } catch {
      // Keep navigation usable if the unread counter cannot refresh.
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

function onVisibleOrFocus() {
  if (document.visibilityState === 'visible') void refreshUnread(false)
}

function startSharedPolling() {
  if (typeof window === 'undefined' || pollingSuspended) return
  if (!pollTimer) {
    void refreshUnread(lastRefreshAt === 0)
    pollTimer = window.setInterval(() => void refreshUnread(true), POLL_INTERVAL_MS)
  }
  if (!eventsAttached) {
    document.addEventListener('visibilitychange', onVisibleOrFocus)
    window.addEventListener('focus', onVisibleOrFocus)
    eventsAttached = true
  }
}

function stopSharedPollingIfUnused() {
  if (typeof window === 'undefined' || listeners.size > 0) return
  if (pollTimer) window.clearInterval(pollTimer)
  pollTimer = null
  if (eventsAttached) {
    document.removeEventListener('visibilitychange', onVisibleOrFocus)
    window.removeEventListener('focus', onVisibleOrFocus)
    eventsAttached = false
  }
}

function subscribe(listener: Listener) {
  listeners.add(listener)
  listener(sharedTotal)
  startSharedPolling()
  return () => {
    listeners.delete(listener)
    stopSharedPollingIfUnused()
  }
}

export default function NotificationsNavLink({ mobile = false, dashboard = false }: Props) {
  const [total, setTotal] = useState(sharedTotal)

  useEffect(() => subscribe(setTotal), [])

  if (dashboard) {
    return (
      <Link prefetch={false} className="dashboard-home-nav-tab dashboard-notifications-home-tab" href="/notifications">
        <span>NOTIFICATIONS</span>
        <span className="dashboard-home-nav-meta">
          {total > 0 ? `${total} unread` : 'View notifications'}
          <b>{total > 0 ? total : '→'}</b>
        </span>
      </Link>
    )
  }

  if (mobile) {
    return (
      <Link prefetch={false} className="mobile-leads-link" href="/notifications">
        <b style={total > 0 ? { filter: 'drop-shadow(0 0 5px #f59e0b)' } : undefined}>🔔</b>
        <span>NOTIFY</span>
        {total > 0 && <i className="mobile-leads-count">{total}</i>}
      </Link>
    )
  }

  return (
    <Link prefetch={false} className="nav-link nav-leads" href="/notifications" style={total > 0 ? { boxShadow: 'inset 3px 0 0 #f59e0b' } : undefined}>
      <span>NOTIFICATIONS</span>
      {total > 0 && <span className="nav-leads-count">{total}</span>}
    </Link>
  )
}
