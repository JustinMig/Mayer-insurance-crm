'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

type Conversation = {
  client_id: string
  client_name: string
  phone: string
  latest_body: string
  latest_at: string
  unread_count: number
}

type Payload = {
  total: number
  conversations: Conversation[]
}

export default function UnreadSmsDashboardCard() {
  const pathname = usePathname()
  const [payload, setPayload] = useState<Payload>({ total: 0, conversations: [] })

  async function load() {
    const response = await fetch('/api/sms/unread', { cache: 'no-store' })
    const result = await response.json().catch(() => ({}))
    if (response.ok) {
      setPayload({
        total: Number(result.total || 0),
        conversations: Array.isArray(result.conversations) ? result.conversations : []
      })
    }
  }

  useEffect(() => {
    if (pathname !== '/dashboard') return
    void load()
    const timer = window.setInterval(() => void load(), 15000)
    return () => window.clearInterval(timer)
  }, [pathname])

  if (pathname !== '/dashboard' || payload.total < 1) return null

  return (
    <section className="card card-pad" style={{ marginBottom: 18, border: '2px solid #b78b3f' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 900, letterSpacing: '.08em', color: '#7a5515' }}>NEW MESSAGES</span>
          <h2 style={{ margin: '5px 0 0' }}>{payload.total} unread {payload.total === 1 ? 'text' : 'texts'}</h2>
          <p className="subtle" style={{ margin: '5px 0 0' }}>Click a client to open that text conversation.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        {payload.conversations.map((conversation) => (
          <Link
            prefetch={false}
            key={conversation.client_id}
            href={`/clients/${conversation.client_id}?text=1`}
            style={{ textDecoration: 'none', color: 'inherit', border: '1px solid #d7d9d8', borderRadius: 12, padding: '12px 14px', background: '#fffefa', display: 'grid', gap: 4 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <strong>{conversation.client_name}</strong>
              <span style={{ minWidth: 26, height: 26, padding: '0 8px', borderRadius: 999, display: 'grid', placeItems: 'center', background: '#10263f', color: '#fff', fontSize: 12, fontWeight: 900 }}>{conversation.unread_count}</span>
            </div>
            <span style={{ fontSize: 13 }}>{conversation.latest_body}</span>
            <small className="subtle">{new Date(conversation.latest_at).toLocaleString()}</small>
          </Link>
        ))}
      </div>
    </section>
  )
}
