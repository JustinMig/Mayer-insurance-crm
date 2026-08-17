'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

type Payload = {
  total: number
  boards: Record<string, number>
}

function MessageBoard({ title, count, href }: { title: string; count: number; href: string }) {
  return (
    <section className="card card-pad" style={{ border: count > 0 ? '2px solid #b78b3f' : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ minWidth: 58, height: 58, borderRadius: 14, display: 'grid', placeItems: 'center', background: '#10263f', color: '#fff', fontSize: 24, fontWeight: 900 }}>{count}</div>
          <div>
            <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 900, letterSpacing: '.08em', color: count > 0 ? '#7a5515' : '#657084' }}>{title.toUpperCase()}</span>
            <h2 style={{ margin: '4px 0 0' }}>{count} new {count === 1 ? 'message' : 'messages'}</h2>
          </div>
        </div>
        <Link prefetch={false} href={href} className="btn btn-primary">OPEN MESSAGES</Link>
      </div>
    </section>
  )
}

export default function UnreadSmsDashboardCard({ viewerName = '' }: { viewerName?: string }) {
  const pathname = usePathname()
  const [payload, setPayload] = useState<Payload>({ total: 0, boards: {} })

  async function load() {
    const response = await fetch('/api/sms/unread', { cache: 'no-store' })
    const result = await response.json().catch(() => ({}))
    if (response.ok) setPayload({ total: Number(result.total || 0), boards: result.boards || {} })
  }

  useEffect(() => {
    if (pathname !== '/dashboard') return
    void load()
    const timer = window.setInterval(() => void load(), 15000)
    return () => window.clearInterval(timer)
  }, [pathname])

  if (pathname !== '/dashboard') return null

  const isSheena = viewerName.trim().toLowerCase() === 'sheena hester'
  if (isSheena) {
    return (
      <div style={{ display: 'grid', gap: 12, marginBottom: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <MessageBoard title="Justin Messages" count={Number(payload.boards['Justin Mayer'] || 0)} href="/messages?agent=justin" />
        <MessageBoard title="Isaiah Messages" count={Number(payload.boards['Isaiah Hernandez'] || 0)} href="/messages?agent=isaiah" />
      </div>
    )
  }

  return <div style={{ marginBottom: 18 }}><MessageBoard title="Messages" count={payload.total} href="/messages" /></div>
}
