'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DeleteRingCentralCallButton({ callId }: { callId: string }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  async function removeCall() {
    if (deleting) return
    const confirmed = window.confirm('Remove this call from Notifications?\n\nThe call will stay in the client record, and the original call/recording will stay in RingCentral.')
    if (!confirmed) return

    setDeleting(true)
    try {
      const response = await fetch(`/api/ringcentral/calls/${encodeURIComponent(callId)}`, { method: 'DELETE' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Unable to remove the call from Notifications.')
      router.refresh()
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to remove the call from Notifications.')
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
      title="Remove from Notifications only. The call stays in the client record and RingCentral."
    >
      {deleting ? 'Removing…' : 'Remove'}
    </button>
  )
}
