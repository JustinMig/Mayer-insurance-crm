'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import RingCentralCallLink from './RingCentralCallLink'
import { toRingCentralNumber } from '@/lib/ringcentral-call-target'

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
  }, [isClientRecord, pilot, pathname])

  const dialNumber = useMemo(() => toRingCentralNumber(phone), [phone])

  if (!isClientRecord || !pilot || !host || !dialNumber) return null

  return createPortal(
    <div className="ringcentral-outbound-call-wrap">
      <RingCentralCallLink phone={dialNumber} className="btn btn-primary ringcentral-outbound-call-button">
        ☎ Call with RingCentral
      </RingCentralCallLink>
      <style jsx global>{`
        .ringcentral-outbound-call-wrap{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .ringcentral-outbound-call-button{cursor:pointer;text-decoration:none}
      `}</style>
    </div>,
    host
  )
}
