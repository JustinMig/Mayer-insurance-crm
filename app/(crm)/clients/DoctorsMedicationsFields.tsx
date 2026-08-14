'use client'

import { useState } from 'react'

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
            <div className="field-help">Add as many medications as needed.</div>
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
                <label className="label span-2">Medication name
                  <input className="input" name="medication_name" defaultValue={medication.medication_name || ''} placeholder="Medication name" />
                </label>
                <label className="label">Dosage
                  <input className="input" name="medication_dosage" defaultValue={medication.dosage || ''} placeholder="Example: 10 mg" />
                </label>
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
