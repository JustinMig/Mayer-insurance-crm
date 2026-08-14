'use client'

import { useRouter } from 'next/navigation'

export default function ClientImportForm() {
  const router = useRouter()

  return (
    <div className="card card-pad">
      <h2>Client import retired</h2>
      <p className="subtle">Use the Apple Files life-insurance import instead.</p>
      <button className="btn btn-primary" type="button" onClick={() => router.push('/clients/document-import')}>
        IMPORT FROM FILES
      </button>
    </div>
  )
}
