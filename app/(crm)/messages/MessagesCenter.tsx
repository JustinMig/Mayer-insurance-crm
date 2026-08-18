'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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
  assigned_agent_id: string | null
  agent_name: string
  unread_count: number
  latest_body: string
  latest_at: string
}

type Tab = 'unread' | 'read'
type AgentBoard = 'all' | 'justin' | 'isaiah'

export default function MessagesCenter({ viewerName = '', initialAgent = 'all' }: { viewerName?: string; initialAgent?: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [totalUnread, setTotalUnread] = useState(0)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const [threadMessages, setThreadMessages] = useState<Record<string, SmsMessage[]>>({})
  const [threadLoading, setThreadLoading] = useState<Set<string>>(new Set())
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<Tab>('unread')
  const [agentBoard, setAgentBoard] = useState<AgentBoard>(initialAgent === 'isaiah' ? 'isaiah' : initialAgent === 'justin' ? 'justin' : 'all')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const loadingRef = useRef(false)
  const isSheena = viewerName.trim().toLowerCase() === 'sheena hester'

  const load = useCallback(async () => {
    if (loadingRef.current || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return
    loadingRef.current = true
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
      loadingRef.current = false
      setLoading(false)
    }
  }, [])

  const loadThread = useCallback(async (clientId: string) => {
    setThreadLoading((current) => new Set(current).add(clientId))
    try {
      const response = await fetch(`/api/clients/${clientId}/sms`, { cache: 'no-store' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to load this conversation.')
      setThreadMessages((current) => ({ ...current, [clientId]: Array.isArray(result.messages) ? result.messages : [] }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load this conversation.')
    } finally {
      setThreadLoading((current) => {
        const next = new Set(current)
        next.delete(clientId)
        return next
      })
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 15_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [load])

  useEffect(() => {
    function collapseWhenClickingOutside(event: MouseEvent) {
      const target = event.target as HTMLElement | null
      if (!target?.closest('[data-message-conversation]')) setOpenIds(new Set())
    }
    document.addEventListener('mousedown', collapseWhenClickingOutside)
    return () => document.removeEventListener('mousedown', collapseWhenClickingOutside)
  }, [])

  const boardConversations = useMemo(() => {
    if (!isSheena || agentBoard === 'all') return conversations
    const wanted = agentBoard === 'justin' ? 'justin mayer' : 'isaiah hernandez'
    return conversations.filter((c) => c.agent_name.trim().toLowerCase() === wanted)
  }, [conversations, agentBoard, isSheena])

  const unreadConversations = useMemo(() => boardConversations.filter((c) => c.unread_count > 0), [boardConversations])
  const readConversations = useMemo(() => boardConversations.filter((c) => c.unread_count === 0), [boardConversations])
  const visibleConversations = activeTab === 'unread' ? unreadConversations : readConversations
  const boardUnread = unreadConversations.reduce((sum, c) => sum + c.unread_count, 0)

  function toggleMessageSelected(id: string) {
    setSelectedMessages((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function markRead(clientIds: string[]) {
    if (!clientIds.length) return false
    try {
      const response = await fetch('/api/sms/conversations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_ids: clientIds })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to mark messages read.')
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to mark messages read.')
      return false
    }
  }

  async function openConversation(conversation: Conversation) {
    if (openIds.has(conversation.client_id)) {
      setOpenIds(new Set())
      return
    }

    setOpenIds(new Set([conversation.client_id]))
    if (conversation.unread_count > 0) {
      await markRead([conversation.client_id])
      await Promise.all([loadThread(conversation.client_id), load()])
      setActiveTab('read')
    } else {
      await loadThread(conversation.client_id)
    }
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
      const openId = Array.from(openIds)[0]
      await Promise.all([load(), openId ? loadThread(openId) : Promise.resolve()])
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
          <p className="subtle">Conversation summaries stay lightweight. The full text history loads only when you open a client.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="card" style={{ padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
            <strong style={{ fontSize: 22 }}>{isSheena ? boardUnread : totalUnread}</strong><span className="subtle">new</span>
          </div>
          <button type="button" className="btn btn-secondary" disabled={!selectedMessages.size || busy} onClick={() => void deleteSelected()}>
            {busy ? 'Working…' : `DELETE SELECTED${selectedMessages.size ? ` (${selectedMessages.size})` : ''}`}
          </button>
        </div>
      </div>

      {isSheena ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
          <button type="button" className={agentBoard === 'justin' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => { setAgentBoard('justin'); setOpenIds(new Set()) }}>JUSTIN MESSAGES</button>
          <button type="button" className={agentBoard === 'isaiah' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => { setAgentBoard('isaiah'); setOpenIds(new Set()) }}>ISAIAH MESSAGES</button>
          <button type="button" className={agentBoard === 'all' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => { setAgentBoard('all'); setOpenIds(new Set()) }}>ALL</button>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, marginTop: isSheena ? 10 : 18, flexWrap: 'wrap' }}>
        <button type="button" className={activeTab === 'unread' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => { setActiveTab('unread'); setOpenIds(new Set()) }}>
          UNREAD ({boardUnread})
        </button>
        <button type="button" className={activeTab === 'read' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => { setActiveTab('read'); setOpenIds(new Set()) }}>
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
          const messages = threadMessages[conversation.client_id] || []
          const isThreadLoading = threadLoading.has(conversation.client_id)
          return (
            <article data-message-conversation className="card" key={conversation.client_id} style={{ overflow: 'hidden', border: conversation.unread_count > 0 ? '2px solid #b78b3f' : undefined }}>
              <button
                type="button"
                onClick={() => void openConversation(conversation)}
                style={{ width: '100%', border: 0, background: 'transparent', padding: 14, textAlign: 'left', cursor: 'pointer', display: 'grid', gap: 9 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <strong>{conversation.client_name}</strong>
                    <div className="subtle" style={{ fontSize: 12 }}>{conversation.phone || 'No phone number saved'}{isSheena ? ` · ${conversation.agent_name}` : ''}</div>
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
                  {isThreadLoading ? <div className="subtle">Loading conversation…</div> : null}
                  {!isThreadLoading && !messages.length ? <div className="subtle">No text history found.</div> : null}
                  {messages.map((message) => (
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
