'use client'

import { useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'

const PRODUCT_OPTIONS = [
  'Medicare Advantage (Part C) / Cost Plans',
  'Stand-alone Prescription Drug Plans (Part D)',
  'Medicare Supplement (Medigap)',
  'Dental / Vision / Hearing products',
  'Hospital Indemnity products',
  'Other Medicare-related health products'
]

function clientIdFromPath(pathname: string) {
  const match = pathname.match(/^\/clients\/([^/]+)$/)
  if (!match || match[1] === 'new') return ''
  return decodeURIComponent(match[1])
}

export default function ClientSoaTextAction() {
  const pathname = usePathname()
  const clientId = useMemo(() => clientIdFromPath(pathname), [pathname])
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [products, setProducts] = useState<string[]>([...PRODUCT_OPTIONS])
  const [otherProduct, setOtherProduct] = useState('')

  if (!clientId) return null

  function toggleProduct(product: string) {
    setProducts((current) => current.includes(product) ? current.filter((item) => item !== product) : [...current, product])
  }

  async function send() {
    if (sending) return
    if (!products.length && !otherProduct.trim()) {
      setMessage('Choose at least one product type to discuss.')
      return
    }
    setSending(true)
    setMessage('')
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/soa-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ products, other_product: otherProduct.trim() })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to text the SOA.')
      setMessage(`SOA signing link sent to ${result.phone || 'the client phone on file'}.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to text the SOA.')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <button type="button" className="client-soa-direct-button" onClick={() => { setMessage(''); setOpen(true) }}>
        TEXT SOA
      </button>

      {open ? (
        <div className="client-soa-direct-backdrop" role="dialog" aria-modal="true" aria-label="Text Scope of Appointment" onMouseDown={(event) => { if (event.currentTarget === event.target && !sending) setOpen(false) }}>
          <section className="card client-soa-direct-modal">
            <div className="client-soa-direct-head">
              <div><h2>Text Scope of Appointment</h2><p className="subtle">Sends a secure signing link to the client phone number saved in this record.</p></div>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setOpen(false)} disabled={sending}>Close</button>
            </div>

            <div className="client-soa-direct-products">
              <strong>Products requested for discussion</strong>
              <div className="client-soa-direct-grid">
                {PRODUCT_OPTIONS.map((product) => (
                  <label key={product}><input type="checkbox" checked={products.includes(product)} onChange={() => toggleProduct(product)} /> {product}</label>
                ))}
              </div>
              <label className="label">Other product type<input className="input" value={otherProduct} onChange={(event) => setOtherProduct(event.target.value)} placeholder="Optional" /></label>
            </div>

            {message ? <div className="notice">{message}</div> : null}
            <div className="client-soa-direct-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)} disabled={sending}>CANCEL</button>
              <button type="button" className="btn btn-primary" onClick={() => void send()} disabled={sending}>{sending ? 'Sending…' : 'TEXT SOA TO CLIENT'}</button>
            </div>
          </section>
        </div>
      ) : null}

      <style jsx global>{`
        .client-soa-direct-button{position:fixed;right:18px;bottom:18px;z-index:900;border:1px solid #315b4c;border-radius:999px;background:#315b4c;color:#fff;padding:10px 15px;font:inherit;font-size:.78rem;font-weight:900;cursor:pointer;box-shadow:0 4px 14px rgba(20,46,37,.18)}
        .client-soa-direct-backdrop{position:fixed;inset:0;z-index:2100;background:rgba(15,23,42,.55);display:grid;place-items:center;padding:14px}
        .client-soa-direct-modal{width:min(720px,100%);max-height:calc(100dvh - 28px);overflow:auto;padding:17px;display:grid;gap:14px}
        .client-soa-direct-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.client-soa-direct-head h2{margin:0}.client-soa-direct-head p{margin:5px 0 0}
        .client-soa-direct-products{display:grid;gap:11px}.client-soa-direct-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.client-soa-direct-grid label{display:flex;align-items:flex-start;gap:7px;padding:9px;border:1px solid #dbe3e7;border-radius:9px;background:#f8faf9;font-size:.8rem;font-weight:750}
        .client-soa-direct-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
        @media(max-width:720px){.client-soa-direct-button{right:12px;bottom:calc(68px + env(safe-area-inset-bottom));padding:9px 12px}.client-soa-direct-grid{grid-template-columns:1fr}.client-soa-direct-modal{padding:12px}.client-soa-direct-actions .btn{flex:1}}
      `}</style>
    </>
  )
}
