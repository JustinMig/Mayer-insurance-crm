'use client'

import { useMemo, useState, type FormEvent } from 'react'

const MISSISSIPPI_COUNTIES = [
  'Adams','Alcorn','Amite','Attala','Benton','Bolivar','Calhoun','Carroll','Chickasaw','Choctaw','Claiborne','Clarke','Clay','Coahoma','Copiah','Covington','DeSoto','Forrest','Franklin','George','Greene','Grenada','Hancock','Harrison','Hinds','Holmes','Humphreys','Issaquena','Itawamba','Jackson','Jasper','Jefferson','Jefferson Davis','Jones','Kemper','Lafayette','Lamar','Lauderdale','Lawrence','Leake','Lee','Leflore','Lincoln','Lowndes','Madison','Marion','Marshall','Monroe','Montgomery','Neshoba','Newton','Noxubee','Oktibbeha','Panola','Pearl River','Perry','Pike','Pontotoc','Prentiss','Quitman','Rankin','Scott','Sharkey','Simpson','Smith','Stone','Sunflower','Tallahatchie','Tate','Tippah','Tishomingo','Tunica','Union','Walthall','Warren','Washington','Wayne','Webster','Wilkinson','Winston','Yalobusha','Yazoo'
] as const

const CARRIERS = ['All carriers', 'Aetna', 'Devoted', 'HealthSpring', 'Humana', 'UnitedHealthcare'] as const

const COMPARISON_ROWS: Array<{ key: keyof MedicarePlan; label: string }> = [
  { key: 'monthly_premium', label: 'Monthly premium' },
  { key: 'moop_in_network', label: 'In-network max out-of-pocket' },
  { key: 'pcp_copay', label: 'Primary care doctor' },
  { key: 'specialist_copay', label: 'Specialist' },
  { key: 'inpatient_hospital', label: 'Inpatient hospital' },
  { key: 'otc_benefit', label: 'OTC benefit' },
  { key: 'food_benefit', label: 'Food / nutrition benefit' },
  { key: 'dental_benefit', label: 'Dental' },
  { key: 'vision_benefit', label: 'Vision' },
  { key: 'hearing_benefit', label: 'Hearing' }
]

type MedicarePlan = {
  id: string
  carrier: string
  plan_name: string
  contract_id: string
  plan_id: string
  segment_id: string
  plan_key: string
  plan_type: string | null
  snp_indicator: boolean
  snp_type: string | null
  dsnp_integration_status: string | null
  zero_dollar_cost_sharing_dsnp: boolean | null
  monthly_premium: string | null
  moop_in_network: string | null
  pcp_copay: string | null
  specialist_copay: string | null
  inpatient_hospital: string | null
  otc_benefit: string | null
  food_benefit: string | null
  dental_benefit: string | null
  vision_benefit: string | null
  hearing_benefit: string | null
  medicaid_level_status: 'not_required' | 'verified' | 'needs_verification'
  medicaid_match_status: 'not_required' | 'verified' | 'not_selected' | 'needs_verification'
  is_dsnp: boolean
  cms_source_date: string | null
  q1_source_url: string | null
  source_note: string | null
}

type SearchPayload = {
  county: string
  medicaid: string
  plan_year: number
  results: MedicarePlan[]
  count: number
  cms_source_date: string
  error?: string
}

function displayValue(value: string | null | undefined) {
  return value?.trim() || 'Not published — verify plan materials'
}

function formatSourceDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value
  return `${Number(match[2])}/${Number(match[3])}/${match[1]}`
}

function Benefit({ label, value, wide = false }: { label: string; value: string | null; wide?: boolean }) {
  const needsVerification = !value || /not published|verify carrier|some coverage/i.test(value)
  return (
    <div className={`medicare-plan-benefit${wide ? ' medicare-plan-benefit-wide' : ''}${needsVerification ? ' is-unverified' : ''}`}>
      <span>{label}</span>
      <strong>{displayValue(value)}</strong>
    </div>
  )
}

export default function MedicarePlanFinder() {
  const [county, setCounty] = useState('')
  const [medicaid, setMedicaid] = useState('none')
  const [carrier, setCarrier] = useState<(typeof CARRIERS)[number]>('All carriers')
  const [payload, setPayload] = useState<SearchPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([])
  const [showComparison, setShowComparison] = useState(false)
  const [compareError, setCompareError] = useState('')

  const displayedPlans = useMemo(() => {
    const plans = payload?.results || []
    return carrier === 'All carriers' ? plans : plans.filter((plan) => plan.carrier === carrier)
  }, [carrier, payload])

  const selectedPlans = useMemo(() => {
    if (!payload) return []
    const planById = new Map(payload.results.map((plan) => [plan.id, plan]))
    return selectedPlanIds.map((id) => planById.get(id)).filter((plan): plan is MedicarePlan => Boolean(plan))
  }, [payload, selectedPlanIds])

  async function searchPlans(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const cleanedCounty = county.trim().replace(/\s+county$/i, '')
    if (!cleanedCounty) {
      setError('Enter a Mississippi county.')
      return
    }

    setLoading(true)
    setError('')
    setCarrier('All carriers')
    setSelectedPlanIds([])
    setShowComparison(false)
    setCompareError('')

    try {
      const params = new URLSearchParams({ county: cleanedCounty, medicaid })
      const response = await fetch(`/api/medicare-plans?${params.toString()}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      })

      if (response.redirected && new URL(response.url).pathname === '/login') {
        window.location.assign('/login')
        return
      }

      const result = await response.json() as SearchPayload
      if (!response.ok) throw new Error(result.error || `Plan search failed (${response.status})`)
      setPayload(result)
      setCounty(result.county)
    } catch (searchError) {
      setPayload(null)
      setError(searchError instanceof Error ? searchError.message : 'Unable to search Medicare plans right now.')
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setCounty('')
    setMedicaid('none')
    setCarrier('All carriers')
    setPayload(null)
    setError('')
    setSelectedPlanIds([])
    setShowComparison(false)
    setCompareError('')
  }

  function toggleCompare(planId: string) {
    setCompareError('')
    if (selectedPlanIds.includes(planId)) {
      const next = selectedPlanIds.filter((id) => id !== planId)
      setSelectedPlanIds(next)
      if (next.length === 0) setShowComparison(false)
      return
    }
    if (selectedPlanIds.length >= 4) {
      setCompareError('You can compare up to 4 plans at one time. Remove a selected plan before adding another.')
      return
    }
    setSelectedPlanIds([...selectedPlanIds, planId])
  }

  return (
    <section className="card card-pad medicare-plan-finder dashboard-lookup-accent dashboard-lookup-accent-medicare" style={{ marginTop: 20 }}>
      <div className="medicare-plan-finder-heading">
        <div>
          <h2 style={{ marginBottom: 4 }}>Medicare Plan Finder</h2>
          <p className="subtle" style={{ margin: 0 }}>2026 Mississippi MAPD plans from Aetna, Devoted, HealthSpring, Humana and UnitedHealthcare.</p>
        </div>
        <div className="build-lookup-actions">
          <span className="medicare-plan-year-badge">2026 MAPD</span>
          <button type="button" className="btn btn-secondary btn-small" onClick={reset}>Reset</button>
        </div>
      </div>

      <form className="medicare-plan-controls" onSubmit={searchPlans}>
        <label className="label">Mississippi county
          <input
            className="input dashboard-field dashboard-field-county"
            type="text"
            list="mississippi-medicare-counties"
            value={county}
            onChange={(event) => setCounty(event.target.value)}
            placeholder="Example: Alcorn"
            autoComplete="off"
          />
          <datalist id="mississippi-medicare-counties">
            {MISSISSIPPI_COUNTIES.map((name) => <option value={name} key={name} />)}
          </datalist>
        </label>

        <label className="label">Medicaid level
          <select className="select dashboard-field dashboard-field-medicaid" value={medicaid} onChange={(event) => setMedicaid(event.target.value)}>
            <option value="none">No Medicaid</option>
            <option value="qmb">QMB</option>
            <option value="slmb">SLMB</option>
            <option value="qi">QI</option>
            <option value="fbde">FBDE / Full Medicaid</option>
            <option value="other">Other Medicaid</option>
          </select>
        </label>

        <button className="btn btn-primary medicare-plan-search-button" type="submit" disabled={loading}>
          {loading ? 'SEARCHING…' : 'FIND PLANS'}
        </button>
      </form>

      <div className="medicare-plan-filter-note">
        <strong>Medicaid filtering:</strong> No Medicaid removes D-SNPs. When a Medicaid level is selected, D-SNPs are shown first. If CMS/public plan data does not publish that plan’s exact QMB/SLMB/QI/FBDE acceptance, the result is clearly marked <em>Verify Medicaid eligibility</em> instead of guessing.
      </div>

      {error ? <div className="medicare-plan-error">{error}</div> : null}

      {!payload && !loading && !error ? (
        <div className="build-lookup-empty medicare-plan-empty">Enter a county, choose the client’s Medicaid level, then select <strong>Find Plans</strong>.</div>
      ) : null}

      {payload ? (
        <>
          <div className="medicare-plan-results-toolbar">
            <div>
              <strong>{payload.count} plans found in {payload.county} County</strong>
              <span>CMS county/premium/MOOP data as of {formatSourceDate(payload.cms_source_date)}</span>
            </div>
            <div className="medicare-plan-toolbar-actions">
              <label className="label medicare-carrier-filter">Carrier
                <select className="select dashboard-field dashboard-field-carrier" value={carrier} onChange={(event) => setCarrier(event.target.value as (typeof CARRIERS)[number])}>
                  {CARRIERS.map((name) => <option value={name} key={name}>{name}</option>)}
                </select>
              </label>
              <button
                type="button"
                className="btn btn-secondary medicare-compare-button"
                disabled={selectedPlans.length === 0}
                onClick={() => setShowComparison((current) => !current)}
              >
                {showComparison ? 'HIDE COMPARISON' : selectedPlans.length ? `COMPARE ${selectedPlans.length} ${selectedPlans.length === 1 ? 'PLAN' : 'PLANS'}` : 'COMPARE PLANS'}
              </button>
            </div>
          </div>

          <div className="medicare-compare-help">
            Select the <strong>Compare</strong> box on up to 4 plans. Then use the Compare Plans button to line every benefit up side-by-side.
          </div>

          {compareError ? <div className="medicare-plan-error medicare-compare-error">{compareError}</div> : null}

          {showComparison && selectedPlans.length > 0 ? (
            <section className="medicare-comparison" aria-label="Medicare plan comparison">
              <div className="medicare-comparison-heading">
                <div>
                  <h3>Plan Comparison</h3>
                  <span>{selectedPlans.length} of 4 plans selected</span>
                </div>
                <button type="button" className="btn btn-secondary btn-small" onClick={() => { setSelectedPlanIds([]); setShowComparison(false); setCompareError('') }}>Clear comparison</button>
              </div>
              <div className="medicare-comparison-scroll">
                <table className="medicare-comparison-table" style={{ minWidth: `${190 + selectedPlans.length * 225}px` }}>
                  <thead>
                    <tr>
                      <th>Benefit</th>
                      {selectedPlans.map((plan) => (
                        <th key={plan.id}>
                          <span className="medicare-comparison-carrier">{plan.carrier}</span>
                          <strong>{plan.plan_name}</strong>
                          <small>{plan.plan_key}</small>
                          <button type="button" onClick={() => toggleCompare(plan.id)}>Remove</button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {COMPARISON_ROWS.map((row) => (
                      <tr key={row.key}>
                        <th scope="row">{row.label}</th>
                        {selectedPlans.map((plan) => (
                          <td key={plan.id}>{displayValue(plan[row.key] as string | null | undefined)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {displayedPlans.length === 0 ? (
            <div className="build-lookup-empty medicare-plan-empty">No plans from that carrier match this county and Medicaid selection.</div>
          ) : (
            <div className="medicare-plan-results">
              {displayedPlans.map((plan) => {
                const selectedForCompare = selectedPlanIds.includes(plan.id)
                return (
                  <article className={`medicare-plan-card${selectedForCompare ? ' is-selected-for-compare' : ''}`} key={plan.id}>
                    <div className="medicare-plan-compare-strip">
                      <label className="medicare-plan-compare-choice">
                        <input
                          type="checkbox"
                          checked={selectedForCompare}
                          onChange={() => toggleCompare(plan.id)}
                        />
                        <span>Compare</span>
                      </label>
                      <span>{selectedPlanIds.length}/4 selected</span>
                    </div>

                    <details className="medicare-plan-details">
                      <summary className="medicare-plan-card-head">
                        <span className="medicare-plan-summary-main">
                          <span className="medicare-plan-carrier">{plan.carrier}</span>
                          <strong className="medicare-plan-title">{plan.plan_name}</strong>
                          <span className="medicare-plan-meta">
                            <span>{plan.plan_key}</span>
                            {plan.plan_type ? <span>{plan.plan_type}</span> : null}
                            {plan.snp_indicator && plan.snp_type ? <span>{plan.snp_type}</span> : null}
                          </span>
                        </span>
                        <span className="medicare-plan-summary-right">
                          <span className="medicare-plan-badges">
                            {plan.is_dsnp ? <span className="medicare-plan-badge dual">D-SNP</span> : <span className="medicare-plan-badge standard">MAPD</span>}
                            {plan.zero_dollar_cost_sharing_dsnp ? <span className="medicare-plan-badge zero-cost">$0 Medicare cost-share D-SNP</span> : null}
                          </span>
                          <span className="medicare-plan-expand-label"><span className="closed-label">Open plan details</span><span className="open-label">Close plan details</span></span>
                        </span>
                      </summary>

                      <div className="medicare-plan-card-body">
                        {plan.medicaid_match_status === 'needs_verification' ? (
                          <div className="medicare-plan-medicaid-warning">
                            <strong>Verify Medicaid eligibility:</strong> this D-SNP serves the county, but the public master data does not identify this plan’s exact accepted Medicaid category. Confirm the client’s {medicaid.toUpperCase()} eligibility with the carrier before enrollment.
                          </div>
                        ) : null}

                        <div className="medicare-plan-benefit-grid primary-benefits">
                          <Benefit label="Monthly premium" value={plan.monthly_premium} />
                          <Benefit label="In-network max out-of-pocket" value={plan.moop_in_network} />
                          <Benefit label="Primary care doctor" value={plan.pcp_copay} />
                          <Benefit label="Specialist" value={plan.specialist_copay} />
                        </div>

                        <div className="medicare-plan-benefit-grid detail-benefits">
                          <Benefit label="Inpatient hospital" value={plan.inpatient_hospital} wide />
                          <Benefit label="OTC benefit" value={plan.otc_benefit} />
                          <Benefit label="Food / nutrition benefit" value={plan.food_benefit} />
                          <Benefit label="Dental" value={plan.dental_benefit} wide />
                          <Benefit label="Vision" value={plan.vision_benefit} wide />
                          <Benefit label="Hearing" value={plan.hearing_benefit} wide />
                        </div>

                        <details className="medicare-plan-source-details">
                          <summary>Data source &amp; verification note</summary>
                          <p>{plan.source_note || 'Verify current CMS and carrier plan materials before enrollment.'}</p>
                          {plan.q1_source_url ? <a href={plan.q1_source_url} target="_blank" rel="noreferrer">Open 2026 plan benefit detail</a> : null}
                        </details>
                      </div>
                    </details>
                  </article>
                )
              })}
            </div>
          )}
        </>
      ) : null}

      <p className="medicare-plan-disclaimer">
        Agent reference only. Benefits, supplemental allowances, service areas and D-SNP eligibility can change or contain plan-specific conditions. CMS and the carrier’s current Evidence/Summary of Benefits and enrollment eligibility rules control.
      </p>
    </section>
  )
}
