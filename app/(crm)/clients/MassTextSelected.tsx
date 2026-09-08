'use client'

import { useEffect, useMemo, useState } from 'react'

type ClientSummary = {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
}

type Job = {
  id: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled'
  total_items: number
  processed_items: number
  succeeded_items: number
  failed_items: number
  result?: { failures?: string[] }
  error_message?: string | null
}

function clientName(client: ClientSummary) {
  return [client.first_name, client.last_name].filter(Boolean).join(' ').trim() || 'Client'
}

export default function MassTextSelected({
  clients,
  selectedClientIds
}: {
  clients: ClientSummary[]
  selectedClientIds: string[]
}) {
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState('')
  const [job, setJob] = useState<Job | null>(null)

  const selectedClients = useMemo(() => {
    const selected = new Set(selectedClientIds)
    return clients.filter((client) => selected.has(client.id))
  }, [clients, selectedClientIds])

  useEffect(() => {
    if (!job || !['queued','running'].includes(job.status)) return
    let stopped = false
    const check = async () => {
      try {
        const response = await fetch(`/api/jobs/${job.id}`, { cache: 'no-store' })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok || stopped) return
        const next = payload.job as Job
        setJob(next)
        if (next.status === 'completed') {
          const failures = Array.isArray(next.result?.failures) ? next.result?.failures || [] : []
          if (!next.failed_items) setResult(`Sent successfully to all ${next.succeeded_items} client${next.succeeded_items === 1 ? '' : 's'}. Replies will return to each client’s text thread.`)
          else setResult(`Finished: ${next.succeeded_items} sent, ${next.failed_items} failed.${failures.length ? ` ${failures.slice(0, 4).join(' • ')}` : ''}`)
        } else if (next.status === 'failed') {
          setResult(next.error_message || 'The mass text job failed.')
        }
      } catch {
        // Keep the modal usable; the next poll can recover.
      }
    }
    void check()
    const timer = window.setInterval(() => void check(), 1500)
    return () => { stopped = true; window.clearInterval(timer) }
  }, [job?.id, job?.status])

  function openComposer() {
    if (!selectedClients.length) return
    setResult('')
    setJob(null)
    setOpen(true)
  }

  function closeComposer() {
    setOpen(false)
  }

  async function sendMassText() {
    const message = body.trim()
    if (!message || !selectedClients.length || sending || (job && ['queued','running'].includes(job.status))) return

    setSending(true)
    setResult('')
    setJob(null)
    try {
      const response = await fetch('/api/sms/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_ids: selectedClients.map((client) => client.id), body: message })
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || `Queue failed with HTTP ${response.status}.`)
      setJob({ id: String(payload.job_id), status: 'queued', total_items: Number(payload.total_count || selectedClients.length), processed_items: 0, succeeded_items: 0, failed_items: Number(payload.preflight_failed_count || 0) })
      setResult('Mass text queued. You can close this window and keep using the CRM while it sends in the background.')
    } catch (error) {
      setResult(error instanceof Error ? error.message : 'Unable to queue mass text.')
    } finally {
      setSending(false)
    }
  }

  const running = Boolean(job && ['queued','running'].includes(job.status))
  const progress = job?.total_items ? Math.min(100, Math.round((job.processed_items / job.total_items) * 100)) : 0

  return (
    <>
      <button className="btn btn-primary" type="button" disabled={selectedClients.length === 0} onClick={openComposer}>
        Mass Text{selectedClients.length ? ` (${selectedClients.length})` : ''}
      </button>

      {open ? (
        <div role="dialog" aria-modal="true" aria-label="Mass text selected clients" style={{ position: 'fixed', inset: 0, zIndex: 10050, background: 'rgba(15,23,42,.55)', display: 'grid', placeItems: 'center', padding: 18 }} onMouseDown={(event) => { if (event.currentTarget === event.target) closeComposer() }}>
          <section className="card card-pad" style={{ width: 'min(680px, 100%)', maxHeight: '88vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 14 }}>
              <div><h2 style={{ margin: 0 }}>Mass Text Selected Clients</h2><p className="subtle" style={{ margin: '6px 0 0' }}>One separate text is queued for each selected client. Recipients will not see one another.</p></div>
              <button className="btn btn-secondary" type="button" onClick={closeComposer}>Close</button>
            </div>

            <div className="notice" style={{ marginTop: 16 }}>Replies are saved to the matching client’s text conversation and increase unread Notifications until opened.</div>

            <label className="label" style={{ display: 'block', marginTop: 16 }}>
              Message
              <textarea className="input" value={body} onChange={(event) => setBody(event.target.value.slice(0, 1500))} rows={7} placeholder="Type the message to send to the selected clients…" disabled={running} style={{ width: '100%', minHeight: 150, resize: 'vertical', marginTop: 7 }} />
            </label>
            <div className="subtle" style={{ marginTop: 5, textAlign: 'right' }}>{body.length}/1500</div>

            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 800 }}>Recipients ({selectedClients.length})</summary>
              <div style={{ display: 'grid', gap: 6, marginTop: 10, maxHeight: 180, overflow: 'auto' }}>
                {selectedClients.map((client) => <div key={client.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid #e2e8f0', paddingBottom: 6 }}><strong>{clientName(client)}</strong><span className="subtle">{client.phone || 'No phone number'}</span></div>)}
              </div>
            </details>

            {job ? (
              <div className="notice" style={{ marginTop: 16 }}>
                <strong>{job.status === 'queued' ? 'Queued' : job.status === 'running' ? 'Sending in background' : job.status === 'completed' ? 'Completed' : 'Job stopped'}</strong>
                <div style={{ marginTop: 8, height: 8, borderRadius: 999, background: '#dfe7eb', overflow: 'hidden' }}><div style={{ width: `${progress}%`, height: '100%', background: '#4f7d67' }} /></div>
                <div className="subtle" style={{ marginTop: 6 }}>{job.processed_items}/{job.total_items} processed · {job.succeeded_items} sent · {job.failed_items} failed</div>
              </div>
            ) : null}

            {result ? <div className="notice" style={{ marginTop: 16 }}>{result}</div> : null}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" type="button" onClick={closeComposer}>Close</button>
              <button className="btn btn-primary" type="button" onClick={sendMassText} disabled={sending || running || !body.trim() || selectedClients.length === 0}>
                {sending ? 'Queuing…' : running ? 'Sending in Background…' : `Send to ${selectedClients.length} Client${selectedClients.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
