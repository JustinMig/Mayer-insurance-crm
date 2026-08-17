'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

type SmsMessage = {
  id: string
  direction: 'inbound' | 'outbound'
  body: string
  status: string
  error_code: string | null
  read_at: string | null
  created_at: string
}

type Conversation = {
  client_id: string
  client_name: string
  phone: string
  unread_count: number
  latest_body: string
  latest_at: string
  messages: SmsMessage[]
}

export default function MessagesCenter() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [totalUnread, setTotalUnread] = useState(0)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    try {
      const response = await fetch('/api/sms/conversations', { cache: 'no-store' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to load messages.')
      setConversations(Array.isArray(result.conversations) ? result.conversations : [])
      setTotalUnread(Number(result.total_unread || 0))
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load messages.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 15000)
    return () => window.clearInterval(timer)
  }, [])

  const selectedUnread = useMemo(() => conversations.filter((c) => selected.has(c.client_id) && c.unread_count > 0), [conversations, selected])

  function toggleOpen(id: string) {
    setOpenIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function clearUnread(clientIds: string[]) {
    if (!clientIds.length || busy) return
    setBusy(true)
    try {
      const response = await fetch('/api/sms/conversations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_ids: clientIds })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to clear unread messages.')
      setSelected((current) => {
        const next = new Set(current)
        clientIds.forEach((id) => next.delete(id))
        return next
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to clear unread messages.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'end', flexWrap: 'wrap' }}>
        <div className="clients-page-heading">
          <h1>Messages</h1>
          <p className="subtle">All client text conversations, including read and unread messages.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="card" style={{ padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
            <strong style={{ fontSize: 22 }}>{totalUnread}</strong><span className="subtle">new</span>
          </div>
          <button type="button" className="btn btn-secondary" disabled={!selectedUnread.length || busy} onClick={() => void clearUnread(selectedUnread.map((c) => c.client_id))}>
            {busy ? 'Clearing…' : `CLEAR SELECTED${selectedUnread.length ? ` (${selectedUnread.length})` : ''}`}
          </button>
        </div>
      </div>

      {error ? <div className="card card-pad" style={{ marginTop: 18, border: '1px solid #b42318' }}>{error}</div> : null}

      <section style={{ display: 'grid', gap: 12, marginTop: 20 }}>
        {loading ? <div className="card card-pad">Loading messages…</div> : null}
        {!loading && !conversations.length ? <div className="card card-pad"><strong>No text conversations yet.</strong></div> : null}

        {conversations.map((conversation) => {
          const isOpen = openIds.has(conversation.client_id)
          return (
            <article className="card" key={conversation.client_id} style={{ overflow: 'hidden', border: conversation.unread_count > 0 ? '2px solid #b78b3f' : undefined }}>
              <div style={{ padding: 14, display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input type="checkbox" checked={selected.has(conversation.client_id)} onChange={() => toggleSelected(conversation.client_id)} aria-label={`Select ${conversation.client_name}`} />
                    <div>
                      <strong>{conversation.client_name}</strong>
                      <div className="subtle" style={{ fontSize: 12 }}>{conversation.phone || 'No phone number saved'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {conversation.unread_count > 0 ? <span style={{ background: '#10263f', color: '#fff', borderRadius: 999, padding: '5px 9px', fontSize: 12, fontWeight: 900 }}>{conversation.unread_count} unread</span> : <span className="subtle" style={{ fontSize: 12 }}>All read</span>}
                    {conversation.unread_count > 0 ? <button type="button" className="btn btn-secondary btn-small" disabled={busy} onClick={() => void clearUnread([conversation.client_id])}>CLEAR UNREAD</button> : null}
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => toggleOpen(conversation.client_id)}>{isOpen ? 'HIDE' : 'VIEW MESSAGES'}</button>
                    <Link prefetch={false} href={`/clients/${conversation.client_id}?text=1`} className="btn btn-primary btn-small">OPEN CLIENT</Link>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{conversation.latest_body}</span>
                  <small className="subtle">{new Date(conversation.latest_at).toLocaleString()}</small>
                </div>
              </div>

              {isOpen ? (
                <div style={{ borderTop: '1px solid #e2e8f0', background: '#f7f9fb', padding: 14, display: 'grid', gap: 10 }}>
                  {conversation.messages.map((message) => (
                    <div key={message.id} style={{ justifySelf: message.direction === 'outbound' ? 'end' : 'start', maxWidth: '86%', padding: '10px 12px', borderRadius: 12, background: message.direction === 'outbound' ? '#dfeaf3' : '#fff', border: message.direction === 'inbound' ? '1px solid #dbe3ea' : undefined }}>
                      <div>{message.body}</div>
                      <small className="subtle" style={{ display: 'block', marginTop: 5 }}>
                        {new Date(message.created_at).toLocaleString()} · {message.direction === 'inbound' ? (message.read_at ? 'Read' : 'Unread') : message.status}
                        {message.error_code ? ` · Error ${message.error_code}` : ''}
                      </small>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          )
        })}
      </section>
    </>
  )
}
