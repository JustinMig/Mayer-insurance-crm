'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function MailCenterRefresh({ connected }: { connected: boolean }) {
  const router = useRouter()
  const busyRef = useRef(false)
  const [syncing, setSyncing] = useState(false)
  const [status, setStatus] = useState('')

  const sync = useCallback(async (silent = false) => {
    if (!connected || busyRef.current) return
    if (silent && typeof document !== 'undefined' && document.visibilityState === 'hidden') return

    busyRef.current = true
    if (!silent) setSyncing(true)
    try {
      const response = await fetch('/api/mail-center/sync', { method: 'POST', cache: 'no-store' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Mail check failed.')

      if (result.labelMissing) {
        setStatus('Create the Gmail label “Send to CRM” to sync messages.')
      } else {
        const changed = Number(result.imported || 0) + Number(result.updated || 0)
        if (changed > 0) {
          setStatus(`${changed} message${changed === 1 ? '' : 's'} refreshed.`)
          router.refresh()
        } else if (!silent) {
          setStatus('Mail is up to date.')
        }
      }
    } catch (error) {
      if (!silent) setStatus(error instanceof Error ? error.message : 'Mail check failed.')
    } finally {
      busyRef.current = false
      if (!silent) setSyncing(false)
    }
  }, [connected, router])

  useEffect(() => {
    if (!connected) return
    void sync(true)
    const timer = window.setInterval(() => void sync(true), 90_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void sync(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [connected, sync])

  return (
    <div style={{ display: 'grid', gap: 5, justifyItems: 'end' }}>
      <button type="button" className="btn btn-secondary" disabled={!connected || syncing} onClick={() => void sync(false)}>
        {syncing ? 'Checking…' : 'Check Mail'}
      </button>
      {status ? <small className="subtle">{status}</small> : null}
    </div>
  )
}
