'use client'

import { useState } from 'react'

export default function DeleteClientButton({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function removeClient() {
    const confirmed = window.confirm(`Delete ${clientName}?\n\nThis permanently deletes the client record and its uploaded CRM files. This cannot be undone.`)
    if (!confirmed) return

    setDeleting(true)
    setError('')
    try {
      const response = await fetch(`/api/clients/${clientId}`, { method: 'DELETE' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || `Delete failed with HTTP ${response.status}.`)
      window.location.href = payload?.storage_warning ? '/clients?deleted=1&cleanup_warning=1' : '/clients?deleted=1'
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete this client.')
      setDeleting(false)
    }
  }

  return (
    <div className="delete-client-wrap">
      <button className="btn btn-danger" type="button" onClick={removeClient} disabled={deleting}>
        {deleting ? 'Deleting…' : 'Delete Client'}
      </button>
      {error ? <span className="delete-client-error">{error}</span> : null}
    </div>
  )
}
