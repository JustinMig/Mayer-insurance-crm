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

type RingCentralStatus = {
  pilot: boolean
  configured: boolean
}

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
  const [attempts, setAttempts] = useState<Attempt[]>([])
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

      let target = form.querySelector<HTMLElement>(':scope > .client-call-history-host')
      if (!target) {
        target = document.createElement('div')
        target.className = 'client-call-history-host'
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
      document.querySelector('.client-call-history-host')?.remove()
      setHost(null)
    }
  }, [clientId])

  const loadHistory = useCallback(async () => {
    if (!clientId) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/call-history`, { cache: 'no-store' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to load call history.')
      setAttempts(Array.isArray(result.attempts) ? result.attempts : [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load call history.')
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => { void loadHistory() }, [loadHistory])

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
      setSyncMessage(`Synced ${result.synced || 0} calls · ${result.matched || 0} matched to clients · ${result.recordings || 0} recordings`)
      await loadHistory()
    } catch (syncError) {
      setSyncMessage(syncError instanceof Error ? syncError.message : 'RingCentral sync failed.')
    } finally {
      setSyncing(false)
    }
  }

  if (!clientId || !host) return null

  return createPortal(
    <details className="section-details section-call-history">
      <summary><span>Call History</span><small>Call attempts plus RingCentral activity for Justin</small></summary>
      <div className="section-body intake-section-body">
        <div className="intake-group call-history-group">
          <div className="intake-group-heading call-history-title-row">
            <div><strong>Client Call History</strong><span>Call List activity is preserved here. Justin's RingCentral calls can also be matched to this client by phone number.</span></div>
            {ringCentral.pilot ? (
              <button className="btn btn-secondary ringcentral-sync-button" type="button" onClick={syncRingCentral} disabled={syncing || !ringCentral.configured}>
                {syncing ? 'Syncing…' : ringCentral.configured ? 'Sync RingCentral' : 'RingCentral Setup Needed'}
              </button>
            ) : null}
          </div>
          {ringCentral.pilot && syncMessage ? <div className="ringcentral-sync-message">{syncMessage}</div> : null}
          {loading ? <p className="subtle" style={{ margin: 0 }}>Loading call history…</p> : null}
          {error ? <div className="notice">{error}</div> : null}
          {!loading && !error && !attempts.length ? <p className="subtle" style={{ margin: 0 }}>No calls have been recorded for this client yet.</p> : null}
          {attempts.length ? (
            <div className="call-history-list">
              {attempts.map((attempt) => (
                <div className={`call-history-row ${attempt.source === 'ringcentral' ? 'ringcentral-call-row' : ''}`} key={`${attempt.source || 'manual'}-${attempt.id}`}>
                  <div className="call-history-head">
                    <div className="call-history-labels">
                      <strong>{attempt.source === 'ringcentral' ? (attempt.direction || label(attempt.outcome)) : label(attempt.outcome)}</strong>
                      {attempt.source === 'ringcentral' ? <span className="ringcentral-badge">RingCentral</span> : null}
                    </div>
                    <span>{formatDateTime(attempt.called_at)}</span>
                  </div>
                  <div className="call-history-agent">{attempt.agent_name}</div>
                  {attempt.source === 'ringcentral' ? (
                    <div className="ringcentral-call-meta">
                      <span>{attempt.outcome || 'Call'}</span>
                      <span>{formatDuration(attempt.duration_seconds)}</span>
                      {attempt.contact_phone ? <span>{formatPhone(attempt.contact_phone)}</span> : null}
                    </div>
                  ) : null}
                  {attempt.outcome === 'callback' && attempt.callback_date ? <div className="call-history-callback"><strong>Callback:</strong> {formatCallback(attempt.callback_date, attempt.callback_time)}</div> : null}
                  {attempt.note ? <div className="call-history-note">{attempt.note}</div> : null}
                  {attempt.source === 'ringcentral' && attempt.recording_id ? (
                    <audio className="ringcentral-recording" controls preload="none" src={`/api/ringcentral/recordings/${encodeURIComponent(attempt.recording_id)}`}>
                      Your browser does not support audio playback.
                    </audio>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <style jsx global>{`
        .section-call-history{border-left:4px solid #6f8799}
        .section-call-history>summary{background:#f5f8fa}
        .call-history-title-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
        .ringcentral-sync-button{white-space:nowrap;min-width:148px}
        .ringcentral-sync-message{margin:0 0 10px;padding:8px 10px;border-radius:8px;background:#eef6f1;color:#315b43;font-size:.78rem;font-weight:750}
        .call-history-list{display:grid;gap:8px}.call-history-row{border:1px solid #dfe6ec;border-radius:10px;background:#fff;padding:10px 11px}.ringcentral-call-row{border-left:4px solid #066fac}.call-history-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.call-history-head strong{color:#263746}.call-history-head>span{color:#6b7b8b;font-size:.76rem;font-weight:700}.call-history-labels{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.ringcentral-badge{padding:2px 6px;border-radius:999px;background:#e8f4fb;color:#075f91;font-size:.62rem;font-weight:900;letter-spacing:.02em}.call-history-agent{margin-top:3px;color:#718096;font-size:.72rem;font-weight:800;text-transform:uppercase}.call-history-note,.call-history-callback{margin-top:7px;color:#455767;font-size:.82rem;line-height:1.45;white-space:pre-wrap}.call-history-callback{background:#f1f6fb;border-radius:8px;padding:7px 8px}.ringcentral-call-meta{display:flex;gap:10px;flex-wrap:wrap;margin-top:7px;color:#526475;font-size:.78rem;font-weight:700}.ringcentral-call-meta span+span{padding-left:10px;border-left:1px solid #d7e0e7}.ringcentral-recording{display:block;width:100%;height:36px;margin-top:9px}
      `}</style>
    </details>,
    host
  )
}
