'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type Props = {
  mobile?: boolean
}

export default function NotificationsNavLink({ mobile = false }: Props) {
  const [total, setTotal] = useState(0)

  async function load() {
    try {
      const response = await fetch('/api/notifications/unread', { cache: 'no-store' })
      const result = await response.json().catch(() => ({}))
      if (response.ok) setTotal(Number(result.total || 0))
    } catch {
      // Keep navigation usable if the unread counter cannot refresh.
    }
  }

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 15000)
    return () => window.clearInterval(timer)
  }, [])

  if (mobile) {
    return (
      <Link prefetch={false} className="mobile-leads-link" href="/notifications">
        <b style={total > 0 ? { filter: 'drop-shadow(0 0 5px #f59e0b)' } : undefined}>🔔</b>
        <span>NOTIFY</span>
        {total > 0 && <i className="mobile-leads-count">{total}</i>}
      </Link>
    )
  }

  return (
    <Link prefetch={false} className="nav-link nav-leads" href="/notifications" style={total > 0 ? { boxShadow: 'inset 3px 0 0 #f59e0b' } : undefined}>
      <span>NOTIFICATIONS</span>
      {total > 0 && <span className="nav-leads-count">{total}</span>}
    </Link>
  )
}
