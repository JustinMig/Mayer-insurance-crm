'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export default function CallListNavLinks() {
  const [desktopHost, setDesktopHost] = useState<HTMLElement | null>(null)
  const [mobileHost, setMobileHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const desktop = document.querySelector<HTMLElement>('.nav')
    const mobile = document.querySelector<HTMLElement>('.mobile-nav')
    setDesktopHost(desktop)
    setMobileHost(mobile)
  }, [])

  return (
    <>
      {desktopHost ? createPortal(
        <Link prefetch={false} className="nav-link nav-outreach" href="/campaigns">OUTREACH</Link>,
        desktopHost
      ) : null}
      {mobileHost ? createPortal(
        <Link prefetch={false} className="mobile-outreach-link" href="/campaigns"><b>◎</b><span>OUTREACH</span></Link>,
        mobileHost
      ) : null}
      <style jsx global>{`
        .nav .nav-outreach{background:#e5e8ef!important;color:#48546a!important;box-shadow:inset 4px 0 0 #8894aa}
        .nav .nav-outreach:hover{background:#d9dee8!important;color:#3d485c!important}
        .mobile-nav .mobile-outreach-link{background:#f0f1f6!important;color:#48546a!important;border-top:3px solid #8894aa}
        .call-button{display:none!important}
      `}</style>
    </>
  )
}
