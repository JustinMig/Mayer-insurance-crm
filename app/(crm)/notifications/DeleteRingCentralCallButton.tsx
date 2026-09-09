'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DeleteRingCentralCallButton({ callId }: { callId: string }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  async function removeCall() {
    if (deleting) return
    const confirmed = window.confirm('Delete this call from the CRM call log?\n\nThis will NOT delete the call or recording from RingCentral.')
    if (!confirmed) return

    setDeleting(true)
    try {
      const response = await fetch(`/api/ringcentral/calls/${encodeURIComponent(callId)}`, { method: 'DELETE' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Unable to delete the call from the CRM.')
      router.refresh()
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to delete the call from the CRM.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <button
      type="button"
      className="btn btn-secondary calls-delete-button"
      onClick={removeCall}
      disabled={deleting}
      title="Remove from CRM only. The call remains in RingCentral."
    >
      {deleting ? 'Deleting…' : 'Delete from CRM'}
    </button>
  )
}
