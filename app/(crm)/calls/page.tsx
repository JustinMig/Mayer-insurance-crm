import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCrmSession } from '@/lib/crm-session'
import { isRingCentralConfigured } from '@/lib/ringcentral'
import CallsSyncButton from './CallsSyncButton'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const JUSTIN_USER_ID = '9c9b6c8a-add4-475d-bda5-c27169f117a1'

type CallRow = {
  id: string
  client_id: string | null
  direction: string
  result: string | null
  started_at: string
  duration_seconds: number | null
  contact_phone: string | null
  from_phone: string | null
  to_phone: string | null
  recording_id: string | null
}

type ClientRow = {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
}

function isJustin(userId: string, fullName?: string | null) {
  return userId === JUSTIN_USER_ID && String(fullName || '').trim().toLowerCase() === 'justin mayer'
}

function formatPhone(value?: string | null) {
  const digits = String(value || '').replace(/\D/g, '').slice(-10)
  if (digits.length !== 10) return value || 'Unknown number'
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

function formatDuration(seconds?: number | null) {
  const total = Math.max(0, Number(seconds || 0))
  const minutes = Math.floor(total / 60)
  const remainder = total % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  }).format(date)
}

function isMissed(result?: string | null) {
  const value = String(result || '').toLowerCase()
  return ['missed', 'no answer', 'busy', 'rejected', 'voicemail'].some((term) => value.includes(term))
}

function clientName(client?: ClientRow) {
  if (!client) return 'Unknown caller'
  const name = `${client.first_name || ''} ${client.last_name || ''}`.trim()
  return name || 'Client'
}

export default async function CallsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, userId, profile } = await getCrmSession()
  if (!profile?.agency_id || !isJustin(userId, profile.full_name)) redirect('/dashboard')

  const params = searchParams ? await searchParams : {}
  const filter = String(Array.isArray(params.filter) ? params.filter[0] : params.filter || 'all').toLowerCase()
  const query = String(Array.isArray(params.q) ? params.q[0] : params.q || '').trim().toLowerCase()

  const { data: callData, error: callError } = await supabase
    .from('ringcentral_calls')
    .select('id,client_id,direction,result,started_at,duration_seconds,contact_phone,from_phone,to_phone,recording_id')
    .eq('agency_id', profile.agency_id)
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(250)

  if (callError) throw new Error(`Unable to load RingCentral calls: ${callError.message}`)

  const calls = (callData || []) as CallRow[]
  const clientIds = Array.from(new Set(calls.map((call) => call.client_id).filter(Boolean))) as string[]
  const clientMap = new Map<string, ClientRow>()

  if (clientIds.length) {
    const { data: clients } = await supabase
      .from('clients')
      .select('id,first_name,last_name,phone')
      .eq('agency_id', profile.agency_id)
      .in('id', clientIds)
    for (const client of (clients || []) as ClientRow[]) clientMap.set(client.id, client)
  }

  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const totalToday = calls.filter((call) => String(call.started_at || '').slice(0, 10) === todayKey).length
  const missedCount = calls.filter((call) => isMissed(call.result)).length
  const recordingCount = calls.filter((call) => Boolean(call.recording_id)).length
  const unknownCount = calls.filter((call) => !call.client_id).length

  const filteredCalls = calls.filter((call) => {
    if (filter === 'missed' && !isMissed(call.result)) return false
    if (filter === 'recordings' && !call.recording_id) return false
    if (filter === 'unknown' && call.client_id) return false
    if (filter === 'inbound' && call.direction !== 'Inbound') return false
    if (filter === 'outbound' && call.direction !== 'Outbound') return false

    if (!query) return true
    const client = call.client_id ? clientMap.get(call.client_id) : undefined
    const haystack = [
      clientName(client),
      call.contact_phone,
      call.from_phone,
      call.to_phone,
      call.direction,
      call.result
    ].join(' ').toLowerCase()
    return haystack.includes(query)
  })

  const configured = isRingCentralConfigured()
  const filters = [
    ['all', 'All Calls'],
    ['missed', 'Missed'],
    ['recordings', 'Recordings'],
    ['unknown', 'Unknown'],
    ['inbound', 'Inbound'],
    ['outbound', 'Outbound']
  ] as const

  return (
    <>
      <div className="calls-page-heading">
        <div>
          <h1>Calls</h1>
          <p className="subtle">Justin's RingCentral call center. Sync recent calls, identify clients, review missed calls, and play recordings.</p>
        </div>
        <CallsSyncButton configured={configured} />
      </div>

      <section className="calls-summary-grid">
        <div className="card card-pad calls-summary-card"><span>Calls Today</span><strong>{totalToday}</strong></div>
        <div className="card card-pad calls-summary-card"><span>Missed Calls</span><strong>{missedCount}</strong></div>
        <div className="card card-pad calls-summary-card"><span>Recordings</span><strong>{recordingCount}</strong></div>
        <div className="card card-pad calls-summary-card"><span>Unknown Callers</span><strong>{unknownCount}</strong></div>
      </section>

      <section className="card card-pad calls-toolbar">
        <form method="get" className="calls-search-form">
          <input type="search" name="q" defaultValue={query} placeholder="Search client or phone number" aria-label="Search calls" />
          {filter !== 'all' ? <input type="hidden" name="filter" value={filter} /> : null}
          <button className="btn btn-secondary" type="submit">Search</button>
          {query ? <Link className="btn btn-secondary" href={`/calls${filter !== 'all' ? `?filter=${encodeURIComponent(filter)}` : ''}`}>Clear</Link> : null}
        </form>
        <div className="calls-filter-row" aria-label="Call filters">
          {filters.map(([value, label]) => (
            <Link
              key={value}
              className={`calls-filter-chip ${filter === value ? 'active' : ''}`}
              href={`/calls?filter=${value}${query ? `&q=${encodeURIComponent(query)}` : ''}`}
            >
              {label}
            </Link>
          ))}
        </div>
      </section>

      {!configured ? (
        <div className="notice" style={{ marginTop: 14 }}>
          RingCentral credentials are not available to this deployment yet. Once the production deployment loads the three RingCentral environment variables, the Sync RingCentral button will activate.
        </div>
      ) : null}

      <section className="calls-list" style={{ marginTop: 14 }}>
        {!filteredCalls.length ? (
          <div className="card card-pad"><p className="subtle" style={{ margin: 0 }}>No calls match this view yet. Use Sync RingCentral to pull Justin's recent call history.</p></div>
        ) : filteredCalls.map((call) => {
          const client = call.client_id ? clientMap.get(call.client_id) : undefined
          const phone = call.contact_phone || (call.direction === 'Inbound' ? call.from_phone : call.to_phone)
          const missed = isMissed(call.result)
          return (
            <article className={`card card-pad calls-row ${missed ? 'missed' : ''}`} key={call.id}>
              <div className="calls-row-main">
                <div className="calls-direction-icon" aria-hidden="true">{call.direction === 'Inbound' ? '↙' : '↗'}</div>
                <div className="calls-row-copy">
                  <div className="calls-row-title">
                    <strong>{clientName(client)}</strong>
                    <span className={`calls-status-badge ${missed ? 'missed' : ''}`}>{call.result || call.direction}</span>
                  </div>
                  <div className="calls-row-meta">
                    <span>{call.direction}</span>
                    <span>{formatPhone(phone)}</span>
                    <span>{formatDuration(call.duration_seconds)}</span>
                    <span>{formatDateTime(call.started_at)}</span>
                  </div>
                </div>
              </div>
              <div className="calls-row-actions">
                {client ? <Link className="btn btn-secondary" href={`/clients/${client.id}`}>Open Client</Link> : <span className="calls-unknown-label">Not matched to a client</span>}
                {call.recording_id ? (
                  <audio className="calls-recording-player" controls preload="none" src={`/api/ringcentral/recordings/${encodeURIComponent(call.recording_id)}`}>
                    Your browser does not support audio playback.
                  </audio>
                ) : null}
              </div>
            </article>
          )
        })}
      </section>

      <style>{`
        .calls-page-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex-wrap:wrap}.calls-page-heading h1{margin-bottom:4px}.ringcentral-calls-sync{display:grid;justify-items:end;gap:7px}.ringcentral-calls-sync-message{max-width:520px;padding:8px 10px;border-radius:9px;background:#eef6f1;color:#315b43;font-size:.78rem;font-weight:800;text-align:right}.calls-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:18px}.calls-summary-card{display:grid;gap:5px}.calls-summary-card span{font-size:.74rem;font-weight:900;text-transform:uppercase;letter-spacing:.04em;color:#6c7a86}.calls-summary-card strong{font-size:1.75rem;color:#18324a}.calls-toolbar{margin-top:14px;display:grid;gap:12px}.calls-search-form{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.calls-search-form input[type=search]{flex:1;min-width:220px;min-height:42px;border:1px solid #cbd5e1;border-radius:10px;padding:9px 11px;background:#fff}.calls-filter-row{display:flex;gap:7px;flex-wrap:wrap}.calls-filter-chip{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:6px 10px;border:1px solid #cbd5e1;border-radius:999px;background:#f7fafc;color:#425568;font-size:.72rem;font-weight:900;text-decoration:none}.calls-filter-chip.active{background:#18324a;border-color:#18324a;color:#fff}.calls-list{display:grid;gap:10px}.calls-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(250px,420px);gap:16px;align-items:center;border-left:4px solid #6f8799}.calls-row.missed{border-left-color:#a65b5b}.calls-row-main{display:flex;align-items:center;gap:12px;min-width:0}.calls-direction-icon{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#e8f4fb;color:#075f91;font-size:1.15rem;font-weight:900;flex:0 0 auto}.calls-row-copy{min-width:0}.calls-row-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.calls-row-title strong{font-size:.98rem;color:#243746}.calls-status-badge{display:inline-flex;padding:3px 7px;border-radius:999px;background:#eef3f6;color:#516273;font-size:.64rem;font-weight:900}.calls-status-badge.missed{background:#f7e9e9;color:#8b4545}.calls-row-meta{display:flex;gap:9px;flex-wrap:wrap;margin-top:6px;color:#6b7b8b;font-size:.76rem;font-weight:750}.calls-row-meta span+span{padding-left:9px;border-left:1px solid #d9e1e7}.calls-row-actions{display:grid;justify-items:end;gap:8px}.calls-recording-player{width:100%;height:36px}.calls-unknown-label{font-size:.73rem;font-weight:850;color:#8a6454;background:#f6eee9;border-radius:8px;padding:6px 8px}@media(max-width:900px){.calls-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.calls-row{grid-template-columns:1fr}.calls-row-actions{justify-items:stretch}.calls-row-actions .btn{justify-self:start}.ringcentral-calls-sync{justify-items:start}.ringcentral-calls-sync-message{text-align:left}}@media(max-width:560px){.calls-summary-grid{grid-template-columns:1fr 1fr;gap:8px}.calls-summary-card{padding:12px!important}.calls-summary-card strong{font-size:1.4rem}.calls-search-form{display:grid;grid-template-columns:1fr auto}.calls-search-form input[type=search]{min-width:0}.calls-filter-row{gap:6px}.calls-row{padding:12px!important}.calls-row-meta{gap:6px}.calls-row-meta span+span{padding-left:6px}.calls-page-heading{display:grid}.calls-page-heading .btn{width:100%}}
      `}</style>
    </>
  )
}
