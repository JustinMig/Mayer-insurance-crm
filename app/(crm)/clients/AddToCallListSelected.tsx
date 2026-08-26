'use client'

import { useState } from 'react'

export default function AddToCallListSelected({ selectedClientIds }: { selectedClientIds: string[] }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function addSelected() {
    if (!selectedClientIds.length || busy) return
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/call-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', client_ids: selectedClientIds })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to add clients to the call list.')

      const added = Number(result.added_count || 0)
      const existing = Number(result.already_on_list || 0)
      setMessage(
        added > 0
          ? `${added} added to Call List${existing ? ` · ${existing} already there` : ''}`
          : existing > 0
            ? 'Selected clients are already on the Call List.'
            : 'No clients were added.'
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to add clients to the call list.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="add-call-list-control">
      <button
        type="button"
        className="btn btn-secondary"
        disabled={!selectedClientIds.length || busy}
        onClick={() => void addSelected()}
      >
        {busy ? 'Adding…' : `ADD TO CALL LIST${selectedClientIds.length ? ` (${selectedClientIds.length})` : ''}`}
      </button>
      {message ? <span className="add-call-list-message" role="status">{message}</span> : null}
      <style jsx>{`
        .add-call-list-control{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
        .add-call-list-message{font-size:.75rem;font-weight:800;color:#526271;max-width:230px}
      `}</style>
    </div>
  )
}
