'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

const NEW_CLIENT_RESET_KEY = 'crm-reset-new-client-form'
const LEGACY_ACTIVE_CLIENT_KEY = 'crm-active-client-id'

export default function ClientDraftGuard() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchKey = searchParams.toString()
  const lastClientIdRef = useRef('')

  useEffect(() => {
    // Never let the old "active client" behavior redirect Client Records back
    // into a previously opened record.
    sessionStorage.removeItem(LEGACY_ACTIVE_CLIENT_KEY)

    // After a newly-created client has been opened, make the next New Client
    // visit start with a completely fresh browser/React form. This protects
    // against Safari/iOS back-forward cache carrying one person's fields or
    // staged file state into the next client.
    if (pathname === '/clients/new') {
      lastClientIdRef.current = ''
      if (sessionStorage.getItem(NEW_CLIENT_RESET_KEY) === '1') {
        sessionStorage.removeItem(NEW_CLIENT_RESET_KEY)
        window.location.reload()
      }
      return
    }

    const match = pathname.match(/^\/clients\/([^/]+)$/)
    if (!match) {
      lastClientIdRef.current = ''
      return
    }

    const clientId = match[1]

    if (searchParams.get('created') === '1') {
      sessionStorage.setItem(NEW_CLIENT_RESET_KEY, '1')
    }

    // Old versions of the CRM stored unsaved client-profile drafts. Remove any
    // leftover copy so another record can never inherit restored form values.
    sessionStorage.removeItem(`crm-client-draft:${clientId}`)
    sessionStorage.removeItem(`crm-client-save-to-search:${clientId}`)

    // Client profile inputs are intentionally mostly uncontrolled for speed.
    // Force a full remount whenever the dynamic client ID changes so the live
    // values from record A can never be submitted on record B.
    if (lastClientIdRef.current && lastClientIdRef.current !== clientId) {
      lastClientIdRef.current = clientId
      window.location.reload()
      return
    }
    lastClientIdRef.current = clientId

    let disposed = false
    let observer: MutationObserver | null = null

    const verifyRenderedClient = () => {
      const form = document.querySelector<HTMLFormElement>('form.client-profile-form')
      if (!form) return false

      const formClientId = (form.elements.namedItem('client_id') as HTMLInputElement | null)?.value || ''
      if (formClientId && formClientId !== clientId) {
        window.location.reload()
      }
      return true
    }

    if (!verifyRenderedClient()) {
      observer = new MutationObserver(() => {
        if (disposed) return
        if (verifyRenderedClient()) {
          observer?.disconnect()
          observer = null
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })
    }

    return () => {
      disposed = true
      observer?.disconnect()
    }
  }, [pathname, searchKey, searchParams])

  // There is intentionally no unsaved-changes modal. Leaving Client Records
  // simply leaves the page; changes are saved only when Save Changes is tapped.
  return null
}
