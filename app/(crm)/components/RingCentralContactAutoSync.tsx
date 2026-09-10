'use client'

import { useEffect } from 'react'

const SUCCESS_KEY = 'mayerig:ringcentral-contact-sync:last-success:v1'
const ATTEMPT_KEY = 'mayerig:ringcentral-contact-sync:last-attempt:v1'
const SUCCESS_INTERVAL_MS = 6 * 60 * 60 * 1000
const RETRY_INTERVAL_MS = 5 * 60 * 1000

export default function RingCentralContactAutoSync() {
  useEffect(() => {
    let cancelled = false
    let timer: number | null = null

    const now = Date.now()
    let lastSuccess = 0
    let lastAttempt = 0
    try {
      lastSuccess = Number(window.localStorage.getItem(SUCCESS_KEY) || 0)
      lastAttempt = Number(window.localStorage.getItem(ATTEMPT_KEY) || 0)
    } catch {
      // Storage can be unavailable in private browsing. A best-effort sync is still safe.
    }

    if (lastSuccess && now - lastSuccess < SUCCESS_INTERVAL_MS) return
    if (lastAttempt && now - lastAttempt < RETRY_INTERVAL_MS) return

    timer = window.setTimeout(async () => {
      if (cancelled) return
      try { window.localStorage.setItem(ATTEMPT_KEY, String(Date.now())) } catch {}

      try {
        const response = await fetch('/api/ringcentral/contacts-sync', {
          method: 'POST',
          cache: 'no-store'
        })
        if (cancelled) return
        if (response.ok || response.status === 202) {
          try { window.localStorage.setItem(SUCCESS_KEY, String(Date.now())) } catch {}
        }
      } catch {
        // Background contact sync must never interrupt normal CRM use.
      }
    }, 4500)

    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [])

  return null
}
