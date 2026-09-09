'use client'

import { useEffect, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { getCallPlatform, ringCentralCallHref } from '@/lib/ringcentral-call-target'
import type { CallPlatform } from '@/lib/ringcentral-call-target'

export default function RingCentralCallLink({ phone, className, children }: {
  phone: string
  className: string
  children: ReactNode
}) {
  const [platform, setPlatform] = useState<CallPlatform | null>(null)

  useEffect(() => {
    setPlatform(getCallPlatform(navigator))
  }, [])

  if (!platform) return null
  const href = ringCentralCallHref(phone, platform)
  if (!href) return null

  const mac = platform === 'mac'
  const chromeOnMac = mac && /Chrome|CriOS/i.test(navigator.userAgent || '') && !/Edg|OPR/i.test(navigator.userAgent || '')

  function startCall(event: MouseEvent<HTMLAnchorElement>) {
    if (!chromeOnMac) return
    // RingCentral documents a JavaScript location handoff for Chrome when
    // using rcmobile://. Safari uses the ordinary href directly.
    event.preventDefault()
    const targetWindow = window.parent || window
    targetWindow.location.assign(href)
  }

  return (
    <span className="ringcentral-call-control">
      <a
        href={href}
        {...(mac ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
        onClick={startCall}
        className={className}
        title="Call this client with RingCentral"
      >
        {children}
      </a>
      <style jsx global>{`
        .ringcentral-call-control{display:inline-flex;align-items:center;max-width:100%}
        .ringcentral-call-control>a{text-decoration:none;cursor:pointer}
      `}</style>
    </span>
  )
}
