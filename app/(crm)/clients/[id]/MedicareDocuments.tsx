'use client'

import { useMemo, useRef, useState, type ChangeEvent, type PointerEvent } from 'react'

type DocumentRow = {
  id: string
  file_name: string
  mime_type: string | null
  document_type: string | null
  created_at: string
}

type Props = {
  clientId: string
  clientName: string
  clientPhone: string
  clientAddress: string
  agentName: string
  agentEmail: string
  initialDocuments: DocumentRow[]
}

const productOptions = [
  'Medicare Advantage (Part C)',
  'Prescription Drug Plan (Part D)',
  'Medicare Supplement (Medigap)',
  'Dental / Vision / Hearing',
  'Other Medicare-related coverage'
]

function localDate() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

function prettyType(type: string | null) {
  if (type === 'scope_of_appointment') return 'Signed Scope of Appointment'
  if (type === 'medicare_photo') return 'Medicare photo'
  if (type === 'medicare_document') return 'Medicare document'
  if (type === 'card_information') return 'Card Information'
  return type ? type.replaceAll('_', ' ') : 'Document'
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(/\s+/)
  let line = ''
  let cursorY = y
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY)
      line = word
      cursorY += lineHeight
    } else {
      line = test
    }
  }
  if (line) ctx.fillText(line, x, cursorY)
  return cursorY + lineHeight
}

export default function MedicareDocuments(props: Props) {
  const [documents, setDocuments] = useState<DocumentRow[]>(props.initialDocuments)
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState('')
  const [soaOpen, setSoaOpen] = useState(false)
  const [appointmentDate, setAppointmentDate] = useState(localDate())
  const [beneficiaryName, setBeneficiaryName] = useState(props.clientName)
  const [beneficiaryPhone, setBeneficiaryPhone] = useState(props.clientPhone)
  const [agentPhone, setAgentPhone] = useState('')
  const [selectedProducts, setSelectedProducts] = useState<string[]>(['Medicare Advantage (Part C)'])
  const [otherProduct, setOtherProduct] = useState('')
  const [hasInk, setHasInk] = useState(false)
  const signatureRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)

  const sortedDocuments = useMemo(
    () => [...documents].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
    [documents]
  )

  async function uploadFile(file: File, documentType: string, preferredName?: string) {
    setUploading(true)
    setStatus('Uploading…')
    try {
      const form = new FormData()
      form.set('file', file)
      form.set('document_type', documentType)
      if (preferredName) form.set('file_name', preferredName)
      const response = await fetch(`/api/clients/${props.clientId}/documents`, { method: 'POST', body: form })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Upload failed.')
      setDocuments(current => [result.document, ...current])
      setStatus('Saved to this client’s files.')
      return true
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Upload failed.')
      return false
    } finally {
      setUploading(false)
    }
  }

  async function handlePicker(event: ChangeEvent<HTMLInputElement>, type: string) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    await uploadFile(file, type)
  }

  function pointFromEvent(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget
    const rect = canvas.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height)
    }
  }

  function startSignature(event: PointerEvent<HTMLCanvasElement>) {
    event.preventDefault()
    drawingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    lastPointRef.current = pointFromEvent(event)
  }

  function moveSignature(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !lastPointRef.current) return
    event.preventDefault()
    const canvas = event.currentTarget
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const next = pointFromEvent(event)
    ctx.strokeStyle = '#111827'
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y)
    ctx.lineTo(next.x, next.y)
    ctx.stroke()
    lastPointRef.current = next
    setHasInk(true)
  }

  function endSignature(event?: PointerEvent<HTMLCanvasElement>) {
    if (event) event.preventDefault()
    drawingRef.current = false
    lastPointRef.current = null
  }

  function clearSignature() {
    const canvas = signatureRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx?.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
  }

  function toggleProduct(product: string) {
    setSelectedProducts(current => current.includes(product) ? current.filter(item => item !== product) : [...current, product])
  }

  async function buildSoaImage() {
    if (!hasInk) throw new Error('The client must sign before saving the Scope of Appointment.')
    if (!appointmentDate) throw new Error('Enter the appointment date.')
    if (!beneficiaryName.trim()) throw new Error('Enter the beneficiary name.')
    if (!agentPhone.trim()) throw new Error('Enter the agent phone number.')
    if (!selectedProducts.length && !otherProduct.trim()) throw new Error('Select at least one product type to discuss.')

    const canvas = document.createElement('canvas')
    canvas.width = 1400
    canvas.height = 1900
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not create the signed document.')

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#0f172a'
    ctx.font = 'bold 48px Arial, sans-serif'
    ctx.fillText('Mayer Insurance Group', 90, 110)
    ctx.font = 'bold 38px Arial, sans-serif'
    ctx.fillText('Scope of Appointment', 90, 175)
    ctx.font = '24px Arial, sans-serif'
    ctx.fillStyle = '#334155'
    ctx.fillText(`Appointment date: ${appointmentDate}`, 90, 235)

    let y = 305
    ctx.fillStyle = '#0f172a'
    ctx.font = 'bold 28px Arial, sans-serif'
    ctx.fillText('Beneficiary', 90, y)
    y += 44
    ctx.font = '24px Arial, sans-serif'
    ctx.fillText(`Name: ${beneficiaryName.trim()}`, 90, y)
    y += 38
    ctx.fillText(`Phone: ${beneficiaryPhone.trim() || 'Not provided'}`, 90, y)
    y += 38
    y = wrapText(ctx, `Address: ${props.clientAddress || 'Not provided'}`, 90, y, 1210, 34) + 20

    ctx.font = 'bold 28px Arial, sans-serif'
    ctx.fillText('Agent', 90, y)
    y += 44
    ctx.font = '24px Arial, sans-serif'
    ctx.fillText(`Name: ${props.agentName}`, 90, y)
    y += 38
    ctx.fillText(`Email: ${props.agentEmail || 'Not provided'}`, 90, y)
    y += 38
    ctx.fillText(`Phone: ${agentPhone.trim()}`, 90, y)
    y += 60

    ctx.font = 'bold 28px Arial, sans-serif'
    ctx.fillText('Products requested for discussion', 90, y)
    y += 44
    ctx.font = '24px Arial, sans-serif'
    const products = [...selectedProducts]
    if (otherProduct.trim()) products.push(otherProduct.trim())
    for (const product of products) {
      ctx.fillText(`• ${product}`, 110, y)
      y += 36
    }
    y += 28

    ctx.font = 'bold 28px Arial, sans-serif'
    ctx.fillText('Beneficiary acknowledgement', 90, y)
    y += 44
    ctx.font = '24px Arial, sans-serif'
    const acknowledgement = 'By signing below, I agree that the agent named above may discuss the product types selected on this form during the appointment shown above. I understand that signing this form does not require me to enroll in a plan, does not change my current or future Medicare enrollment, and does not automatically enroll me in any plan.'
    y = wrapText(ctx, acknowledgement, 90, y, 1210, 36) + 28
    const additional = 'If I ask to discuss a different plan type during the appointment, a new Scope of Appointment may be required before that additional product type is discussed.'
    y = wrapText(ctx, additional, 90, y, 1210, 36) + 35

    ctx.font = 'bold 26px Arial, sans-serif'
    ctx.fillText('Beneficiary signature', 90, y)
    y += 24
    ctx.strokeStyle = '#cbd5e1'
    ctx.strokeRect(90, y, 1210, 300)

    const signature = signatureRef.current
    if (signature) ctx.drawImage(signature, 110, y + 20, 1170, 260)
    y += 345
    ctx.font = '22px Arial, sans-serif'
    ctx.fillStyle = '#475569'
    ctx.fillText(`Signed electronically: ${new Date().toLocaleString()}`, 90, y)
    y += 40
    ctx.font = '18px Arial, sans-serif'
    ctx.fillText('Generated and stored by Mayer Insurance Group CRM. Retain according to applicable carrier and CMS requirements.', 90, y)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create signed Scope of Appointment.')), 'image/png')
    })
  }

  async function saveScope() {
    setStatus('')
    try {
      const blob = await buildSoaImage()
      const fileName = `Scope_of_Appointment_${props.clientName.replace(/[^a-zA-Z0-9]+/g, '_')}_${appointmentDate}.png`
      const file = new File([blob], fileName, { type: 'image/png' })
      const saved = await uploadFile(file, 'scope_of_appointment', fileName)
      if (saved) {
        setSoaOpen(false)
        clearSignature()
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save the Scope of Appointment.')
    }
  }

  return (
    <div className="medicare-documents-panel">
      <div className="medicare-documents-heading">
        <div>
          <strong>Client Files</strong>
          <div className="field-help">Upload a document, take a photo, or capture a signed Scope of Appointment.</div>
        </div>
        <div className="document-action-row">
          <label className={`btn btn-secondary upload-button ${uploading ? 'is-disabled' : ''}`}>
            Upload File
            <input
              type="file"
              hidden
              disabled={uploading}
              accept="image/*,.pdf,.txt,.doc,.docx"
              onChange={event => handlePicker(event, 'medicare_document')}
            />
          </label>
          <label className={`btn btn-secondary upload-button ${uploading ? 'is-disabled' : ''}`}>
            Take Photo
            <input
              type="file"
              hidden
              disabled={uploading}
              accept="image/*"
              capture="environment"
              onChange={event => handlePicker(event, 'medicare_photo')}
            />
          </label>
          <label className={`btn btn-secondary upload-button ${uploading ? 'is-disabled' : ''}`}>
            Card Information
            <input
              type="file"
              hidden
              disabled={uploading}
              accept="image/*,.pdf,.txt,.doc,.docx"
              onChange={event => handlePicker(event, 'card_information')}
            />
          </label>
          <button className="btn btn-primary" type="button" onClick={() => { setStatus(''); setSoaOpen(true) }}>
            Sign Scope of Appointment
          </button>
        </div>
      </div>

      {status ? <div className="document-status">{status}</div> : null}

      <div className="document-list">
        {sortedDocuments.length ? sortedDocuments.map(doc => (
          <div className="document-row" key={doc.id}>
            <div>
              <strong>{doc.file_name}</strong>
              <div className="field-help">{prettyType(doc.document_type)} · {new Date(doc.created_at).toLocaleString()}</div>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => window.open(`/api/clients/${props.clientId}/documents/${doc.id}`, '_blank', 'noopener,noreferrer')}
            >
              Open
            </button>
          </div>
        )) : <div className="field-help">No Medicare files saved yet.</div>}
      </div>

      {soaOpen ? (
        <div className="soa-backdrop" role="dialog" aria-modal="true" aria-label="Scope of Appointment">
          <div className="soa-modal">
            <div className="soa-modal-header">
              <div>
                <h2>Scope of Appointment</h2>
                <p className="subtle">Have the client review the scope, then sign with a finger, stylus, or mouse.</p>
              </div>
              <button type="button" className="btn btn-secondary" onClick={() => setSoaOpen(false)}>Close</button>
            </div>

            <div className="soa-grid">
              <label className="label">Appointment date
                <input className="input" type="date" value={appointmentDate} onChange={e => setAppointmentDate(e.target.value)} />
              </label>
              <label className="label">Beneficiary name
                <input className="input" value={beneficiaryName} onChange={e => setBeneficiaryName(e.target.value)} />
              </label>
              <label className="label">Beneficiary phone
                <input className="input" type="tel" value={beneficiaryPhone} onChange={e => setBeneficiaryPhone(e.target.value)} />
              </label>
              <label className="label">Agent phone
                <input className="input" type="tel" value={agentPhone} onChange={e => setAgentPhone(e.target.value)} placeholder="Required for signed SOA" />
              </label>
            </div>

            <div className="soa-section">
              <strong>Products the client agrees may be discussed</strong>
              <div className="soa-products">
                {productOptions.map(product => (
                  <label className="checkbox-card" key={product}>
                    <input type="checkbox" checked={selectedProducts.includes(product)} onChange={() => toggleProduct(product)} /> {product}
                  </label>
                ))}
              </div>
              <label className="label" style={{ marginTop: 12 }}>Other product type
                <input className="input" value={otherProduct} onChange={e => setOtherProduct(e.target.value)} placeholder="Optional" />
              </label>
            </div>

            <div className="soa-acknowledgement">
              By signing, the client agrees that the agent may discuss the selected product types during the appointment. Signing does not require enrollment, change Medicare enrollment status, or automatically enroll the client in a plan. A new scope may be needed if the client asks to discuss a different plan type.
            </div>

            <div className="soa-section">
              <div className="signature-heading">
                <strong>Client Signature</strong>
                <button type="button" className="btn btn-secondary btn-small" onClick={clearSignature}>Clear Signature</button>
              </div>
              <canvas
                ref={signatureRef}
                className="signature-canvas"
                width={900}
                height={260}
                onPointerDown={startSignature}
                onPointerMove={moveSignature}
                onPointerUp={endSignature}
                onPointerCancel={endSignature}
                onPointerLeave={endSignature}
              />
              <div className="field-help">Electronic signature captured in the CRM. Confirm any carrier-specific SOA requirements before use.</div>
            </div>

            <div className="soa-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setSoaOpen(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={uploading} onClick={saveScope}>
                {uploading ? 'Saving…' : 'Save Signed Scope to Client Files'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
