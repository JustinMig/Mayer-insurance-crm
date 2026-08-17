'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

type Payload = {
  total: number
}

export default function UnreadSmsDashboardCard() {
  const pathname = usePathname()
  const [payload, setPayload] = useState<Payload>({ total: 0 })

  async function load() {
    const response = await fetch('/api/sms/unread', { cache: 'no-store' })
    const result = await response.json().catch(() => ({}))
    if (response.ok) setPayload({ total: Number(result.total || 0) })
  }

  useEffect(() => {
    if (pathname !== '/dashboard') return
    void load()
    const timer = window.setInterval(() => void load(), 15000)
    return () => window.clearInterval(timer)
  }, [pathname])

  if (pathname !== '/dashboard') return null

  return (
    <section className="card card-pad" style={{ marginBottom: 18, border: payload.total > 0 ? '2px solid #b78b3f' : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ minWidth: 58, height: 58, borderRadius: 14, display: 'grid', placeItems: 'center', background: '#10263f', color: '#fff', fontSize: 24, fontWeight: 900 }}>
            {payload.total}
          </div>
          <div>
            <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 900, letterSpacing: '.08em', color: payload.total > 0 ? '#7a5515' : '#657084' }}>MESSAGES</span>
            <h2 style={{ margin: '4px 0 0' }}>{payload.total} new {payload.total === 1 ? 'message' : 'messages'}</h2>
            <p className="subtle" style={{ margin: '5px 0 0' }}>Open all client text conversations and manage unread messages.</p>
          </div>
        </div>
        <Link prefetch={false} href="/messages" className="btn btn-primary">OPEN MESSAGES</Link>
      </div>
    </section>
  )
}
