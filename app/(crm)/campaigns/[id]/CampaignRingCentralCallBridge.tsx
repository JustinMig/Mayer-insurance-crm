'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

type CallTarget = {
  key: string
  host: HTMLElement
  phone: string
}

function toRingCentralNumber(value: string) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 10) return `1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return digits
  return digits
}

function isAppleDevice() {
  if (typeof navigator === 'undefined') return false
  const userAgent = navigator.userAgent || ''
  const platform = navigator.platform || ''
  const isiOS = /iPad|iPhone|iPod/i.test(userAgent) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isMac = /Macintosh|Mac OS X/i.test(userAgent) || /^Mac/i.test(platform)
  return isiOS || isMac
}

export default function CampaignRingCentralCallBridge() {
  const [targets, setTargets] = useState<CallTarget[]>([])

  useEffect(() => {
    let scheduled = false

    const scan = () => {
      scheduled = false
      const rows = Array.from(document.querySelectorAll<HTMLElement>('.campaign-client-row'))
      const next: CallTarget[] = []

      rows.forEach((row, index) => {
        const host = row.querySelector<HTMLElement>('.campaign-person-title-line')
        const phoneText = row.querySelector<HTMLElement>('.campaign-client-phone')?.textContent || ''
        const phone = toRingCentralNumber(phoneText)
        if (!host || phone.length < 10) return

        const clientLink = row.querySelector<HTMLAnchorElement>('.campaign-client-name')
        const key = `${clientLink?.getAttribute('href') || 'client'}:${phone}:${index}`
        next.push({ key, host, phone })
      })

      setTargets(next)
    }

    const scheduleScan = () => {
      if (scheduled) return
      scheduled = true
      window.requestAnimationFrame(scan)
    }

    scan()
    const observer = new MutationObserver(scheduleScan)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  const apple = isAppleDevice()

  return (
    <>
      {targets.map((target) => {
        const href = apple
          ? `rcmobile://call?number=${encodeURIComponent(target.phone)}`
          : `https://app.ringcentral.com/r/call?number=${encodeURIComponent(target.phone)}`
        return createPortal(
          <a
            key={target.key}
            className="campaign-ringcentral-call"
            href={href}
            target={apple ? undefined : '_blank'}
            rel={apple ? undefined : 'noopener noreferrer'}
            title={apple ? 'Call this client in the RingCentral app' : 'Call this client with RingCentral'}
            aria-label="Call client with RingCentral"
          >
            ☎ Call
          </a>,
          target.host
        )
      })}
      <style jsx global>{`
        .campaign-ringcentral-call{
          appearance:none;
          border:1px solid #9ab1c2;
          border-radius:999px;
          background:#edf5fa;
          color:#315b76;
          min-height:27px;
          padding:4px 9px;
          font:inherit;
          font-size:.68rem;
          font-weight:900;
          line-height:1;
          cursor:pointer;
          white-space:nowrap;
          text-decoration:none;
          display:inline-flex;
          align-items:center;
        }
        .campaign-ringcentral-call:hover{background:#dfeef6;color:#244b64}
        @media(max-width:720px){
          .campaign-ringcentral-call{min-height:30px;padding:5px 10px;font-size:.7rem}
        }
      `}</style>
    </>
  )
}
