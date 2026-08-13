'use client'

import { useRef, useState, type ChangeEvent, type FormEvent, type PointerEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClientIntake } from '../actions'
import DoctorsMedicationsFields from '../DoctorsMedicationsFields'
import LifeInsuranceFields from '../LifeInsuranceFields'
import HealthPlanFields from '../HealthPlanFields'
import HospitalIndemnityFields from '../HospitalIndemnityFields'

import DateOfBirthInput from '../DateOfBirthInput'
import FileDropZone from '../../components/FileDropZone'
type AgentOption = { id: string; full_name: string; role: string }

type Props = {
  currentUserId: string
  currentUserName: string
  currentUserEmail: string
  currentUserRole: string
  agents: AgentOption[]
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

export default function NewClientForm(props: Props) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement | null>(null)
  const signatureRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)

  const canAssignAgent = props.currentUserRole === 'admin' || props.currentUserRole === 'manager'
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')

  const [medicareFile, setMedicareFile] = useState<File | null>(null)
  const [medicarePhoto, setMedicarePhoto] = useState<File | null>(null)
  const [cardFile, setCardFile] = useState<File | null>(null)
  const [soaFile, setSoaFile] = useState<File | null>(null)
  const [medicationsFile, setMedicationsFile] = useState<File | null>(null)
  const [medicationsPhoto, setMedicationsPhoto] = useState<File | null>(null)
  const [lifeInsuranceFile, setLifeInsuranceFile] = useState<File | null>(null)
  const [healthPlanFile, setHealthPlanFile] = useState<File | null>(null)

  const [soaOpen, setSoaOpen] = useState(false)
  const [beneficiaryName, setBeneficiaryName] = useState('')
  const [beneficiaryPhone, setBeneficiaryPhone] = useState('')
  const [beneficiaryAddress, setBeneficiaryAddress] = useState('')
  const [agentName, setAgentName] = useState(props.currentUserName)
  const [agentEmail, setAgentEmail] = useState(props.currentUserEmail)
  const [agentPhone, setAgentPhone] = useState('')
  const [selectedProducts, setSelectedProducts] = useState<string[]>([...productOptions])
  const [otherProduct, setOtherProduct] = useState('')
  const [hasInk, setHasInk] = useState(false)

  function selectedFile(event: ChangeEvent<HTMLInputElement>, setter: (file: File | null) => void) {
    const file = event.target.files?.[0] || null
    event.target.value = ''
    setter(file)
  }

  function readFormText(name: string) {
    const form = formRef.current
    if (!form) return ''
    const field = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
    return field?.value?.trim() || ''
  }

  function openSoa() {
    const first = readFormText('first_name')
    const last = readFormText('last_name')
    setBeneficiaryName([first, last].filter(Boolean).join(' '))
    setBeneficiaryPhone(readFormText('phone'))
    setBeneficiaryAddress([
      readFormText('address_line1'),
      readFormText('city'),
      readFormText('state'),
      readFormText('zip_code')
    ].filter(Boolean).join(', '))

    const assignedId = canAssignAgent ? readFormText('assigned_agent_id') : props.currentUserId
    const assigned = props.agents.find(agent => agent.id === assignedId)
    setAgentName(assigned?.full_name || props.currentUserName)
    setAgentEmail(assignedId === props.currentUserId ? props.currentUserEmail : '')
    setStatus('')
    setSoaOpen(true)
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
    const ctx = event.currentTarget.getContext('2d')
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
    event?.preventDefault()
    drawingRef.current = false
    lastPointRef.current = null
  }

  function clearSignature() {
    const canvas = signatureRef.current
    if (!canvas) return
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
  }

  function toggleProduct(product: string) {
    setSelectedProducts(current => current.includes(product) ? current.filter(item => item !== product) : [...current, product])
  }

  async function buildSoaFile() {
    if (!hasInk) throw new Error('The client must sign before saving the Scope of Appointment.')
    if (!beneficiaryName.trim()) throw new Error('Enter the beneficiary name.')
    if (!agentName.trim()) throw new Error('Enter the agent name.')
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
    y = wrapText(ctx, `Address: ${beneficiaryAddress.trim() || 'Not provided'}`, 90, y, 1210, 34) + 20

    ctx.font = 'bold 28px Arial, sans-serif'
    ctx.fillText('Agent', 90, y)
    y += 44
    ctx.font = '24px Arial, sans-serif'
    ctx.fillText(`Name: ${agentName.trim()}`, 90, y)
    y += 38
    ctx.fillText(`Email: ${agentEmail.trim() || 'Not provided'}`, 90, y)
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
    if (signatureRef.current) ctx.drawImage(signatureRef.current, 110, y + 20, 1170, 260)
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
    const safeName = beneficiaryName.trim().replace(/[^a-zA-Z0-9]+/g, '_') || 'Client'
    return new File([blob], `Scope_of_Appointment_${safeName}_${appointmentDate}.png`, { type: 'image/png' })
  }

  async function stageScope() {
    setStatus('')
    try {
      const file = await buildSoaFile()
      setSoaFile(file)
      setSoaOpen(false)
      setStatus('Signed Scope of Appointment is ready and will be saved when you save the client. The appointment date is the signature date.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not prepare the Scope of Appointment.')
    }
  }

  async function uploadDocument(clientId: string, file: File, documentType: string) {
    const form = new FormData()
    form.set('file', file)
    form.set('document_type', documentType)
    form.set('file_name', file.name)
    const response = await fetch(`/api/clients/${clientId}/documents`, { method: 'POST', body: form })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || `Could not upload ${file.name}.`)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setStatus('Saving client…')

    try {
      const data = new FormData(event.currentTarget)
      const result = await createClientIntake(data)
      if (!result.clientId) throw new Error(result.error || 'Unable to save client.')

      const queued: Array<{ file: File; type: string }> = []
      if (medicareFile) queued.push({ file: medicareFile, type: 'medicare_document' })
      if (medicarePhoto) queued.push({ file: medicarePhoto, type: 'medicare_photo' })
      if (cardFile) queued.push({ file: cardFile, type: 'card_information' })
      if (soaFile) queued.push({ file: soaFile, type: 'scope_of_appointment' })
      if (medicationsFile) queued.push({ file: medicationsFile, type: 'medications' })
      if (medicationsPhoto) queued.push({ file: medicationsPhoto, type: 'medications' })
      if (lifeInsuranceFile) queued.push({ file: lifeInsuranceFile, type: 'life_insurance' })
      if (healthPlanFile) queued.push({ file: healthPlanFile, type: 'health_plan' })

      let failed = 0
      for (const item of queued) {
        try {
          await uploadDocument(result.clientId, item.file, item.type)
        } catch {
          failed += 1
        }
      }

      router.push(`/clients/${result.clientId}?created=1${failed ? '&upload_warning=1' : ''}`)
      router.refresh()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to save client.')
      setSaving(false)
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="grid add-client-form" style={{ marginTop: 20 }}>
      <details className="section-details section-client">
        <summary><span>Client Information</span><small>Personal, contact, address &amp; identification</small></summary>
        <div className="section-body intake-section-body">
          {canAssignAgent ? (
            <div className="intake-group intake-group-agent">
              <div className="intake-group-heading"><div><strong>Agent Assignment</strong><span>Choose which agent owns this client record.</span></div></div>
              <label className="label">Assign client to agent
                <select className="select" name="assigned_agent_id" defaultValue={props.currentUserRole === 'admin' ? props.currentUserId : ''} required>
                  <option value="" disabled>Select agent</option>
                  {props.agents.map(agent => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}
                </select>
                <span className="field-help">The client will appear in the selected agent&apos;s client list. Managers can still view the client under All agents.</span>
              </label>
            </div>
          ) : <input type="hidden" name="assigned_agent_id" value={props.currentUserId} />}

          <div className="intake-group">
            <div className="intake-group-heading"><div><strong>Personal Details</strong><span>Basic identifying information.</span></div></div>
            <div className="form-grid">
              <label className="label">First name<input className="input" name="first_name" required /></label>
              <label className="label">Last name<input className="input" name="last_name" required /></label>
              <label className="label">Date of birth<DateOfBirthInput /></label>
              <label className="label">Gender<select className="select" name="gender" defaultValue=""><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></label>
              <label className="label">Height - feet<input className="input" type="number" name="height_feet" inputMode="numeric" min={1} max={8} placeholder="5" /></label>
              <label className="label">Height - inches<input className="input" type="number" name="height_in" inputMode="numeric" min={0} max={11} placeholder="10" /></label>
              <label className="label">Weight (lb)<input className="input" type="number" name="weight_lbs" inputMode="numeric" min={1} max={999} placeholder="180" /></label>
            </div>
          </div>

          <div className="intake-group">
            <div className="intake-group-heading"><div><strong>Contact Information</strong><span>How to reach the client.</span></div></div>
            <div className="form-grid">
              <label className="label">Email<input className="input" type="email" name="email" inputMode="email" /></label>
              <label className="label">Phone<input className="input" type="tel" name="phone" inputMode="tel" /></label>
            </div>
          </div>

          <div className="intake-group">
            <div className="intake-group-heading"><div><strong>Address</strong><span>Residential and county information.</span></div></div>
            <div className="form-grid">
              <label className="label span-2">Street address<input className="input" name="address_line1" autoComplete="street-address" /></label>
              <label className="label">City<input className="input" name="city" /></label>
              <label className="label">State<input className="input" name="state" maxLength={2} placeholder="MS" /></label>
              <label className="label">ZIP code<input className="input" name="zip_code" inputMode="numeric" /></label>
              <label className="label">County<input className="input" name="county" /></label>
            </div>
          </div>

          <div className="intake-group">
            <div className="intake-group-heading"><div><strong>Client Status</strong><span>Veteran and tobacco-use information.</span></div></div>
            <div className="form-grid">
              <label className="label">Veteran
                <select className="select" name="is_veteran" defaultValue="">
                  <option value="">Select</option><option value="yes">Yes</option><option value="no">No</option>
                </select>
              </label>
              <label className="label">Smoking / tobacco use
                <select className="select" name="is_smoker" defaultValue="">
                  <option value="">Select</option><option value="yes">Yes</option><option value="no">No</option>
                </select>
              </label>
            </div>
          </div>

          <div className="intake-group intake-group-sensitive">
            <div className="intake-group-heading"><div><strong>Identification</strong><span>Sensitive values are encrypted before storage.</span></div></div>
            <div className="form-grid">
              <label className="label">Social Security number<input className="input" name="ssn" type="password" autoComplete="off" inputMode="numeric" placeholder="Encrypted before storage" /></label>
              <label className="label">Driver&apos;s license number<input className="input" name="drivers_license" type="password" autoComplete="off" placeholder="Encrypted before storage" /></label>
              <label className="label">License state<input className="input" name="drivers_license_state" maxLength={2} placeholder="MS" /></label>
              <label className="label">License expiration<input className="input" type="date" name="drivers_license_expiration" /></label>
            </div>
          </div>

          <div className="intake-group">
            <div className="intake-group-heading"><div><strong>Products</strong><span>Select every product category that applies.</span></div></div>
            <div className="checkbox-row product-choice-row">
              <label className="checkbox-card"><input type="checkbox" name="is_medicare" /> Medicare</label>
              <label className="checkbox-card"><input type="checkbox" name="is_life" /> Life</label>
              <label className="checkbox-card"><input type="checkbox" name="is_retirement" /> Retirement</label>
            </div>
          </div>
        </div>
      </details>

      <details className="section-details section-medicare">
        <summary><span>Medicare Information</span><small>Medicare, Medicaid, dates &amp; documents</small></summary>
        <div className="section-body intake-section-body">
          <div className="intake-group">
            <div className="intake-group-heading"><div><strong>Coverage Identification</strong><span>Medicare and Medicaid information.</span></div></div>
            <div className="form-grid">
              <label className="label">Medicare number<input className="input" name="medicare_number" type="password" autoComplete="off" placeholder="Encrypted before storage" /></label>
              <label className="label">Medicaid number<input className="input" name="medicaid_number" type="password" autoComplete="off" placeholder="Encrypted before storage" /></label>
              <label className="label">Medicaid level<select className="select" name="medicaid_level" defaultValue=""><option value="">Select</option><option>QMB</option><option>SLMB</option><option>QI</option><option>FBDE</option><option>Other</option></select></label>
            </div>
          </div>

          <div className="intake-group">
            <div className="intake-group-heading"><div><strong>Medicare Effective Dates</strong><span>Original Part A and Part B effective dates.</span></div></div>
            <div className="form-grid">
              <label className="label">Part A date<input className="input" type="date" name="part_a_date" /></label>
              <label className="label">Part B date<input className="input" type="date" name="part_b_date" /></label>
            </div>
          </div>

          <div className="intake-group intake-group-files">
            <div className="medicare-documents-heading">
              <div>
                <strong>Medicare Files &amp; Forms</strong>
                <div className="field-help">Choose files now. They will be placed in the client&apos;s private file folder when Save Client is pressed.</div>
              </div>
              <div className="document-action-row">
                <FileDropZone label="Upload Medicare File" onFile={(file) => setMedicareFile(file)} />
                <label className="btn btn-secondary upload-button">Take Photo<input type="file" hidden accept="image/*" capture="environment" onChange={event => selectedFile(event, setMedicarePhoto)} /></label>
                <FileDropZone label="Card Information" onFile={(file) => setCardFile(file)} />
                <button className="btn btn-primary" type="button" onClick={openSoa}>Sign Scope of Appointment</button>
              </div>
            </div>
            <div className="intake-file-list">
              {medicareFile ? <div className="document-row"><div><strong>Medicare File</strong><div className="field-help">{medicareFile.name}</div></div><button className="btn btn-secondary btn-small" type="button" onClick={() => setMedicareFile(null)}>Remove</button></div> : null}
              {medicarePhoto ? <div className="document-row"><div><strong>Medicare Photo</strong><div className="field-help">{medicarePhoto.name}</div></div><button className="btn btn-secondary btn-small" type="button" onClick={() => setMedicarePhoto(null)}>Remove</button></div> : null}
              {cardFile ? <div className="document-row"><div><strong>Card Information</strong><div className="field-help">{cardFile.name}</div></div><button className="btn btn-secondary btn-small" type="button" onClick={() => setCardFile(null)}>Remove</button></div> : null}
              {soaFile ? <div className="document-row"><div><strong>Signed Scope of Appointment</strong><div className="field-help">{soaFile.name}</div></div><button className="btn btn-secondary btn-small" type="button" onClick={() => setSoaFile(null)}>Remove</button></div> : null}
            </div>
          </div>
        </div>
      </details>

      <details className="section-details section-care">
        <summary><span>Doctors &amp; Medications</span><small>Doctors, pharmacy, prescriptions &amp; medication files</small></summary>
        <div className="section-body intake-section-body">
          <DoctorsMedicationsFields />
          <div className="intake-group intake-group-files">
            <div className="medicare-documents-heading">
              <div><strong>Medication Files</strong><div className="field-help">Upload a medication list or take a picture of medication bottles. The file will save to the client&apos;s private folder when Save Client is pressed.</div></div>
              <div className="document-action-row">
                <FileDropZone label="Upload Medications" onFile={(file) => setMedicationsFile(file)} />
                <label className="btn btn-secondary upload-button">Take Medication Photo<input type="file" hidden accept="image/*" capture="environment" onChange={event => selectedFile(event, setMedicationsPhoto)} /></label>
              </div>
            </div>
            <div className="intake-file-list">
              {medicationsFile ? <div className="document-row"><div><strong>Medications</strong><div className="field-help">{medicationsFile.name}</div></div><button className="btn btn-secondary btn-small" type="button" onClick={() => setMedicationsFile(null)}>Remove</button></div> : null}
              {medicationsPhoto ? <div className="document-row"><div><strong>Medication Photo</strong><div className="field-help">{medicationsPhoto.name}</div></div><button className="btn btn-secondary btn-small" type="button" onClick={() => setMedicationsPhoto(null)}>Remove</button></div> : null}
            </div>
          </div>
        </div>
      </details>

      <details className="section-details section-life">
        <summary><span>Life Insurance</span><small>Carrier, coverage, premium, policy type &amp; files</small></summary>
        <div className="section-body intake-section-body">
          <div className="intake-group">
            <div className="intake-group-heading"><div><strong>Policy Details</strong><span>Carrier and coverage information.</span></div></div>
            <LifeInsuranceFields />
          </div>
          <div className="intake-group intake-group-files">
            <div className="medicare-documents-heading">
              <div><strong>Life Insurance Files</strong><div className="field-help">Choose a policy, application, illustration, or other life insurance file now. It will be saved to the client&apos;s private folder when Save Client is pressed.</div></div>
              <div className="document-action-row"><FileDropZone label="Upload Life Insurance File" onFile={(file) => setLifeInsuranceFile(file)} /></div>
            </div>
            <div className="intake-file-list">{lifeInsuranceFile ? <div className="document-row"><div><strong>Life Insurance File</strong><div className="field-help">{lifeInsuranceFile.name}</div></div><button className="btn btn-secondary btn-small" type="button" onClick={() => setLifeInsuranceFile(null)}>Remove</button></div> : null}</div>
          </div>
        </div>
      </details>

      <details className="section-details section-health">
        <summary><span>Health Plan Info</span><small>Company, member ID, plan ID, effective date &amp; files</small></summary>
        <div className="section-body intake-section-body">
          <div className="intake-group">
            <div className="intake-group-heading"><div><strong>Health Plan Details</strong><span>Current medical plan information.</span></div></div>
            <HealthPlanFields />
          </div>
          <div className="intake-group intake-group-files">
            <div className="medicare-documents-heading">
              <div><strong>Health Plan Files</strong><div className="field-help">Choose an insurance card, plan summary, enrollment document, or other health plan file. It will be saved to the client&apos;s private folder when Save Client is pressed.</div></div>
              <div className="document-action-row"><FileDropZone label="Upload Health Plan File" onFile={(file) => setHealthPlanFile(file)} /></div>
            </div>
            <div className="intake-file-list">{healthPlanFile ? <div className="document-row"><div><strong>Health Plan File</strong><div className="field-help">{healthPlanFile.name}</div></div><button className="btn btn-secondary btn-small" type="button" onClick={() => setHealthPlanFile(null)}>Remove</button></div> : null}</div>
          </div>
        </div>
      </details>

      <details className="section-details section-hospital">
        <summary><span>Hospital Indemnity Plan</span><small>Company, premium &amp; effective date</small></summary>
        <div className="section-body intake-section-body">
          <div className="intake-group">
            <div className="intake-group-heading"><div><strong>Plan Details</strong><span>Hospital indemnity coverage information.</span></div></div>
            <HospitalIndemnityFields />
          </div>
        </div>
      </details>

      <details className="section-details section-banking">
        <summary><span>Banking Information</span><small>Bank, account &amp; debit card details</small></summary>
        <div className="section-body intake-section-body">
          <div className="intake-group intake-group-sensitive">
            <div className="intake-group-heading"><div><strong>Bank Account</strong><span>Financial account numbers are encrypted before storage.</span></div></div>
            <div className="form-grid">
              <label className="label">Bank name<input className="input" name="bank_name" autoComplete="off" /></label>
              <label className="label">Routing number<input className="input" name="bank_routing_number" type="password" inputMode="numeric" autoComplete="off" placeholder="Encrypted before storage" /></label>
              <label className="label">Account number<input className="input" name="bank_account_number" type="password" inputMode="numeric" autoComplete="off" placeholder="Encrypted before storage" /></label>
            </div>
          </div>
          <div className="intake-group intake-group-sensitive">
            <div className="intake-group-heading"><div><strong>Debit Card</strong><span>Card number is encrypted. CVV is never stored.</span></div></div>
            <div className="form-grid">
              <label className="label">Debit card number<input className="input" name="bank_debit_card_number" type="password" inputMode="numeric" autoComplete="off" placeholder="Encrypted before storage" /></label>
              <label className="label">Expiration date<input className="input" name="bank_debit_card_expiration" inputMode="numeric" autoComplete="off" placeholder="MM/YY" maxLength={7} /></label>
              <label className="label">CVV code<input className="input" value="Not stored for security" disabled readOnly /><span className="field-help">CVV codes are intentionally not saved in the CRM.</span></label>
            </div>
          </div>
        </div>
      </details>

      <details className="section-details section-notes">
        <summary><span>Notes</span><small>Additional client information</small></summary>
        <div className="section-body intake-section-body">
          <div className="intake-group">
            <div className="intake-group-heading"><div><strong>Client Notes</strong><span>Add anything important that does not fit elsewhere.</span></div></div>
            <label className="label">Notes<textarea className="textarea" name="notes" placeholder="Enter client notes..." /></label>
          </div>
        </div>
      </details>

      {status ? <div className="document-status">{status}</div> : null}
      <div className="add-client-save-row"><button className="btn btn-primary" disabled={saving} type="submit">{saving ? 'Saving…' : 'Save Client'}</button></div>

      {soaOpen ? (
        <div className="soa-backdrop" role="dialog" aria-modal="true" aria-label="Scope of Appointment">
          <div className="soa-modal">
            <div className="soa-modal-header">
              <div><h2>Scope of Sales Appointment Confirmation</h2><p className="subtle">Review the requested Medicare/health-related product types with the client, then capture the client signature.</p></div>
              <button type="button" className="btn btn-secondary" onClick={() => setSoaOpen(false)}>Close</button>
            </div>

            <div className="soa-grid">
              <div className="label">Appointment date<span className="input input-readonly">Set automatically when signed</span><span className="field-help">The SOA appointment date will be the date the client signs this form.</span></div>
              <label className="label">Beneficiary name<input className="input" value={beneficiaryName} onChange={e => setBeneficiaryName(e.target.value)} /></label>
              <label className="label">Beneficiary phone<input className="input" type="tel" value={beneficiaryPhone} onChange={e => setBeneficiaryPhone(e.target.value)} /></label>
              <label className="label">Beneficiary address<input className="input" value={beneficiaryAddress} onChange={e => setBeneficiaryAddress(e.target.value)} /></label>
              <label className="label">Agent name<input className="input" value={agentName} onChange={e => setAgentName(e.target.value)} /></label>
              <label className="label">Agent email<input className="input" type="email" value={agentEmail} onChange={e => setAgentEmail(e.target.value)} placeholder="Optional" /></label>
              <label className="label">Agent phone<input className="input" type="tel" value={agentPhone} onChange={e => setAgentPhone(e.target.value)} placeholder="Required for signed SOA" /></label>
            </div>

            <div className="soa-section">
              <strong>Products requested for discussion</strong>
              <div className="field-help">All health-related product categories are pre-selected. Uncheck any category the beneficiary does not want discussed.</div>
              <div className="soa-products">
                {productOptions.map(product => <label className="checkbox-card" key={product}><input type="checkbox" checked={selectedProducts.includes(product)} onChange={() => toggleProduct(product)} /> {product}</label>)}
              </div>
              <label className="label" style={{ marginTop: 12 }}>Other product type<input className="input" value={otherProduct} onChange={e => setOtherProduct(e.target.value)} placeholder="Optional" /></label>
            </div>

            <div className="soa-acknowledgement">
              <strong>Beneficiary acknowledgement</strong><br />
              I requested discussion of the selected health-related product types. Signing does not obligate me to enroll, does not affect my current or future Medicare enrollment status, and does not automatically enroll me in any plan. The agent may discuss only the product types agreed to on this scope; an updated or new scope must be documented before discussing another product type.
            </div>

            <div className="soa-section">
              <div className="signature-heading"><strong>Client Signature</strong><button type="button" className="btn btn-secondary btn-small" onClick={clearSignature}>Clear Signature</button></div>
              <canvas ref={signatureRef} className="signature-canvas" width={900} height={260} onPointerDown={startSignature} onPointerMove={moveSignature} onPointerUp={endSignature} onPointerCancel={endSignature} onPointerLeave={endSignature} />
              <div className="field-help">The signed scope will be staged now and uploaded to the new client&apos;s private file folder after Save Client. The appointment date is automatically set to the date the client signs it.</div>
            </div>

            <div className="soa-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setSoaOpen(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={stageScope}>Save Signed Scope for New Client</button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  )
}
