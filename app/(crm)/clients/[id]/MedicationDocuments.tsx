'use client'

import { useMemo, useState, type ChangeEvent } from 'react'
import DocumentActions from './DocumentActions'

type DocumentRow = {
  id: string
  file_name: string
  mime_type: string | null
  document_type: string | null
  created_at: string
}

type Props = {
  clientId: string
  initialDocuments: DocumentRow[]
}

export default function MedicationDocuments({ clientId, initialDocuments }: Props) {
  const [documents, setDocuments] = useState<DocumentRow[]>(initialDocuments)
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState('')

  const sortedDocuments = useMemo(
    () => [...documents].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
    [documents]
  )

  async function uploadFile(file: File) {
    setUploading(true)
    setStatus('Uploading medications file…')
    try {
      const form = new FormData()
      form.set('file', file)
      form.set('document_type', 'medications')
      form.set('file_name', file.name)
      const response = await fetch(`/api/clients/${clientId}/documents`, { method: 'POST', body: form })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Upload failed.')
      setDocuments(current => [result.document, ...current])
      setStatus('Medications file saved to this client.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  async function handlePicker(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) await uploadFile(file)
  }

  return (
    <div className="medicare-documents-panel">
      <div className="medicare-documents-heading">
        <div>
          <strong>Medications</strong>
          <div className="field-help">Upload a medication list or take a picture of medication bottles.</div>
        </div>
        <div className="document-action-row">
          <label className={`btn btn-secondary upload-button ${uploading ? 'is-disabled' : ''}`}>
            Upload Medications
            <input type="file" hidden disabled={uploading} accept="image/*,.pdf,.txt,.doc,.docx" onChange={handlePicker} />
          </label>
          <label className={`btn btn-secondary upload-button ${uploading ? 'is-disabled' : ''}`}>
            Take Medication Photo
            <input type="file" hidden disabled={uploading} accept="image/*" capture="environment" onChange={handlePicker} />
          </label>
        </div>
      </div>

      {status ? <div className="document-status">{status}</div> : null}

      <div className="document-list">
        {sortedDocuments.length ? sortedDocuments.map(doc => (
          <div className="document-row" key={doc.id}>
            <div>
              <strong>{doc.file_name}</strong>
              <div className="field-help">Medications · {new Date(doc.created_at).toLocaleString()}</div>
            </div>
            <DocumentActions clientId={clientId} documentId={doc.id} fileName={doc.file_name} onDeleted={(id) => setDocuments(current => current.filter(item => item.id !== id))} onStatus={setStatus} />
          </div>
        )) : <div className="field-help">No medication files saved yet.</div>}
      </div>
    </div>
  )
}
