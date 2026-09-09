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

export default function RingCentralOutboundCallBridge() {
  const pathname = usePathname()
  const isClientRecord = /^\/clients\/[0-9a-f-]{36}$/i.test(pathname)
  const [pilot, setPilot] = useState(false)
  const [phone, setPhone] = useState('')
  const [host, setHost] = useState<HTMLElement | null>(null)

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
    window.location.assign(`rcmobile://call?number=${encodeURIComponent(dialNumber)}`)
  }

  return createPortal(
    <button
      type="button"
      className="btn btn-primary ringcentral-outbound-call-button"
      onClick={startCall}
      title="Open RingCentral and call this client"
    >
      ☎ Call with RingCentral
    </button>,
    host
  )
}
