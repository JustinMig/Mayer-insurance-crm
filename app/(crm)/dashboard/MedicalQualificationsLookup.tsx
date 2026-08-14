'use client'

import { useMemo, useState, type ChangeEvent } from 'react'
import { PHYSICIANS_MUTUAL_MEDICAL_QUALIFICATIONS, type MedicalQualificationEntry } from '@/lib/medical-qualifications'

type CarrierKey = 'physicians-mutual'

const carriers: Array<{ key: CarrierKey; name: string }> = [
  { key: 'physicians-mutual', name: 'Physicians Mutual' }
]

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function searchableValues(entry: MedicalQualificationEntry) {
  return [entry.name, ...(entry.aliases || [])].map(normalize)
}

export default function MedicalQualificationsLookup() {
  const [carrier, setCarrier] = useState<CarrierKey | ''>('physicians-mutual')
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const needle = normalize(query)
    if (!carrier || !needle) return []

    const matches = PHYSICIANS_MUTUAL_MEDICAL_QUALIFICATIONS
      .filter((entry) => entry.carrier === carrier)
      .map((entry) => {
        const values = searchableValues(entry)
        const exact = values.some((value) => value === needle)
        const starts = values.some((value) => value.startsWith(needle))
        const contains = values.some((value) => value.includes(needle))
        return { entry, exact, starts, contains }
      })
      .filter((match) => match.contains)
      .sort((a, b) => Number(b.exact) - Number(a.exact) || Number(b.starts) - Number(a.starts) || a.entry.name.localeCompare(b.entry.name))

    return matches.slice(0, 20).map((match) => match.entry)
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
          <p className="subtle" style={{ margin: 0 }}>Choose the carrier, then search a medical condition or medication.</p>
        </div>
        <div className="build-lookup-actions">
          <span className="build-lookup-badge">Life underwriting</span>
          <button type="button" className="btn btn-secondary btn-small" onClick={resetLookup}>Reset</button>
        </div>
      </div>

      <div className="medical-lookup-controls">
        <label className="label">Carrier
          <select
            className="select"
            value={carrier}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => {
              setCarrier(event.target.value as CarrierKey | '')
              setQuery('')
            }}
          >
            <option value="">Select carrier</option>
            {carriers.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
          </select>
        </label>

        <label className="label">Condition or medication
          <input
            className="input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={carrier ? 'Example: AIDS, COPD, Abacavir, Eliquis' : 'Choose carrier first'}
            disabled={!carrier}
            autoComplete="off"
          />
        </label>
      </div>

      {!carrier ? (
        <div className="build-lookup-empty">Choose a carrier to begin.</div>
      ) : !query.trim() ? (
        <div className="build-lookup-empty">Type a condition or medication. Physicians Mutual Secure Essential Life uses Approved, Refer to Underwriter, or Decline—not Level/Graded medical classes in the supplied guide.</div>
      ) : results.length === 0 ? (
        <div className="build-lookup-empty"><strong>No exact rule found in the supplied Physicians Mutual documents.</strong><br />Do not assume the client is eligible. Refer the case to underwriting for review.</div>
      ) : (
        <div className="medical-table-wrap table-wrap">
          <table className="medical-qualifications-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Condition / Medication</th>
                <th>Result</th>
                <th>Time Rule</th>
                <th>Underwriting Note</th>
              </tr>
            </thead>
            <tbody>
              {results.map((entry) => (
                <tr key={`${entry.type}-${entry.name}`}>
                  <td><span className="medical-type-badge">{entry.type}</span></td>
                  <td>
                    <strong>{entry.name}</strong>
                    {entry.associatedDiagnosis ? <span className="medical-associated">Common associated diagnosis: {entry.associatedDiagnosis}</span> : null}
                  </td>
                  <td><span className="medical-result-decline">{entry.outcome}</span></td>
                  <td><strong>{entry.timeframe}</strong></td>
                  <td>{entry.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="build-source-note medical-source-note">
        Source: Physicians Life Insurance Company Secure Essential Life (L780) Product &amp; Underwriting Guidelines, revised 05/11/2026, medical conditions pages 9–11 and auto-decline medications pages 14–15. Medication diagnosis labels are supporting context from the supplied SELI auto-decline medication document. Carrier underwriting and state-specific rules control.
      </p>
    </section>
  )
}
