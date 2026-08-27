'use client'

import { useEffect } from 'react'

type IdleWindow = Window & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
  cancelIdleCallback?: (handle: number) => void
}

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return

    let cancelled = false
    let idleId: number | null = null
    const idleWindow = window as IdleWindow

    const register = () => {
      if (cancelled) return
      void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => undefined)
    }

    const schedule = () => {
      if (typeof idleWindow.requestIdleCallback === 'function') {
        idleId = idleWindow.requestIdleCallback(register, { timeout: 2500 })
      } else {
        globalThis.setTimeout(register, 0)
      }
    }

    if (document.readyState === 'complete') schedule()
    else window.addEventListener('load', schedule, { once: true })

    return () => {
      cancelled = true
      window.removeEventListener('load', schedule)
      if (idleId !== null && typeof idleWindow.cancelIdleCallback === 'function') idleWindow.cancelIdleCallback(idleId)
    }
  }, [])

  return null
}
