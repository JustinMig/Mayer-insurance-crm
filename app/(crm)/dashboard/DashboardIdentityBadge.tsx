'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import CommissionTopbarButton from './CommissionTopbarButton'

function displayRole(role: string) {
  const value = String(role || '').trim().toLowerCase()
  if (!value) return 'CRM User'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export default function DashboardIdentityBadge({ name, role }: { name: string; role: string }) {
  const pathname = usePathname()
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [topbarHost, setTopbarHost] = useState<HTMLElement | null>(null)
  const isJustin = String(name || '').trim().toLowerCase() === 'justin mayer'

  useEffect(() => {
    if (pathname !== '/dashboard') {
      setHost(null)
      setTopbarHost(null)
      return
    }

    let cancelled = false
    let attempts = 0
    let timer: number | null = null

    const findHosts = () => {
      if (cancelled) return
      const heading = document.querySelector<HTMLElement>('.content .clients-page-heading')
      const topbar = document.querySelector<HTMLElement>('.topbar .topbar-brand')
      if (heading) setHost(heading)
      if (topbar) setTopbarHost(topbar)
      if (heading && topbar) return
      attempts += 1
      if (attempts < 20) timer = window.setTimeout(findHosts, 80)
    }

    findHosts()
    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
      setHost(null)
      setTopbarHost(null)
    }
  }, [pathname])

  if (pathname !== '/dashboard') return null

  return (
    <>
      {host ? createPortal(
        <div className="dashboard-crm-identity" aria-label={`Signed in as ${name}, ${displayRole(role)}`}>
          <strong>{name || 'CRM User'}</strong>
          <span>{displayRole(role)}</span>
          <style jsx global>{`
            .content .clients-page-heading{position:relative}
            .dashboard-crm-identity{display:inline-flex;align-items:center;gap:7px;margin-top:7px;padding:5px 9px;border:1px solid #d2dce5;border-radius:999px;background:#f5f8fa;color:#33485a;font-size:.7rem;line-height:1;font-weight:800;box-shadow:0 1px 3px rgba(15,23,42,.04)}
            .dashboard-crm-identity strong{font-size:.73rem;color:#20384d}.dashboard-crm-identity span{padding-left:7px;border-left:1px solid #cbd5df;color:#6a7885;text-transform:capitalize}
            @media(max-width:720px){.dashboard-crm-identity{margin-top:5px;padding:5px 8px;font-size:.64rem}.dashboard-crm-identity strong{font-size:.68rem}}
          `}</style>
        </div>,
        host
      ) : null}
      {isJustin && topbarHost ? createPortal(<CommissionTopbarButton />, topbarHost) : null}
    </>
  )
}
