'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'

type SmsMessage = {
  id: string
  direction: 'outbound' | 'inbound'
  body: string
  status: string
  error_code: string | null
  created_at: string
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
      <button type="button" className="client-text-dock-button" onClick={() => { setOpen(true); void load() }} aria-label={`Text ${clientName}`}>
        ✉ <span>TEXT</span>
      </button>
      {open ? (
        <div className="client-text-backdrop" role="dialog" aria-modal="true" aria-label={`Text ${clientName}`}>
          <section className="client-text-panel">
            <div className="client-text-panel-head">
              <div><strong>Text {clientName}</strong><span>{phone || 'No phone number saved'}</span></div>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setOpen(false)}>Close</button>
            </div>
            <div className="client-text-thread">
              {messages.length ? messages.map((message) => (
                <div key={message.id} className={`client-text-bubble ${message.direction}`}>
                  <div>{message.body}</div>
                  <small>{new Date(message.created_at).toLocaleString()} · {message.status}{message.error_code ? ` · Error ${message.error_code}` : ''}</small>
                </div>
              )) : <div className="client-text-empty">No messages yet.</div>}
            </div>
            <div className="client-text-compose">
              <textarea className="textarea" value={body} onChange={(e) => setBody(e.target.value)} maxLength={1500} placeholder="Type a text message…" disabled={!phone || sending} />
              <button type="button" className="btn btn-primary" onClick={send} disabled={!phone || !body.trim() || sending}>{sending ? 'Sending…' : 'Send Text'}</button>
            </div>
            {status ? <div className="field-help">{status}</div> : null}
          </section>
        </div>
      ) : null}
    </>
  )
}
