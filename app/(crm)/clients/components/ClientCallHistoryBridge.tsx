'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'

type Attempt = {
  id: string
  user_id: string
  agent_name: string
  outcome: string
  note: string | null
  callback_date: string | null
  callback_time: string | null
  called_at: string
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

export default function ClientCallHistoryBridge() {
  const pathname = usePathname()
  const clientId = useMemo(() => clientIdFromPath(pathname), [pathname])
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

  useEffect(() => {
    if (!clientId) return
    let cancelled = false
    setLoading(true)
    setError('')

    fetch(`/api/clients/${encodeURIComponent(clientId)}/call-history`, { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(result.error || 'Unable to load call history.')
        if (!cancelled) setAttempts(Array.isArray(result.attempts) ? result.attempts : [])
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Unable to load call history.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [clientId])

  if (!clientId || !host) return null

  return createPortal(
    <details className="section-details section-call-history">
      <summary><span>Call History</span><small>Saved call attempts, outcomes &amp; callbacks</small></summary>
      <div className="section-body intake-section-body">
        <div className="intake-group call-history-group">
          <div className="intake-group-heading"><div><strong>Client Call History</strong><span>Call List activity is preserved here even after the client is removed from the active list.</span></div></div>
          {loading ? <p className="subtle" style={{ margin: 0 }}>Loading call history…</p> : null}
          {error ? <div className="notice">{error}</div> : null}
          {!loading && !error && !attempts.length ? <p className="subtle" style={{ margin: 0 }}>No calls have been recorded for this client yet.</p> : null}
          {attempts.length ? (
            <div className="call-history-list">
              {attempts.map((attempt) => (
                <div className="call-history-row" key={attempt.id}>
                  <div className="call-history-head">
                    <strong>{label(attempt.outcome)}</strong>
                    <span>{formatDateTime(attempt.called_at)}</span>
                  </div>
                  <div className="call-history-agent">{attempt.agent_name}</div>
                  {attempt.outcome === 'callback' && attempt.callback_date ? <div className="call-history-callback"><strong>Callback:</strong> {formatCallback(attempt.callback_date, attempt.callback_time)}</div> : null}
                  {attempt.note ? <div className="call-history-note">{attempt.note}</div> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <style jsx global>{`
        .section-call-history{border-left:4px solid #6f8799}
        .section-call-history>summary{background:#f5f8fa}
        .call-history-list{display:grid;gap:8px}.call-history-row{border:1px solid #dfe6ec;border-radius:10px;background:#fff;padding:10px 11px}.call-history-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.call-history-head strong{color:#263746}.call-history-head span{color:#6b7b8b;font-size:.76rem;font-weight:700}.call-history-agent{margin-top:3px;color:#718096;font-size:.72rem;font-weight:800;text-transform:uppercase}.call-history-note,.call-history-callback{margin-top:7px;color:#455767;font-size:.82rem;line-height:1.45;white-space:pre-wrap}.call-history-callback{background:#f1f6fb;border-radius:8px;padding:7px 8px}
      `}</style>
    </details>,
    host
  )
}
