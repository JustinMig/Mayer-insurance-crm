'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { usePathname } from 'next/navigation'

type SmsMessage = {
  id: string
  direction: 'outbound' | 'inbound'
  body: string
  status: string
  error_code: string | null
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
  const clientId = useMemo(() => {
    const match = pathname.match(/^\/clients\/([^/]+)$/)
    return match?.[1] || ''
  }, [pathname])
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<SmsMessage[]>([])
  const [phone, setPhone] = useState('')
  const [clientName, setClientName] = useState('Client')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState('')
  const [sending, setSending] = useState(false)

  async function load() {
    if (!clientId) return
    const response = await fetch(`/api/clients/${clientId}/sms`, { cache: 'no-store' })
    const result = await response.json().catch(() => ({}))
    if (response.ok) {
      setMessages(result.messages || [])
      setPhone(result.phone || '')
      setClientName(result.client_name || 'Client')
    }
  }

  useEffect(() => {
    setOpen(false)
    setMessages([])
    setBody('')
    setStatus('')
    if (!clientId) return
    void load()
  }, [clientId])

  useEffect(() => {
    if (!open || !clientId) return
    const timer = window.setInterval(() => void load(), 7000)
    return () => window.clearInterval(timer)
  }, [open, clientId])

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
      <button type="button" style={styles.dock} onClick={() => { setOpen(true); void load() }} aria-label={`Text ${clientName}`}>
        ✉ <span>TEXT</span>
      </button>
      {open ? (
        <div style={styles.backdrop} role="dialog" aria-modal="true" aria-label={`Text ${clientName}`} onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
          <section style={styles.panel}>
            <div style={styles.head}>
              <div style={styles.headText}><strong>Text {clientName}</strong><span style={styles.phone}>{phone || 'No phone number saved'}</span></div>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setOpen(false)}>Close</button>
            </div>
            <div style={styles.thread}>
              {messages.length ? messages.map((message) => (
                <div key={message.id} style={message.direction === 'outbound' ? styles.outbound : styles.inbound}>
                  <div>{message.body}</div>
                  <small style={styles.meta}>{new Date(message.created_at).toLocaleString()} · {message.status}{message.error_code ? ` · Error ${message.error_code}` : ''}</small>
                </div>
              )) : <div style={styles.empty}>No messages yet. Send the first test text below.</div>}
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
