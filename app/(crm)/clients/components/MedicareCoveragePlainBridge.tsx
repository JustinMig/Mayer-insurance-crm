'use client'

import { useEffect, useMemo } from 'react'
import { usePathname } from 'next/navigation'

function clientIdFromPath(pathname: string) {
  const match = pathname.match(/^\/clients\/([^/]+)$/)
  if (!match || match[1] === 'new') return ''
  return decodeURIComponent(match[1])
}

function prepareField(input: HTMLInputElement, value?: string) {
  const container = input.closest<HTMLElement>('.label')
  const reveal = container?.querySelector<HTMLElement>('.sensitive-reveal')
  const clearLine = container?.querySelector<HTMLElement>('.clear-sensitive')
  const clearBox = clearLine?.querySelector<HTMLInputElement>('input[type="checkbox"]')

  if (typeof value === 'string' && document.activeElement !== input) input.value = value
  input.placeholder = input.name === 'medicare_number' ? 'Medicare number' : 'Medicaid number'
  if (reveal) reveal.style.display = 'none'
  if (clearLine) clearLine.style.display = 'none'
  if (clearBox) clearBox.checked = input.value.trim() === ''

  if (input.dataset.plainMedicareBound === '1') return
  input.dataset.plainMedicareBound = '1'
  input.addEventListener('input', () => {
    if (clearBox) clearBox.checked = input.value.trim() === ''
  })
}

export default function MedicareCoveragePlainBridge() {
  const pathname = usePathname()
  const clientId = useMemo(() => clientIdFromPath(pathname), [pathname])
  const isNewClient = pathname === '/clients/new'

  useEffect(() => {
    if (!isNewClient) return
    let observer: MutationObserver | null = null

    const apply = () => {
      const medicare = document.querySelector<HTMLInputElement>('.add-client-form input[name="medicare_number"]')
      const medicaid = document.querySelector<HTMLInputElement>('.add-client-form input[name="medicaid_number"]')
      if (medicare) prepareField(medicare)
      if (medicaid) prepareField(medicaid)
      return Boolean(medicare && medicaid)
    }

    if (!apply()) {
      observer = new MutationObserver(() => {
        if (apply()) {
          observer?.disconnect()
          observer = null
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })
    }

    return () => observer?.disconnect()
  }, [isNewClient])

  useEffect(() => {
    if (!clientId) return
    let cancelled = false
    let observer: MutationObserver | null = null

    void (async () => {
      try {
        const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/medicare-basic`, { cache: 'no-store' })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'Unable to load Medicare information.')
        if (cancelled) return

        const apply = () => {
          const medicare = document.querySelector<HTMLInputElement>('.client-profile-form input[name="medicare_number"]')
          const medicaid = document.querySelector<HTMLInputElement>('.client-profile-form input[name="medicaid_number"]')
          if (medicare) prepareField(medicare, String(data.medicare_number || ''))
          if (medicaid) prepareField(medicaid, String(data.medicaid_number || ''))
          return Boolean(medicare && medicaid)
        }

        if (!apply()) {
          observer = new MutationObserver(() => {
            if (apply()) {
              observer?.disconnect()
              observer = null
            }
          })
          observer.observe(document.body, { childList: true, subtree: true })
        }
      } catch {
        // If the direct loader fails, leave the existing protected field UI in place as a safe fallback.
      }
    })()

    return () => {
      cancelled = true
      observer?.disconnect()
    }
  }, [clientId])

  return null
}
