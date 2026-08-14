'use client'

import { useMemo, useRef, useState, type DragEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClientIntake } from '../actions'
import {
  classifyDocument,
  emptyClientDocumentDraft,
  extractClientDataFromText,
  mergeClientDocumentDraft,
  type ClientDocumentDraft,
  type DocumentCategory
} from '@/lib/apple-document-intake'

type AgentOption = { id: string; full_name: string }

type Props = {
  currentUserId: string
  currentUserName: string
  canAssignAgent: boolean
  agents: AgentOption[]
}

type ScannedDocument = {
  id: string
  file: File
  text: string
  category: DocumentCategory
  status: 'waiting' | 'scanning' | 'ready' | 'error'
  error?: string
}

type PdfJsWindow = Window & { pdfjsLib?: any; Tesseract?: any }

const CATEGORY_OPTIONS: Array<{ value: DocumentCategory; label: string }> = [
  { value: 'unclassified', label: 'Needs review · Choose section' },
  { value: 'card_information', label: 'Medicare · Card Information' },
  { value: 'medicare_document', label: 'Medicare · Plan / Other Document' },
  { value: 'scope_of_appointment', label: 'Medicare · Scope of Appointment' },
  { value: 'medications', label: 'Doctors & Medications' },
  { value: 'life_insurance', label: 'Life Insurance' },
  { value: 'health_plan', label: 'Health Plan' },
  { value: 'hospital_indemnity', label: 'Hospital Indemnity' },
  { value: 'aca', label: 'Other Coverage · ACA' },
  { value: 'dental', label: 'Other Coverage · Dental' },
  { value: 'hearing', label: 'Other Coverage · Hearing' },
  { value: 'vision', label: 'Other Coverage · Vision' },
  { value: 'retirement', label: 'Other Coverage · Retirement' }
]

const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_FILES = 20

function scriptOnce(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null
    if (existing?.dataset.loaded === 'true') return resolve()
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Could not load the document scanner.')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.crossOrigin = 'anonymous'
    script.addEventListener('load', () => { script.dataset.loaded = 'true'; resolve() }, { once: true })
    script.addEventListener('error', () => reject(new Error('Could not load the document scanner.')), { once: true })
    document.head.appendChild(script)
  })
}

async function ensurePdfJs() {
  const w = window as PdfJsWindow
  if (!w.pdfjsLib) {
    await scriptOnce('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js')
    if (!w.pdfjsLib) throw new Error('PDF reader did not load.')
    w.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
  }
  return w.pdfjsLib
}

async function ensureTesseract() {
  const w = window as PdfJsWindow
  if (!w.Tesseract) {
    await scriptOnce('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js')
    if (!w.Tesseract) throw new Error('Optical character scanner did not load.')
  }
  return w.Tesseract
}

async function ocrCanvas(canvas: HTMLCanvasElement, onProgress?: (value: number) => void) {
  const Tesseract = await ensureTesseract()
  const result = await Tesseract.recognize(canvas, 'eng', {
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
    langPath: 'https://tessdata.projectnaptha.com/4.0.0',
    logger: (message: { status?: string; progress?: number }) => {
      if (message.status === 'recognizing text' && typeof message.progress === 'number') onProgress?.(message.progress)
    }
  })
  return String(result?.data?.text || '')
}

async function imageFileToCanvas(file: File) {
  const url = URL.createObjectURL(file)
  try {
    const img = document.createElement('img')
    img.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('This image could not be opened. On iPhone, try saving the scan as PDF or JPEG first.'))
      img.src = url
    })
    const maxSide = 2200
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not prepare image for scanning.')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function extractPdf(file: File, onProgress: (message: string) => void) {
  const pdfjs = await ensurePdfJs()
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pages = Math.min(pdf.numPages, 12)
  const chunks: string[] = []

  for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
    onProgress(`Reading PDF page ${pageNumber} of ${pages}…`)
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const pageText = content.items.map((item: { str?: string }) => item.str || '').join(' ').trim()
    if (pageText.length >= 80) {
      chunks.push(pageText)
      continue
    }

    onProgress(`Scanning image text on PDF page ${pageNumber} of ${pages}…`)
    const viewport = page.getViewport({ scale: 1.65 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    await page.render({ canvasContext: ctx, viewport }).promise
    chunks.push(await ocrCanvas(canvas))
  }
  return chunks.join('\n')
}

async function extractText(file: File, onProgress: (message: string) => void) {
  const lower = file.name.toLowerCase()
  if (file.type === 'text/plain' || lower.endsWith('.txt')) return file.text()
  if (file.type === 'application/pdf' || lower.endsWith('.pdf')) return extractPdf(file, onProgress)
  if (file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(lower)) {
    onProgress(`Scanning ${file.name}…`)
    const canvas = await imageFileToCanvas(file)
    return ocrCanvas(canvas, (progress) => onProgress(`Scanning ${file.name}… ${Math.round(progress * 100)}%`))
  }
  throw new Error('Use PDF, JPEG, PNG, HEIC/HEIF, WebP, or TXT for automatic scanning. DOC/DOCX can still be saved manually after the client is created.')
}

function dataForCategory(data: Partial<ClientDocumentDraft>, category: DocumentCategory): Partial<ClientDocumentDraft> {
  const next = { ...data }
  const detectedCompany = next.life_company_choice || ''
  const detectedPremium = next.life_premium_amount || ''
  const detectedEffective = next.life_effective_date || next.health_effective_date || next.hospital_indemnity_effective_date || ''

  if (category === 'health_plan' || category === 'aca') {
    if (detectedCompany && !next.health_company_custom) { next.health_company_choice = '__other__'; next.health_company_custom = detectedCompany }
    next.health_effective_date = detectedEffective
    next.life_company_choice = ''; next.life_face_amount_choice = ''; next.life_face_amount_custom = ''; next.life_premium_amount = ''; next.life_policy_type = ''; next.life_effective_date = ''
    next.hospital_indemnity_premium = ''; next.hospital_indemnity_effective_date = ''
  } else if (category === 'hospital_indemnity') {
    if (detectedCompany && !next.hospital_indemnity_company) next.hospital_indemnity_company = detectedCompany
    next.hospital_indemnity_premium = detectedPremium
    next.hospital_indemnity_effective_date = detectedEffective
    next.life_company_choice = ''; next.life_face_amount_choice = ''; next.life_face_amount_custom = ''; next.life_premium_amount = ''; next.life_policy_type = ''; next.life_effective_date = ''
    next.health_company_choice = ''; next.health_company_custom = ''; next.health_member_id = ''; next.health_plan_id = ''; next.health_effective_date = ''
  } else if (category !== 'life_insurance') {
    next.life_company_choice = ''; next.life_face_amount_choice = ''; next.life_face_amount_custom = ''; next.life_premium_amount = ''; next.life_policy_type = ''; next.life_effective_date = ''
    if (category !== 'health_plan' && category !== 'aca') { next.health_company_choice = ''; next.health_company_custom = ''; next.health_member_id = ''; next.health_plan_id = ''; next.health_effective_date = '' }
    next.hospital_indemnity_company = ''; next.hospital_indemnity_premium = ''; next.hospital_indemnity_effective_date = ''
  }
  return next
}

function inputClass() { return 'input' }

export default function DocumentClientImport(props: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [documents, setDocuments] = useState<ScannedDocument[]>([])
  const [draft, setDraft] = useState<ClientDocumentDraft>(emptyClientDocumentDraft())
  const [assignedAgentId, setAssignedAgentId] = useState(props.currentUserId)
  const [dragging, setDragging] = useState(false)
  const [scanStatus, setScanStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const readyCount = documents.filter(item => item.status === 'ready').length
  const scanErrorCount = documents.filter(item => item.status === 'error').length
  const hasUnclassified = documents.some(item => item.status === 'ready' && item.category === 'unclassified')
  const canSave = Boolean(draft.first_name.trim() && draft.last_name.trim() && readyCount && !hasUnclassified)
  const clientFlags = useMemo(() => ({
    is_medicare: documents.some(item => ['medicare_document', 'card_information', 'scope_of_appointment'].includes(item.category)),
    is_life: documents.some(item => item.category === 'life_insurance'),
    is_retirement: documents.some(item => item.category === 'retirement')
  }), [documents])

  function update<K extends keyof ClientDocumentDraft>(key: K, value: ClientDocumentDraft[K]) {
    setDraft(current => ({ ...current, [key]: value }))
  }

  async function addFiles(input: FileList | File[] | null) {
    setError('')
    if (!input) return
    const incoming = Array.from(input)
    if (!incoming.length) return
    if (documents.length + incoming.length > MAX_FILES) {
      setError(`Import up to ${MAX_FILES} documents at a time.`)
      return
    }
    const tooLarge = incoming.find(file => file.size > MAX_FILE_SIZE)
    if (tooLarge) {
      setError(`${tooLarge.name} is larger than 10 MB. Reduce that file before importing.`)
      return
    }

    const added = incoming.map((file): ScannedDocument => ({
      id: crypto.randomUUID(), file, text: '', category: classifyDocument(file.name, ''), status: 'waiting'
    }))
    setDocuments(current => [...current, ...added])

    let mergedDraft = draft
    for (const item of added) {
      setDocuments(current => current.map(doc => doc.id === item.id ? { ...doc, status: 'scanning' } : doc))
      try {
        const text = await extractText(item.file, setScanStatus)
        const category = classifyDocument(item.file.name, text)
        mergedDraft = mergeClientDocumentDraft(mergedDraft, dataForCategory(extractClientDataFromText(text), category))
        setDraft(mergedDraft)
        setDocuments(current => current.map(doc => doc.id === item.id ? { ...doc, text, category, status: 'ready' } : doc))
      } catch (scanError) {
        setDocuments(current => current.map(doc => doc.id === item.id ? { ...doc, status: 'error', error: scanError instanceof Error ? scanError.message : 'Could not scan this file.' } : doc))
      }
    }
    setScanStatus('Document scan complete. Review the fields below before creating the client.')
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    if (saving) return
    void addFiles(event.dataTransfer.files)
  }

  function removeDocument(id: string) {
    if (saving) return
    setDocuments(current => current.filter(item => item.id !== id))
  }

  function updateDocumentCategory(id: string, category: DocumentCategory) {
    setDocuments(current => current.map(item => item.id === id ? { ...item, category } : item))
  }

  function addMedication() {
    update('medications', [...draft.medications, { name: '', dosage: '', times_per_day: '', quantity_filled: '', refill_count: '' }])
  }

  function updateMedication(index: number, key: keyof ClientDocumentDraft['medications'][number], value: string) {
    const medications = draft.medications.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item)
    update('medications', medications)
  }

  async function uploadDocument(clientId: string, document: ScannedDocument) {
    const form = new FormData()
    form.set('file', document.file)
    form.set('file_name', document.file.name)
    form.set('document_type', document.category)
    const response = await fetch(`/api/clients/${clientId}/documents`, { method: 'POST', body: form })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || `Could not upload ${document.file.name}.`)
  }

  function append(form: FormData, key: string, value: string) {
    if (value.trim()) form.set(key, value.trim())
  }

  async function createClientFromDocuments() {
    if (saving) return
    setError('')
    if (!draft.first_name.trim() || !draft.last_name.trim()) {
      setError('Confirm the client first and last name before creating the record.')
      return
    }
    if (!documents.some(item => item.status === 'ready')) {
      setError('Scan at least one document first.')
      return
    }
    if (documents.some(item => item.status === 'ready' && item.category === 'unclassified')) {
      setError('Choose the correct CRM section for every scanned document before creating the client.')
      return
    }
    setSaving(true)
    setScanStatus('Creating client…')

    try {
      const form = new FormData()
      append(form, 'assigned_agent_id', assignedAgentId)
      const simpleFields: Array<keyof ClientDocumentDraft> = [
        'first_name','last_name','date_of_birth','height_feet','height_in','weight_lbs','gender','email','phone','address_line1','city','state','zip_code','county','ssn',
        'drivers_license','drivers_license_state','drivers_license_expiration','is_veteran','is_smoker','medicare_number','part_a_date','part_b_date','medicaid_number','medicaid_level',
        'primary_doctor_name','primary_doctor_city','primary_doctor_state','pharmacy_name','pharmacy_city','pharmacy_state','life_company_choice','life_face_amount_choice','life_face_amount_custom',
        'life_premium_amount','life_policy_type','life_effective_date','health_company_choice','health_company_custom','health_member_id','health_plan_id','health_effective_date',
        'hospital_indemnity_company','hospital_indemnity_premium','hospital_indemnity_effective_date','notes'
      ]
      for (const key of simpleFields) {
        const value = draft[key]
        if (typeof value === 'string') append(form, String(key), value)
      }
      if (clientFlags.is_medicare || draft.medicare_number || draft.part_a_date || draft.part_b_date) form.set('is_medicare', 'on')
      if (clientFlags.is_life || draft.life_company_choice || draft.life_face_amount_custom) form.set('is_life', 'on')
      if (clientFlags.is_retirement) form.set('is_retirement', 'on')
      for (const med of draft.medications) {
        form.append('medication_name', med.name)
        form.append('medication_dosage', med.dosage)
        form.append('medication_times_per_day', med.times_per_day)
        form.append('medication_quantity_filled', med.quantity_filled)
        form.append('medication_refill_count', med.refill_count)
      }

      const result = await createClientIntake(form)
      if (!result.clientId) throw new Error(result.error || 'Could not create client.')

      setScanStatus('Saving client documents…')
      let failures = 0
      for (const document of documents.filter(item => item.status === 'ready')) {
        try { await uploadDocument(result.clientId, document) } catch { failures += 1 }
      }
      router.push(`/clients/${result.clientId}?created=1&document_import=1${failures ? '&upload_warning=1' : ''}`)
      router.refresh()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Document import failed.')
      setSaving(false)
    }
  }

  return (
    <div className="document-import-page">
      <section className="card card-pad document-import-drop-card">
        <div className="document-import-title-row">
          <div>
            <h2>1. Choose files from Apple Files</h2>
            <p className="subtle">On iPhone/iPad tap Choose Files. On Mac you can also drag files directly from Finder or Apple Files/iCloud Drive.</p>
          </div>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => inputRef.current?.click()}>CHOOSE FILES</button>
        </div>
        <div
          className={`document-import-drop${dragging ? ' is-dragging' : ''}`}
          onDragEnter={(event) => { event.preventDefault(); if (!saving) setDragging(true) }}
          onDragOver={(event) => { event.preventDefault(); if (!saving) event.dataTransfer.dropEffect = 'copy' }}
          onDragLeave={(event) => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }}
          onDrop={onDrop}
          onClick={() => { if (!saving) inputRef.current?.click() }}
          role="button"
          tabIndex={0}
        >
          <strong>Drop client documents here</strong>
          <span>PDF, JPEG, PNG, HEIC/HEIF, WebP or TXT · up to 20 files · 10 MB each</span>
          <small>Scanning happens in this browser. Files are not stored in the CRM until you approve the review and create the client.</small>
        </div>
        <input ref={inputRef} hidden type="file" multiple accept="image/*,.pdf,.txt,.heic,.heif" onChange={(event) => { void addFiles(event.target.files); event.target.value = '' }} />
        {scanStatus && <div className="document-import-status">{scanStatus}</div>}
        {error && <div className="document-import-error">{error}</div>}
      </section>

      {documents.length > 0 && (
        <section className="card card-pad" style={{ marginTop: 18 }}>
          <div className="document-import-title-row"><div><h2>2. Confirm where each file belongs</h2><p className="subtle">The CRM makes a best guess. Any file it cannot identify is marked Needs review and must be assigned before saving.</p></div><strong>{readyCount} scanned{scanErrorCount ? ` · ${scanErrorCount} needs attention` : ''}</strong></div>
          <div className="document-import-file-list">
            {documents.map(document => (
              <div className="document-import-file" key={document.id}>
                <div className="document-import-file-name"><strong>{document.file.name}</strong><span>{document.status === 'ready' ? 'Scanned' : document.status === 'error' ? document.error : document.status === 'scanning' ? 'Scanning…' : 'Waiting…'}</span></div>
                <select className="input" value={document.category} disabled={saving} onChange={(event) => updateDocumentCategory(document.id, event.target.value as DocumentCategory)}>
                  {CATEGORY_OPTIONS.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}
                </select>
                <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => removeDocument(document.id)}>Remove</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {documents.length > 0 && (
        <section className="card card-pad document-import-review" style={{ marginTop: 18 }}>
          <div className="document-import-title-row"><div><h2>3. Review extracted client information</h2><p className="subtle">Nothing is created until you click Create Client & Save Files.</p></div></div>

          {props.canAssignAgent && <div className="document-import-field"><label>Assigned Agent</label><select className={inputClass()} value={assignedAgentId} onChange={(event) => setAssignedAgentId(event.target.value)}>{props.agents.map(agent => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}</select></div>}

          <h3>Client Information</h3>
          <div className="document-import-grid">
            <div className="document-import-field"><label>First Name *</label><input className={inputClass()} value={draft.first_name} onChange={e => update('first_name', e.target.value)} /></div>
            <div className="document-import-field"><label>Last Name *</label><input className={inputClass()} value={draft.last_name} onChange={e => update('last_name', e.target.value)} /></div>
            <div className="document-import-field"><label>Date of Birth</label><input className={inputClass()} placeholder="MM/DD/YYYY" value={draft.date_of_birth} onChange={e => update('date_of_birth', e.target.value)} /></div>
            <div className="document-import-field"><label>Gender</label><input className={inputClass()} value={draft.gender} onChange={e => update('gender', e.target.value)} /></div>
            <div className="document-import-field"><label>Phone</label><input className={inputClass()} value={draft.phone} onChange={e => update('phone', e.target.value)} /></div>
            <div className="document-import-field"><label>Email</label><input className={inputClass()} value={draft.email} onChange={e => update('email', e.target.value)} /></div>
            <div className="document-import-field"><label>Address</label><input className={inputClass()} value={draft.address_line1} onChange={e => update('address_line1', e.target.value)} /></div>
            <div className="document-import-field"><label>City</label><input className={inputClass()} value={draft.city} onChange={e => update('city', e.target.value)} /></div>
            <div className="document-import-field"><label>State</label><input className={inputClass()} maxLength={2} value={draft.state} onChange={e => update('state', e.target.value.toUpperCase())} /></div>
            <div className="document-import-field"><label>ZIP</label><input className={inputClass()} value={draft.zip_code} onChange={e => update('zip_code', e.target.value)} /></div>
            <div className="document-import-field"><label>County</label><input className={inputClass()} value={draft.county} onChange={e => update('county', e.target.value)} /></div>
            <div className="document-import-field"><label>SSN</label><input className={inputClass()} value={draft.ssn} onChange={e => update('ssn', e.target.value)} /></div>
            <div className="document-import-field"><label>Driver's License</label><input className={inputClass()} value={draft.drivers_license} onChange={e => update('drivers_license', e.target.value)} /></div>
            <div className="document-import-field"><label>DL State</label><input className={inputClass()} maxLength={2} value={draft.drivers_license_state} onChange={e => update('drivers_license_state', e.target.value.toUpperCase())} /></div>
            <div className="document-import-field"><label>DL Expiration</label><input className={inputClass()} placeholder="MM/DD/YYYY" value={draft.drivers_license_expiration} onChange={e => update('drivers_license_expiration', e.target.value)} /></div>
            <div className="document-import-field"><label>Height</label><div className="document-import-inline"><input className={inputClass()} placeholder="ft" inputMode="numeric" value={draft.height_feet} onChange={e => update('height_feet', e.target.value)} /><input className={inputClass()} placeholder="in" inputMode="numeric" value={draft.height_in} onChange={e => update('height_in', e.target.value)} /></div></div>
            <div className="document-import-field"><label>Weight (lbs)</label><input className={inputClass()} inputMode="numeric" value={draft.weight_lbs} onChange={e => update('weight_lbs', e.target.value)} /></div>
          </div>

          <h3>Medicare Information</h3>
          <div className="document-import-grid">
            <div className="document-import-field"><label>Medicare Number</label><input className={inputClass()} value={draft.medicare_number} onChange={e => update('medicare_number', e.target.value.toUpperCase())} /></div>
            <div className="document-import-field"><label>Part A Effective Date</label><input className={inputClass()} placeholder="MM/DD/YYYY" value={draft.part_a_date} onChange={e => update('part_a_date', e.target.value)} /></div>
            <div className="document-import-field"><label>Part B Effective Date</label><input className={inputClass()} placeholder="MM/DD/YYYY" value={draft.part_b_date} onChange={e => update('part_b_date', e.target.value)} /></div>
            <div className="document-import-field"><label>Medicaid Number</label><input className={inputClass()} value={draft.medicaid_number} onChange={e => update('medicaid_number', e.target.value)} /></div>
            <div className="document-import-field"><label>Medicaid Level</label><input className={inputClass()} value={draft.medicaid_level} onChange={e => update('medicaid_level', e.target.value)} /></div>
          </div>

          <h3>Doctors & Medications</h3>
          <div className="document-import-grid">
            <div className="document-import-field"><label>Primary Doctor</label><input className={inputClass()} value={draft.primary_doctor_name} onChange={e => update('primary_doctor_name', e.target.value)} /></div>
            <div className="document-import-field"><label>Pharmacy</label><input className={inputClass()} value={draft.pharmacy_name} onChange={e => update('pharmacy_name', e.target.value)} /></div>
          </div>
          <div className="document-import-medications">
            {draft.medications.map((med, index) => <div className="document-import-medication" key={`${index}-${med.name}`}>
              <input className={inputClass()} placeholder="Medication" value={med.name} onChange={e => updateMedication(index, 'name', e.target.value)} />
              <input className={inputClass()} placeholder="Dosage" value={med.dosage} onChange={e => updateMedication(index, 'dosage', e.target.value)} />
              <input className={inputClass()} placeholder="Times/day" value={med.times_per_day} onChange={e => updateMedication(index, 'times_per_day', e.target.value)} />
            </div>)}
            <button type="button" className="btn btn-secondary" onClick={addMedication}>+ Add Medication</button>
          </div>

          <details className="document-import-optional"><summary>Life, Health & Hospital Plan Fields</summary>
            <div className="document-import-grid" style={{ marginTop: 14 }}>
              <div className="document-import-field"><label>Life Company</label><input className={inputClass()} value={draft.life_company_choice} onChange={e => update('life_company_choice', e.target.value)} /></div>
              <div className="document-import-field"><label>Life Face Amount</label><input className={inputClass()} value={draft.life_face_amount_custom} onChange={e => { update('life_face_amount_choice', e.target.value ? '__custom__' : ''); update('life_face_amount_custom', e.target.value) }} /></div>
              <div className="document-import-field"><label>Life Premium</label><input className={inputClass()} value={draft.life_premium_amount} onChange={e => update('life_premium_amount', e.target.value)} /></div>
              <div className="document-import-field"><label>Life Policy Type</label><input className={inputClass()} value={draft.life_policy_type} onChange={e => update('life_policy_type', e.target.value)} /></div>
              <div className="document-import-field"><label>Life Effective Date</label><input className={inputClass()} placeholder="MM/DD/YYYY" value={draft.life_effective_date} onChange={e => update('life_effective_date', e.target.value)} /></div>
              <div className="document-import-field"><label>Health Company</label><input className={inputClass()} value={draft.health_company_custom || draft.health_company_choice} onChange={e => { update('health_company_choice', '__other__'); update('health_company_custom', e.target.value) }} /></div>
              <div className="document-import-field"><label>Health Member ID</label><input className={inputClass()} value={draft.health_member_id} onChange={e => update('health_member_id', e.target.value)} /></div>
              <div className="document-import-field"><label>Health Plan ID</label><input className={inputClass()} value={draft.health_plan_id} onChange={e => update('health_plan_id', e.target.value)} /></div>
              <div className="document-import-field"><label>Health Effective Date</label><input className={inputClass()} placeholder="MM/DD/YYYY" value={draft.health_effective_date} onChange={e => update('health_effective_date', e.target.value)} /></div>
              <div className="document-import-field"><label>Hospital Indemnity Company</label><input className={inputClass()} value={draft.hospital_indemnity_company} onChange={e => update('hospital_indemnity_company', e.target.value)} /></div>
              <div className="document-import-field"><label>Hospital Indemnity Premium</label><input className={inputClass()} value={draft.hospital_indemnity_premium} onChange={e => update('hospital_indemnity_premium', e.target.value)} /></div>
              <div className="document-import-field"><label>Hospital Indemnity Effective Date</label><input className={inputClass()} placeholder="MM/DD/YYYY" value={draft.hospital_indemnity_effective_date} onChange={e => update('hospital_indemnity_effective_date', e.target.value)} /></div>
            </div>
          </details>

          <div className="document-import-field" style={{ marginTop: 18 }}><label>Notes</label><textarea className="input" rows={4} value={draft.notes} onChange={e => update('notes', e.target.value)} /></div>

          <div className="document-import-save-row">
            <div><strong>Final review required</strong><span>Confirm the scanned fields and file categories before saving.</span></div>
            <button className="btn btn-primary" type="button" disabled={!canSave || saving} onClick={() => void createClientFromDocuments()}>{saving ? 'SAVING…' : 'CREATE CLIENT & SAVE FILES'}</button>
          </div>
        </section>
      )}
    </div>
  )
}
