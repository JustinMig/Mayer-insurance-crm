'use client'

import { useEffect, useState } from 'react'

type PushState = 'checking' | 'ready' | 'enabled' | 'blocked' | 'unsupported' | 'error'
type BadgeNavigator = Navigator & {
  standalone?: boolean
  setAppBadge?: (contents?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

function base64UrlToBytes(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const normalized = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const output = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index)
  return output
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isStandalone() {
  const badgeNavigator = navigator as BadgeNavigator
  return window.matchMedia('(display-mode: standalone)').matches || badgeNavigator.standalone === true
}

async function saveSubscription(subscription: PushSubscription) {
  const response = await fetch('/api/push/subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
    cache: 'no-store',
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error || 'Unable to save notification subscription.')
}

export default function PushNotificationManager() {
  const [state, setState] = useState<PushState>('checking')
  const [publicKey, setPublicKey] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true

    async function initialize() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        if (active) setState('unsupported')
        return
      }

      try {
        const configResponse = await fetch('/api/push/config', { cache: 'no-store' })
        const config = await configResponse.json().catch(() => ({}))
        if (!configResponse.ok || !config?.enabled || !config?.publicKey) throw new Error(config?.error || 'Phone alerts are unavailable.')
        if (!active) return
        setPublicKey(String(config.publicKey))

        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
        await navigator.serviceWorker.ready
        const existing = await registration.pushManager.getSubscription()

        if (Notification.permission === 'denied') {
          if (active) setState('blocked')
          return
        }

        if (Notification.permission === 'granted' && existing) {
          await saveSubscription(existing)
          if (active) setState('enabled')
          return
        }

        if (active) setState('ready')
      } catch (error) {
        if (!active) return
        setMessage(error instanceof Error ? error.message : 'Phone alerts could not be initialized.')
        setState('error')
      }
    }

    void initialize()
    return () => { active = false }
  }, [])

  async function enableAlerts() {
    setMessage('')
    try {
      if (isIos() && !isStandalone()) {
        setMessage('On iPhone, open the CRM from the Home Screen app before enabling alerts.')
        return
      }

      const permission = await Notification.requestPermission()
      if (permission === 'denied') {
        setState('blocked')
        setMessage('Notifications are blocked. Enable them in your device notification settings for Mayer CRM.')
        return
      }
      if (permission !== 'granted') return

      const registration = await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToBytes(publicKey),
        })
      }
      await saveSubscription(subscription)
      setState('enabled')
      setMessage('Phone alerts are on.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not enable phone alerts.')
      setState('error')
    }
  }

  async function disableAlerts() {
    setMessage('')
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await fetch('/api/push/subscription', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
          cache: 'no-store',
        }).catch(() => null)
        await subscription.unsubscribe()
      }
      const badgeNavigator = navigator as BadgeNavigator
      await badgeNavigator.clearAppBadge?.().catch(() => undefined)
      setState('ready')
      setMessage('Phone alerts are off.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not turn off phone alerts.')
    }
  }

  if (state === 'checking' || state === 'unsupported') return null

  return (
    <div className="push-alert-control">
      {state === 'enabled' ? (
        <button type="button" className="push-alert-button enabled" onClick={disableAlerts} title="Phone alerts are enabled. Tap to turn them off.">
          🔔 Alerts On
        </button>
      ) : state === 'blocked' ? (
        <button type="button" className="push-alert-button blocked" disabled title="Enable notifications in your device settings.">
          🔕 Alerts Blocked
        </button>
      ) : (
        <button type="button" className="push-alert-button" onClick={enableAlerts}>
          🔔 Enable Alerts
        </button>
      )}
      {message ? <span className="push-alert-message" role="status">{message}</span> : null}
      <style jsx>{`
        .push-alert-control{position:relative;display:flex;align-items:center;gap:7px}
        .push-alert-button{border:1px solid #c9d5df;background:#fff;color:#31485b;border-radius:999px;padding:7px 10px;font:inherit;font-size:.78rem;font-weight:900;white-space:nowrap;cursor:pointer}
        .push-alert-button:hover{background:#f5f8fa}.push-alert-button.enabled{background:#e9f7ee;border-color:#b8dec5;color:#26633a}.push-alert-button.blocked{background:#f4eeee;border-color:#e4cccc;color:#755050;cursor:not-allowed}
        .push-alert-message{position:absolute;right:0;top:calc(100% + 7px);z-index:90;width:min(310px,80vw);padding:8px 10px;border-radius:9px;background:#fff;border:1px solid #d7e0e8;box-shadow:0 8px 24px rgba(15,23,42,.14);font-size:.76rem;font-weight:700;color:#44576a}
        @media(max-width:720px){.push-alert-button{padding:6px 8px;font-size:.72rem}.push-alert-message{position:fixed;right:12px;top:58px}}
      `}</style>
    </div>
  )
}
