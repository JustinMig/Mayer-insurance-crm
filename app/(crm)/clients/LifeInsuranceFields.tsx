'use client'

import { useState } from 'react'

import ManualDateInput from './ManualDateInput'
type LifeInsuranceData = {
  company_name?: string | null
  face_amount?: string | number | null
  premium_amount?: string | number | null
  policy_type?: string | null
  effective_date?: string | null
} | null

type Props = {
  lifeInsurance?: LifeInsuranceData
}

const companyOptions = [
  'American Amicable',
  'Mutual of Omaha',
  'CICA',
  'Gerber',
  'Corebridge',
  'Transamerica',
  'Aflac'
]

const faceAmountOptions = ['5000', '10000', '15000', '20000', '25000']

function normalizedAmount(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return ''
  const number = Number(value)
  return Number.isFinite(number) ? String(number) : String(value)
}

function moneyLabel(value: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value))
}

export default function LifeInsuranceFields({ lifeInsurance = null }: Props) {
  const savedCompany = lifeInsurance?.company_name || ''
  const savedFaceAmount = normalizedAmount(lifeInsurance?.face_amount)

  const [companyChoice, setCompanyChoice] = useState(
    companyOptions.includes(savedCompany) ? savedCompany : savedCompany ? '__other__' : ''
  )
  const [faceAmountChoice, setFaceAmountChoice] = useState(
    faceAmountOptions.includes(savedFaceAmount) ? savedFaceAmount : savedFaceAmount ? '__custom__' : ''
  )

  return (
    <div className="form-grid" style={{ marginTop: 16 }}>
      <label className="label">Company name
        <select className="select" name="life_company_choice" value={companyChoice} onChange={event => setCompanyChoice(event.target.value)}>
          <option value="">Select company</option>
          {companyOptions.map(company => <option key={company} value={company}>{company}</option>)}
          <option value="__other__">Other / Not listed</option>
        </select>
      </label>

      {companyChoice === '__other__' ? (
        <label className="label">Other company
          <input
            className="input"
            name="life_company_custom"
            defaultValue={companyOptions.includes(savedCompany) ? '' : savedCompany}
            placeholder="Enter company name"
            required
          />
        </label>
      ) : <div />}

      <label className="label">Face amount
        <select className="select" name="life_face_amount_choice" value={faceAmountChoice} onChange={event => setFaceAmountChoice(event.target.value)}>
          <option value="">Select face amount</option>
          {faceAmountOptions.map(amount => <option key={amount} value={amount}>{moneyLabel(amount)}</option>)}
          <option value="__custom__">Custom amount</option>
        </select>
      </label>

      {faceAmountChoice === '__custom__' ? (
        <label className="label">Custom face amount
          <input
            className="input"
            name="life_face_amount_custom"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            defaultValue={faceAmountOptions.includes(savedFaceAmount) ? '' : savedFaceAmount}
            placeholder="Enter amount"
            required
          />
        </label>
      ) : <div />}

      <label className="label">Premium amount
        <input
          className="input"
          name="life_premium_amount"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          defaultValue={normalizedAmount(lifeInsurance?.premium_amount)}
          placeholder="0.00"
        />
      </label>

      <label className="label">Policy type
        <select className="select" name="life_policy_type" defaultValue={lifeInsurance?.policy_type || ''}>
          <option value="">Select policy type</option>
          <option value="Term">Term</option>
          <option value="Whole Life">Whole Life</option>
          <option value="IUL">IUL</option>
        </select>
      </label>

      <label className="label">Effective date
        <ManualDateInput name="life_effective_date" defaultValue={lifeInsurance?.effective_date} />
      </label>
    </div>
  )
}
