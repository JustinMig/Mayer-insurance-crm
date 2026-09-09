'use client'

import { useEffect, useState } from 'react'

type PeriodSummary = {
  total: number
  initial: number
  switches: number
  t65: number
  payout: number
}

type AgentOption = {
  id: string
  full_name: string
}

type CommissionSummary = {
  agents: AgentOption[]
  selected_agent: AgentOption
  life: {
    month_name: string
    year: number
    monthly_premium: number
    yearly_total: number
  }
  medicare: {
    contract_year: number
    rates: {
      initial: number
      switch: number
      renewal_monthly_equivalent: number
    }
    current_book_count: number
    monthly_renewal_equivalent: number
    annual_renewal_value: number
    periods: {
      aep: PeriodSummary
      oep: PeriodSummary
      sep: PeriodSummary
      t65: PeriodSummary
    }
  }
}

type ViewKey = 'life' | 'medicare'

function money(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(amount || 0))
}

export default function CommissionQuickView() {
  const [view, setView] = useState<ViewKey>('life')
  const [data, setData] = useState<CommissionSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load(agentId = '') {
    setLoading(true)
    setError('')
    try {
      const query = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : ''
      const response = await fetch(`/api/dashboard/commission-summary${query}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(String(payload.error || 'Unable to load commission data.'))
      setData(payload as CommissionSummary)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load commission data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <section className="commission-quick-view">
      {data && data.agents.length > 1 ? (
        <div className="commission-agent-picker">
          <span>Agent</span>
          <select
            value={data.selected_agent?.id || ''}
            onChange={(event) => load(event.target.value)}
            aria-label="Commission agent"
            disabled={loading}
          >
            {data.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}
          </select>
        </div>
      ) : null}

      <div className="commission-type-picker" role="tablist" aria-label="Commission type">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'life'}
          className={view === 'life' ? 'active' : ''}
          onClick={() => setView('life')}
        >
          <span className="commission-type-icon">$</span>
          <span><strong>Life Insurance</strong><small>Premium production</small></span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'medicare'}
          className={view === 'medicare' ? 'active' : ''}
          onClick={() => setView('medicare')}
        >
          <span className="commission-type-icon">M</span>
          <span><strong>Medicare</strong><small>Commission estimates</small></span>
        </button>
      </div>

      {loading ? <div className="commission-quick-state">Loading current commission data…</div> : null}
      {!loading && error ? <div className="commission-quick-state error">{error}</div> : null}

      {!loading && !error && data && view === 'life' ? (
        <div className="commission-life-panel" role="tabpanel">
          <div className="commission-panel-head">
            <div><span>{data.selected_agent?.full_name || 'Agent'} · Life Insurance</span><h3>Premium Production</h3></div>
            <b>{data.life.year}</b>
          </div>
          <div className="commission-life-grid">
            <article>
              <span>Monthly Premium · {data.life.month_name}</span>
              <strong>{money(data.life.monthly_premium)}</strong>
            </article>
            <article>
              <span>Yearly Total · {data.life.year}</span>
              <strong>{money(data.life.yearly_total)}</strong>
            </article>
          </div>
          <p className="commission-note">Live premium-production totals from the CRM.</p>
        </div>
      ) : null}

      {!loading && !error && data && view === 'medicare' ? (
        <div className="commission-medicare-panel" role="tabpanel">
          <div className="commission-panel-head">
            <div><span>{data.selected_agent?.full_name || 'Agent'} · Medicare</span><h3>Commission Estimates</h3></div>
            <b>{data.medicare.contract_year}</b>
          </div>

          <div className="commission-rate-row">
            <article><span>New / T65 Initial</span><strong>{money(data.medicare.rates.initial)}</strong></article>
            <article><span>MA → MA Switch</span><strong>{money(data.medicare.rates.switch)}</strong></article>
            <article><span>Renewal Monthly Eq.</span><strong>{money(data.medicare.rates.renewal_monthly_equivalent)}</strong></article>
          </div>

          <div className="commission-book-row">
            <article><span>Current Medicare Book</span><strong>{data.medicare.current_book_count} clients</strong></article>
            <article><span>Monthly Renewal Equivalent</span><strong>{money(data.medicare.monthly_renewal_equivalent)}</strong></article>
            <article><span>Annual Renewal Value</span><strong>{money(data.medicare.annual_renewal_value)}</strong></article>
          </div>

          <div className="commission-period-grid">
            <PeriodCard title="AEP" subtitle={`January ${data.medicare.contract_year}`} summary={data.medicare.periods.aep} totalLabel="Projected January" />
            <PeriodCard title="OEP" subtitle={String(data.medicare.contract_year)} summary={data.medicare.periods.oep} totalLabel="Prorated Est." />
            <PeriodCard title="SEP" subtitle={String(data.medicare.contract_year)} summary={data.medicare.periods.sep} totalLabel="Prorated Est." />
            <PeriodCard title="T65 / IEP" subtitle={String(data.medicare.contract_year)} summary={data.medicare.periods.t65} totalLabel="Prorated Est." t65 />
          </div>
          <p className="commission-note">CMS-maximum commission estimates based on the selected agent's CRM production. Actual carrier compensation can differ.</p>
        </div>
      ) : null}

      <style jsx>{`
        .commission-quick-view{display:grid;gap:14px;max-width:880px;margin:0 auto}
        .commission-agent-picker{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:8px 10px;border:1px solid #d6e0e7;border-radius:12px;background:#fff}.commission-agent-picker span{font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;color:#6b7d8c;font-weight:900}.commission-agent-picker select{min-height:38px;min-width:180px;border:1px solid #cbd7e0;border-radius:9px;background:#f8fafc;color:#233d52;padding:6px 10px;font-weight:800}
        .commission-type-picker{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .commission-type-picker button{min-height:70px;border:1px solid #d6e0e7;border-radius:14px;background:#fff;padding:10px 12px;display:flex;align-items:center;gap:10px;text-align:left;color:#3f5162;font:inherit;cursor:pointer;box-shadow:0 2px 8px rgba(15,23,42,.04)}
        .commission-type-picker button.active{border-color:#7696ad;background:#edf4f8;box-shadow:0 4px 14px rgba(24,50,74,.12)}
        .commission-type-picker button>span:last-child{display:grid;gap:2px}.commission-type-picker strong{font-size:.92rem;color:#19384f}.commission-type-picker small{font-size:.68rem;color:#718191;font-weight:700}
        .commission-type-icon{width:38px;height:38px;border-radius:11px;background:#18324a;color:#fff;display:grid;place-items:center;font-size:1rem;font-weight:900;flex:none}
        .commission-quick-state{padding:36px 16px;text-align:center;border:1px solid #dbe4ea;border-radius:14px;background:#fff;color:#64748b;font-weight:800}.commission-quick-state.error{color:#8c4141;background:#fff6f6;border-color:#eccdcd}
        .commission-life-panel,.commission-medicare-panel{display:grid;gap:12px;padding:15px;border:1px solid #d6e0e7;border-radius:16px;background:#fff}
        .commission-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.commission-panel-head span{font-size:.65rem;text-transform:uppercase;letter-spacing:.06em;color:#6c8090;font-weight:900}.commission-panel-head h3{margin:2px 0 0;color:#18324a;font-size:1.1rem}.commission-panel-head>b{background:#18324a;color:#fff;border-radius:999px;padding:7px 11px;font-size:.72rem}
        .commission-life-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.commission-life-grid article{padding:18px;border-radius:13px;background:#18324a;color:#fff;display:grid;gap:7px}.commission-life-grid span{font-size:.7rem;font-weight:900;color:#dce8f1;text-transform:uppercase;letter-spacing:.03em}.commission-life-grid strong{font-size:1.55rem;color:#fff}
        .commission-rate-row,.commission-book-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.commission-rate-row article,.commission-book-row article{padding:11px;border-radius:11px;border:1px solid #dce5eb;background:#f8fbfd;display:grid;gap:4px}.commission-rate-row span,.commission-book-row span{font-size:.65rem;color:#6b7d8c;font-weight:800}.commission-rate-row strong,.commission-book-row strong{color:#1c4059;font-size:.96rem}
        .commission-book-row{padding:9px;border-radius:13px;background:#18324a}.commission-book-row article{background:transparent;border:0;padding:5px 7px}.commission-book-row span{color:#d8e6f1}.commission-book-row strong{color:#fff}
        .commission-period-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.commission-note{margin:0;color:#788897;font-size:.65rem;line-height:1.45}
        @media(max-width:620px){
          .commission-quick-view{gap:10px}.commission-agent-picker{justify-content:stretch}.commission-agent-picker select{min-width:0;flex:1}.commission-type-picker{gap:7px}.commission-type-picker button{min-height:62px;padding:8px}.commission-type-icon{width:34px;height:34px}
          .commission-life-panel,.commission-medicare-panel{padding:11px}.commission-life-grid{gap:7px}.commission-life-grid article{padding:13px 10px}.commission-life-grid strong{font-size:1.2rem}.commission-life-grid span{font-size:.58rem}
          .commission-rate-row,.commission-book-row{grid-template-columns:1fr 1fr 1fr;gap:5px}.commission-rate-row article,.commission-book-row article{padding:8px 6px}.commission-rate-row span,.commission-book-row span{font-size:.56rem}.commission-rate-row strong,.commission-book-row strong{font-size:.78rem}
          .commission-period-grid{gap:6px}
        }
      `}</style>
    </section>
  )
}

function PeriodCard({ title, subtitle, summary, totalLabel, t65 = false }: { title: string; subtitle: string; summary: PeriodSummary; totalLabel: string; t65?: boolean }) {
  return (
    <article className="commission-period-card">
      <header><strong>{title}</strong><span>{subtitle}</span></header>
      <div><span>{t65 ? 'T65 Clients' : 'New / T65'}</span><b>{t65 ? summary.t65 : summary.initial}</b></div>
      {!t65 ? <div><span>Switches</span><b>{summary.switches}</b></div> : null}
      <footer><span>{totalLabel}</span><strong>{money(summary.payout)}</strong></footer>
      <style jsx>{`
        .commission-period-card{border:1px solid #d8e3eb;border-radius:11px;background:#f9fbfc;padding:10px;display:grid;gap:6px}.commission-period-card header,.commission-period-card div,.commission-period-card footer{display:flex;align-items:center;justify-content:space-between;gap:8px}.commission-period-card header{border-bottom:1px solid #e6edf2;padding-bottom:6px}.commission-period-card header strong{color:#244b65;font-size:.8rem}.commission-period-card header span,.commission-period-card div span,.commission-period-card footer span{font-size:.62rem;color:#728494;font-weight:800}.commission-period-card div b{font-size:.75rem;color:#2f4657}.commission-period-card footer{border-top:1px solid #e6edf2;padding-top:6px}.commission-period-card footer strong{font-size:.86rem;color:#163f5b}
        @media(max-width:620px){.commission-period-card{padding:8px 7px}.commission-period-card header strong{font-size:.7rem}.commission-period-card header span,.commission-period-card div span,.commission-period-card footer span{font-size:.54rem}.commission-period-card footer strong{font-size:.72rem}}
      `}</style>
    </article>
  )
}
