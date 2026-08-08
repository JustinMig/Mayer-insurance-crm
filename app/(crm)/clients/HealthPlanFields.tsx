'use client'

import { useState } from 'react'
import SensitiveReveal from './[id]/SensitiveReveal'

type HealthPlanData = {
  company_name?: string | null
  plan_id?: string | null
  effective_date?: string | null
} | null

type Props = {
  healthPlan?: HealthPlanData
  clientId?: string
  memberMasked?: string
}

const companyOptions = [
  'Aetna',
  'Cigna',
  'Humana',
  'Devoted',
  'BCBS',
  'UnitedHealthcare'
]

export default function HealthPlanFields({ healthPlan = null, clientId, memberMasked = 'Not saved' }: Props) {
  const savedCompany = healthPlan?.company_name || ''
  const [companyChoice, setCompanyChoice] = useState(
    companyOptions.includes(savedCompany) ? savedCompany : savedCompany ? '__other__' : ''
  )

  return (
    <div className="form-grid" style={{ marginTop: 16 }}>
      <label className="label">Company name
        <select className="select" name="health_company_choice" value={companyChoice} onChange={event => setCompanyChoice(event.target.value)}>
          <option value="">Select company</option>
          {companyOptions.map(company => <option key={company} value={company}>{company}</option>)}
          <option value="__other__">Other / Not listed</option>
        </select>
      </label>

      {companyChoice === '__other__' ? (
        <label className="label">Other company
          <input
            className="input"
            name="health_company_custom"
            defaultValue={companyOptions.includes(savedCompany) ? '' : savedCompany}
            placeholder="Enter company name"
            required
          />
        </label>
      ) : <div />}

      {clientId ? (
        <div className="label">Member ID
          <SensitiveReveal clientId={clientId} field="health_member_id" masked={memberMasked} />
          <input className="input" name="health_member_id" type="password" autoComplete="new-password" placeholder="Enter a new Member ID only to replace the saved value" />
          <span className="field-help">The box above is only for replacing the saved Member ID.</span>
          <span className="clear-sensitive"><input type="checkbox" name="clear_health_member_id" /> Clear saved Member ID</span>
        </div>
      ) : (
        <label className="label">Member ID
          <input className="input" name="health_member_id" type="password" autoComplete="off" placeholder="Encrypted before storage" />
        </label>
      )}

      <label className="label">Plan ID
        <input className="input" name="health_plan_id" defaultValue={healthPlan?.plan_id || ''} />
      </label>

      <label className="label">Effective date
        <input className="input" type="date" name="health_effective_date" defaultValue={healthPlan?.effective_date || ''} />
      </label>
    </div>
  )
}
