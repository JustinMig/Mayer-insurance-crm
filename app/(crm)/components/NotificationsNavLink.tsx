'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type Props = {
  mobile?: boolean
}

type Listener = (total: number) => void

let sharedTotal = 0
let pollTimer: number | null = null
let inFlight: Promise<void> | null = null
let eventsAttached = false
const listeners = new Set<Listener>()

function publish(total: number) {
  sharedTotal = total
  listeners.forEach((listener) => listener(total))
}

async function refreshUnread() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const response = await fetch('/api/notifications/unread', { cache: 'no-store' })
      const result = await response.json().catch(() => ({}))
      if (response.ok) publish(Number(result.total || 0))
    } catch {
      // Keep navigation usable if the unread counter cannot refresh.
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

function onVisibleOrFocus() {
  if (document.visibilityState === 'visible') void refreshUnread()
}

function startSharedPolling() {
  if (typeof window === 'undefined') return
  if (!pollTimer) {
    void refreshUnread()
    pollTimer = window.setInterval(() => void refreshUnread(), 15_000)
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

export default function NotificationsNavLink({ mobile = false }: Props) {
  const [total, setTotal] = useState(sharedTotal)

  useEffect(() => subscribe(setTotal), [])

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
