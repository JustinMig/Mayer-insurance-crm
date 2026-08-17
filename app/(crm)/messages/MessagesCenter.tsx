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

type Tab = 'unread' | 'read'

export default function MessagesCenter() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [totalUnread, setTotalUnread] = useState(0)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<Tab>('unread')
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

  const unreadConversations = useMemo(() => conversations.filter((c) => c.unread_count > 0), [conversations])
  const readConversations = useMemo(() => conversations.filter((c) => c.unread_count === 0), [conversations])
  const visibleConversations = activeTab === 'unread' ? unreadConversations : readConversations

  function toggleMessageSelected(id: string) {
    setSelectedMessages((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function markRead(clientIds: string[]) {
    if (!clientIds.length || busy) return
    setBusy(true)
    try {
      const response = await fetch('/api/sms/conversations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_ids: clientIds })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to mark messages read.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to mark messages read.')
    } finally {
      setBusy(false)
    }
  }

  async function openConversation(conversation: Conversation) {
    if (conversation.unread_count > 0) {
      setOpenIds((current) => new Set(current).add(conversation.client_id))
      await markRead([conversation.client_id])
      setActiveTab('read')
      return
    }

    setOpenIds((current) => {
      const next = new Set(current)
      if (next.has(conversation.client_id)) next.delete(conversation.client_id)
      else next.add(conversation.client_id)
      return next
    })
  }

  async function deleteSelected() {
    const ids = Array.from(selectedMessages)
    if (!ids.length || busy) return
    if (!window.confirm(`Delete ${ids.length} selected ${ids.length === 1 ? 'text' : 'texts'}? This removes them from the CRM conversation history.`)) return

    setBusy(true)
    try {
      const response = await fetch('/api/sms/conversations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_ids: ids })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to delete selected texts.')
      setSelectedMessages(new Set())
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete selected texts.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'end', flexWrap: 'wrap' }}>
        <div className="clients-page-heading">
          <h1>Messages</h1>
          <p className="subtle">Unread conversations move to Read automatically when you open them.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="card" style={{ padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
            <strong style={{ fontSize: 22 }}>{totalUnread}</strong><span className="subtle">new</span>
          </div>
          <button type="button" className="btn btn-secondary" disabled={!selectedMessages.size || busy} onClick={() => void deleteSelected()}>
            {busy ? 'Working…' : `DELETE SELECTED${selectedMessages.size ? ` (${selectedMessages.size})` : ''}`}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
        <button type="button" className={activeTab === 'unread' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setActiveTab('unread')}>
          UNREAD ({totalUnread})
        </button>
        <button type="button" className={activeTab === 'read' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setActiveTab('read')}>
          READ ({readConversations.length})
        </button>
      </div>

      {error ? <div className="card card-pad" style={{ marginTop: 18, border: '1px solid #b42318' }}>{error}</div> : null}

      <section style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        {loading ? <div className="card card-pad">Loading messages…</div> : null}
        {!loading && !visibleConversations.length ? (
          <div className="card card-pad"><strong>{activeTab === 'unread' ? 'No unread messages.' : 'No read conversations yet.'}</strong></div>
        ) : null}

        {visibleConversations.map((conversation) => {
          const isOpen = openIds.has(conversation.client_id)
          return (
            <article className="card" key={conversation.client_id} style={{ overflow: 'hidden', border: conversation.unread_count > 0 ? '2px solid #b78b3f' : undefined }}>
              <button
                type="button"
                onClick={() => void openConversation(conversation)}
                style={{ width: '100%', border: 0, background: 'transparent', padding: 14, textAlign: 'left', cursor: 'pointer', display: 'grid', gap: 9 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <strong>{conversation.client_name}</strong>
                    <div className="subtle" style={{ fontSize: 12 }}>{conversation.phone || 'No phone number saved'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {conversation.unread_count > 0 ? <span style={{ background: '#10263f', color: '#fff', borderRadius: 999, padding: '5px 9px', fontSize: 12, fontWeight: 900 }}>{conversation.unread_count} unread</span> : <span className="subtle" style={{ fontSize: 12 }}>Read</span>}
                    <span className="btn btn-secondary btn-small">{isOpen ? 'HIDE' : 'VIEW'}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{conversation.latest_body}</span>
                  <small className="subtle">{new Date(conversation.latest_at).toLocaleString()}</small>
                </div>
              </button>

              {isOpen ? (
                <div style={{ borderTop: '1px solid #e2e8f0', background: '#f7f9fb', padding: 14, display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 2 }}>
                    <Link prefetch={false} href={`/clients/${conversation.client_id}?text=1`} className="btn btn-primary btn-small">OPEN CLIENT</Link>
                  </div>
                  {conversation.messages.map((message) => (
                    <label key={message.id} style={{ justifySelf: message.direction === 'outbound' ? 'end' : 'start', maxWidth: '86%', display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
                      <input type="checkbox" checked={selectedMessages.has(message.id)} onChange={() => toggleMessageSelected(message.id)} style={{ marginTop: 10 }} />
                      <div style={{ padding: '10px 12px', borderRadius: 12, background: message.direction === 'outbound' ? '#dfeaf3' : '#fff', border: message.direction === 'inbound' ? '1px solid #dbe3ea' : undefined }}>
                        <div>{message.body}</div>
                        <small className="subtle" style={{ display: 'block', marginTop: 5 }}>
                          {new Date(message.created_at).toLocaleString()} · {message.direction === 'inbound' ? (message.read_at ? 'Read' : 'Unread') : message.status}
                          {message.error_code ? ` · Error ${message.error_code}` : ''}
                        </small>
                      </div>
                    </label>
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
