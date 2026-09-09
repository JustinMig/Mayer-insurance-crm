'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CallsSyncButton({ configured }: { configured: boolean }) {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState('')

  async function syncCalls() {
    if (syncing) return
    setSyncing(true)
    setMessage('')
    try {
      const response = await fetch('/api/ringcentral/sync', { method: 'POST' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'RingCentral sync failed.')
      if (result.already_syncing) {
        setMessage(result.message || 'RingCentral sync is already running. Please wait a moment.')
        return
      }
      setMessage(`Synced ${result.synced || 0} calls · ${result.matched || 0} matched · ${result.unmatched || 0} unknown · ${result.recordings || 0} recordings`)
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'RingCentral sync failed.')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="ringcentral-calls-sync">
      <button className="btn btn-primary" type="button" onClick={syncCalls} disabled={!configured || syncing}>
        {syncing ? 'Syncing RingCentral…' : configured ? 'Sync RingCentral' : 'RingCentral Setup Needed'}
      </button>
      {message ? <div className="ringcentral-calls-sync-message">{message}</div> : null}
    </div>
  )
}
