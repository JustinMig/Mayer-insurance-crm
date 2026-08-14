'use client'

import ManualDateInput from './ManualDateInput'
type HospitalIndemnityData = {
  company_name?: string | null
  premium_amount?: string | number | null
  effective_date?: string | null
} | null

function normalizedAmount(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return ''
  const number = Number(value)
  return Number.isFinite(number) ? String(number) : String(value)
}

export default function HospitalIndemnityFields({ hospitalIndemnity = null }: { hospitalIndemnity?: HospitalIndemnityData }) {
  return (
    <div className="form-grid" style={{ marginTop: 16 }}>
      <label className="label">Company name
        <input className="input" name="hospital_indemnity_company" defaultValue={hospitalIndemnity?.company_name || ''} placeholder="Enter company name" />
      </label>
      <label className="label">Premium amount
        <input className="input" name="hospital_indemnity_premium" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={normalizedAmount(hospitalIndemnity?.premium_amount)} placeholder="0.00" />
      </label>
      <label className="label">Effective date
        <ManualDateInput name="hospital_indemnity_effective_date" defaultValue={hospitalIndemnity?.effective_date} />
      </label>
    </div>
  )
}
