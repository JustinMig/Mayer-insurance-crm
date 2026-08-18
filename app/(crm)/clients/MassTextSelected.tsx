'use client'

import { useMemo, useState } from 'react'

type ClientSummary = {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
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

  const selectedClients = useMemo(() => {
    const selected = new Set(selectedClientIds)
    return clients.filter((client) => selected.has(client.id))
  }, [clients, selectedClientIds])

  function openComposer() {
    if (!selectedClients.length) return
    setResult('')
    setOpen(true)
  }

  function closeComposer() {
    if (sending) return
    setOpen(false)
  }

  async function sendMassText() {
    const message = body.trim()
    if (!message || !selectedClients.length || sending) return

    setSending(true)
    setResult('')
    try {
      const response = await fetch('/api/sms/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_ids: selectedClients.map((client) => client.id),
          body: message
        })
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || `Send failed with HTTP ${response.status}.`)

      const sentCount = Number(payload.sent_count || 0)
      const failedCount = Number(payload.failed_count || 0)
      const failures = Array.isArray(payload.failures) ? payload.failures as string[] : []

      if (!failedCount) {
        setResult(`Sent successfully to all ${sentCount} selected client${sentCount === 1 ? '' : 's'}. Replies will return to each client’s text thread and appear as unread Notifications.`)
      } else {
        const preview = failures.slice(0, 4).join(' • ')
        const extra = failures.length > 4 ? ` • +${failures.length - 4} more` : ''
        setResult(`Sent to ${sentCount} of ${selectedClients.length}. ${failedCount} failed${preview ? `: ${preview}${extra}` : '.'}`)
      }
    } catch (error) {
      setResult(error instanceof Error ? error.message : 'Unable to send mass text.')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <button
        className="btn btn-primary"
        type="button"
        disabled={selectedClients.length === 0}
        onClick={openComposer}
      >
        Mass Text{selectedClients.length ? ` (${selectedClients.length})` : ''}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mass text selected clients"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10050,
            background: 'rgba(15,23,42,.55)',
            display: 'grid',
            placeItems: 'center',
            padding: 18
          }}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeComposer()
          }}
        >
          <section className="card card-pad" style={{ width: 'min(680px, 100%)', maxHeight: '88vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 14 }}>
              <div>
                <h2 style={{ margin: 0 }}>Mass Text Selected Clients</h2>
                <p className="subtle" style={{ margin: '6px 0 0' }}>
                  One separate text will be sent to each of the {selectedClients.length} selected clients. Recipients will not see one another.
                </p>
              </div>
              <button className="btn btn-secondary" type="button" onClick={closeComposer} disabled={sending}>Close</button>
            </div>

            <div className="notice" style={{ marginTop: 16 }}>
              Replies are saved to the matching client’s text conversation and will increase the unread Notifications count until opened.
            </div>

            <label className="label" style={{ display: 'block', marginTop: 16 }}>
              Message
              <textarea
                className="input"
                value={body}
                onChange={(event) => setBody(event.target.value.slice(0, 1500))}
                rows={7}
                placeholder="Type the message to send to the selected clients…"
                disabled={sending}
                style={{ width: '100%', minHeight: 150, resize: 'vertical', marginTop: 7 }}
              />
            </label>

            <div className="subtle" style={{ marginTop: 5, textAlign: 'right' }}>{body.length}/1500</div>

            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 800 }}>Recipients ({selectedClients.length})</summary>
              <div style={{ display: 'grid', gap: 6, marginTop: 10, maxHeight: 180, overflow: 'auto' }}>
                {selectedClients.map((client) => (
                  <div key={client.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid #e2e8f0', paddingBottom: 6 }}>
                    <strong>{clientName(client)}</strong>
                    <span className="subtle">{client.phone || 'No phone number'}</span>
                  </div>
                ))}
              </div>
            </details>

            {sending ? (
              <div className="notice" style={{ marginTop: 16 }}>
                Sending {selectedClients.length} individual text{selectedClients.length === 1 ? '' : 's'}… You can leave this window open while the server processes them.
              </div>
            ) : null}

            {result ? <div className="notice" style={{ marginTop: 16 }}>{result}</div> : null}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" type="button" onClick={closeComposer} disabled={sending}>Cancel</button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={sendMassText}
                disabled={sending || !body.trim() || selectedClients.length === 0}
              >
                {sending ? 'Sending…' : `Send to ${selectedClients.length} Client${selectedClients.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
