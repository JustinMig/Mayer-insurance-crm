'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'

const MISSISSIPPI_COUNTIES = [
  'Adams','Alcorn','Amite','Attala','Benton','Bolivar','Calhoun','Carroll','Chickasaw','Choctaw','Claiborne','Clarke','Clay','Coahoma','Copiah','Covington','DeSoto','Forrest','Franklin','George','Greene','Grenada','Hancock','Harrison','Hinds','Holmes','Humphreys','Issaquena','Itawamba','Jackson','Jasper','Jefferson','Jefferson Davis','Jones','Kemper','Lafayette','Lamar','Lauderdale','Lawrence','Leake','Lee','Leflore','Lincoln','Lowndes','Madison','Marion','Marshall','Monroe','Montgomery','Neshoba','Newton','Noxubee','Oktibbeha','Panola','Pearl River','Perry','Pike','Pontotoc','Prentiss','Quitman','Rankin','Scott','Sharkey','Simpson','Smith','Stone','Sunflower','Tallahatchie','Tate','Tippah','Tishomingo','Tunica','Union','Walthall','Warren','Washington','Wayne','Webster','Wilkinson','Winston','Yalobusha','Yazoo'
] as const

const CARRIERS = ['All carriers', 'Aetna', 'Devoted', 'HealthSpring', 'Humana', 'UnitedHealthcare'] as const

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
  part_b_credit: string | null
  dental_annual_allowance: string | null
  vision_annual_allowance: string | null
  otc_allowance: string | null
  food_allowance: string | null
  medicaid_level_status: 'not_required' | 'verified' | 'needs_verification'
  medicaid_match_status: 'not_required' | 'verified' | 'not_selected' | 'needs_verification'
  is_dsnp: boolean
  cms_source_date: string | null
  q1_source_url: string | null
  source_note: string | null
}

const COMPARISON_ROWS: Array<{ key: keyof MedicarePlan; label: string }> = [
  { key: 'monthly_premium', label: 'Monthly premium' },
  { key: 'moop_in_network', label: 'In-network max out-of-pocket' },
  { key: 'pcp_copay', label: 'Primary care doctor' },
  { key: 'specialist_copay', label: 'Specialist' },
  { key: 'inpatient_hospital', label: 'Inpatient hospital' },
  { key: 'part_b_credit', label: 'Part B credit' },
  { key: 'dental_annual_allowance', label: 'Dental allowance / year' },
  { key: 'vision_annual_allowance', label: 'Vision allowance / year' },
  { key: 'otc_allowance', label: 'OTC amount / occurrence' },
  { key: 'food_allowance', label: 'Food amount / occurrence' }
]

type SearchPayload = {
  county: string
  medicaid: string
  plan_year: number
  results: MedicarePlan[]
  count: number
  cms_source_date: string
  error?: string
}

type DoctorSuggestion = {
  npi: string
  location_key: string
  name: string
  credential: string | null
  specialty: string | null
  address: string
  city: string
  state: string
  postal_code: string
  distance_miles: number
}

type DoctorSearchPayload = {
  results: DoctorSuggestion[]
  count: number
  error?: string
}

type DoctorNetworkMatch = {
  slot_id: string
  npi: string
  location_key: string | null
  name: string
  status: 'in_network' | 'out_of_network' | 'not_verified' | 'source_unavailable'
  source_url: string | null
  verified_at: string | null
  message: string | null
  verification_method: 'cache' | 'live' | 'unavailable'
}

type PlanDoctorNetworkStatus = {
  plan_id: string
  all_selected_in_network: boolean
  doctor_matches: DoctorNetworkMatch[]
}

type DoctorNetworkPayload = {
  available: boolean
  plans: Record<string, PlanDoctorNetworkStatus>
  verified_matches: number
  unavailable_matches?: number
  carrier_support?: Record<string, { carrier: string; connected: boolean; public_access: boolean; source_label: string; message: string | null }>
  message?: string | null
  error?: string
}

function displayValue(value: string | null | undefined) {
  return value?.trim() || 'Not published — verify plan materials'
}

function comparisonValue(value: string | null | undefined) {
  return value?.trim() || '—'
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

function ExactBenefit({ label, value }: { label: string; value: string | null }) {
  if (!value?.trim()) return null
  return (
    <div className="medicare-plan-benefit medicare-plan-exact-benefit">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function DoctorAutocompleteRow({
  slotId,
  index,
  zipCode,
  radius,
  selected,
  canRemove,
  onSelect,
  onRemove
}: {
  slotId: string
  index: number
  zipCode: string
  radius: string
  selected: DoctorSuggestion | undefined
  canRemove: boolean
  onSelect: (slotId: string, doctor: DoctorSuggestion | null) => void
  onRemove: (slotId: string) => void
}) {
  const [query, setQuery] = useState(selected?.name || '')
  const [suggestions, setSuggestions] = useState<DoctorSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (selected && query !== selected.name) setQuery(selected.name)
  }, [selected, query])

  useEffect(() => {
    const cleanedQuery = query.trim()
    if (selected?.name === cleanedQuery) {
      setSuggestions([])
      setMessage('')
      return
    }
    if (!/^\d{5}$/.test(zipCode)) {
      setSuggestions([])
      setMessage(cleanedQuery.length >= 2 ? 'Enter a 5-digit ZIP code first.' : '')
      return
    }
    if (cleanedQuery.length < 2) {
      setSuggestions([])
      setMessage('')
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setMessage('')
      try {
        const params = new URLSearchParams({ q: cleanedQuery, zip: zipCode, radius })
        const response = await fetch(`/api/providers/search?${params.toString()}`, {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          signal: controller.signal
        })
        const payload = await response.json() as DoctorSearchPayload
        if (!response.ok) throw new Error(payload.error || 'Doctor search failed.')
        setSuggestions(payload.results || [])
        setMessage(payload.results?.length ? '' : `No matching doctors found within ${radius} miles.`)
        setOpen(true)
      } catch (searchError) {
        if (controller.signal.aborted) return
        setSuggestions([])
        setMessage(searchError instanceof Error ? searchError.message : 'Unable to search doctors.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 450)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, zipCode, radius, selected])

  function chooseDoctor(doctor: DoctorSuggestion) {
    setQuery(doctor.name)
    setSuggestions([])
    setOpen(false)
    setMessage('')
    onSelect(slotId, doctor)
  }

  function changeQuery(value: string) {
    setQuery(value)
    if (selected) onSelect(slotId, null)
    setOpen(true)
  }

  return (
    <div className="medicare-doctor-row">
      <label className="label">Doctor {index + 1}
        <div className="medicare-doctor-autocomplete">
          <input
            className="input dashboard-field dashboard-field-doctor"
            type="text"
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 140)}
            placeholder="Start typing first or last name"
            autoComplete="off"
            aria-autocomplete="list"
          />
          {loading ? <span className="medicare-doctor-searching">Searching…</span> : null}
          {open && suggestions.length ? (
            <div className="medicare-doctor-suggestions" role="listbox">
              {suggestions.map((doctor) => (
                <button
                  type="button"
                  className="medicare-doctor-suggestion"
                  key={doctor.location_key}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseDoctor(doctor)}
                  role="option"
                  aria-selected={selected?.location_key === doctor.location_key}
                >
                  <strong>{doctor.name}{doctor.credential ? `, ${doctor.credential}` : ''}</strong>
                  <span>{doctor.specialty || 'Individual provider'}</span>
                  <small>{doctor.address ? `${doctor.address} · ` : ''}{doctor.city}, MS {doctor.postal_code} · {doctor.distance_miles.toFixed(1)} mi</small>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {selected ? (
          <span className="medicare-doctor-selected-detail">Selected office: {selected.address ? `${selected.address} · ` : ''}{selected.city}, MS {selected.postal_code} · NPI {selected.npi} · {selected.distance_miles.toFixed(1)} miles away</span>
        ) : message ? <span className="medicare-doctor-search-message">{message}</span> : null}
      </label>
      {canRemove ? <button type="button" className="btn btn-secondary btn-small medicare-doctor-remove" onClick={() => onRemove(slotId)}>Remove</button> : null}
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
  const [doctorZip, setDoctorZip] = useState('')
  const [doctorRadius, setDoctorRadius] = useState('25')
  const [doctorRows, setDoctorRows] = useState<string[]>(['doctor-1'])
  const [selectedDoctors, setSelectedDoctors] = useState<Record<string, DoctorSuggestion>>({})
  const [doctorNetworkPayload, setDoctorNetworkPayload] = useState<DoctorNetworkPayload | null>(null)
  const [doctorNetworkLoading, setDoctorNetworkLoading] = useState(false)
  const [doctorNetworkError, setDoctorNetworkError] = useState('')
  const [filterAllSelectedDoctors, setFilterAllSelectedDoctors] = useState(false)

  const selectedDoctorEntries = useMemo(() => Object.entries(selectedDoctors), [selectedDoctors])

  const displayedPlans = useMemo(() => {
    let plans = payload?.results || []
    if (carrier !== 'All carriers') plans = plans.filter((plan) => plan.carrier === carrier)
    if (filterAllSelectedDoctors && selectedDoctorEntries.length) {
      plans = plans.filter((plan) => doctorNetworkPayload?.plans?.[plan.id]?.all_selected_in_network)
    }
    return plans
  }, [carrier, payload, filterAllSelectedDoctors, selectedDoctorEntries.length, doctorNetworkPayload])

  const selectedPlans = useMemo(() => {
    if (!payload) return []
    const planById = new Map(payload.results.map((plan) => [plan.id, plan]))
    return selectedPlanIds.map((id) => planById.get(id)).filter((plan): plan is MedicarePlan => Boolean(plan))
  }, [payload, selectedPlanIds])

  useEffect(() => {
    if (!payload?.results?.length || selectedDoctorEntries.length === 0) {
      setDoctorNetworkPayload(null)
      setDoctorNetworkLoading(false)
      setDoctorNetworkError('')
      setFilterAllSelectedDoctors(false)
      return
    }

    const controller = new AbortController()
    const doctors = selectedDoctorEntries.map(([slotId, doctor]) => ({
      slot_id: slotId,
      npi: doctor.npi,
      location_key: doctor.location_key,
      name: doctor.name,
      address: doctor.address,
      city: doctor.city,
      state: doctor.state,
      postal_code: doctor.postal_code
    }))

    setDoctorNetworkLoading(true)
    setDoctorNetworkError('')

    void (async () => {
      try {
        const response = await fetch('/api/providers/network-status', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ doctors, plan_ids: payload.results.map((plan) => plan.id) }),
          signal: controller.signal
        })
        const result = await response.json() as DoctorNetworkPayload
        if (!response.ok) throw new Error(result.error || 'Unable to check doctor networks.')
        setDoctorNetworkPayload(result)
      } catch (networkError) {
        if (controller.signal.aborted) return
        setDoctorNetworkPayload(null)
        setDoctorNetworkError(networkError instanceof Error ? networkError.message : 'Unable to check doctor networks.')
      } finally {
        if (!controller.signal.aborted) setDoctorNetworkLoading(false)
      }
    })()

    return () => controller.abort()
  }, [payload, selectedDoctorEntries])

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
    setFilterAllSelectedDoctors(false)

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
    setDoctorZip('')
    setDoctorRadius('25')
    setDoctorRows(['doctor-1'])
    setSelectedDoctors({})
    setDoctorNetworkPayload(null)
    setDoctorNetworkLoading(false)
    setDoctorNetworkError('')
    setFilterAllSelectedDoctors(false)
  }

  function addDoctor() {
    setDoctorRows((current) => current.length >= 5 ? current : [...current, `doctor-${Date.now()}-${current.length}`])
  }

  function removeDoctor(slotId: string) {
    setFilterAllSelectedDoctors(false)
    setDoctorRows((current) => current.length > 1 ? current.filter((id) => id !== slotId) : current)
    setSelectedDoctors((current) => {
      const next = { ...current }
      delete next[slotId]
      return next
    })
  }

  function selectDoctor(slotId: string, doctor: DoctorSuggestion | null) {
    setFilterAllSelectedDoctors(false)
    setSelectedDoctors((current) => {
      const next = { ...current }
      if (doctor) next[slotId] = doctor
      else delete next[slotId]
      return next
    })
  }

  function changeDoctorZip(value: string) {
    setDoctorZip(value.replace(/\D/g, '').slice(0, 5))
    setSelectedDoctors({})
    setDoctorNetworkPayload(null)
    setFilterAllSelectedDoctors(false)
  }

  function changeDoctorRadius(value: string) {
    setDoctorRadius(value)
    setSelectedDoctors({})
    setDoctorNetworkPayload(null)
    setFilterAllSelectedDoctors(false)
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

      <section className="medicare-doctor-filter" aria-label="Doctor network filter">
        <div className="medicare-doctor-filter-heading">
          <div>
            <strong>Doctor Network Filter</strong>
            <span>Set the client’s ZIP code and search radius, then start typing a doctor’s first or last name. The list only shows matching Mississippi providers found inside that area.</span>
          </div>
          <button type="button" className="btn btn-secondary btn-small" onClick={addDoctor} disabled={doctorRows.length >= 5}>+ Add doctor</button>
        </div>

        <div className="medicare-doctor-location-controls">
          <label className="label">ZIP code
            <input
              className="input dashboard-field dashboard-field-doctor-location"
              type="text"
              inputMode="numeric"
              value={doctorZip}
              onChange={(event) => changeDoctorZip(event.target.value)}
              placeholder="Example: 38801"
              maxLength={5}
              autoComplete="postal-code"
            />
          </label>
          <label className="label">Area radius
            <select className="select dashboard-field dashboard-field-doctor-location" value={doctorRadius} onChange={(event) => changeDoctorRadius(event.target.value)}>
              <option value="5">5 miles</option>
              <option value="10">10 miles</option>
              <option value="25">25 miles</option>
              <option value="50">50 miles</option>
              <option value="100">100 miles</option>
            </select>
          </label>
        </div>

        <div className="medicare-doctor-inputs">
          {doctorRows.map((slotId, index) => (
            <DoctorAutocompleteRow
              key={slotId}
              slotId={slotId}
              index={index}
              zipCode={doctorZip}
              radius={doctorRadius}
              selected={selectedDoctors[slotId]}
              canRemove={doctorRows.length > 1}
              onSelect={selectDoctor}
              onRemove={removeDoctor}
            />
          ))}
        </div>

        {selectedDoctorEntries.length ? (
          <div className="medicare-doctor-selected-summary">
            <strong>{selectedDoctorEntries.length} doctor{selectedDoctorEntries.length === 1 ? '' : 's'} selected</strong>
            {selectedDoctorEntries.map(([slotId, doctor]) => (
              <span key={slotId}><b>{doctor.name}</b> — {doctor.address ? `${doctor.address}, ` : ''}{doctor.city}, MS {doctor.postal_code}</span>
            ))}
          </div>
        ) : null}

        <div className="medicare-doctor-network-status">
          <strong>Doctor search:</strong> CMS NPPES provides the doctor identity and practice locations. <strong>Plan match:</strong> the CRM now checks connected carrier directories live by NPI + selected office and saves verified results for reuse.
          {doctorNetworkLoading ? <span className="medicare-doctor-network-inline"> Checking selected doctors…</span> : null}
          {doctorNetworkError ? <span className="medicare-doctor-network-inline error"> {doctorNetworkError}</span> : null}
          {!doctorNetworkLoading && doctorNetworkPayload?.message ? <span className="medicare-doctor-network-inline"> {doctorNetworkPayload.message}</span> : null}
        </div>
      </section>

      <div className="medicare-plan-filter-note">
        <strong>Medicaid filtering:</strong> No Medicaid removes D-SNPs. When a Medicaid level is selected, D-SNPs are shown first. If public plan data does not publish that plan’s exact QMB/SLMB/QI/FBDE acceptance, the result is marked <em>Verify Medicaid eligibility</em> instead of guessing.
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
              {selectedDoctorEntries.length ? (
                <button
                  type="button"
                  className={`btn medicare-doctor-plan-filter-button${filterAllSelectedDoctors ? ' is-active' : ' btn-secondary'}`}
                  onClick={() => setFilterAllSelectedDoctors((current) => !current)}
                  aria-pressed={filterAllSelectedDoctors}
                  title={doctorNetworkLoading ? 'Doctor network verification is still loading. You can turn the filter on now.' : (doctorNetworkPayload?.message || 'Show only plans verified in-network for every selected doctor office.')}
                >
                  {filterAllSelectedDoctors ? 'SHOW ALL PLANS' : 'ONLY IN-NETWORK DOCTORS'}
                </button>
              ) : null}
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
            Select the <strong>Compare</strong> box on up to 4 plans. Supplemental dollar benefits are only displayed when an exact amount is stored for that plan.
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
                          <td key={plan.id}>{comparisonValue(plan[row.key] as string | null | undefined)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {displayedPlans.length === 0 ? (
            <div className="build-lookup-empty medicare-plan-empty">{filterAllSelectedDoctors ? 'No plans have verified in-network matches for every selected doctor at the selected office locations.' : 'No plans from that carrier match this county and Medicaid selection.'}</div>
          ) : (
            <div className="medicare-plan-results">
              {displayedPlans.map((plan) => {
                const selectedForCompare = selectedPlanIds.includes(plan.id)
                const hasExactSupplemental = Boolean(
                  plan.part_b_credit ||
                  plan.dental_annual_allowance ||
                  plan.vision_annual_allowance ||
                  plan.otc_allowance ||
                  plan.food_allowance
                )

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

                    {(() => {
                      const inNetworkDoctors = selectedDoctorEntries.flatMap(([slotId, doctor]) => {
                        const match = doctorNetworkPayload?.plans?.[plan.id]?.doctor_matches.find((item) => item.slot_id === slotId)
                        return match?.status === 'in_network' ? [{ slotId, doctor, match }] : []
                      })

                      if (!inNetworkDoctors.length) return null

                      return (
                        <div className="medicare-plan-doctor-match-strip">
                          <span className="medicare-plan-doctor-match-title">In-network doctors</span>
                          <div className="medicare-plan-doctor-match-list">
                            {inNetworkDoctors.map(({ slotId, doctor, match }) => {
                              const detail = match.message || `${doctor.address ? `${doctor.address}, ` : ''}${doctor.city}, MS ${doctor.postal_code}`
                              return (
                                <span className="medicare-plan-doctor-match in_network" key={slotId} title={detail}>
                                  <strong>{doctor.name}</strong>
                                  <small>In network · {doctor.city}</small>
                                  {match.verified_at ? <em>Checked {new Date(match.verified_at).toLocaleDateString()}</em> : null}
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })()}

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

                        <div className="medicare-plan-benefit-grid hospital-benefits">
                          <Benefit label="Inpatient hospital" value={plan.inpatient_hospital} wide />
                        </div>

                        {hasExactSupplemental ? (
                          <div className="medicare-plan-supplemental-section">
                            <div className="medicare-plan-supplemental-heading">Extra benefits</div>
                            <div className="medicare-plan-benefit-grid supplemental-benefits">
                              <ExactBenefit label="Part B credit" value={plan.part_b_credit} />
                              <ExactBenefit label="Dental / year" value={plan.dental_annual_allowance} />
                              <ExactBenefit label="Vision / year" value={plan.vision_annual_allowance} />
                              <ExactBenefit label="OTC amount / occurrence" value={plan.otc_allowance} />
                              <ExactBenefit label="Food card amount / occurrence" value={plan.food_allowance} />
                            </div>
                          </div>
                        ) : null}

                        <details className="medicare-plan-source-details">
                          <summary>Data source &amp; verification note</summary>
                          <p>{plan.source_note || 'Verify current CMS and carrier plan materials before enrollment.'}</p>
                          <p>Supplemental allowances are hidden unless an exact dollar amount is available. The frequency is shown with the amount when known, for example “$100 / quarter.”</p>
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
