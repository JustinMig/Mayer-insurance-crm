'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'

export default function SoaTextBridge() {
  const pathname = usePathname()
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')

  const match = pathname.match(/^\/clients\/([^/]+)$/)
  const clientId = match?.[1] || ''

  useEffect(() => {
    if (!clientId) {
      setTarget(null)
      return
    }

    const findTarget = () => {
      const modal = document.querySelector<HTMLElement>('.soa-modal')
      const footer = modal?.querySelector<HTMLElement>('.soa-footer') || null
      setTarget(footer)
    }

    findTarget()
    const observer = new MutationObserver(findTarget)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [clientId])

  async function send() {
    if (!clientId || sending) return
    const modal = document.querySelector<HTMLElement>('.soa-modal')
    if (!modal) return

    const phoneInputs = Array.from(modal.querySelectorAll<HTMLInputElement>('input[type="tel"]'))
    const phone = phoneInputs[0]?.value?.trim() || ''
    const products = Array.from(modal.querySelectorAll<HTMLElement>('.soa-products .checkbox-card'))
      .filter(label => label.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked)
      .map(label => (label.textContent || '').trim())
      .filter(Boolean)
    const otherProduct = Array.from(modal.querySelectorAll<HTMLInputElement>('input'))
      .find(input => input.placeholder === 'Optional')?.value?.trim() || ''

    if (!phone) {
      setMessage('Enter the beneficiary mobile number first.')
      return
    }

    setSending(true)
    setMessage('')
    try {
      const response = await fetch(`/api/clients/${clientId}/soa-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, products, other_product: otherProduct })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to text the SOA.')
      setMessage(`SOA signing link sent to ${result.phone || phone}.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to text the SOA.')
    } finally {
      setSending(false)
    }
  }

  if (!target || !clientId) return null

  return createPortal(
    <div style={{ width: '100%', display: 'grid', gap: 8, marginRight: 'auto' }}>
      <button type="button" className="btn btn-primary" disabled={sending} onClick={() => void send()}>
        {sending ? 'Sending SOA…' : 'TEXT SOA TO CLIENT'}
      </button>
      <span className="field-help">Uses the Beneficiary phone number above. The client signs on their phone and the completed SOA is saved automatically to this client’s files.</span>
      {message ? <div className="document-status">{message}</div> : null}
    </div>,
    target
  )
}
