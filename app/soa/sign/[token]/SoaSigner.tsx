'use client'

import { useEffect, useRef, useState, type PointerEvent } from 'react'

type RequestPayload = {
  beneficiary_name?: string
  beneficiary_phone?: string
  beneficiary_address?: string
  agent_name?: string
  agent_email?: string
  products?: string[]
  other_product?: string
}

export default function SoaSigner({ token }: { token: string }) {
  const [payload, setPayload] = useState<RequestPayload | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'submitting' | 'signed' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [hasInk, setHasInk] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    let active = true
    fetch(`/api/soa/sign/${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async response => {
        const result = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(result.error || 'Unable to open this signing request.')
        if (!active) return
        if (result.status === 'signed') {
          setState('signed')
          return
        }
        setPayload(result.request || {})
        setState('ready')
      })
      .catch(error => {
        if (!active) return
        setMessage(error instanceof Error ? error.message : 'Unable to open this signing request.')
        setState('error')
      })
    return () => { active = false }
  }, [token])

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget
    const rect = canvas.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height)
    }
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    event.preventDefault()
    drawingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    lastPointRef.current = point(event)
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !lastPointRef.current) return
    event.preventDefault()
    const ctx = event.currentTarget.getContext('2d')
    if (!ctx) return
    const next = point(event)
    ctx.strokeStyle = '#111827'
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y)
    ctx.lineTo(next.x, next.y)
    ctx.stroke()
    lastPointRef.current = next
    setHasInk(true)
  }

  function end(event?: PointerEvent<HTMLCanvasElement>) {
    event?.preventDefault()
    drawingRef.current = false
    lastPointRef.current = null
  }

  function clear() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
  }

  async function submit() {
    if (!canvasRef.current || !hasInk || state !== 'ready') {
      setMessage('Please sign in the signature box first.')
      return
    }
    setState('submitting')
    setMessage('')
    try {
      const response = await fetch(`/api/soa/sign/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature_data_url: canvasRef.current.toDataURL('image/png') })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to save your signed Scope of Appointment.')
      setState('signed')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save your signed Scope of Appointment.')
      setState('ready')
    }
  }

  if (state === 'loading') return <main style={{ maxWidth: 760, margin: '0 auto', padding: 24 }}><h1>Scope of Appointment</h1><p>Loading…</p></main>
  if (state === 'error') return <main style={{ maxWidth: 760, margin: '0 auto', padding: 24 }}><h1>Scope of Appointment</h1><p>{message}</p></main>
  if (state === 'signed') return <main style={{ maxWidth: 760, margin: '0 auto', padding: 24, textAlign: 'center' }}><h1>Thank you</h1><p>Your signed Scope of Appointment has been securely submitted to Mayer Insurance Group.</p><p>You may close this page.</p></main>

  const products = [...(payload?.products || [])]
  if (payload?.other_product) products.push(payload.other_product)

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '22px 16px 40px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#0f172a' }}>
      <div style={{ border: '1px solid #dbe3ea', borderRadius: 18, padding: 20, background: '#fff', boxShadow: '0 12px 40px rgba(15,23,42,.08)' }}>
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#2563eb' }}>MAYER INSURANCE GROUP</div>
          <h1 style={{ fontSize: 28, margin: '6px 0 8px' }}>Scope of Appointment</h1>
          <p style={{ color: '#475569', lineHeight: 1.55, margin: 0 }}>Please review the requested Medicare product discussions below and sign at the bottom.</p>
        </div>

        <section style={{ padding: 16, borderRadius: 12, background: '#f8fafc', marginBottom: 18 }}>
          <strong>Beneficiary</strong>
          <div style={{ marginTop: 8 }}>{payload?.beneficiary_name || 'Client'}</div>
          {payload?.beneficiary_phone ? <div>{payload.beneficiary_phone}</div> : null}
          {payload?.beneficiary_address ? <div>{payload.beneficiary_address}</div> : null}
        </section>

        <section style={{ padding: 16, borderRadius: 12, background: '#f8fafc', marginBottom: 18 }}>
          <strong>Agent</strong>
          <div style={{ marginTop: 8 }}>{payload?.agent_name || 'Agent'}</div>
          {payload?.agent_email ? <div>{payload.agent_email}</div> : null}
        </section>

        <section style={{ marginBottom: 18 }}>
          <strong>Products requested for discussion</strong>
          <ul style={{ paddingLeft: 22, lineHeight: 1.6 }}>
            {(products.length ? products : ['Medicare-related health products requested by beneficiary']).map(product => <li key={product}>{product}</li>)}
          </ul>
        </section>

        <section style={{ lineHeight: 1.58, color: '#334155', fontSize: 15 }}>
          <p>By signing below, I confirm that I requested discussion of the health-related product types selected above. I understand that I am under no obligation to enroll in a plan, my current or future Medicare enrollment status will not be affected by signing this form, and I will not be automatically enrolled in any plan.</p>
          <p>The agent may discuss only the product types agreed to on this Scope of Appointment. If I request discussion of a different product type, an updated or new Scope of Appointment must be documented before that additional product type is discussed.</p>
          <p>For scheduled individual Medicare marketing appointments, CMS timing requirements may require the Scope of Appointment to be documented at least 48 hours in advance, subject to applicable exceptions.</p>
        </section>

        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 8 }}>
            <strong>Beneficiary signature</strong>
            <button type="button" onClick={clear} style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: 9, padding: '8px 12px' }}>Clear</button>
          </div>
          <canvas
            ref={canvasRef}
            width={1000}
            height={300}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            style={{ width: '100%', height: 190, border: '2px solid #cbd5e1', borderRadius: 12, background: '#fff', touchAction: 'none' }}
          />
        </div>

        {message ? <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: '#fff7ed', color: '#9a3412' }}>{message}</div> : null}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={state === 'submitting'}
          style={{ width: '100%', marginTop: 18, border: 0, borderRadius: 12, padding: '14px 16px', background: '#10263f', color: '#fff', fontSize: 16, fontWeight: 800 }}
        >
          {state === 'submitting' ? 'Submitting…' : 'SIGN & SUBMIT SOA'}
        </button>
      </div>
    </main>
  )
}
