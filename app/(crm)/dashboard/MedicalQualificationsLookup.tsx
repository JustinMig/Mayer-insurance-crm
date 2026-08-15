'use client'

import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import type { MedicalCarrierKey, MedicalQualificationEntry } from '@/lib/medical-qualifications'

type CarrierOption = {
  key: MedicalCarrierKey
  name: string
  source: string
}

type Props = {
  carrierOptions: CarrierOption[]
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function resultClass(outcome: string) {
  const value = normalize(outcome)
  if (value.includes('decline') || value.includes('no coverage')) return 'medical-result medical-result-decline'
  if (value.includes('graded') || value.includes('return of premium') || value.includes('table') || value.includes('individual consideration') || value.includes('refer')) return 'medical-result medical-result-caution'
  if (value.includes('preferred') || value.includes('standard') || value.includes('select') || value.includes('immediate') || value.includes('approved')) return 'medical-result medical-result-positive'
  return 'medical-result medical-result-neutral'
}

export default function MedicalQualificationsLookup({ carrierOptions }: Props) {
  const [carrier, setCarrier] = useState<MedicalCarrierKey | ''>('physicians-mutual')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MedicalQualificationEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState('')

  const selectedCarrier = useMemo(
    () => carrierOptions.find((item) => item.key === carrier),
    [carrier, carrierOptions]
  )

  useEffect(() => {
    const cleanedQuery = query.trim()
    if (!carrier || !cleanedQuery) {
      setResults([])
      setLoading(false)
      setSearchError('')
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setSearchError('')

      try {
        const params = new URLSearchParams({ carrier, q: cleanedQuery })
        const response = await fetch(`/api/medical-qualifications?${params.toString()}`, {
          signal: controller.signal,
          credentials: 'same-origin',
          headers: { Accept: 'application/json' }
        })

        if (response.redirected && new URL(response.url).pathname === '/login') {
          window.location.assign('/login')
          return
        }

        if (!response.ok) {
          throw new Error(`Search failed (${response.status})`)
        }

        const payload = await response.json() as { results?: MedicalQualificationEntry[] }
        setResults(Array.isArray(payload.results) ? payload.results : [])
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setResults([])
        setSearchError('Unable to search underwriting rules right now. Try again.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 180)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [carrier, query])

  function resetLookup() {
    setCarrier('physicians-mutual')
    setQuery('')
    setResults([])
    setSearchError('')
  }

  return (
    <section className="card card-pad medical-lookup-card dashboard-lookup-accent dashboard-lookup-accent-medical" style={{ marginTop: 20 }}>
      <div className="build-lookup-heading">
        <div>
          <h2 style={{ marginBottom: 4 }}>Medical Qualifications</h2>
          <p className="subtle medical-lookup-intro" style={{ margin: 0 }}>Choose a carrier, then search a condition or medication.</p>
        </div>
        <div className="build-lookup-actions">
          <span className="build-lookup-badge">Life underwriting</span>
          <button type="button" className="btn btn-secondary btn-small" onClick={resetLookup}>Reset</button>
        </div>
      </div>

      <div className="medical-lookup-controls">
        <label className="label">Carrier / product
          <select
            className="select dashboard-field dashboard-field-medical-carrier"
            value={carrier}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => {
              setCarrier(event.target.value as MedicalCarrierKey | '')
              setQuery('')
              setResults([])
              setSearchError('')
            }}
          >
            <option value="">Select carrier</option>
            {carrierOptions.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
          </select>
        </label>

        <label className="label">Condition or medication
          <input
            className="input dashboard-field dashboard-field-medication"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={carrier ? 'Example: AIDS, COPD, cancer, Eliquis, Humira' : 'Choose carrier first'}
            disabled={!carrier}
            autoComplete="off"
            enterKeyHint="search"
          />
        </label>
      </div>

      {!carrier ? (
        <div className="build-lookup-empty">Choose a carrier/product to begin.</div>
      ) : !query.trim() ? (
        <div className="build-lookup-empty">Type a condition or medication. Results use each carrier’s own terminology, such as Immediate, Select, Preferred, Standard, Graded, Return of Premium, table ratings, Refer, or Decline.</div>
      ) : loading ? (
        <div className="build-lookup-empty medical-search-status">Searching underwriting rules…</div>
      ) : searchError ? (
        <div className="build-lookup-empty"><strong>{searchError}</strong></div>
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
                  <td data-label="Type"><span className="medical-type-badge">{entry.type}</span></td>
                  <td data-label="Condition / Medication">
                    <strong>{entry.name}</strong>
                    {entry.associatedDiagnosis ? <span className="medical-associated">Guide use / associated condition: {entry.associatedDiagnosis}</span> : null}
                  </td>
                  <td data-label="Result"><span className={resultClass(entry.outcome)}>{entry.outcome}</span></td>
                  <td data-label="Time / Criteria"><strong>{entry.timeframe}</strong></td>
                  <td data-label="Underwriting Note">{entry.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details className="medical-source-details">
        <summary>Source &amp; underwriting note</summary>
        <p className="build-source-note medical-source-note">
          Source for selected carrier: {selectedCarrier?.source || 'Select a carrier'}. This lookup is an agent reference built from the supplied underwriting guides; carrier underwriting, application health questions, electronic data, and state-specific rules control the final decision.
        </p>
      </details>
    </section>
  )
}
