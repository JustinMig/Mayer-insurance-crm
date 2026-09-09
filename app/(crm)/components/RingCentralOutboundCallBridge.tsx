'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'

function toRingCentralNumber(value: string) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 10) return `1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return digits
  return digits
}

function isMobileDevice() {
  if (typeof navigator === 'undefined') return false
  const userAgent = navigator.userAgent || ''
  const platform = navigator.platform || ''
  const isiOS = /iPad|iPhone|iPod/i.test(userAgent) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isAndroid = /Android/i.test(userAgent)
  return isiOS || isAndroid
}

function isChromeBrowser() {
  if (typeof navigator === 'undefined') return false
  const userAgent = navigator.userAgent || ''
  return /Chrome|CriOS/i.test(userAgent) && !/Edg|OPR/i.test(userAgent)
}

function nativeRingCentralUrl(dialNumber: string) {
  const encoded = encodeURIComponent(dialNumber)
  return isMobileDevice()
    ? `rcmobile://call?number=${encoded}`
    : `rcapp://r/call?number=${encoded}`
}

export default function RingCentralOutboundCallBridge() {
  const pathname = usePathname()
  const isClientRecord = /^\/clients\/[0-9a-f-]{36}$/i.test(pathname)
  const [pilot, setPilot] = useState(false)
  const [phone, setPhone] = useState('')
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [launchMessage, setLaunchMessage] = useState('')

  useEffect(() => {
    if (!isClientRecord) {
      setPilot(false)
      return
    }

    let cancelled = false
    fetch('/api/ringcentral/sync', { cache: 'no-store' })
      .then((response) => response.json())
      .then((result) => {
        if (!cancelled) setPilot(Boolean(result?.pilot))
      })
      .catch(() => {
        if (!cancelled) setPilot(false)
      })

    return () => { cancelled = true }
  }, [isClientRecord])

  useEffect(() => {
    if (!isClientRecord || !pilot) return

    let attempts = 0
    let timer: number | null = null
    let phoneInput: HTMLInputElement | null = null

    const syncPhone = () => setPhone(phoneInput?.value || '')

    const findTargets = () => {
      attempts += 1
      phoneInput = document.querySelector<HTMLInputElement>('.client-profile-form input[name="phone"]')
      const heading = document.querySelector<HTMLElement>('.content h1')
      const headingRow = heading?.parentElement?.parentElement || null
      const actionHost = headingRow?.lastElementChild instanceof HTMLElement ? headingRow.lastElementChild : null

      if (phoneInput && actionHost) {
        setHost(actionHost)
        syncPhone()
        phoneInput.addEventListener('input', syncPhone)
        phoneInput.addEventListener('change', syncPhone)
        return true
      }

      if (attempts < 30) timer = window.setTimeout(findTargets, 150)
      return false
    }

    findTargets()

    return () => {
      if (timer !== null) window.clearTimeout(timer)
      phoneInput?.removeEventListener('input', syncPhone)
      phoneInput?.removeEventListener('change', syncPhone)
      setHost(null)
    }
  }, [isClientRecord, pilot])

  const dialNumber = useMemo(() => toRingCentralNumber(phone), [phone])

  if (!isClientRecord || !pilot || !host || dialNumber.length < 10) return null

  const nativeUrl = nativeRingCentralUrl(dialNumber)

  const startCall = (event: React.MouseEvent<HTMLAnchorElement>) => {
    setLaunchMessage('Opening the RingCentral app…')

    // RingCentral documents direct native URI links for Safari and other
    // browsers, while Chrome requires a JavaScript location assignment.
    // There is deliberately NO https/web fallback here: these CRM call
    // buttons are native-app-only.
    if (isChromeBrowser()) {
      event.preventDefault()
      try {
        const targetWindow = window.parent || window
        targetWindow.location.assign(nativeUrl)
      } catch {
        window.location.assign(nativeUrl)
      }
    }

    window.setTimeout(() => {
      if (document.visibilityState === 'visible') {
        setLaunchMessage('RingCentral app requested. If it does not open, verify RingCentral is installed and enabled for click-to-dial on this device.')
      }
    }, 1800)
  }

  return createPortal(
    <div className="ringcentral-outbound-call-wrap">
      <a
        className="btn btn-primary ringcentral-outbound-call-button"
        href={nativeUrl}
        onClick={startCall}
        title="Open the installed RingCentral app and call this client"
      >
        ☎ Call with RingCentral
      </a>
      {launchMessage ? <span className="ringcentral-outbound-call-message">{launchMessage}</span> : null}
      <style jsx global>{`
        .ringcentral-outbound-call-wrap{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .ringcentral-outbound-call-button{cursor:pointer;text-decoration:none}
        .ringcentral-outbound-call-message{max-width:390px;color:#64748b;font-size:.72rem;font-weight:700}
      `}</style>
    </div>,
    host
  )
}
