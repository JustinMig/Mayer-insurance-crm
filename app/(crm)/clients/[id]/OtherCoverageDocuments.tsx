'use client'

import { useState } from 'react'
import DocumentActions from './DocumentActions'

type DocumentRow = {
  id: string
  file_name: string
  mime_type: string | null
  document_type: string | null
  created_at: string
}

const LABELS: Record<string, string> = {
  aca: 'ACA',
  dental: 'Dental',
  hearing: 'Hearing',
  vision: 'Vision',
  retirement: 'Retirement'
}

export default function OtherCoverageDocuments({ clientId, documents: initialDocuments }: { clientId: string; documents: DocumentRow[] }) {
  const [documents, setDocuments] = useState<DocumentRow[]>(initialDocuments)
  const [status, setStatus] = useState('')
  const sorted = [...documents].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
  if (!sorted.length) return null

  return (
    <details className="section-details section-notes">
      <summary><span>Other Coverage Files</span><small>ACA, dental, vision, hearing &amp; retirement documents</small></summary>
      <div className="section-body intake-section-body">
        <div className="intake-group intake-group-files">
          <div className="medicare-documents-panel">
            <div className="medicare-documents-heading">
              <div>
                <strong>Imported Coverage Files</strong>
                <div className="field-help">These files came from matching legacy attachment CSV records and are kept with the correct client.</div>
              </div>
            </div>
            {status ? <div className="document-status">{status}</div> : null}
            <div className="document-list">
              {sorted.map((doc) => (
                <div className="document-row" key={doc.id}>
                  <div>
                    <strong>{doc.file_name}</strong>
                    <div className="field-help">{LABELS[doc.document_type || ''] || 'Other Coverage'} · {new Date(doc.created_at).toLocaleString()}</div>
                  </div>
                  <DocumentActions clientId={clientId} documentId={doc.id} fileName={doc.file_name} onDeleted={(id) => setDocuments(current => current.filter(item => item.id !== id))} onStatus={setStatus} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </details>
  )
}
