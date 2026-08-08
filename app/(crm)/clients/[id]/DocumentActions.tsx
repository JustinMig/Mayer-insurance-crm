'use client'

import { useState } from 'react'

type Props = {
  clientId: string
  documentId: string
  fileName: string
  onDeleted: (documentId: string) => void
  onStatus?: (message: string) => void
}

export default function DocumentActions({ clientId, documentId, fileName, onDeleted, onStatus }: Props) {
  const [deleting, setDeleting] = useState(false)

  async function deleteDocument() {
    if (deleting) return
    if (!window.confirm(`Delete ${fileName}? This permanently removes the file from this client.`)) return

    setDeleting(true)
    onStatus?.('Deleting file…')
    try {
      const response = await fetch(`/api/clients/${clientId}/documents/${documentId}`, { method: 'DELETE' })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Could not delete the file.')
      onDeleted(documentId)
      onStatus?.('File deleted.')
    } catch (error) {
      onStatus?.(error instanceof Error ? error.message : 'Could not delete the file.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="document-row-actions">
      <button
        type="button"
        className="btn btn-secondary btn-small"
        onClick={() => window.open(`/api/clients/${clientId}/documents/${documentId}`, '_blank', 'noopener,noreferrer')}
      >
        Open
      </button>
      <button type="button" className="btn btn-danger btn-small" disabled={deleting} onClick={deleteDocument}>
        {deleting ? 'Deleting…' : 'Delete'}
      </button>
    </div>
  )
}
