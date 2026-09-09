'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { getCallPlatform, requiresAppleCallingSetup, ringCentralCallHref, toRingCentralNumber } from '@/lib/ringcentral-call-target'
import type { CallPlatform } from '@/lib/ringcentral-call-target'

const SETUP_KEY = 'mayerig:ringcentral:apple-default-confirmed:v1'
let confirmedForThisPage = false

function hasConfirmedSetup() {
  try { return confirmedForThisPage || window.localStorage.getItem(SETUP_KEY) === 'yes' }
  catch { return confirmedForThisPage }
}

function rememberSetup(confirmed: boolean) {
  confirmedForThisPage = confirmed
  try {
    if (confirmed) window.localStorage.setItem(SETUP_KEY, 'yes')
    else window.localStorage.removeItem(SETUP_KEY)
  } catch { /* Private browsing can deny storage; retain only this page's choice. */ }
}

export default function RingCentralCallLink({ phone, className, children }: {
  phone: string
  className: string
  children: ReactNode
}) {
  const [platform, setPlatform] = useState<CallPlatform | null>(null)
  const [setupOpen, setSetupOpen] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => { setPlatform(getCallPlatform(navigator)) }, [])

  useEffect(() => {
    if (!setupOpen) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    dialog?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); setSetupOpen(false); return }
      if (event.key !== 'Tab' || !dialog) return
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href], [tabindex="0"]'))
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (!first || !last) { event.preventDefault(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
        event.preventDefault(); first.focus()
      }
    }
    dialog?.addEventListener('keydown', onKeyDown)
    return () => {
      dialog?.removeEventListener('keydown', onKeyDown)
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [setupOpen])

  const number = toRingCentralNumber(phone)
  const href = platform ? ringCentralCallHref(phone, platform) : ''
  const apple = platform !== null && requiresAppleCallingSetup(platform)

  function openSetup() {
    setConfirmed(hasConfirmedSetup())
    setCopyMessage('')
    setSetupOpen(true)
  }

  function startCall(event: MouseEvent<HTMLAnchorElement>) {
    if (!platform || !href) { event.preventDefault(); return }
    if (apple && !hasConfirmedSetup()) {
      event.preventDefault()
      openSetup()
      return
    }
    // Preserve the existing non-Apple native handoff. Standard Apple tel:
    // links use their ordinary, user-initiated anchor action in every browser.
    if (!apple && /Chrome|CriOS/i.test(navigator.userAgent) && !/Edg|OPR/i.test(navigator.userAgent)) {
      event.preventDefault()
      window.location.assign(href)
    }
    // Do not claim the app opened: browsers cannot confirm an external call.
  }

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(`+${number}`)
      setCopyMessage('Number copied. Open RingCentral and paste it into the dialpad.')
    } catch {
      setCopyMessage(`Copy this number into RingCentral: +${number}`)
    }
  }

  if (!number) return null

  return (
    <span className="ringcentral-call-control">
      {href ? (
        <a href={href} className={className} onClick={startCall} title="Call this client with RingCentral">
          {children}
        </a>
      ) : <button type="button" className={className} disabled>{children}</button>}
      <button type="button" className="ringcentral-call-setup-button" onClick={openSetup} aria-label="RingCentral calling setup" title="RingCentral calling setup">⚙</button>
      {setupOpen && platform ? createPortal(
        <div className="ringcentral-call-setup-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setSetupOpen(false) }}>
          <div ref={dialogRef} className="ringcentral-call-setup-panel" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
            <div className="ringcentral-call-setup-heading">
              <h2 id={titleId}>RingCentral calling setup</h2>
              <button type="button" className="btn" aria-label="Close calling setup" onClick={() => setSetupOpen(false)}>×</button>
            </div>
            {apple ? (
              <>
                <p>The Call button uses this device&apos;s default calling app, without opening a RingCentral web page. Set that app to <strong>RingCentral</strong> before calling.</p>
                {platform === 'mac' ? (
                  <p>On newer Macs, open <strong>Phone → Settings → General → Default for calls</strong> and choose <strong>RingCentral</strong>. On older Macs, the setting is in <strong>FaceTime → Settings → General</strong>. Open and sign in to the RingCentral desktop app first.</p>
                ) : (
                  <p>Open <strong>Settings → Apps → Default Apps → Calling</strong>. Choose <strong>RingCentral</strong> if it is listed. The app and iOS/iPadOS version must support default calling.</p>
                )}
                <p className="ringcentral-call-setup-warning">This device setting also affects telephone links outside the CRM. If RingCentral is not listed, or another app opens, do not place the call through your personal line. Copy the number and call from RingCentral directly instead.</p>
                <label className="ringcentral-call-setup-confirm">
                  <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                  <span>I have selected RingCentral as this device&apos;s default calling app.</span>
                </label>
              </>
            ) : <p>Open and sign in to the installed RingCentral app. If the app link is not registered on this device, copy the number and call from RingCentral directly. No browser calling page is opened automatically.</p>}
            <p className="ringcentral-call-setup-number">Number: <strong>+{number}</strong></p>
            {copyMessage ? <p role="status">{copyMessage}</p> : null}
            <div className="ringcentral-call-setup-actions">
              <button type="button" className="btn" onClick={() => void copyNumber()}>Copy number</button>
              {apple ? <button type="button" className="btn btn-primary" onClick={() => { rememberSetup(confirmed); setSetupOpen(false) }}>Save calling setup</button> : null}
              <button type="button" className="btn" onClick={() => setSetupOpen(false)}>Close</button>
            </div>
            {apple ? <small>After saving, click Call again. This browser remembers your confirmation; it does not verify or change your device settings. Recheck setup if another app opens.</small> : null}
          </div>
        </div>, document.body
      ) : null}
      <style jsx global>{`
        .ringcentral-call-control{display:inline-flex;align-items:center;gap:6px;max-width:100%}
        .ringcentral-call-control>a{text-decoration:none;cursor:pointer}
        .ringcentral-call-setup-button{display:inline-flex;align-items:center;justify-content:center;min-width:32px;min-height:32px;border:1px solid #d5dde3;border-radius:8px;background:#fff;color:#4f6170;font:inherit;cursor:pointer}
        .ringcentral-call-setup-backdrop{position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,.48);display:flex;align-items:center;justify-content:center;padding:16px}
        .ringcentral-call-setup-panel{box-sizing:border-box;width:100%;max-width:530px;max-height:90dvh;overflow:auto;padding:20px;border-radius:14px;background:#fff;color:#172033;box-shadow:0 12px 40px rgba(15,23,42,.25);font-size:.9rem;line-height:1.5}
        .ringcentral-call-setup-heading{display:flex;justify-content:space-between;align-items:center;gap:12px}
        .ringcentral-call-setup-heading h2{font-size:1.1rem;margin:0}
        .ringcentral-call-setup-warning{padding:10px;border:1px solid #e9d99f;border-radius:8px;background:#fff8e6}
        .ringcentral-call-setup-confirm{display:flex;align-items:flex-start;gap:10px;font-weight:700;cursor:pointer}
        .ringcentral-call-setup-confirm input{flex:none;width:20px;height:20px;margin-top:2px}
        .ringcentral-call-setup-actions{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}
        .ringcentral-call-setup-panel small{display:block;color:#61717e}
        @media(max-width:720px){.ringcentral-call-setup-button{min-width:40px;min-height:40px}.ringcentral-call-setup-panel{padding:16px}.ringcentral-call-setup-actions .btn{min-height:44px}}
      `}</style>
    </span>
  )
}
