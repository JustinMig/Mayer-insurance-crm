'use client'

import { useMemo, useState, type ChangeEvent } from 'react'
import {
  ALL_MEDICAL_QUALIFICATIONS,
  MEDICAL_CARRIER_OPTIONS,
  type MedicalCarrierKey,
  type MedicalQualificationEntry
} from '@/lib/medical-qualifications'

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function searchableValues(entry: MedicalQualificationEntry) {
  return [entry.name, ...(entry.aliases || []), entry.associatedDiagnosis || ''].map(normalize).filter(Boolean)
}

function resultClass(outcome: string) {
  const value = normalize(outcome)
  if (value.includes('decline') || value.includes('no coverage')) return 'medical-result medical-result-decline'
  if (value.includes('graded') || value.includes('return of premium') || value.includes('table') || value.includes('individual consideration') || value.includes('refer')) return 'medical-result medical-result-caution'
  if (value.includes('preferred') || value.includes('standard') || value.includes('select') || value.includes('immediate') || value.includes('approved')) return 'medical-result medical-result-positive'
  return 'medical-result medical-result-neutral'
}

export default function MedicalQualificationsLookup() {
  const [carrier, setCarrier] = useState<MedicalCarrierKey | ''>('physicians-mutual')
  const [query, setQuery] = useState('')

  const selectedCarrier = MEDICAL_CARRIER_OPTIONS.find((item) => item.key === carrier)

  const results = useMemo(() => {
    const needle = normalize(query)
    if (!carrier || !needle) return []

    const words = needle.split(/\s+/).filter(Boolean)
    const matches = ALL_MEDICAL_QUALIFICATIONS
      .filter((entry) => entry.carrier === carrier)
      .map((entry) => {
        const values = searchableValues(entry)
        const joined = values.join(' ')
        const exact = values.some((value) => value === needle)
        const starts = values.some((value) => value.startsWith(needle))
        const contains = words.every((word) => joined.includes(word))
        return { entry, exact, starts, contains }
      })
      .filter((match) => match.contains)
      .sort((a, b) => Number(b.exact) - Number(a.exact) || Number(b.starts) - Number(a.starts) || a.entry.name.localeCompare(b.entry.name))

    return matches.slice(0, 30).map((match) => match.entry)
  }, [carrier, query])

  function resetLookup() {
    setCarrier('physicians-mutual')
    setQuery('')
  }

  return (
    <section className="card card-pad medical-lookup-card" style={{ marginTop: 20 }}>
      <div className="build-lookup-heading">
        <div>
          <h2 style={{ marginBottom: 4 }}>Medical Qualifications</h2>
          <p className="subtle" style={{ margin: 0 }}>Choose the carrier/product, then search a medical condition or medication.</p>
        </div>
        <div className="build-lookup-actions">
          <span className="build-lookup-badge">Life underwriting</span>
          <button type="button" className="btn btn-secondary btn-small" onClick={resetLookup}>Reset</button>
        </div>
      </div>

      <div className="medical-lookup-controls">
        <label className="label">Carrier / product
          <select
            className="select"
            value={carrier}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => {
              setCarrier(event.target.value as MedicalCarrierKey | '')
              setQuery('')
            }}
          >
            <option value="">Select carrier</option>
            {MEDICAL_CARRIER_OPTIONS.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
          </select>
        </label>

        <label className="label">Condition or medication
          <input
            className="input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={carrier ? 'Example: AIDS, COPD, cancer, Eliquis, Humira' : 'Choose carrier first'}
            disabled={!carrier}
            autoComplete="off"
          />
        </label>
      </div>

      {!carrier ? (
        <div className="build-lookup-empty">Choose a carrier/product to begin.</div>
      ) : !query.trim() ? (
        <div className="build-lookup-empty">Type a condition or medication. Results use each carrier’s own terminology, such as Immediate, Select, Preferred, Standard, Graded, Return of Premium, table ratings, Refer, or Decline.</div>
      ) : results.length === 0 ? (
        <div className="build-lookup-empty"><strong>No matching rule was found in the supplied guide for {selectedCarrier?.name || 'this carrier'}.</strong><br />Do not assume eligibility. Use the carrier’s underwriting/risk-assessment process for conditions or medications not listed.</div>
      ) : (
        <div className="medical-table-wrap table-wrap">
          <table className="medical-qualifications-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Condition / Medication</th>
                <th>Result</th>
                <th>Time / Criteria</th>
                <th>Underwriting Note</th>
              </tr>
            </thead>
            <tbody>
              {results.map((entry, index) => (
                <tr key={`${entry.carrier}-${entry.type}-${entry.name}-${entry.timeframe}-${index}`}>
                  <td><span className="medical-type-badge">{entry.type}</span></td>
                  <td>
                    <strong>{entry.name}</strong>
                    {entry.associatedDiagnosis ? <span className="medical-associated">Guide use / associated condition: {entry.associatedDiagnosis}</span> : null}
                  </td>
                  <td><span className={resultClass(entry.outcome)}>{entry.outcome}</span></td>
                  <td><strong>{entry.timeframe}</strong></td>
                  <td>{entry.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="build-source-note medical-source-note">
        Source for selected carrier: {selectedCarrier?.source || 'Select a carrier'}. This lookup is an agent reference built from the supplied underwriting guides; carrier underwriting, application health questions, electronic data, and state-specific rules control the final decision.
      </p>
    </section>
  )
}
