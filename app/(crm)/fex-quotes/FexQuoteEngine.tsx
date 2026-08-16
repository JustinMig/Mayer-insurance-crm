'use client'

import { useMemo, useState } from 'react'

type Gender = 'male' | 'female'
type Tobacco = 'no' | 'yes'
type BenefitFilter = 'all' | 'level' | 'graded' | 'rop'
type PlanKey = 'immediate' | 'graded' | 'rop'
type RateRow = [number, number, number, number]

type PlanDefinition = {
  key: PlanKey
  name: string
  benefit: string
  description: string
  rates: Record<number, RateRow>
}

function parseRates(source: string) {
  const rows: Record<number, RateRow> = {}
  source.trim().split('\n').forEach((line) => {
    const [age, ntMale, ntFemale, tMale, tFemale] = line.split(',').map(Number)
    rows[age] = [ntMale, ntFemale, tMale, tFemale]
  })
  return rows
}

const IMMEDIATE = parseRates(`
50,32.96,27.30,43.12,32.55
51,34.90,29.36,45.03,33.62
52,36.67,30.58,47.09,35.34
53,39.14,32.21,49.42,37.29
54,40.94,33.74,51.61,38.73
55,42.49,35.28,53.82,40.94
56,44.18,36.42,56.05,42.23
57,45.32,37.70,58.29,44.20
58,47.64,38.77,61.08,45.91
59,49.50,40.17,63.35,47.70
60,50.47,40.48,65.82,49.01
61,53.38,42.85,70.04,51.46
62,56.09,44.50,73.13,54.08
63,58.71,46.44,76.01,56.85
64,61.80,48.50,79.64,59.78
65,64.89,50.47,83.43,62.57
66,69.24,53.59,88.51,65.88
67,73.78,56.34,93.22,69.33
68,78.70,59.45,98.88,72.10
69,83.12,62.52,104.55,77.12
70,86.53,65.61,108.72,79.02
71,92.03,69.53,115.15,83.20
72,97.83,73.65,121.93,87.61
73,104.40,78.84,129.60,92.61
74,111.76,83.69,137.51,97.75
75,119.74,89.87,147.55,104.29
76,128.75,95.83,157.59,112.49
77,138.02,101.29,168.10,120.00
78,150.28,108.15,180.87,127.85
79,161.92,116.60,191.58,139.06
80,174.07,126.18,203.53,150.62
81,187.87,135.75,216.30,164.14
82,202.91,146.26,229.56,179.51
83,217.02,158.11,246.08,195.69
84,232.78,170.98,266.64,214.76
85,248.49,185.66,289.69,236.13
`)

const GRADED = parseRates(`
50,40.10,31.60,60.54,39.42
51,42.35,33.24,63.59,41.70
52,44.61,34.88,66.64,43.99
53,47.16,36.73,70.09,46.58
54,49.72,38.58,73.54,49.16
55,52.27,40.43,76.99,51.76
56,54.51,42.11,80.07,54.62
57,56.86,43.88,83.32,57.63
58,59.33,45.73,86.73,60.79
59,61.91,47.68,90.30,64.11
60,63.91,49.18,93.06,66.67
61,67.32,51.75,97.77,71.04
62,71.08,54.58,102.96,75.86
63,74.96,57.49,108.31,80.83
64,79.08,60.58,113.99,86.11
65,83.43,63.86,120.00,91.67
66,89.84,68.27,127.56,97.27
67,96.82,73.08,135.81,103.39
68,104.25,78.19,144.57,109.89
69,112.25,83.70,154.02,115.36
70,116.03,86.30,158.49,120.21
71,123.89,91.71,167.77,127.72
72,133.90,97.82,178.25,134.86
73,144.20,104.83,190.28,143.78
74,155.02,113.30,204.35,152.18
75,166.09,120.77,217.59,164.03
76,179.53,129.78,237.11,174.29
77,196.73,140.60,255.76,180.79
78,215.27,154.50,274.12,193.50
79,234.33,167.38,295.71,207.22
80,254.20,182.31,313.12,224.54
81,269.86,197.76,316.15,238.85
82,283.87,213.21,320.54,258.06
83,296.64,227.63,325.48,278.28
84,307.97,241.02,336.06,301.39
85,312.35,248.49,359.73,328.83
`)

const ROP = parseRates(`
50,47.26,38.07,71.47,44.57
51,49.51,40.14,75.83,47.38
52,51.76,42.21,79.54,49.99
53,54.30,44.55,83.74,52.94
54,56.85,46.89,87.95,55.90
55,59.10,49.03,90.87,58.59
56,62.07,51.49,95.45,62.21
57,65.21,54.09,99.83,66.01
58,68.51,56.83,104.43,69.69
59,71.96,59.69,109.25,73.86
60,74.63,61.89,112.46,77.08
61,79.19,65.67,118.79,82.57
62,84.22,69.82,125.76,88.62
63,89.40,74.12,132.96,94.87
64,94.44,78.29,139.29,101.03
65,99.75,82.69,146.59,107.50
66,106.46,88.61,155.29,115.05
67,113.79,94.65,165.56,122.74
68,121.62,100.62,175.74,130.30
69,129.48,106.56,185.90,139.72
70,133.20,109.08,190.71,143.89
71,141.58,115.89,201.14,152.54
72,151.05,123.58,212.92,162.31
73,161.15,131.78,225.91,173.52
74,170.68,139.52,238.15,184.95
75,183.24,149.73,255.41,199.91
76,197.86,160.46,271.50,219.34
77,215.62,166.36,280.96,229.32
78,234.14,177.92,299.45,248.83
79,253.37,190.40,319.42,268.69
80,271.98,203.79,337.76,287.23
81,287.61,219.16,362.12,312.71
82,303.16,234.41,389.82,341.67
83,319.58,250.24,415.13,372.16
84,347.84,270.85,448.15,406.99
85,381.41,295.31,487.35,448.38
`)

const PLANS: PlanDefinition[] = [
  { key: 'immediate', name: 'Senior Choice Immediate Death Benefit', benefit: 'Level', description: '100% of the face amount is payable immediately for covered death.', rates: IMMEDIATE },
  { key: 'graded', name: 'Senior Choice Graded Death Benefit', benefit: 'Graded / Modified', description: '30% in year 1, 70% in year 2, and 100% in year 3 and later. Accidental death pays 100% in all years.', rates: GRADED },
  { key: 'rop', name: 'Senior Choice Return of Premium', benefit: 'Return of Premium', description: 'Return of premium plus 10% interest during the graded period, then 100% of face amount after the graded period.', rates: ROP }
]

const STATES = [
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['DC','District of Columbia'],['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming']
] as const

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const FACE_AMOUNTS = [2000,2500,3000,4000,5000,6000,7000,8000,9000,10000,11000,12000,13000,14000,15000,16000,17000,18000,19000,20000,25000,30000,35000]

function money(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

function ageLastBirthday(year: number, month: number, day: number) {
  const now = new Date()
  let age = now.getFullYear() - year
  const currentMonth = now.getMonth() + 1
  const currentDay = now.getDate()
  if (currentMonth < month || (currentMonth === month && currentDay < day)) age -= 1
  return age
}

function rateIndex(gender: Gender, tobacco: Tobacco) {
  if (tobacco === 'no') return gender === 'male' ? 0 : 1
  return gender === 'male' ? 2 : 3
}

function planMaximum(plan: PlanKey, age: number) {
  if (plan === 'immediate') return age <= 75 ? 35000 : 20000
  return 20000
}

function stateAgeEligible(plan: PlanKey, state: string, age: number) {
  if ((state === 'MO' || state === 'NJ') && plan !== 'immediate') {
    const maxAge = state === 'MO' ? 75 : 76
    return age <= maxAge
  }
  return true
}

export default function FexQuoteEngine() {
  const now = new Date()
  const [state, setState] = useState('MS')
  const [birthMonth, setBirthMonth] = useState(1)
  const [birthDay, setBirthDay] = useState(1)
  const [birthYear, setBirthYear] = useState(now.getFullYear() - 65)
  const [gender, setGender] = useState<Gender>('male')
  const [tobacco, setTobacco] = useState<Tobacco>('no')
  const [faceAmount, setFaceAmount] = useState(10000)
  const [benefit, setBenefit] = useState<BenefitFilter>('all')
  const [quoted, setQuoted] = useState(true)

  const age = ageLastBirthday(birthYear, birthMonth, birthDay)
  const maxFaceForFilter = benefit === 'graded' || benefit === 'rop' ? 20000 : age <= 75 ? 35000 : 20000
  const selectableAmounts = FACE_AMOUNTS.filter((amount) => amount <= maxFaceForFilter)

  const quotes = useMemo(() => {
    if (age < 50 || age > 85) return []
    const index = rateIndex(gender, tobacco)
    return PLANS
      .filter((plan) => benefit === 'all' || (benefit === 'level' && plan.key === 'immediate') || benefit === plan.key)
      .map((plan) => {
        const max = planMaximum(plan.key, age)
        const stateEligible = stateAgeEligible(plan.key, state, age)
        const row = plan.rates[age]
        const faceEligible = faceAmount >= 2500 && faceAmount <= max
        if (!row || !faceEligible || !stateEligible) {
          return { ...plan, available: false, max, stateEligible, premium: 0, annual: 0, rate: row?.[index] || 0 }
        }
        const rate = row[index]
        const annual = rate * (faceAmount / 1000) + 30
        return { ...plan, available: true, max, stateEligible, premium: annual * 0.088, annual, rate }
      })
  }, [age, gender, tobacco, faceAmount, benefit, state])

  function changeBenefit(value: BenefitFilter) {
    setBenefit(value)
    const benefitMax = value === 'graded' || value === 'rop' ? 20000 : age <= 75 ? 35000 : 20000
    if (faceAmount > benefitMax) setFaceAmount(benefitMax)
    setQuoted(false)
  }

  function getQuotes() {
    if (!selectableAmounts.includes(faceAmount)) setFaceAmount(selectableAmounts[selectableAmounts.length - 1] || 10000)
    setQuoted(true)
  }

  return (
    <div className="fq-wrap">
      <header className="fq-head">
        <div><span>FINAL EXPENSE LIFE INSURANCE</span><h1>FEX Quotes</h1><p>Fast carrier-rate lookup for final expense whole life.</p></div>
        <div className="fq-carrier">American Amicable · Senior Choice</div>
      </header>

      <section className="fq-panel">
        <div className="fq-grid">
          <label><span>State</span><select value={state} onChange={(e) => { setState(e.target.value); setQuoted(false) }}>{STATES.map(([abbr,name]) => <option key={abbr} value={abbr}>{name}</option>)}</select></label>

          <label className="fq-dob"><span>Birth Date</span><div className="fq-dob-row">
            <select aria-label="Birth month" value={birthMonth} onChange={(e) => { setBirthMonth(Number(e.target.value)); setQuoted(false) }}>{MONTHS.map((m,i)=><option key={m} value={i+1}>{m}</option>)}</select>
            <select aria-label="Birth day" value={birthDay} onChange={(e) => { setBirthDay(Number(e.target.value)); setQuoted(false) }}>{Array.from({length:31},(_,i)=>i+1).map(d=><option key={d}>{d}</option>)}</select>
            <select aria-label="Birth year" value={birthYear} onChange={(e) => { setBirthYear(Number(e.target.value)); setQuoted(false) }}>{Array.from({length:90},(_,i)=>now.getFullYear()-i).map(y=><option key={y}>{y}</option>)}</select>
          </div></label>

          <fieldset><legend>Gender</legend><div className="fq-toggle"><button type="button" className={gender==='male'?'on':''} onClick={()=>{setGender('male');setQuoted(false)}}>Male</button><button type="button" className={gender==='female'?'on':''} onClick={()=>{setGender('female');setQuoted(false)}}>Female</button></div></fieldset>

          <fieldset><legend>Tobacco</legend><div className="fq-toggle"><button type="button" className={tobacco==='no'?'on':''} onClick={()=>{setTobacco('no');setQuoted(false)}}>No</button><button type="button" className={tobacco==='yes'?'on':''} onClick={()=>{setTobacco('yes');setQuoted(false)}}>Yes</button></div></fieldset>

          <label><span>Amount</span><select value={faceAmount} onChange={(e)=>{setFaceAmount(Number(e.target.value));setQuoted(false)}}>{selectableAmounts.map(a=><option key={a} value={a}>{money(a).replace('.00','')}</option>)}</select></label>

          <label><span>Benefit</span><select value={benefit} onChange={(e)=>changeBenefit(e.target.value as BenefitFilter)}><option value="all">All Benefit Types</option><option value="level">Level</option><option value="graded">Graded / Modified</option><option value="rop">Return of Premium</option></select></label>
        </div>

        <div className="fq-submit-row"><div><b>Age {age}</b><span>{state} · {gender === 'male' ? 'Male' : 'Female'} · {tobacco === 'yes' ? 'Tobacco' : 'Non-Tobacco'} · {money(faceAmount)} coverage</span></div><button type="button" onClick={getQuotes}>GET QUOTES</button></div>
      </section>

      {age < 50 || age > 85 ? (
        <section className="fq-empty"><strong>Age not eligible for this carrier.</strong><p>American Amicable Senior Choice is issued at ages 50–85.</p></section>
      ) : quoted ? (
        <section className="fq-results">
          <div className="fq-results-head"><span>Company / Plan</span><span>Benefit</span><span>Coverage</span><span>Monthly Premium</span></div>
          {quotes.map((q)=><article key={q.key} className="fq-row">
            <div className="fq-plan"><b>American Amicable</b><strong>{q.name}</strong><small>{q.description}</small></div>
            <div data-label="Benefit"><b>{q.benefit}</b></div>
            <div data-label="Coverage"><b>{q.available ? money(faceAmount) : `Max ${money(q.max)}`}</b></div>
            <div className="fq-premium" data-label="Monthly Premium">{q.available ? <><strong>{money(q.premium)}</strong><small>${q.rate.toFixed(2)} / $1,000 + $30 annual fee</small></> : <><strong>Not Available</strong><small>{!q.stateEligible ? 'State age limit for this benefit' : faceAmount > q.max ? `Selected amount exceeds ${money(q.max)} maximum` : 'Not available for selection'}</small></>}</div>
          </article>)}
        </section>
      ) : (
        <section className="fq-empty"><strong>Ready to quote.</strong><p>Press GET QUOTES after changing the client information.</p></section>
      )}

      <section className="fq-foot"><b>Current carrier data</b><p>American Amicable Senior Choice rates are calculated from the carrier rate tables stored in this CRM. Additional carriers can be added as their official rate sheets are supplied. Final underwriting, product availability and state variations remain subject to the carrier.</p></section>

      <style jsx>{`
        .fq-wrap{max-width:1120px;margin:0 auto;display:grid;gap:18px}.fq-head{display:flex;justify-content:space-between;align-items:end;gap:16px;flex-wrap:wrap}.fq-head span{font-size:.72rem;font-weight:900;letter-spacing:.12em;color:#2563eb}.fq-head h1{margin:3px 0 2px;font-size:2rem}.fq-head p{margin:0;color:#64748b}.fq-carrier{border:1px solid #dbe3ee;border-radius:10px;padding:8px 11px;font-size:.82rem;font-weight:800;background:#fff}.fq-panel{background:linear-gradient(180deg,#182332,#101827);border-radius:16px;padding:18px;color:#fff;box-shadow:0 12px 30px #0f172a1a}.fq-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.fq-grid label,.fq-grid fieldset{display:grid;gap:6px;border:0;margin:0;padding:0}.fq-grid label>span,.fq-grid legend{font-size:.75rem;font-weight:900;text-transform:uppercase;letter-spacing:.06em;color:#cbd5e1}.fq-grid select{width:100%;min-height:44px;border:1px solid #475569;border-radius:8px;background:#fff;color:#0f172a;padding:0 10px;font-size:16px}.fq-dob-row{display:grid;grid-template-columns:1fr .8fr 1.25fr;gap:6px}.fq-toggle{display:grid;grid-template-columns:1fr 1fr;gap:6px}.fq-toggle button{min-height:44px;border:1px solid #475569;border-radius:8px;background:#263244;color:#e2e8f0;font-weight:800}.fq-toggle button.on{background:#fff;color:#0f172a;border-color:#fff}.fq-submit-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px;padding-top:16px;border-top:1px solid #334155}.fq-submit-row>div{display:grid;gap:2px}.fq-submit-row span{font-size:.82rem;color:#cbd5e1}.fq-submit-row button{border:0;border-radius:9px;background:#2563eb;color:#fff;font-weight:900;padding:13px 22px;min-height:46px}.fq-results{border:1px solid #dbe3ee;background:#fff;border-radius:14px;overflow:hidden}.fq-results-head,.fq-row{display:grid;grid-template-columns:2.1fr .9fr .8fr 1.05fr;gap:10px;align-items:center}.fq-results-head{padding:10px 14px;background:#eef2f7;font-size:.72rem;font-weight:900;text-transform:uppercase;color:#475569}.fq-row{padding:14px;border-top:1px solid #e5e7eb}.fq-plan{display:grid;gap:2px}.fq-plan>b{font-size:.72rem;text-transform:uppercase;color:#2563eb}.fq-plan>strong{font-size:.98rem}.fq-plan small,.fq-premium small{color:#64748b;line-height:1.35}.fq-premium{display:grid;gap:2px}.fq-premium>strong{font-size:1.22rem;color:#0f172a}.fq-empty,.fq-foot{border:1px solid #dbe3ee;background:#fff;border-radius:14px;padding:18px}.fq-empty p,.fq-foot p{margin:5px 0 0;color:#64748b;line-height:1.5}.fq-foot{font-size:.86rem}.fq-row [data-label]{min-width:0}
        @media(max-width:820px){.fq-grid{grid-template-columns:1fr 1fr}.fq-results-head{display:none}.fq-row{grid-template-columns:1fr 1fr}.fq-plan{grid-column:1/-1;padding-bottom:8px;border-bottom:1px solid #eef2f7}.fq-row [data-label]::before{content:attr(data-label);display:block;font-size:.68rem;font-weight:900;text-transform:uppercase;color:#94a3b8;margin-bottom:3px}}
        @media(max-width:560px){.fq-wrap{gap:12px}.fq-head h1{font-size:1.55rem}.fq-carrier{display:none}.fq-panel{padding:13px;border-radius:12px}.fq-grid{grid-template-columns:1fr}.fq-dob-row{grid-template-columns:1fr .75fr 1.15fr}.fq-submit-row{align-items:stretch;flex-direction:column}.fq-submit-row button{width:100%}.fq-results{border-radius:12px}.fq-row{grid-template-columns:1fr 1fr;padding:12px}.fq-premium>strong{font-size:1.12rem}.fq-plan small{font-size:.78rem}}
      `}</style>
    </div>
  )
}
