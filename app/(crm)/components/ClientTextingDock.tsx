'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

type SmsMessage = {
  id: string
  direction: 'outbound' | 'inbound'
  body: string
  status: string
  error_code: string | null
  read_at?: string | null
  created_at: string
}

const styles: Record<string, CSSProperties> = {
  dock: {
    position: 'fixed', right: 18, bottom: 'calc(72px + env(safe-area-inset-bottom))', zIndex: 45,
    border: 0, borderRadius: 999, padding: '12px 16px', background: '#10263f', color: '#fff',
    fontWeight: 900, boxShadow: '0 10px 28px rgba(16,38,63,.28)', display: 'flex', gap: 7, alignItems: 'center'
  },
  backdrop: {
    position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(15,23,42,.58)', display: 'grid',
    placeItems: 'center', padding: 14
  },
  panel: {
    width: 'min(620px, 100%)', maxHeight: 'min(760px, calc(100dvh - 28px))', background: '#fff',
    borderRadius: 18, boxShadow: '0 24px 80px rgba(15,23,42,.28)', display: 'grid', gridTemplateRows: 'auto 1fr auto auto', overflow: 'hidden'
  },
  head: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: 16, borderBottom: '1px solid #e2e8f0' },
  headText: { display: 'grid', gap: 3 },
  phone: { fontSize: 12, color: '#657084' },
  thread: { minHeight: 240, overflowY: 'auto', padding: 14, display: 'grid', gap: 10, alignContent: 'start', background: '#f7f9fb' },
  outbound: { justifySelf: 'end', maxWidth: '84%', padding: '10px 12px', borderRadius: '14px 14px 4px 14px', background: '#dfeaf3', color: '#173856' },
  inbound: { justifySelf: 'start', maxWidth: '84%', padding: '10px 12px', borderRadius: '14px 14px 14px 4px', background: '#fff', border: '1px solid #dbe3ea', color: '#172033' },
  meta: { display: 'block', marginTop: 5, fontSize: 10, color: '#657084', lineHeight: 1.3 },
  empty: { color: '#657084', textAlign: 'center', padding: '44px 12px' },
  compose: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: 14, borderTop: '1px solid #e2e8f0', background: '#fff' },
  textarea: { minHeight: 76, resize: 'vertical' },
  status: { padding: '0 14px 12px', background: '#fff' }
}

export default function ClientTextingDock() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const clientId = useMemo(() => {
    const match = pathname.match(/^\/clients\/([^/]+)$/)
    return match?.[1] || ''
  }, [pathname])
  const openFromDashboard = searchParams.get('text') === '1'
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<SmsMessage[]>([])
  const [phone, setPhone] = useState('')
  const [clientName, setClientName] = useState('Client')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState('')
  const [sending, setSending] = useState(false)
  const loadingRef = useRef(false)

  const load = useCallback(async () => {
    if (!clientId || loadingRef.current) return false
    loadingRef.current = true
    try {
      const response = await fetch(`/api/clients/${clientId}/sms`, { cache: 'no-store' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) return false
      const nextMessages = Array.isArray(result.messages) ? result.messages as SmsMessage[] : []
      setMessages(nextMessages)
      setPhone(result.phone || '')
      setClientName(result.client_name || 'Client')
      return nextMessages.some((message) => message.direction === 'inbound' && !message.read_at)
    } finally {
      loadingRef.current = false
    }
  }, [clientId])

  const markRead = useCallback(async () => {
    if (!clientId) return
    await fetch(`/api/clients/${clientId}/sms`, { method: 'PATCH', cache: 'no-store' }).catch(() => null)
  }, [clientId])

  async function openThread() {
    setOpen(true)
    await markRead()
    await load()
  }

  useEffect(() => {
    setOpen(openFromDashboard)
    setMessages([])
    setPhone('')
    setClientName('Client')
    setBody('')
    setStatus('')
    if (!clientId || !openFromDashboard) return
    void (async () => {
      await markRead()
      await load()
    })()
  }, [clientId, openFromDashboard, load, markRead])

  useEffect(() => {
    if (!open || !clientId) return

    const refresh = async () => {
      if (document.visibilityState === 'hidden') return
      const hasUnread = await load()
      if (hasUnread) await markRead()
    }

    const timer = window.setInterval(() => void refresh(), 10_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [open, clientId, load, markRead])

  if (!clientId) return null

  async function send() {
    const text = body.trim()
    if (!text || sending) return
    setSending(true)
    setStatus('Sending…')
    try {
      const response = await fetch(`/api/clients/${clientId}/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to send text.')
      setBody('')
      setStatus('Sent.')
      await load()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to send text.')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <button type="button" style={styles.dock} onClick={() => { void openThread() }} aria-label={`Text ${clientName}`}>
        ✉ <span>TEXT</span>
      </button>
      {open ? (
        <div style={styles.backdrop} role="dialog" aria-modal="true" aria-label={`Text ${clientName}`} onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
          <section style={styles.panel}>
            <div style={styles.head}>
              <div style={styles.headText}><strong>Text {clientName}</strong><span style={styles.phone}>{phone || 'Loading phone number…'}</span></div>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setOpen(false)}>Close</button>
            </div>
            <div style={styles.thread}>
              {messages.length ? messages.map((message) => (
                <div key={message.id} style={message.direction === 'outbound' ? styles.outbound : styles.inbound}>
                  <div>{message.body}</div>
                  <small style={styles.meta}>{new Date(message.created_at).toLocaleString()} · {message.status}{message.error_code ? ` · Error ${message.error_code}` : ''}</small>
                </div>
              )) : <div style={styles.empty}>No messages yet. Send the first text below.</div>}
            </div>
            <div style={styles.compose}>
              <textarea className="textarea" style={styles.textarea} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1500} placeholder="Type a text message…" disabled={!phone || sending} />
              <button type="button" className="btn btn-primary" onClick={send} disabled={!phone || !body.trim() || sending}>{sending ? 'Sending…' : 'Send Text'}</button>
            </div>
            {status ? <div className="field-help" style={styles.status}>{status}</div> : null}
          </section>
        </div>
      ) : null}
    </>
  )
}
