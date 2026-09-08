'use client'

import { useEffect, useState } from 'react'

type Health = {
  generated_at: string
  counts: Record<string, number>
  jobs: Array<{ id: string; status: string; job_type: string; total_items: number; processed_items: number; succeeded_items: number; failed_items: number; error_message: string | null; created_at: string }>
  job_summary: { queued: number; running: number; failed: number }
  performance: Array<{ metric_name: string; device_class: string; samples: number; average: number; p95: number }>
  recommendations: Array<{ key: string; level: string; message: string }>
}

function metric(value: number, name: string) {
  if (name === 'CLS') return value.toFixed(3)
  return `${Math.round(value)} ms`
}

export default function SystemHealthClient() {
  const [health, setHealth] = useState<Health | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/system-health', { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to load system health.')
      setHealth(data as Health)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load system health.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  return (
    <section className="system-health">
      <div className="system-health-head"><div><h1>SYSTEM HEALTH</h1><p className="subtle">CRM performance, background work and growth indicators.</p></div><button type="button" className="btn btn-primary" onClick={() => void load()} disabled={loading}>{loading ? 'Checking…' : 'Refresh'}</button></div>
      {error ? <div className="notice notice-error">{error}</div> : null}
      {health ? (
        <>
          <div className="health-count-grid">
            {Object.entries(health.counts).map(([key, value]) => <div className="card health-count" key={key}><span>{key.replaceAll('_',' ')}</span><strong>{value.toLocaleString()}</strong></div>)}
          </div>

          <div className="card card-pad health-section">
            <h2>Background Jobs</h2>
            <div className="health-job-summary"><span>Queued <b>{health.job_summary.queued}</b></span><span>Running <b>{health.job_summary.running}</b></span><span>Failed <b>{health.job_summary.failed}</b></span></div>
            {!health.jobs.length ? <div className="subtle">No background jobs yet.</div> : <div className="health-job-list">{health.jobs.slice(0, 12).map((job) => <div key={job.id}><strong>{job.job_type}</strong><span>{job.status} · {job.processed_items}/{job.total_items} processed · {job.failed_items} failed</span>{job.error_message ? <small>{job.error_message}</small> : null}</div>)}</div>}
          </div>

          <div className="card card-pad health-section">
            <h2>Real Device Performance · last 7 days</h2>
            {!health.performance.length ? <div className="subtle">Performance samples will appear as the CRM is used on phones, tablets and computers.</div> : <div className="health-performance-list">{health.performance.map((row) => <div key={`${row.metric_name}-${row.device_class}`}><strong>{row.metric_name}</strong><span>{row.device_class} · {row.samples} samples</span><b>Avg {metric(row.average,row.metric_name)} · P95 {metric(row.p95,row.metric_name)}</b></div>)}</div>}
          </div>

          <div className="card card-pad health-section">
            <h2>Current Checks</h2>
            <div className="health-check-list">{health.recommendations.map((item) => <div className={item.level === 'ok' ? 'ok' : 'warn'} key={item.key}><b>{item.level === 'ok' ? '✓' : '!'}</b><span>{item.message}</span></div>)}</div>
          </div>
          <div className="subtle">Last checked {new Date(health.generated_at).toLocaleString()}</div>
        </>
      ) : null}
      <style jsx>{`
        .system-health{display:grid;gap:14px}.system-health-head{display:flex;align-items:end;justify-content:space-between;gap:12px;flex-wrap:wrap}.system-health-head h1{margin:0}.system-health-head p{margin:4px 0 0}.health-count-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.health-count{padding:12px;display:grid;gap:5px}.health-count span{text-transform:capitalize;font-size:.72rem;font-weight:850;color:#657585}.health-count strong{font-size:1.35rem;color:#273b4b}.health-section{display:grid;gap:12px}.health-section h2{margin:0}.health-job-summary{display:flex;gap:8px;flex-wrap:wrap}.health-job-summary span{padding:7px 9px;border:1px solid #dce4e8;border-radius:9px;background:#f7f9fa;font-size:.78rem}.health-job-list,.health-performance-list,.health-check-list{display:grid;gap:7px}.health-job-list>div,.health-performance-list>div{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 12px;padding:9px 10px;border:1px solid #e0e7ea;border-radius:9px}.health-job-list span,.health-performance-list span{font-size:.75rem;color:#667887}.health-job-list small{grid-column:1/-1;color:#9b4f4f}.health-performance-list b{font-size:.76rem;color:#3e5667}.health-check-list>div{display:flex;gap:8px;align-items:flex-start;padding:9px 10px;border-radius:9px}.health-check-list .ok{background:#eef7f1;color:#315c3b}.health-check-list .warn{background:#fff4e8;color:#81552d}@media(max-width:850px){.health-count-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.health-job-list>div,.health-performance-list>div{grid-template-columns:1fr}.health-performance-list b{justify-self:start}}@media(max-width:480px){.health-count-grid{grid-template-columns:1fr 1fr}}
      `}</style>
    </section>
  )
}
