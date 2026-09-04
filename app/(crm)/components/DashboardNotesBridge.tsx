'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import DashboardNotes from '../dashboard/DashboardNotes'

export default function DashboardNotesBridge() {
  const [target, setTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.content')
    if (!root) return

    // Justin's dashboard already renders the Notes section directly. The bridge
    // is only needed for the dashboards that do not have an inline instance.
    if (root.querySelector('.dashboard-notes-shell')) return

    const controller = new AbortController()
    let observer: MutationObserver | null = null
    let createdHost: HTMLElement | null = null
    let disposed = false

    const attachBelowCalendar = () => {
      if (disposed) return false
      if (root.querySelector('.dashboard-notes-shell')) return true

      const calendar = root.querySelector<HTMLElement>('.dashboard-calendar-block')
      if (!calendar) return false

      let host = root.querySelector<HTMLElement>('#shared-dashboard-notes-mount')
      if (!host) {
        host = document.createElement('div')
        host.id = 'shared-dashboard-notes-mount'
        createdHost = host
        calendar.insertAdjacentElement('afterend', host)
      }

      setTarget(host)
      return true
    }

    void (async () => {
      try {
        const response = await fetch('/api/dashboard/notes?access=1', {
          cache: 'no-store',
          signal: controller.signal
        })
        if (!response.ok || disposed) return

        if (!attachBelowCalendar()) {
          observer = new MutationObserver(() => {
            if (attachBelowCalendar()) {
              observer?.disconnect()
              observer = null
            }
          })
          observer.observe(root, { childList: true, subtree: true })
        }
      } catch {
        // A denied or interrupted access check should leave the dashboard unchanged.
      }
    })()

    return () => {
      disposed = true
      controller.abort()
      observer?.disconnect()
      if (createdHost?.isConnected) createdHost.remove()
      setTarget(null)
    }
  }, [])

  if (!target) return null
  return createPortal(<DashboardNotes />, target)
}
