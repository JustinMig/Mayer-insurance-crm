'use client'

import { useMemo, useState, type ChangeEvent } from 'react'
import { AMERICAN_AMICABLE_BUILD, MUTUAL_OF_OMAHA_BUILD } from '@/lib/build-charts'

type CompanyKey = 'mutual-of-omaha' | 'american-amicable'

type CompanyOption = {
  key: CompanyKey
  name: string
  aliases: string[]
}

const companies: CompanyOption[] = [
  { key: 'mutual-of-omaha', name: 'Mutual of Omaha', aliases: ['moo', 'mutual of omaha', 'mutual omaha', 'omaha'] },
  { key: 'american-amicable', name: 'American Amicable', aliases: ['amam', 'american amicable', 'americanamicable', 'amicable'] }
]

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function companyFromQuery(query: string): CompanyOption | null {
  const needle = normalize(query)
  if (!needle) return null
  return companies.find((company) => company.aliases.some((alias) => normalize(alias) === needle) || normalize(company.name) === needle) || null
}

export default function BuildChartLookup() {
  const [companyQuery, setCompanyQuery] = useState('')
  const [selectedCompany, setSelectedCompany] = useState<CompanyKey | null>(null)
  const [heightKey, setHeightKey] = useState('')

  const exactCompany = selectedCompany
    ? companies.find((company) => company.key === selectedCompany) || null
    : companyFromQuery(companyQuery)

  const companyMatches = useMemo(() => {
    const needle = normalize(companyQuery)
    if (!needle || exactCompany) return []
    return companies.filter((company) => {
      const haystack = [company.name, ...company.aliases].map(normalize).join(' ')
      return haystack.includes(needle)
    })
  }, [companyQuery, exactCompany])

  const rows = exactCompany?.key === 'mutual-of-omaha'
    ? MUTUAL_OF_OMAHA_BUILD
    : exactCompany?.key === 'american-amicable'
      ? AMERICAN_AMICABLE_BUILD
      : []
  const mutualRow = exactCompany?.key === 'mutual-of-omaha'
    ? MUTUAL_OF_OMAHA_BUILD.find((row) => `${row.feet}-${row.inches}` === heightKey) || null
    : null
  const americanRow = exactCompany?.key === 'american-amicable'
    ? AMERICAN_AMICABLE_BUILD.find((row) => `${row.feet}-${row.inches}` === heightKey) || null
    : null
  const hasSelectedRow = Boolean(mutualRow || americanRow)

  function chooseCompany(company: CompanyOption) {
    setSelectedCompany(company.key)
    setCompanyQuery(company.name)
    setHeightKey('')
  }

  function resetCompanyForText(value: string) {
    setCompanyQuery(value)
    const exact = companyFromQuery(value)
    setSelectedCompany(exact?.key || null)
    setHeightKey('')
  }

  return (
    <section className="card card-pad build-lookup-card" style={{ marginTop: 20 }}>
      <div className="build-lookup-heading">
        <div>
          <h2 style={{ marginBottom: 4 }}>Height &amp; Weight Underwriting Lookup</h2>
          <p className="subtle" style={{ margin: 0 }}>Type MOO / Mutual of Omaha or AMAM / American Amicable, then select the client&apos;s height.</p>
        </div>
        <span className="build-lookup-badge">Life build charts</span>
      </div>

      <div className="build-lookup-controls">
        <div className="build-company-wrap">
          <label className="label">Company
            <input
              className="input"
              value={companyQuery}
              onChange={(event: ChangeEvent<HTMLInputElement>) => resetCompanyForText(event.target.value)}
              placeholder="MOO, AMAM, or company name"
              autoComplete="off"
            />
          </label>
          {companyMatches.length ? (
            <div className="build-company-results">
              {companyMatches.map((company) => (
                <button key={company.key} type="button" onClick={() => chooseCompany(company)}>
                  <strong>{company.name}</strong>
                  <span>{company.key === 'mutual-of-omaha' ? 'MOO' : 'AMAM'}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <label className="label">Height
          <select
            className="select"
            value={heightKey}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setHeightKey(event.target.value)}
            disabled={!exactCompany}
          >
            <option value="">{exactCompany ? 'Select height' : 'Choose company first'}</option>
            {rows.map((row) => <option key={`${row.feet}-${row.inches}`} value={`${row.feet}-${row.inches}`}>{row.height}</option>)}
          </select>
        </label>
      </div>

      {!exactCompany ? (
        <div className="build-lookup-empty">Choose Mutual of Omaha or American Amicable to begin.</div>
      ) : !hasSelectedRow ? (
        <div className="build-lookup-empty">Select a height to see the chart values.</div>
      ) : mutualRow ? (
        <div className="build-lookup-result">
          <div className="build-result-title"><strong>Mutual of Omaha</strong><span>{mutualRow.height}</span></div>
          <div className="build-result-grid build-result-grid-two">
            <div><span>TLE, IULE, Living Promise - Minimum Weight</span><strong>{mutualRow.minimumWeight} lb</strong></div>
            <div><span>TLE, IULE - Maximum Weight</span><strong>{mutualRow.maximumWeight} lb</strong></div>
          </div>
          <p className="build-source-note">Source: Mutual of Omaha underwriting guide, page 28. DI Rider Maximum Weight is intentionally excluded.</p>
        </div>
      ) : americanRow ? (
        <div className="build-lookup-result">
          <div className="build-result-title"><strong>American Amicable</strong><span>{americanRow.height}</span></div>
          <div className="build-aa-groups">
            <div className="build-aa-group">
              <span className="build-group-title">Maximum Weight for Plan</span>
              <div className="build-result-grid build-result-grid-three">
                <div><span>Immediate</span><strong>{americanRow.maximumImmediate} lb</strong></div>
                <div><span>Graded</span><strong>{americanRow.maximumGraded} lb</strong></div>
                <div><span>ROP</span><strong>{americanRow.maximumRop} lb</strong></div>
              </div>
            </div>
            <div className="build-aa-group">
              <span className="build-group-title">Minimum Weight for Plan</span>
              <div className="build-result-grid build-result-grid-two">
                <div><span>Immediate</span><strong>{americanRow.minimumImmediate} lb</strong></div>
                <div><span>ROP</span><strong>{americanRow.minimumRop} lb</strong></div>
              </div>
            </div>
          </div>
          {americanRow.homeOfficeReferral ? <p className="build-referral-note">The source chart marks 4&apos;5&quot; through 4&apos;7&quot; as Refer to Home Office when using the mobile application decision engine.</p> : null}
          <p className="build-source-note">Source: American Amicable Senior Choice guide, PDF page 13 (printed page 14).</p>
        </div>
      ) : null}
    </section>
  )
}
