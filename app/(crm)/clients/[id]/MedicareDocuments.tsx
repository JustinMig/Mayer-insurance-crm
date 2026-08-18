'use client'

import { useMemo, useRef, useState, type ChangeEvent, type PointerEvent } from 'react'
import DocumentActions from './DocumentActions'
import FileDropZone from '../../components/FileDropZone'

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
  'Medicare Advantage (Part C) / Cost Plans',
  'Stand-alone Prescription Drug Plans (Part D)',
  'Medicare Supplement (Medigap)',
  'Dental / Vision / Hearing products',
  'Hospital Indemnity products',
  'Other Medicare-related health products'
]

function localDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
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
  const [beneficiaryName, setBeneficiaryName] = useState(props.clientName)
  const [beneficiaryPhone, setBeneficiaryPhone] = useState(props.clientPhone)
  const [agentPhone, setAgentPhone] = useState('')
  const [selectedProducts, setSelectedProducts] = useState<string[]>([...productOptions])
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
      // Materialize the file before sending it. iPad/iPhone Safari can create a
      // valid File object but send an empty multipart/FormData body after a
      // drag/drop or Files picker handoff. Sending the ArrayBuffer directly
      // avoids WebKit's multipart upload path entirely.
      const bytes = await file.arrayBuffer()
      if (!bytes.byteLength) throw new Error('The selected file is empty. Please choose the file again.')

      const fileName = preferredName || file.name || 'document'
      const params = new URLSearchParams({
        file_name: fileName,
        document_type: documentType
      })

      const response = await fetch(`/api/clients/${props.clientId}/documents?${params.toString()}`, {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-Upload-Size': String(bytes.byteLength)
        },
        body: bytes,
        cache: 'no-store'
      })
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
    if (!beneficiaryName.trim()) throw new Error('Enter the beneficiary name.')
    if (!agentPhone.trim()) throw new Error('Enter the agent phone number.')
    if (!selectedProducts.length && !otherProduct.trim()) throw new Error('Select at least one product type to discuss.')

    const canvas = document.createElement('canvas')
    canvas.width = 1400
    canvas.height = 2300
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not create the signed document.')

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#0f172a'
    ctx.font = 'bold 48px Arial, sans-serif'
    ctx.fillText('Mayer Insurance Group', 90, 110)
    ctx.font = 'bold 38px Arial, sans-serif'
    ctx.fillText('Scope of Sales Appointment Confirmation', 90, 175)
    ctx.font = '24px Arial, sans-serif'
    ctx.fillStyle = '#334155'
    const signedAt = new Date()
    const appointmentDate = localDate(signedAt)
    ctx.fillText(`Appointment date: ${appointmentDate}`, 90, 235)
    ctx.font = '20px Arial, sans-serif'
    ctx.fillStyle = '#475569'
    ctx.fillText(`SOA signed: ${signedAt.toLocaleString()}`, 90, 275)

    ctx.fillStyle = '#0f172a'
    ctx.font = '22px Arial, sans-serif'
    let introY = 325
    introY = wrapText(ctx, 'This Scope of Appointment documents the health-related Medicare product types the beneficiary has requested to discuss with the agent named below.', 90, introY, 1210, 32)
    introY = wrapText(ctx, 'Signing this form does not obligate the beneficiary to enroll, does not affect current or future Medicare enrollment status, and does not automatically enroll the beneficiary in any plan.', 90, introY + 8, 1210, 32)

    let y = introY + 28

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
    const acknowledgement = 'By signing below, I confirm that I requested discussion of the health-related product types selected above. I understand that I am under no obligation to enroll in a plan, my current or future Medicare enrollment status will not be affected by signing this form, and I will not be automatically enrolled in any plan.'
    y = wrapText(ctx, acknowledgement, 90, y, 1210, 36) + 24
    const additional = 'The agent may discuss only the product types agreed to on this Scope of Appointment. If I request discussion of a different product type, an updated or new Scope of Appointment must be documented before that additional product type is discussed.'
    y = wrapText(ctx, additional, 90, y, 1210, 36) + 20
    const timing = 'For scheduled individual Medicare marketing appointments, CMS timing requirements may require the Scope of Appointment to be documented at least 48 hours in advance, subject to applicable exceptions.'
    y = wrapText(ctx, timing, 90, y, 1210, 36) + 35

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

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not create signed Scope of Appointment.')), 'image/png')
    })
    return { blob, appointmentDate }
  }

  async function saveScope() {
    setStatus('')
    try {
      const { blob, appointmentDate } = await buildSoaImage()
      const safeName = props.clientName.replace(/[^a-zA-Z0-9]+/g, '_') || 'Client'
      const fileName = `Scope_of_Appointment_${safeName}_${appointmentDate}.png`
      const file = new File([blob], fileName, { type: 'image/png' })
      const saved = await uploadFile(file, 'scope_of_appointment', fileName)
      if (saved) {
        setSoaOpen(false)
        clearSignature()
        setStatus('Signed Scope of Appointment saved. The appointment date is the date the client signed it.')
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
          <FileDropZone label="Upload Medicare File" disabled={uploading} onFile={async (file) => { await uploadFile(file, 'medicare_document') }} />
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
          <FileDropZone label="Card Information" disabled={uploading} onFile={async (file) => { await uploadFile(file, 'card_information') }} />
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
            <DocumentActions clientId={props.clientId} documentId={doc.id} fileName={doc.file_name} onDeleted={(id) => setDocuments(current => current.filter(item => item.id !== id))} onStatus={setStatus} />
          </div>
        )) : <div className="field-help">No Medicare files saved yet.</div>}
      </div>

      {soaOpen ? (
        <div className="soa-backdrop" role="dialog" aria-modal="true" aria-label="Scope of Appointment">
          <div className="soa-modal">
            <div className="soa-modal-header">
              <div>
                <h2>Scope of Sales Appointment Confirmation</h2>
                <p className="subtle">Review the requested Medicare/health-related product types with the client, then capture the client signature.</p>
              </div>
              <button type="button" className="btn btn-secondary" onClick={() => setSoaOpen(false)}>Close</button>
            </div>

            <div className="soa-grid">
              <div className="label">Appointment date<span className="input input-readonly">Set automatically when signed</span><span className="field-help">The SOA appointment date will be the date the client signs this form.</span></div>
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
              <strong>Products requested for discussion</strong>
              <div className="field-help">All health-related product categories are pre-selected. Uncheck any category the beneficiary does not want discussed.</div>
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
              <strong>Beneficiary acknowledgement</strong><br />
              I requested discussion of the selected health-related product types. Signing does not obligate me to enroll, does not affect my current or future Medicare enrollment status, and does not automatically enroll me in any plan. The agent may discuss only the product types agreed to on this scope; an updated or new scope must be documented before discussing another product type.
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
              <div className="field-help">Electronic signature captured in the CRM. The appointment date is automatically set to the signature date. Carrier-specific requirements may also apply.</div>
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
