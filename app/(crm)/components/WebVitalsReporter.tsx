'use client'

import { useEffect } from 'react'

function deviceClass() {
  const width = window.innerWidth
  if (width <= 720) return 'phone'
  if (width <= 1100) return 'tablet'
  return 'desktop'
}

function connectionType() {
  const nav = navigator as Navigator & { connection?: { effectiveType?: string } }
  return nav.connection?.effectiveType || ''
}

function report(metric_name: string, metric_value: number, metadata: Record<string, unknown> = {}) {
  if (!Number.isFinite(metric_value) || metric_value < 0) return
  const body = JSON.stringify({
    route: window.location.pathname,
    metric_name,
    metric_value,
    device_class: deviceClass(),
    connection_type: connectionType(),
    metadata
  })
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/system-health/vitals', new Blob([body], { type: 'application/json' }))
      return
    }
  } catch {}
  void fetch('/api/system-health/vitals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => undefined)
}

export default function WebVitalsReporter() {
  useEffect(() => {
    let cls = 0
    let lcp = 0
    const observers: PerformanceObserver[] = []

    try {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      if (navigation) {
        report('TTFB', Math.max(0, navigation.responseStart - navigation.requestStart))
        report('DOM_INTERACTIVE', Math.max(0, navigation.domInteractive - navigation.startTime))
        report('LOAD_COMPLETE', Math.max(0, navigation.loadEventEnd - navigation.startTime))
      }

      if (PerformanceObserver.supportedEntryTypes.includes('largest-contentful-paint')) {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) lcp = Math.max(lcp, entry.startTime)
        })
        observer.observe({ type: 'largest-contentful-paint', buffered: true })
        observers.push(observer)
      }

      if (PerformanceObserver.supportedEntryTypes.includes('layout-shift')) {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as Array<PerformanceEntry & { value?: number; hadRecentInput?: boolean }>) {
            if (!entry.hadRecentInput) cls += Number(entry.value || 0)
          }
        })
        observer.observe({ type: 'layout-shift', buffered: true })
        observers.push(observer)
      }

      if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration >= 100) report('LONG_TASK', entry.duration)
          }
        })
        observer.observe({ type: 'longtask', buffered: true })
        observers.push(observer)
      }
    } catch {
      // Performance telemetry is best-effort and must never affect CRM use.
    }

    const flush = () => {
      if (lcp > 0) report('LCP', lcp)
      if (cls > 0) report('CLS', cls)
    }
    window.addEventListener('pagehide', flush, { once: true })

    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
      observers.forEach((observer) => observer.disconnect())
    }
  }, [])

  return null
}
