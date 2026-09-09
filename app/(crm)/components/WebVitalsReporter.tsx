'use client'

import { useEffect } from 'react'

type MetricPayload = {
  route: string
  metric_name: string
  metric_value: number
  device_class: string
  connection_type: string
  metadata: Record<string, unknown>
}

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

export default function WebVitalsReporter() {
  useEffect(() => {
    let cls = 0
    let lcp = 0
    let flushTimer: number | null = null
    const observers: PerformanceObserver[] = []
    const pending: MetricPayload[] = []

    const flush = () => {
      if (flushTimer !== null) {
        window.clearTimeout(flushTimer)
        flushTimer = null
      }
      if (!pending.length) return
      const events = pending.splice(0, pending.length)
      const body = JSON.stringify({ events })
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/system-health/vitals', new Blob([body], { type: 'application/json' }))
          return
        }
      } catch {}
      void fetch('/api/system-health/vitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true
      }).catch(() => undefined)
    }

    const queue = (metric_name: string, metric_value: number, metadata: Record<string, unknown> = {}) => {
      if (!Number.isFinite(metric_value) || metric_value < 0) return
      pending.push({
        route: window.location.pathname,
        metric_name,
        metric_value,
        device_class: deviceClass(),
        connection_type: connectionType(),
        metadata
      })
      if (flushTimer === null) flushTimer = window.setTimeout(flush, 4000)
    }

    try {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      if (navigation) {
        queue('TTFB', Math.max(0, navigation.responseStart - navigation.requestStart))
        queue('DOM_INTERACTIVE', Math.max(0, navigation.domInteractive - navigation.startTime))
        queue('LOAD_COMPLETE', Math.max(0, navigation.loadEventEnd - navigation.startTime))
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
          const longTasks = list.getEntries().filter((entry) => entry.duration >= 100)
          if (!longTasks.length) return
          queue('LONG_TASK', Math.max(...longTasks.map((entry) => entry.duration)), { count: longTasks.length })
        })
        observer.observe({ type: 'longtask', buffered: true })
        observers.push(observer)
      }
    } catch {
      // Performance telemetry is best-effort and must never affect CRM use.
    }

    const finalFlush = () => {
      if (lcp > 0) queue('LCP', lcp)
      if (cls > 0) queue('CLS', cls)
      flush()
    }
    window.addEventListener('pagehide', finalFlush, { once: true })

    return () => {
      window.removeEventListener('pagehide', finalFlush)
      finalFlush()
      observers.forEach((observer) => observer.disconnect())
    }
  }, [])

  return null
}
