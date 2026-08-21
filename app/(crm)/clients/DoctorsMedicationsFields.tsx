'use client'

import { useEffect, useRef, useState } from 'react'

type CareInfo = {
  primary_doctor_name?: string | null
  primary_doctor_city?: string | null
  primary_doctor_state?: string | null
  pharmacy_name?: string | null
  pharmacy_city?: string | null
  pharmacy_state?: string | null
} | null

type Specialist = {
  slot: number
  specialty?: string | null
  doctor_name?: string | null
  city?: string | null
  state?: string | null
}

type Medication = {
  id?: string
  medication_name?: string | null
  dosage?: string | null
  times_per_day?: string | null
  quantity_filled?: string | null
  refill_count?: string | null
}

type Props = {
  careInfo?: CareInfo
  specialists?: Specialist[]
  medications?: Medication[]
}

type MedicationRow = Medication & { rowKey: string }

type MedicationSuggestion = {
  name: string
  strengths: string[]
  rxcuis?: string[]
  source?: 'rxterms' | 'crm'
}

const medicationSuggestionCache = new Map<string, MedicationSuggestion[]>()

function blankMedication(index: number): MedicationRow {
  return {
    rowKey: `new-${Date.now()}-${index}`,
    medication_name: '',
    dosage: '',
    times_per_day: '',
    quantity_filled: '',
    refill_count: ''
  }
}

function isMedicationSuggestion(value: unknown): value is MedicationSuggestion {
  if (!value || typeof value !== 'object') return false
  const suggestion = value as Record<string, unknown>
  return typeof suggestion.name === 'string' && Array.isArray(suggestion.strengths)
}

function MedicationNameAutocomplete({
  defaultValue = '',
  onSelect,
  onTyping,
}: {
  defaultValue?: string
  onSelect: (suggestion: MedicationSuggestion) => void
  onTyping: () => void
}) {
  const [value, setValue] = useState(defaultValue)
  const [suggestions, setSuggestions] = useState<MedicationSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [noResults, setNoResults] = useState(false)
  const requestId = useRef(0)

  useEffect(() => {
    const query = value.trim()
    if (query.length < 2) {
      setSuggestions([])
      setOpen(false)
      setLoading(false)
      setNoResults(false)
      return
    }

    const cacheKey = query.toLocaleLowerCase('en-US')
    const cached = medicationSuggestionCache.get(cacheKey)
    if (cached) {
      setSuggestions(cached)
      setOpen(cached.length > 0)
      setLoading(false)
      setNoResults(cached.length === 0)
      return
    }

    const controller = new AbortController()
    const currentRequest = ++requestId.current
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setNoResults(false)
      try {
        const response = await fetch(`/api/medications/search?q=${encodeURIComponent(query)}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        const result = await response.json().catch(() => ({}))
        if (!response.ok || currentRequest !== requestId.current) return
        const next = Array.isArray(result?.suggestions)
          ? result.suggestions.filter(isMedicationSuggestion).map((item: MedicationSuggestion) => ({
              ...item,
              strengths: item.strengths
                .filter((strength): strength is string => typeof strength === 'string')
                .map(strength => strength.trim())
                .filter(Boolean),
            }))
          : []
        medicationSuggestionCache.set(cacheKey, next)
        setSuggestions(next)
        setOpen(next.length > 0)
        setNoResults(next.length === 0)
      } catch (error) {
        if ((error as Error)?.name !== 'AbortError' && currentRequest === requestId.current) {
          setSuggestions([])
          setOpen(false)
          setNoResults(true)
        }
      } finally {
        if (currentRequest === requestId.current) setLoading(false)
      }
    }, 160)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [value])

  function chooseMedication(suggestion: MedicationSuggestion) {
    requestId.current += 1
    setValue(suggestion.name)
    setSuggestions([])
    setOpen(false)
    setNoResults(false)
    onSelect(suggestion)
  }

  return (
    <div className="medication-autocomplete">
      <input
        className="input"
        name="medication_name"
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          setNoResults(false)
          onTyping()
        }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 140)}
        placeholder="Start typing a medication name"
        autoComplete="off"
        spellCheck={false}
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {loading ? <span className="medication-autocomplete-status">Searching…</span> : null}
      {open ? (
        <div className="medication-autocomplete-menu" role="listbox" aria-label="Medication suggestions">
          {suggestions.map((suggestion) => (
            <button
              key={`${suggestion.name.toLocaleLowerCase('en-US')}-${suggestion.strengths.join('|')}`}
              type="button"
              role="option"
              className="medication-autocomplete-option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseMedication(suggestion)}
            >
              <span>{suggestion.name}</span>
              {suggestion.strengths.length ? (
                <small>{suggestion.strengths.length} strength{suggestion.strengths.length === 1 ? '' : 's'}</small>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
      {noResults && !loading && value.trim().length >= 2 ? (
        <span className="medication-no-results">No catalog match. You can still enter it manually.</span>
      ) : null}
      <style jsx>{`
        .medication-autocomplete{position:relative}
        .medication-autocomplete-status{position:absolute;right:10px;top:21px;transform:translateY(-50%);font-size:.72rem;color:#718096;pointer-events:none}
        .medication-no-results{display:block;margin-top:5px;font-size:.72rem;font-weight:500;color:#718096}
        .medication-autocomplete-menu{position:absolute;z-index:120;left:0;right:0;top:calc(100% + 4px);max-height:300px;overflow:auto;background:#fff;border:1px solid #cfd9e2;border-radius:10px;box-shadow:0 12px 32px rgba(15,23,42,.18);padding:4px}
        .medication-autocomplete-option{display:flex;width:100%;border:0;background:#fff;color:#263746;text-align:left;padding:9px 10px;border-radius:7px;font:inherit;font-size:.88rem;cursor:pointer;align-items:center;justify-content:space-between;gap:12px}
        .medication-autocomplete-option small{flex:0 0 auto;color:#718096;font-size:.72rem;font-weight:700}
        .medication-autocomplete-option:hover,.medication-autocomplete-option:focus{background:#edf4f8;outline:none}
      `}</style>
    </div>
  )
}

function MedicationLookupFields({ medication }: { medication: MedicationRow }) {
  const [strengths, setStrengths] = useState<string[]>([])
  const [dosage, setDosage] = useState(medication.dosage || '')
  const [manualDosage, setManualDosage] = useState(true)

  function selectMedication(suggestion: MedicationSuggestion) {
    const uniqueStrengths = Array.from(new Set(suggestion.strengths.map(value => value.trim()).filter(Boolean)))
    setStrengths(uniqueStrengths)

    if (!uniqueStrengths.length) {
      setManualDosage(true)
      return
    }

    const existingDosage = dosage.trim()
    const matchingExisting = uniqueStrengths.find(
      strength => strength.toLocaleLowerCase('en-US') === existingDosage.toLocaleLowerCase('en-US')
    )
    setDosage(matchingExisting || '')
    setManualDosage(false)
  }

  function medicationChanged() {
    setStrengths([])
    setManualDosage(true)
  }

  return (
    <>
      <label className="label span-2">Medication name
        <MedicationNameAutocomplete
          defaultValue={medication.medication_name || ''}
          onSelect={selectMedication}
          onTyping={medicationChanged}
        />
      </label>
      <label className="label">Dosage / strength
        <input type="hidden" name="medication_dosage" value={dosage} />
        {strengths.length > 0 && !manualDosage ? (
          <select
            className="select"
            value={dosage}
            onChange={(event) => {
              if (event.target.value === '__manual__') {
                setDosage('')
                setManualDosage(true)
                return
              }
              setDosage(event.target.value)
            }}
          >
            <option value="">Choose strength / form</option>
            {strengths.map(strength => (
              <option key={strength} value={strength}>{strength}</option>
            ))}
            <option value="__manual__">Other / enter manually</option>
          </select>
        ) : (
          <>
            <input
              className="input"
              value={dosage}
              onChange={(event) => setDosage(event.target.value)}
              placeholder="Example: 10 mg"
              autoComplete="off"
            />
            {strengths.length > 0 ? (
              <button
                type="button"
                className="strength-list-return"
                onClick={() => setManualDosage(false)}
              >
                Choose from {strengths.length} listed strength{strengths.length === 1 ? '' : 's'}
              </button>
            ) : null}
          </>
        )}
        <style jsx>{`
          .strength-list-return{border:0;background:transparent;color:#365d83;padding:3px 0 0;text-align:left;font-size:.72rem;font-weight:700;cursor:pointer}
          .strength-list-return:hover{text-decoration:underline}
        `}</style>
      </label>
    </>
  )
}

export default function DoctorsMedicationsFields({ careInfo = null, specialists = [], medications = [] }: Props) {
  const initialMedications: MedicationRow[] = medications.length
    ? medications.map((medication, index) => ({ ...medication, rowKey: medication.id || `existing-${index}` }))
    : [blankMedication(0)]

  const [medicationRows, setMedicationRows] = useState<MedicationRow[]>(initialMedications)

  function specialistFor(slot: number) {
    return specialists.find(item => Number(item.slot) === slot)
  }

  function addMedication() {
    setMedicationRows(current => [...current, blankMedication(current.length)])
  }

  function removeMedication(rowKey: string) {
    setMedicationRows(current => {
      const next = current.filter(item => item.rowKey !== rowKey)
      return next.length ? next : [blankMedication(0)]
    })
  }

  return (
    <div className="doctors-medications-fields">
      <div className="care-subsection">
        <div className="care-subsection-heading">
          <strong>Primary Doctor</strong>
          <span className="field-help">Primary care physician information.</span>
        </div>
        <div className="form-grid">
          <label className="label span-2">Doctor name
            <input className="input" name="primary_doctor_name" defaultValue={careInfo?.primary_doctor_name || ''} placeholder="Primary doctor name" />
          </label>
          <label className="label">City
            <input className="input" name="primary_doctor_city" defaultValue={careInfo?.primary_doctor_city || ''} />
          </label>
          <label className="label">State
            <input className="input" name="primary_doctor_state" maxLength={2} placeholder="MS" defaultValue={careInfo?.primary_doctor_state || ''} />
          </label>
        </div>
      </div>

      <div className="care-subsection">
        <div className="care-subsection-heading">
          <strong>Specialist Doctors</strong>
          <span className="field-help">Add up to 5 specialists.</span>
        </div>
        <div className="specialist-grid">
          {[1, 2, 3, 4, 5].map(slot => {
            const specialist = specialistFor(slot)
            return (
              <div className="specialist-card" key={slot}>
                <strong>Specialist {slot}</strong>
                <div className="form-grid" style={{ marginTop: 12 }}>
                  <label className="label">Specialty
                    <input className="input" name={`specialist_${slot}_specialty`} defaultValue={specialist?.specialty || ''} placeholder="Cardiology, Orthopedics, etc." />
                  </label>
                  <label className="label">Doctor name
                    <input className="input" name={`specialist_${slot}_name`} defaultValue={specialist?.doctor_name || ''} />
                  </label>
                  <label className="label">City
                    <input className="input" name={`specialist_${slot}_city`} defaultValue={specialist?.city || ''} />
                  </label>
                  <label className="label">State
                    <input className="input" name={`specialist_${slot}_state`} maxLength={2} placeholder="MS" defaultValue={specialist?.state || ''} />
                  </label>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="care-subsection">
        <div className="care-subsection-heading">
          <strong>Pharmacy</strong>
          <span className="field-help">The pharmacy the client normally uses.</span>
        </div>
        <div className="form-grid">
          <label className="label span-2">Pharmacy name
            <input className="input" name="pharmacy_name" defaultValue={careInfo?.pharmacy_name || ''} />
          </label>
          <label className="label">City
            <input className="input" name="pharmacy_city" defaultValue={careInfo?.pharmacy_city || ''} />
          </label>
          <label className="label">State
            <input className="input" name="pharmacy_state" maxLength={2} placeholder="MS" defaultValue={careInfo?.pharmacy_state || ''} />
          </label>
        </div>
      </div>

      <div className="care-subsection">
        <div className="medication-heading">
          <div>
            <strong>Medication List</strong>
            <div className="field-help">Start typing a generic or brand name, select the medication, then choose its available strength and form. Manual entry is always available.</div>
            <div className="field-help">Drug and strength lookup uses publicly available RxTerms data from the U.S. National Library of Medicine (NLM/NIH). NLM does not endorse this CRM.</div>
          </div>
        </div>

        <div className="medication-list">
          {medicationRows.map((medication, index) => (
            <div className="medication-card" key={medication.rowKey}>
              <div className="medication-card-heading">
                <strong>Medication {index + 1}</strong>
                <button className="btn btn-secondary btn-small" type="button" onClick={() => removeMedication(medication.rowKey)}>Remove</button>
              </div>
              <div className="form-grid" style={{ marginTop: 12 }}>
                <MedicationLookupFields medication={medication} />
                <label className="label">Times per day
                  <input className="input" name="medication_times_per_day" defaultValue={medication.times_per_day || ''} placeholder="Example: 2" />
                </label>
                <label className="label">Quantity filled
                  <input className="input" name="medication_quantity_filled" defaultValue={medication.quantity_filled || ''} inputMode="numeric" placeholder="Example: 30" />
                </label>
                <label className="label">Number of refills
                  <input className="input" name="medication_refill_count" defaultValue={medication.refill_count || ''} inputMode="numeric" placeholder="Example: 3" />
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="medication-add-dock">
          <button className="btn btn-primary medication-add-button" type="button" onClick={addMedication}>+ Add Medication</button>
        </div>
      </div>
    </div>
  )
}
