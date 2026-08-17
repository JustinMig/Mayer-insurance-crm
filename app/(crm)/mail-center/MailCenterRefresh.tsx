'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function MailCenterRefresh({ connected }: { connected: boolean }) {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)

  async function sync() {
    if (!connected || syncing) return
    setSyncing(true)
    try {
      const response = await fetch('/api/mail-center/sync', { method: 'POST', cache: 'no-store' })
      if (response.ok) router.refresh()
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    if (!connected) return
    const timer = window.setInterval(() => void sync(), 60_000)
    return () => window.clearInterval(timer)
  }, [connected])

  return <button type="button" className="btn btn-secondary" disabled={!connected || syncing} onClick={() => void sync()}>{syncing ? 'Checking…' : 'Check Mail'}</button>
}
