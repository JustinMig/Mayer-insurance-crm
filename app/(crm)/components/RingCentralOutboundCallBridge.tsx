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

function launchRingCentralCall(dialNumber: string) {
  const nativeUrl = `rcmobile://call?number=${encodeURIComponent(dialNumber)}`
  const webUrl = `https://app.ringcentral.com/r/call?number=${encodeURIComponent(dialNumber)}`
  let handedOff = false
  let timer = 0

  const cleanup = () => {
    window.removeEventListener('blur', onBlur)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    if (timer) window.clearTimeout(timer)
  }
  const onBlur = () => {
    handedOff = true
    cleanup()
  }
  const onVisibilityChange = () => {
    if (document.hidden) {
      handedOff = true
      cleanup()
    }
  }

  window.addEventListener('blur', onBlur, { once: true })
  document.addEventListener('visibilitychange', onVisibilityChange)

  // RingCentral documents rcmobile://call for handing a call to its installed
  // app. Use a direct user-gesture navigation because Chrome requires the
  // JavaScript assignment path and it also works in other modern browsers.
  try {
    const targetWindow = window.parent || window
    targetWindow.location.assign(nativeUrl)
  } catch {
    window.location.assign(nativeUrl)
  }

  // Some browsers/device installs fail silently when the RingCentral URI
  // handler is not registered. Never leave the CRM button inert: if the app
  // did not take focus, fall back to RingCentral's working call route.
  timer = window.setTimeout(() => {
    cleanup()
    if (!handedOff && document.visibilityState === 'visible') {
      window.location.assign(webUrl)
    }
  }, 1400)
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

  const startCall = () => {
    setLaunchMessage('Opening RingCentral…')
    launchRingCentralCall(dialNumber)
    window.setTimeout(() => {
      if (document.visibilityState === 'visible') {
        setLaunchMessage('Opening RingCentral. If the installed app cannot accept the call link, the RingCentral call page will open automatically.')
      }
    }, 1700)
  }

  return createPortal(
    <div className="ringcentral-outbound-call-wrap">
      <button
        type="button"
        className="btn btn-primary ringcentral-outbound-call-button"
        onClick={startCall}
        title="Open RingCentral and call this client"
      >
        ☎ Call with RingCentral
      </button>
      {launchMessage ? <span className="ringcentral-outbound-call-message">{launchMessage}</span> : null}
      <style jsx global>{`
        .ringcentral-outbound-call-wrap{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .ringcentral-outbound-call-button{cursor:pointer}
        .ringcentral-outbound-call-message{max-width:390px;color:#64748b;font-size:.72rem;font-weight:700}
      `}</style>
    </div>,
    host
  )
}
