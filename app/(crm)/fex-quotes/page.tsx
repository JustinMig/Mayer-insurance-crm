'use client'

import { useMemo, useState } from 'react'

type Gender = 'male' | 'female'
type Tobacco = 'no' | 'yes'
type Mode = 'monthly' | 'quarterly' | 'semiannual' | 'annual'
type PlanKey = 'immediate' | 'graded' | 'rop'
type RateRow = [number, number, number, number]

type PlanDefinition = {
  key: PlanKey
  name: string
  shortName: string
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
  { key: 'immediate', name: 'Senior Choice Immediate Death Benefit', shortName: 'Immediate', description: '100% of face amount paid immediately for covered death.', rates: IMMEDIATE },
  { key: 'graded', name: 'Senior Choice Graded Death Benefit', shortName: 'Graded', description: '30% year 1, 70% year 2, 100% year 3 and later; accidental death pays 100% all years.', rates: GRADED },
  { key: 'rop', name: 'Senior Choice Return of Premium', shortName: 'Return of Premium', description: 'Return of premium plus 10% interest during the graded period; 100% after the graded period.', rates: ROP }
]

const MODE_FACTORS: Record<Mode, number> = { monthly: 0.088, quarterly: 0.262, semiannual: 0.519, annual: 1 }
const MODE_LABELS: Record<Mode, string> = { monthly: 'Monthly EFT', quarterly: 'Quarterly', semiannual: 'Semi-Annual', annual: 'Annual' }

function money(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

function rateIndex(gender: Gender, tobacco: Tobacco) {
  if (tobacco === 'no') return gender === 'male' ? 0 : 1
  return gender === 'male' ? 2 : 3
}

function planMaximum(plan: PlanKey, age: number) {
  if (plan === 'immediate') return age <= 75 ? 35000 : 20000
  return 20000
}

export default function FexQuotesPage() {
  const [age, setAge] = useState(65)
  const [gender, setGender] = useState<Gender>('male')
  const [tobacco, setTobacco] = useState<Tobacco>('no')
  const [faceAmount, setFaceAmount] = useState(10000)
  const [mode, setMode] = useState<Mode>('monthly')

  const quotes = useMemo(() => {
    const index = rateIndex(gender, tobacco)
    return PLANS.map((plan) => {
      const row = plan.rates[age]
      const max = planMaximum(plan.key, age)
      const validFace = faceAmount >= 2500 && faceAmount <= max
      if (!row || !validFace) return { ...plan, available: false, max, rate: row?.[index] || 0, annual: 0, premium: 0 }
      const rate = row[index]
      const annual = (rate * (faceAmount / 1000)) + 30
      const premium = annual * MODE_FACTORS[mode]
      return { ...plan, available: true, max, rate, annual, premium }
    })
  }, [age, gender, tobacco, faceAmount, mode])

  return (
    <div className="fex-page">
      <div className="fex-heading">
        <div>
          <span className="fex-kicker">FINAL EXPENSE</span>
          <h1>FEX Quotes</h1>
          <p>American Amicable Senior Choice · Ages 50–85</p>
        </div>
        <div className="fex-source">Carrier rate sheet calculator</div>
      </div>

      <section className="fex-input-card">
        <div className="fex-fields">
          <label><span>Age</span><select value={age} onChange={(e) => setAge(Number(e.target.value))}>{Array.from({ length: 36 }, (_, i) => 50 + i).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label><span>Gender</span><select value={gender} onChange={(e) => setGender(e.target.value as Gender)}><option value="male">Male</option><option value="female">Female</option></select></label>
          <label><span>Smoker / Tobacco</span><select value={tobacco} onChange={(e) => setTobacco(e.target.value as Tobacco)}><option value="no">No</option><option value="yes">Yes</option></select></label>
          <label><span>Face Amount</span><div className="fex-money-input"><b>$</b><input type="number" inputMode="numeric" min={2500} max={35000} step={500} value={faceAmount} onChange={(e) => setFaceAmount(Math.max(0, Number(e.target.value || 0)))} /></div></label>
          <label><span>Payment Mode</span><select value={mode} onChange={(e) => setMode(e.target.value as Mode)}><option value="monthly">Monthly EFT</option><option value="quarterly">Quarterly</option><option value="semiannual">Semi-Annual</option><option value="annual">Annual</option></select></label>
        </div>
        <div className="fex-summary-line"><strong>{age} · {gender === 'male' ? 'Male' : 'Female'} · {tobacco === 'yes' ? 'Tobacco' : 'Non-Tobacco'} · {money(faceAmount)} face amount</strong><span>Includes the $30 annual policy fee.</span></div>
      </section>

      <section className="fex-results">
        {quotes.map((quote) => (
          <article className={`fex-result ${quote.available ? '' : 'fex-unavailable'}`} key={quote.key}>
            <div className="fex-result-top">
              <div><span>AMERICAN AMICABLE</span><h2>{quote.shortName}</h2><p>{quote.description}</p></div>
              <div className="fex-price">{quote.available ? <><strong>{money(quote.premium)}</strong><span>{MODE_LABELS[mode]}</span></> : <><strong>Unavailable</strong><span>Maximum face amount {money(quote.max)}</span></>}</div>
            </div>
            {quote.available && <div className="fex-detail-row"><div><span>Face Amount</span><strong>{money(faceAmount)}</strong></div><div><span>Rate / $1,000</span><strong>{money(quote.rate)}</strong></div><div><span>Annual Premium</span><strong>{money(quote.annual)}</strong></div><div><span>Maximum Face</span><strong>{money(quote.max)}</strong></div></div>}
          </article>
        ))}
      </section>

      <section className="fex-notes">
        <strong>Senior Choice limits</strong>
        <p>Minimum death benefit is $2,500. Immediate Death Benefit maximum is $35,000 for ages 50–75 and $20,000 for ages 76–85. Graded and Return of Premium maximums are $20,000 for ages 50–85. Issue age is based on age last birthday.</p>
        <p>This tool calculates published base premiums only. Product availability, underwriting eligibility, state variations, riders, and final carrier approval still apply.</p>
      </section>

      <style jsx>{`
        .fex-page{display:grid;gap:18px;max-width:1180px;margin:0 auto}.fex-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}.fex-kicker{font-size:.72rem;font-weight:900;letter-spacing:.12em;color:#2563eb}.fex-heading h1{margin:3px 0 2px;font-size:2rem;color:#0f172a}.fex-heading p{margin:0;color:#64748b}.fex-source{font-size:.78rem;font-weight:800;color:#475569;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:999px;padding:7px 11px}.fex-input-card,.fex-notes{background:#fff;border:1px solid #dbe3ec;border-radius:16px;padding:18px;box-shadow:0 8px 24px rgba(15,23,42,.05)}.fex-fields{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.fex-fields label{display:grid;gap:6px}.fex-fields label>span{font-size:.72rem;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:.04em}.fex-fields select,.fex-fields input{width:100%;min-height:44px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#0f172a;padding:9px 11px;font:inherit;font-size:.92rem;outline:none}.fex-fields select:focus,.fex-fields input:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.10)}.fex-money-input{display:flex;align-items:center;border:1px solid #cbd5e1;border-radius:10px;background:#fff;padding-left:11px}.fex-money-input:focus-within{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.10)}.fex-money-input b{color:#64748b}.fex-money-input input{border:0;box-shadow:none!important;padding-left:5px}.fex-summary-line{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:14px;padding-top:13px;border-top:1px solid #e2e8f0;font-size:.8rem}.fex-summary-line strong{color:#1e293b}.fex-summary-line span{color:#64748b}.fex-results{display:grid;gap:12px}.fex-result{background:#fff;border:1px solid #dbe3ec;border-left:5px solid #2563eb;border-radius:14px;padding:16px 18px;box-shadow:0 5px 18px rgba(15,23,42,.04)}.fex-result:nth-child(2){border-left-color:#7c3aed}.fex-result:nth-child(3){border-left-color:#0891b2}.fex-result-top{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.fex-result-top>div:first-child{min-width:0}.fex-result-top>div:first-child>span{font-size:.67rem;font-weight:900;color:#64748b;letter-spacing:.08em}.fex-result h2{margin:3px 0 4px;color:#0f172a;font-size:1.15rem}.fex-result p{margin:0;color:#64748b;font-size:.8rem;line-height:1.4}.fex-price{text-align:right;flex:0 0 auto}.fex-price strong{display:block;color:#0f172a;font-size:1.7rem;line-height:1}.fex-price span{display:block;margin-top:5px;color:#64748b;font-size:.72rem;font-weight:800}.fex-detail-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin-top:14px;border-top:1px solid #e2e8f0}.fex-detail-row>div{padding:11px 12px 0 0}.fex-detail-row span{display:block;color:#64748b;font-size:.67rem;font-weight:800;text-transform:uppercase}.fex-detail-row strong{display:block;color:#1e293b;font-size:.9rem;margin-top:2px}.fex-unavailable{opacity:.7;border-left-color:#94a3b8!important}.fex-notes{font-size:.78rem;color:#64748b;line-height:1.5}.fex-notes strong{color:#334155}.fex-notes p{margin:6px 0 0}
        @media(max-width:900px){.fex-fields{grid-template-columns:repeat(2,minmax(0,1fr))}.fex-fields label:last-child{grid-column:span 2}.fex-detail-row{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:560px){.fex-page{gap:12px}.fex-heading h1{font-size:1.55rem}.fex-input-card,.fex-notes{padding:14px;border-radius:13px}.fex-fields{grid-template-columns:1fr 1fr;gap:9px}.fex-fields label:nth-child(4),.fex-fields label:last-child{grid-column:span 2}.fex-fields select,.fex-fields input{min-height:46px}.fex-result{padding:14px}.fex-result-top{display:grid;gap:10px}.fex-price{text-align:left;display:flex;align-items:baseline;gap:8px}.fex-price strong{font-size:1.55rem}.fex-detail-row{grid-template-columns:1fr 1fr}.fex-summary-line{display:grid}.fex-source{display:none}}
      `}</style>
    </div>
  )
}
