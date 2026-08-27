'use client'

import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

const CURRENT_ROUTE_KEY = 'mayer-crm-current-route'
const PREVIOUS_ROUTE_KEY = 'mayer-crm-previous-route'

function currentRoute() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function isCrmRoute(value: string | null) {
  return Boolean(value && value.startsWith('/') && !value.startsWith('/login') && !value.startsWith('/auth/'))
}

export default function PreviousPageButton() {
  const pathname = usePathname()
  const router = useRouter()
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null)
  const [hasPrevious, setHasPrevious] = useState(false)

  useEffect(() => {
    const content = document.querySelector<HTMLElement>('.content')
    if (!content) return

    let host = content.querySelector<HTMLElement>('#previous-page-navigation-mount')
    let created = false
    if (!host) {
      host = document.createElement('div')
      host.id = 'previous-page-navigation-mount'
      content.prepend(host)
      created = true
    }
    setMountNode(host)

    return () => {
      if (created && host?.isConnected) host.remove()
      setMountNode(null)
    }
  }, [])

  useEffect(() => {
    const current = currentRoute()
    const storedCurrent = window.sessionStorage.getItem(CURRENT_ROUTE_KEY)

    if (isCrmRoute(storedCurrent) && storedCurrent !== current) {
      window.sessionStorage.setItem(PREVIOUS_ROUTE_KEY, storedCurrent as string)
    }

    window.sessionStorage.setItem(CURRENT_ROUTE_KEY, current)
    const previous = window.sessionStorage.getItem(PREVIOUS_ROUTE_KEY)
    setHasPrevious(isCrmRoute(previous) || window.history.length > 1)
  }, [pathname])

  function goBack() {
    const previous = window.sessionStorage.getItem(PREVIOUS_ROUTE_KEY)

    if (window.history.length > 1 && isCrmRoute(previous)) {
      router.back()
      return
    }

    if (isCrmRoute(previous)) {
      router.push(previous as string)
      return
    }

    if (pathname !== '/dashboard') router.push('/dashboard')
  }

  if (!mountNode) return null
  const disabled = pathname === '/dashboard' && !hasPrevious

  return createPortal(
    <div className="previous-page-row">
      <button
        type="button"
        className="previous-page-button"
        onClick={goBack}
        disabled={disabled}
        aria-label="Go to previous page"
      >
        <span aria-hidden="true">←</span>
        <span>PREVIOUS PAGE</span>
      </button>
      <style jsx global>{`
        .previous-page-row{display:flex;align-items:center;min-height:38px;margin:0 0 12px}
        .previous-page-button{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:38px;padding:7px 12px;border:1px solid #cbd6de;border-radius:9px;background:#f8fafb;color:#40586a;font:inherit;font-size:.72rem;font-weight:900;letter-spacing:.025em;cursor:pointer;box-shadow:0 2px 7px rgba(31,48,62,.05);touch-action:manipulation}
        .previous-page-button:hover{background:#eef3f6;border-color:#afc0cc;color:#263f53}
        .previous-page-button:focus-visible{outline:3px solid rgba(82,109,130,.22);outline-offset:2px}
        .previous-page-button:disabled{opacity:.4;cursor:default;background:#f5f6f7}
        .previous-page-button>span:first-child{font-size:1rem;line-height:1}
        @media(max-width:760px){.previous-page-row{margin-bottom:10px}.previous-page-button{min-height:44px;padding:9px 13px;font-size:.72rem}}
      `}</style>
    </div>,
    mountNode
  )
}
