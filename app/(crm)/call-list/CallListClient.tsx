'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

type Agent = { id: string; full_name: string }
type ClientRow = {
  id: string
  assigned_agent_id: string | null
  first_name: string | null
  last_name: string | null
  phone: string | null
  date_of_birth: string | null
  is_medicare: boolean | null
  is_life: boolean | null
  is_retirement: boolean | null
}
type CallRow = {
  id: string
  user_id: string
  client_id: string
  status: string
  callback_date: string | null
  callback_time: string | null
  last_outcome: string | null
  last_note: string | null
  last_called_at: string | null
  attempt_count: number | null
  added_at: string
  owner_name: string
  client: ClientRow | null
}
type Filter = 'all' | 'pending' | 'callbacks' | 'completed'
type DialogState = { row: CallRow; outcome: 'answered' | 'callback' | 'not_interested' } | null

function clientName(client: ClientRow | null) {
  if (!client) return 'Client'
  return [client.first_name, client.last_name].filter(Boolean).join(' ').trim() || 'Client'
}

function phoneHref(value: string | null | undefined) {
  const cleaned = String(value || '').replace(/[^0-9+]/g, '')
  return cleaned ? `tel:${cleaned}` : '#'
}

function products(client: ClientRow | null) {
  if (!client) return 'No product tag'
  const list: string[] = []
  if (client.is_medicare) list.push('Medicare')
  if (client.is_life) list.push('Life')
  if (client.is_retirement) list.push('Retirement')
  return list.length ? list.join(' · ') : 'No product tag'
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value.includes('T') ? value : `${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Never called'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
}

function formatTime(value: string | null | undefined) {
  if (!value) return ''
  const [hour, minute] = value.slice(0, 5).split(':').map(Number)
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, hour, minute))
}

function centralToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function manualDateToIso(value: string) {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return ''
  const month = Number(match[1])
  const day = Number(match[2])
  const year = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return ''
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function statusLabel(status: string) {
  if (status === 'pending') return 'Not called'
  if (status === 'answered') return 'Answered'
  if (status === 'no_answer') return 'No answer'
  if (status === 'voicemail') return 'Voicemail'
  if (status === 'callback') return 'Callback'
  if (status === 'not_interested') return 'Not interested'
  return status
}

export default function CallListClient({ initialRows, agents, viewerId, isManager }: {
  initialRows: CallRow[]
  agents: Agent[]
  viewerId: string
  isManager: boolean
}) {
  const [rows, setRows] = useState(initialRows)
  const [filter, setFilter] = useState<Filter>('all')
  const [ownerFilter, setOwnerFilter] = useState(isManager ? 'all' : viewerId)
  const [nextMode, setNextMode] = useState(false)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [note, setNote] = useState('')
  const [callbackDate, setCallbackDate] = useState('')
  const [callbackTime, setCallbackTime] = useState('')
  const [busyId, setBusyId] = useState('')
  const [message, setMessage] = useState('')

  const today = useMemo(() => centralToday(), [])
  const ownerRows = useMemo(
    () => rows.filter((row) => ownerFilter === 'all' || row.user_id === ownerFilter),
    [rows, ownerFilter]
  )

  const stats = useMemo(() => ({
    remaining: ownerRows.filter((row) => row.status === 'pending').length,
    answered: ownerRows.filter((row) => row.status === 'answered').length,
    noAnswer: ownerRows.filter((row) => row.status === 'no_answer').length,
    voicemail: ownerRows.filter((row) => row.status === 'voicemail').length,
    callbacks: ownerRows.filter((row) => row.status === 'callback').length,
  }), [ownerRows])

  const callableRows = useMemo(() => ownerRows.filter((row) =>
    row.status === 'pending' || (row.status === 'callback' && Boolean(row.callback_date) && String(row.callback_date) <= today)
  ), [ownerRows, today])

  const visibleRows = useMemo(() => ownerRows.filter((row) => {
    if (filter === 'all') return true
    if (filter === 'pending') return row.status === 'pending'
    if (filter === 'callbacks') return row.status === 'callback'
    return ['answered', 'no_answer', 'voicemail', 'not_interested'].includes(row.status)
  }), [ownerRows, filter])

  function openDialog(row: CallRow, outcome: 'answered' | 'callback' | 'not_interested') {
    setDialog({ row, outcome })
    setNote('')
    setCallbackDate('')
    setCallbackTime('')
    setMessage('')
  }

  async function post(body: Record<string, unknown>) {
    const response = await fetch('/api/call-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || 'Unable to update Call List.')
    return result
  }

  async function recordOutcome(row: CallRow, outcome: string, outcomeNote = '', callbackIso = '', callbackClock = '') {
    if (busyId) return
    setBusyId(row.id)
    setMessage('')
    try {
      const result = await post({
        action: 'outcome',
        item_id: row.id,
        outcome,
        note: outcomeNote,
        callback_date: callbackIso,
        callback_time: callbackClock
      })
      const updated = result.item || {}
      setRows((current) => current.map((item) => item.id === row.id ? {
        ...item,
        status: updated.status || outcome,
        callback_date: updated.callback_date ?? null,
        callback_time: updated.callback_time ?? null,
        last_outcome: updated.last_outcome || outcome,
        last_note: updated.last_note ?? outcomeNote || null,
        last_called_at: updated.last_called_at || new Date().toISOString(),
        attempt_count: Number(updated.attempt_count ?? Number(item.attempt_count || 0) + 1)
      } : item))
      setDialog(null)
      setMessage(outcome === 'callback' ? 'Callback saved to the CRM calendar.' : `${statusLabel(outcome)} saved.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save call outcome.')
    } finally {
      setBusyId('')
    }
  }

  async function submitDialog() {
    if (!dialog) return
    if (dialog.outcome === 'callback') {
      const iso = manualDateToIso(callbackDate)
      if (!iso) return setMessage('Enter the callback date as MM/DD/YYYY.')
      await recordOutcome(dialog.row, dialog.outcome, note, iso, callbackTime)
      return
    }
    await recordOutcome(dialog.row, dialog.outcome, note)
  }

  async function resetRow(row: CallRow) {
    if (busyId) return
    setBusyId(row.id)
    setMessage('')
    try {
      await post({ action: 'reset', item_id: row.id })
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, status: 'pending', callback_date: null, callback_time: null } : item))
      setMessage(`${clientName(row.client)} moved back to Not Called.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to reset call status.')
    } finally {
      setBusyId('')
    }
  }

  async function removeRow(row: CallRow) {
    if (busyId) return
    if (!window.confirm(`Remove ${clientName(row.client)} from the active Call List? Call history will be kept.`)) return
    setBusyId(row.id)
    setMessage('')
    try {
      await post({ action: 'remove', item_id: row.id })
      setRows((current) => current.filter((item) => item.id !== row.id))
      setMessage('Removed from active Call List. Call history was kept.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to remove this client.')
    } finally {
      setBusyId('')
    }
  }

  function RowCard({ row, focus = false }: { row: CallRow; focus?: boolean }) {
    const callbackText = row.status === 'callback' && row.callback_date
      ? `${formatDate(row.callback_date)}${row.callback_time ? ` · ${formatTime(row.callback_time)}` : ''}`
      : ''
    return (
      <article className={`call-card${focus ? ' call-card-focus' : ''}`}>
        <div className="call-card-top">
          <div className="call-card-person">
            <div className="call-name">{clientName(row.client)}</div>
            <div className="call-meta">{row.client?.phone || 'No phone'} · {products(row.client)}</div>
            {isManager ? <div className="call-owner">{row.owner_name}</div> : null}
          </div>
          <span className={`call-status call-status-${row.status}`}>{statusLabel(row.status)}</span>
        </div>

        <div className="call-info-grid">
          <div><span>DOB</span><strong>{formatDate(row.client?.date_of_birth)}</strong></div>
          <div><span>Attempts</span><strong>{Number(row.attempt_count || 0)}</strong></div>
          <div><span>Last call</span><strong>{formatDateTime(row.last_called_at)}</strong></div>
          <div><span>{row.status === 'callback' ? 'Callback' : 'Last result'}</span><strong>{callbackText || (row.last_outcome ? statusLabel(row.last_outcome) : '—')}</strong></div>
        </div>

        {row.last_note ? <div className="call-last-note"><strong>Last note:</strong> {row.last_note}</div> : null}

        <div className="call-actions">
          {row.client?.phone ? <a className="btn btn-primary call-button" href={phoneHref(row.client.phone)}>☎ CALL</a> : null}
          <button className="btn call-outcome answered" type="button" disabled={busyId === row.id} onClick={() => openDialog(row, 'answered')}>ANSWERED</button>
          <button className="btn call-outcome no-answer" type="button" disabled={busyId === row.id} onClick={() => void recordOutcome(row, 'no_answer')}>NO ANSWER</button>
          <button className="btn call-outcome voicemail" type="button" disabled={busyId === row.id} onClick={() => void recordOutcome(row, 'voicemail')}>VOICEMAIL</button>
          <button className="btn call-outcome callback" type="button" disabled={busyId === row.id} onClick={() => openDialog(row, 'callback')}>CALL BACK</button>
          <button className="btn call-outcome not-interested" type="button" disabled={busyId === row.id} onClick={() => openDialog(row, 'not_interested')}>NOT INTERESTED</button>
        </div>

        <div className="call-secondary-actions">
          {row.status !== 'pending' ? <button type="button" className="btn btn-secondary" disabled={busyId === row.id} onClick={() => void resetRow(row)}>RETRY / NOT CALLED</button> : null}
          <Link prefetch={false} className="btn btn-secondary" href={`/clients/${row.client_id}`}>OPEN CLIENT</Link>
          <button type="button" className="btn btn-secondary" disabled={busyId === row.id} onClick={() => void removeRow(row)}>REMOVE FROM LIST</button>
        </div>
      </article>
    )
  }

  const nextRow = callableRows[0] || null

  return (
    <>
      <div className="call-list-heading">
        <div><h1>CALL LIST</h1><p className="subtle">Fast calling queue with saved outcomes and callback scheduling.</p></div>
        <div className="call-heading-actions">
          <Link prefetch={false} href="/clients" className="btn btn-secondary">ADD CLIENTS</Link>
          <button type="button" className="btn btn-primary" onClick={() => setNextMode((value) => !value)}>{nextMode ? 'SHOW FULL LIST' : 'CALL NEXT CLIENT'}</button>
        </div>
      </div>

      {isManager ? (
        <div className="call-owner-filter">
          <label>Agent
            <select className="select" value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
              <option value="all">All agents</option>
              {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}
            </select>
          </label>
        </div>
      ) : null}

      <div className="call-stats">
        <div className="card call-stat"><span>Remaining</span><strong>{stats.remaining}</strong></div>
        <div className="card call-stat"><span>Answered</span><strong>{stats.answered}</strong></div>
        <div className="card call-stat"><span>No Answer</span><strong>{stats.noAnswer}</strong></div>
        <div className="card call-stat"><span>Voicemail</span><strong>{stats.voicemail}</strong></div>
        <div className="card call-stat"><span>Callbacks</span><strong>{stats.callbacks}</strong></div>
      </div>

      {message ? <div className="notice" style={{ marginBottom: 14 }}>{message}</div> : null}

      {nextMode ? (
        nextRow ? (
          <section className="call-next-wrap">
            <div className="call-next-label">NEXT CLIENT · {callableRows.length} ready to call</div>
            <RowCard row={nextRow} focus />
          </section>
        ) : <section className="card"><div className="empty"><strong>No clients are ready to call.</strong><br />Add clients from Client Records or wait for a scheduled callback.</div></section>
      ) : (
        <>
          <div className="call-tabs" role="tablist" aria-label="Call list filters">
            {([
              ['all', 'ALL'], ['pending', 'NOT CALLED'], ['callbacks', 'CALLBACKS'], ['completed', 'COMPLETED']
            ] as Array<[Filter, string]>).map(([value, label]) => (
              <button key={value} type="button" className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>
            ))}
          </div>
          {!visibleRows.length ? (
            <section className="card"><div className="empty">No clients in this Call List view.</div></section>
          ) : <div className="call-grid">{visibleRows.map((row) => <RowCard key={row.id} row={row} />)}</div>}
        </>
      )}

      {dialog ? (
        <div className="call-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null) }}>
          <div className="call-dialog" role="dialog" aria-modal="true" aria-label="Save call outcome">
            <div className="call-dialog-heading">
              <div><strong>{statusLabel(dialog.outcome)}</strong><span>{clientName(dialog.row.client)}</span></div>
              <button type="button" onClick={() => setDialog(null)} aria-label="Close">×</button>
            </div>
            {dialog.outcome === 'callback' ? (
              <div className="call-dialog-grid">
                <label>Callback date<input className="input" inputMode="numeric" placeholder="MM/DD/YYYY" value={callbackDate} onChange={(event) => setCallbackDate(event.target.value)} /></label>
                <label>Callback time<input className="input" type="time" value={callbackTime} onChange={(event) => setCallbackTime(event.target.value)} /></label>
              </div>
            ) : null}
            <label className="call-note-label">Note (optional)<textarea className="textarea" value={note} onChange={(event) => setNote(event.target.value)} placeholder="What happened on the call?" /></label>
            <div className="call-dialog-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setDialog(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={busyId === dialog.row.id} onClick={() => void submitDialog()}>{busyId === dialog.row.id ? 'Saving…' : 'SAVE'}</button>
            </div>
          </div>
        </div>
      ) : null}

      <style>{`
        .call-list-heading{display:flex;justify-content:space-between;gap:14px;align-items:end;flex-wrap:wrap;margin-bottom:16px}.call-list-heading h1{margin-bottom:4px}.call-heading-actions{display:flex;gap:9px;flex-wrap:wrap}
        .call-owner-filter{margin-bottom:13px}.call-owner-filter label{display:flex;align-items:center;gap:8px;font-weight:800}.call-owner-filter .select{width:230px}
        .call-stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-bottom:14px}.call-stat{padding:13px}.call-stat span{display:block;font-size:.7rem;text-transform:uppercase;letter-spacing:.04em;font-weight:900;color:#6b7b8b}.call-stat strong{display:block;margin-top:4px;font-size:1.55rem;color:#172033}
        .call-tabs{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:12px}.call-tabs button{border:1px solid #ccd7e0;background:#fff;color:#425466;border-radius:999px;padding:8px 12px;font:inherit;font-size:.78rem;font-weight:900;cursor:pointer}.call-tabs button.active{background:#31485b;color:#fff;border-color:#31485b}
        .call-grid{display:grid;gap:12px}.call-card{border:1px solid #dbe3ea;border-radius:14px;background:#fff;padding:14px}.call-card-focus{border-width:2px;box-shadow:0 10px 28px rgba(15,23,42,.10)}.call-card-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.call-name{font-size:1.08rem;font-weight:900;color:#172033}.call-meta{margin-top:3px;color:#667788;font-size:.83rem}.call-owner{margin-top:5px;font-size:.72rem;font-weight:900;color:#496070;text-transform:uppercase}.call-status{display:inline-flex;padding:5px 9px;border-radius:999px;border:1px solid #d4dde5;background:#f7f9fb;font-size:.7rem;font-weight:900;white-space:nowrap}.call-status-answered{background:#e9f6ed;color:#2d6841;border-color:#bdddc7}.call-status-no_answer,.call-status-voicemail{background:#fff7e6;color:#725818;border-color:#ecd8a8}.call-status-callback{background:#eef5ff;color:#355d89;border-color:#c6d9ef}.call-status-not_interested{background:#f5eded;color:#714949;border-color:#e1cccc}
        .call-info-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:12px}.call-info-grid>div{border:1px solid #e2e8ee;border-radius:9px;padding:8px 9px;background:#fbfcfd;min-width:0}.call-info-grid span{display:block;font-size:.66rem;text-transform:uppercase;font-weight:900;color:#728191;margin-bottom:3px}.call-info-grid strong{display:block;font-size:.8rem;color:#2e3c4a;overflow-wrap:anywhere}.call-last-note{margin-top:10px;padding:9px 10px;border-radius:9px;background:#f8fafc;color:#4d5d6b;font-size:.8rem;white-space:pre-wrap}
        .call-actions,.call-secondary-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px}.call-actions .btn,.call-secondary-actions .btn{min-height:40px}.call-button{font-weight:900}.call-outcome{border:1px solid #d5dee6;background:#fff;color:#35495c}.call-outcome.answered{background:#eef8f1;border-color:#c4dfcb;color:#2c6740}.call-outcome.no-answer{background:#fff9ec;border-color:#ead9b0;color:#6d561d}.call-outcome.voicemail{background:#f5f2ff;border-color:#d9d0ed;color:#5c4d7a}.call-outcome.callback{background:#eef6ff;border-color:#c9dced;color:#365e83}.call-outcome.not-interested{background:#f8eeee;border-color:#e3cccc;color:#704b4b}
        .call-next-wrap{display:grid;gap:8px}.call-next-label{font-size:.76rem;font-weight:900;color:#627386;text-transform:uppercase;letter-spacing:.05em}
        .call-dialog-backdrop{position:fixed;inset:0;z-index:200;background:rgba(15,23,42,.42);display:grid;place-items:center;padding:16px}.call-dialog{width:min(520px,100%);background:#fff;border-radius:15px;border:1px solid #d8e0e7;box-shadow:0 22px 60px rgba(15,23,42,.24);padding:15px}.call-dialog-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:13px}.call-dialog-heading>div{display:grid;gap:3px}.call-dialog-heading strong{font-size:1.05rem}.call-dialog-heading span{font-size:.82rem;color:#667788}.call-dialog-heading button{border:0;background:transparent;font-size:1.5rem;cursor:pointer}.call-dialog-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.call-dialog-grid label,.call-note-label{display:grid;gap:5px;font-size:.78rem;font-weight:900;color:#44576a}.call-note-label{margin-top:10px}.call-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
        @media(max-width:900px){.call-stats{grid-template-columns:repeat(3,minmax(0,1fr))}.call-info-grid{grid-template-columns:1fr 1fr}}
        @media(max-width:720px){.call-heading-actions,.call-heading-actions .btn{width:100%}.call-stats{grid-template-columns:1fr 1fr}.call-card-top{align-items:flex-start}.call-info-grid{grid-template-columns:1fr}.call-actions .btn,.call-actions a,.call-secondary-actions .btn,.call-secondary-actions a{flex:1 1 calc(50% - 7px);text-align:center}.call-dialog-grid{grid-template-columns:1fr}.call-owner-filter label{align-items:stretch;flex-direction:column}.call-owner-filter .select{width:100%}}
      `}</style>
    </>
  )
}
