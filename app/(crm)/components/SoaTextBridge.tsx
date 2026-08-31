'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'

const DEFAULT_PRODUCTS = [
  'Medicare Advantage (Part C) / Cost Plans',
  'Stand-alone Prescription Drug Plans (Part D)',
  'Medicare Supplement (Medigap)',
  'Dental / Vision / Hearing products',
  'Hospital Indemnity products',
  'Other Medicare-related health products'
]

export default function SoaTextBridge() {
  const pathname = usePathname()
  const [footerTarget, setFooterTarget] = useState<HTMLElement | null>(null)
  const [actionTarget, setActionTarget] = useState<HTMLElement | null>(null)
  const [sending, setSending] = useState(false)
  const [actionMessage, setActionMessage] = useState('')
  const [footerMessage, setFooterMessage] = useState('')

  const match = pathname.match(/^\/clients\/([^/]+)$/)
  const clientId = match?.[1] || ''

  useEffect(() => {
    if (!clientId) {
      setFooterTarget(null)
      setActionTarget(null)
      return
    }

    const root = document.querySelector<HTMLElement>('.content')
    if (!root) return

    const findTargets = () => {
      const footer = root.querySelector<HTMLElement>('.soa-modal .soa-footer') || null
      const actions = root.querySelector<HTMLElement>('.medicare-documents-panel .document-action-row') || null
      setFooterTarget((current) => current === footer ? current : footer)
      setActionTarget((current) => current === actions ? current : actions)
    }

    findTargets()
    const observer = new MutationObserver(findTargets)
    observer.observe(root, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      setFooterTarget(null)
      setActionTarget(null)
    }
  }, [clientId])

  function currentClientPhone() {
    return document.querySelector<HTMLInputElement>('.client-profile-form input[name="phone"]')?.value?.trim() || ''
  }

  function productsFromModal() {
    const modal = document.querySelector<HTMLElement>('.soa-modal')
    if (!modal) return { products: DEFAULT_PRODUCTS, otherProduct: '' }

    const products = Array.from(modal.querySelectorAll<HTMLElement>('.soa-products .checkbox-card'))
      .filter(label => label.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked)
      .map(label => (label.textContent || '').trim())
      .filter(Boolean)
    const otherProduct = Array.from(modal.querySelectorAll<HTMLInputElement>('input'))
      .find(input => input.placeholder === 'Optional')?.value?.trim() || ''

    return { products, otherProduct }
  }

  async function send(mode: 'direct' | 'modal') {
    if (!clientId || sending) return

    const modal = mode === 'modal' ? document.querySelector<HTMLElement>('.soa-modal') : null
    const modalPhone = modal
      ? Array.from(modal.querySelectorAll<HTMLInputElement>('input[type="tel"]'))[0]?.value?.trim() || ''
      : ''
    const phone = modalPhone || currentClientPhone()
    const { products, otherProduct } = mode === 'modal'
      ? productsFromModal()
      : { products: DEFAULT_PRODUCTS, otherProduct: '' }

    if (!phone) {
      const text = 'Enter a valid client mobile number first.'
      if (mode === 'modal') setFooterMessage(text)
      else setActionMessage(text)
      return
    }

    setSending(true)
    if (mode === 'modal') setFooterMessage('')
    else setActionMessage('')

    try {
      const response = await fetch(`/api/clients/${clientId}/soa-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, products, other_product: otherProduct })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to text the SOA.')
      const text = `SOA signing link sent to ${result.phone || phone}.`
      if (mode === 'modal') setFooterMessage(text)
      else setActionMessage(text)
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Unable to text the SOA.'
      if (mode === 'modal') setFooterMessage(text)
      else setActionMessage(text)
    } finally {
      setSending(false)
    }
  }

  if (!clientId) return null

  return (
    <>
      {actionTarget ? createPortal(
        <div className="soa-text-direct-action">
          <button type="button" className="btn btn-primary" disabled={sending} onClick={() => void send('direct')}>
            {sending ? 'Sending SOA…' : 'TEXT SOA TO CLIENT'}
          </button>
          {actionMessage ? <span className="document-status soa-text-action-status">{actionMessage}</span> : null}
        </div>,
        actionTarget
      ) : null}

      {footerTarget ? createPortal(
        <div className="soa-text-footer-action">
          <button type="button" className="btn btn-primary" disabled={sending} onClick={() => void send('modal')}>
            {sending ? 'Sending SOA…' : 'TEXT SOA TO CLIENT'}
          </button>
          <span className="field-help">Uses the Beneficiary phone number above. The client signs on their phone and the completed SOA is saved automatically to this client’s files.</span>
          {footerMessage ? <div className="document-status">{footerMessage}</div> : null}
        </div>,
        footerTarget
      ) : null}

      <style>{`
        .soa-text-direct-action{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .soa-text-action-status{max-width:360px;margin:0!important}
        .soa-text-footer-action{width:100%;display:grid;gap:8px;margin-right:auto}
      `}</style>
    </>
  )
}
