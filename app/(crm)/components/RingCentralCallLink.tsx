'use client'

import type { ReactNode } from 'react'
import { ringCentralCallHref } from '@/lib/ringcentral-call-target'

export default function RingCentralCallLink({ phone, className, children }: {
  phone: string
  className: string
  children: ReactNode
}) {
  const href = ringCentralCallHref(phone)
  if (!href) return null

  // One ordinary, user-initiated link to the pre-change RingCentral call URL.
  // No setup gate, local-storage preference, app-protocol probe, or timer.
  // A real link avoids duplicate launches from window.open returning null.
  return (
    <span className="ringcentral-call-control">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
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
