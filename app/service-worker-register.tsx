'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return

    let cancelled = false
    let idleId: number | null = null

    const register = () => {
      if (cancelled) return
      void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => undefined)
    }

    const schedule = () => {
      if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(register, { timeout: 2500 })
      } else {
        window.setTimeout(register, 0)
      }
    }

    if (document.readyState === 'complete') schedule()
    else window.addEventListener('load', schedule, { once: true })

    return () => {
      cancelled = true
      window.removeEventListener('load', schedule)
      if (idleId !== null && 'cancelIdleCallback' in window) window.cancelIdleCallback(idleId)
    }
  }, [])

  return null
}
