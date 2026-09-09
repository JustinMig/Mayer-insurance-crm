'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'

type Attempt = {
  id: string
  user_id: string
  agent_name: string
  source?: 'manual' | 'ringcentral'
  outcome: string
  note: string | null
  callback_date: string | null
  callback_time: string | null
  called_at: string
  direction?: 'Inbound' | 'Outbound'
  duration_seconds?: number
  contact_phone?: string | null
  from_phone?: string | null
  to_phone?: string | null
  recording_id?: string | null
}

type SmsMessage = {
  id: string
  direction: 'outbound' | 'inbound'
  body: string
  status: string
  error_code: string | null
  read_at?: string | null
  created_at: string
}

type RingCentralStatus = {
  pilot: boolean
  configured: boolean
}

type HistoryTab = 'calls' | 'texts'

function clientIdFromPath(pathname: string) {
  const match = pathname.match(/^\/clients\/([^/]+)$/)
  if (!match || match[1] === 'new') return ''
  return decodeURIComponent(match[1])
}

function label(value: string) {
  if (value === 'answered') return 'Answered'
  if (value === 'no_answer') return 'No Answer'
  if (value === 'voicemail') return 'Voicemail'
  if (value === 'callback') return 'Callback'
  if (value === 'not_interested') return 'Not Interested'
  return value
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  }).format(date)
}

function formatCallback(dateValue: string | null, timeValue: string | null) {
  if (!dateValue) return ''
  const date = new Date(`${dateValue}T12:00:00`)
  const dateText = Number.isNaN(date.getTime()) ? dateValue : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
  if (!timeValue) return dateText
  const [hour, minute] = timeValue.slice(0, 5).split(':').map(Number)
  const timeText = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, hour, minute))
  return `${dateText} · ${timeText}`
}

function formatDuration(seconds?: number) {
  const total = Math.max(0, Number(seconds || 0))
  const minutes = Math.floor(total / 60)
  const remainder = total % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

function formatPhone(value?: string | null) {
  const digits = String(value || '').replace(/\D/g, '').slice(-10)
  if (digits.length !== 10) return value || ''
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

export default function ClientCallHistoryBridge() {
  const pathname = usePathname()
  const clientId = useMemo(() => clientIdFromPath(pathname), [pathname])
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [activeTab, setActiveTab] = useState<HistoryTab>('calls')
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [messages, setMessages] = useState<SmsMessage[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ringCentral, setRingCentral] = useState<RingCentralStatus>({ pilot: false, configured: false })
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')

  useEffect(() => {
    if (!clientId) return
    let disposed = false
    let observer: MutationObserver | null = null

    const attach = () => {
      if (disposed) return false
      const form = document.querySelector<HTMLFormElement>('.client-profile-form')
      const notes = form?.querySelector<HTMLElement>('details.section-notes')
      if (!form || !notes) return false

      let target = form.querySelector<HTMLElement>(':scope > .client-communications-history-host')
      if (!target) {
        target = document.createElement('div')
        target.className = 'client-communications-history-host'
        notes.insertAdjacentElement('beforebegin', target)
      }
      setHost(target)
      return true
    }

    if (!attach()) {
      const root = document.querySelector<HTMLElement>('.content')
      if (root) {
        observer = new MutationObserver(() => {
          if (attach()) observer?.disconnect()
        })
        observer.observe(root, { childList: true, subtree: true })
      }
    }

    return () => {
      disposed = true
      observer?.disconnect()
      document.querySelector('.client-communications-history-host')?.remove()
      setHost(null)
    }
  }, [clientId])

  const loadHistory = useCallback(async () => {
    if (!clientId || loading) return
    setLoading(true)
    setError('')
    try {
      const [callResponse, textResponse] = await Promise.all([
        fetch(`/api/clients/${encodeURIComponent(clientId)}/call-history`, { cache: 'no-store' }),
        fetch(`/api/clients/${encodeURIComponent(clientId)}/sms`, { cache: 'no-store' })
      ])
      const [callResult, textResult] = await Promise.all([
        callResponse.json().catch(() => ({})),
        textResponse.json().catch(() => ({}))
      ])
      if (!callResponse.ok) throw new Error(callResult.error || 'Unable to load call history.')
      if (!textResponse.ok) throw new Error(textResult.error || 'Unable to load text history.')
      setAttempts(Array.isArray(callResult.attempts) ? callResult.attempts : [])
      setMessages(Array.isArray(textResult.messages) ? textResult.messages : [])
      setLoaded(true)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load communication history.')
    } finally {
      setLoading(false)
    }
  }, [clientId, loading])

  useEffect(() => {
    if (!clientId) return
    let cancelled = false
    fetch('/api/ringcentral/sync', { cache: 'no-store' })
      .then((response) => response.json())
      .then((result) => {
        if (!cancelled) setRingCentral({ pilot: Boolean(result.pilot), configured: Boolean(result.configured) })
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [clientId])

  const syncRingCentral = async () => {
    setSyncing(true)
    setSyncMessage('')
    try {
      const response = await fetch('/api/ringcentral/sync', { method: 'POST' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'RingCentral sync failed.')
      setSyncMessage(`Synced ${result.synced || 0} calls · ${result.matched || 0} matched · ${result.recordings || 0} recordings`)
      setLoaded(false)
      await loadHistory()
    } catch (syncError) {
      setSyncMessage(syncError instanceof Error ? syncError.message : 'RingCentral sync failed.')
    } finally {
      setSyncing(false)
    }
  }

  if (!clientId || !host) return null

  return createPortal(
    <details
      className="section-details section-communications-history"
      onToggle={(event) => {
        if (event.currentTarget.open && !loaded && !loading) void loadHistory()
      }}
    >
      <summary><span>Calls &amp; Texts</span><small>Permanent client communication history</small></summary>
      <div className="section-body intake-section-body">
        <div className="intake-group communications-history-group">
          <div className="communications-history-heading">
            <div>
              <strong>Client Communication Record</strong>
              <span>Calls and text messages remain saved here even if you remove them from the Notifications screen.</span>
            </div>
            {ringCentral.pilot && activeTab === 'calls' ? (
              <button className="btn btn-secondary communications-sync-button" type="button" onClick={syncRingCentral} disabled={syncing || !ringCentral.configured}>
                {syncing ? 'Syncing…' : ringCentral.configured ? 'Sync RingCentral' : 'RingCentral Setup Needed'}
              </button>
            ) : null}
          </div>

          <div className="communications-history-tabs" role="tablist" aria-label="Client communication history">
            <button type="button" className={activeTab === 'calls' ? 'active' : ''} onClick={() => setActiveTab('calls')}>Calls <span>{attempts.length}</span></button>
            <button type="button" className={activeTab === 'texts' ? 'active' : ''} onClick={() => setActiveTab('texts')}>Texts <span>{messages.length}</span></button>
          </div>

          {ringCentral.pilot && syncMessage && activeTab === 'calls' ? <div className="communications-sync-message">{syncMessage}</div> : null}
          {loading ? <p className="subtle communications-loading">Loading communication history…</p> : null}
          {error ? <div className="notice">{error}</div> : null}

          {!loading && !error && loaded && activeTab === 'calls' && !attempts.length ? <p className="subtle communications-loading">No calls have been recorded for this client yet.</p> : null}
          {!loading && !error && loaded && activeTab === 'texts' && !messages.length ? <p className="subtle communications-loading">No text messages have been recorded for this client yet.</p> : null}

          {!loading && !error && activeTab === 'calls' && attempts.length ? (
            <div className="communications-call-list">
              {attempts.map((attempt) => (
                <div className={`communications-call-row ${attempt.source === 'ringcentral' ? 'ringcentral-call-row' : ''}`} key={`${attempt.source || 'manual'}-${attempt.id}`}>
                  <div className="communications-call-head">
                    <div className="communications-call-labels">
                      <strong>{attempt.source === 'ringcentral' ? (attempt.direction || label(attempt.outcome)) : label(attempt.outcome)}</strong>
                      {attempt.source === 'ringcentral' ? <span className="communications-ringcentral-badge">RingCentral</span> : <span className="communications-manual-badge">CRM</span>}
                    </div>
                    <span>{formatDateTime(attempt.called_at)}</span>
                  </div>
                  <div className="communications-call-agent">{attempt.agent_name}</div>
                  {attempt.source === 'ringcentral' ? (
                    <div className="communications-call-meta">
                      <span>{attempt.outcome || 'Call'}</span>
                      <span>{formatDuration(attempt.duration_seconds)}</span>
                      {attempt.contact_phone ? <span>{formatPhone(attempt.contact_phone)}</span> : null}
                    </div>
                  ) : null}
                  {attempt.outcome === 'callback' && attempt.callback_date ? <div className="communications-call-note"><strong>Callback:</strong> {formatCallback(attempt.callback_date, attempt.callback_time)}</div> : null}
                  {attempt.note ? <div className="communications-call-note">{attempt.note}</div> : null}
                  {attempt.source === 'ringcentral' && attempt.recording_id ? (
                    <audio className="communications-recording" controls preload="none" src={`/api/ringcentral/recordings/${encodeURIComponent(attempt.recording_id)}`}>
                      Your browser does not support audio playback.
                    </audio>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {!loading && !error && activeTab === 'texts' && messages.length ? (
            <div className="communications-text-list">
              {messages.slice().reverse().map((message) => (
                <div className={`communications-text-row ${message.direction}`} key={message.id}>
                  <div className="communications-text-head">
                    <strong>{message.direction === 'inbound' ? 'Client' : 'Outgoing'}</strong>
                    <span>{formatDateTime(message.created_at)}</span>
                  </div>
                  <div className="communications-text-body">{message.body}</div>
                  <div className="communications-text-meta">
                    {message.direction === 'inbound' ? (message.read_at ? 'Read' : 'Unread') : message.status}
                    {message.error_code ? ` · Error ${message.error_code}` : ''}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <style jsx global>{`
        .section-communications-history{border-left:4px solid #647f91}.section-communications-history>summary{background:#f5f8fa}.communications-history-group{display:grid;gap:10px}.communications-history-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}.communications-history-heading>div{display:grid;gap:3px}.communications-history-heading>div>span{color:#6b7b8b;font-size:.76rem;line-height:1.35}.communications-sync-button{white-space:nowrap;min-width:142px}.communications-sync-message{padding:7px 9px;border-radius:7px;background:#eef6f1;color:#315b43;font-size:.72rem;font-weight:750}.communications-history-tabs{display:flex;gap:6px;border-bottom:1px solid #dce4e9;padding-bottom:7px}.communications-history-tabs button{appearance:none;border:1px solid #d6e0e6;border-radius:999px;background:#fff;color:#546877;padding:6px 10px;font:inherit;font-size:.72rem;font-weight:900;cursor:pointer}.communications-history-tabs button.active{background:#18324a;border-color:#18324a;color:#fff}.communications-history-tabs button span{opacity:.75;margin-left:3px}.communications-loading{margin:2px 0}.communications-call-list,.communications-text-list{display:grid;gap:7px}.communications-call-row{border:1px solid #dfe6ec;border-radius:9px;background:#fff;padding:8px 9px}.communications-call-row.ringcentral-call-row{border-left:3px solid #066fac}.communications-call-head,.communications-text-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.communications-call-head>span,.communications-text-head>span{color:#6b7b8b;font-size:.68rem;font-weight:700}.communications-call-labels{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.communications-ringcentral-badge,.communications-manual-badge{padding:2px 5px;border-radius:999px;font-size:.58rem;font-weight:900}.communications-ringcentral-badge{background:#e8f4fb;color:#075f91}.communications-manual-badge{background:#eef2f4;color:#60717d}.communications-call-agent{margin-top:2px;color:#718096;font-size:.65rem;font-weight:800;text-transform:uppercase}.communications-call-meta{display:flex;gap:7px;flex-wrap:wrap;margin-top:5px;color:#526475;font-size:.7rem;font-weight:700}.communications-call-meta span+span{padding-left:7px;border-left:1px solid #d7e0e7}.communications-call-note{margin-top:5px;color:#455767;font-size:.74rem;line-height:1.4;white-space:pre-wrap}.communications-recording{display:block;width:100%;height:30px;margin-top:6px}.communications-text-row{max-width:88%;border-radius:10px;padding:8px 9px;border:1px solid #dfe6ec}.communications-text-row.inbound{justify-self:start;background:#fff}.communications-text-row.outbound{justify-self:end;background:#edf4f8;border-color:#d3e1e9}.communications-text-head strong{font-size:.72rem;color:#33495a}.communications-text-body{margin-top:4px;color:#253746;font-size:.78rem;line-height:1.4;white-space:pre-wrap;overflow-wrap:anywhere}.communications-text-meta{margin-top:4px;color:#718096;font-size:.63rem;font-weight:700}.communications-history-host{min-width:0}@media(max-width:720px){.communications-history-heading{display:grid}.communications-sync-button{width:100%;min-width:0}.communications-text-row{max-width:96%}.communications-call-row{padding:7px 8px}.communications-recording{height:28px}}
      `}</style>
    </details>,
    host
  )
}
