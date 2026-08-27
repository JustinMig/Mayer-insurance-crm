'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

type Campaign = { id: string; name: string; topic: string; status: string }
type Agent = { id: string; full_name: string }
type ClientRow = {
  id: string
  assigned_agent_id: string | null
  first_name: string | null
  last_name: string | null
  phone: string | null
  date_of_birth: string | null
  county: string | null
  state: string | null
  is_medicare: boolean | null
  is_life: boolean | null
  is_retirement: boolean | null
}
type CampaignRow = {
  id: string
  campaign_id: string
  client_id: string
  assigned_agent_id: string
  status: string
  last_outcome: string | null
  last_note: string | null
  last_contacted_at: string | null
  next_action: string | null
  follow_up_date: string | null
  follow_up_time: string | null
  attempt_count: number
  created_at: string
  owner_name: string
  client: ClientRow | null
}
type Filter = 'open' | 'not_contacted' | 'attempted' | 'spoke' | 'follow_up' | 'resolved' | 'all'
type DialogState = { row: CampaignRow } | null

const RESOLVED = new Set(['completed', 'not_interested', 'do_not_call', 'unreachable'])

function clientName(client: ClientRow | null) {
  if (!client) return 'Client'
  return [client.first_name, client.last_name].filter(Boolean).join(' ').trim() || 'Client'
}

function products(client: ClientRow | null) {
  if (!client) return 'No product tag'
  const values: string[] = []
  if (client.is_medicare) values.push('Medicare')
  if (client.is_life) values.push('Life')
  if (client.is_retirement) values.push('Retirement')
  return values.length ? values.join(' · ') : 'No product tag'
}

function topicLabel(topic: string) {
  if (topic === 'medicare') return 'Medicare'
  if (topic === 'life') return 'Life'
  if (topic === 'health') return 'Health'
  if (topic === 'retirement') return 'Retirement'
  if (topic === 'other') return 'Other'
  return 'General Client Review'
}

function statusLabel(status: string) {
  if (status === 'not_contacted') return 'Not Contacted'
  if (status === 'attempted') return 'Attempted'
  if (status === 'spoke') return 'Spoke With Client'
  if (status === 'follow_up') return 'Follow-Up Needed'
  if (status === 'completed') return 'Completed'
  if (status === 'not_interested') return 'Not Interested'
  if (status === 'do_not_call') return 'Do Not Call'
  if (status === 'unreachable') return 'Unreachable'
  return status
}

function outcomeLabel(outcome: string | null) {
  if (!outcome) return '—'
  if (outcome === 'no_answer') return 'No Answer'
  if (outcome === 'voicemail') return 'Voicemail'
  if (outcome === 'busy') return 'Busy'
  if (outcome === 'bad_number') return 'Bad Number'
  return statusLabel(outcome)
}

function centralToday() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
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

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value.includes('T') ? value : `${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
}

function formatTime(value: string | null | undefined) {
  if (!value) return ''
  const [hour, minute] = value.slice(0, 5).split(':').map(Number)
  const date = new Date(2000, 0, 1, hour, minute)
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date)
}

export default function CampaignDetailClient({ campaign, initialRows, agents, viewerId, canViewAll }: {
  campaign: Campaign
  initialRows: CampaignRow[]
  agents: Agent[]
  viewerId: string
  canViewAll: boolean
}) {
  const [rows, setRows] = useState(initialRows)
  const [filter, setFilter] = useState<Filter>('open')
  const [ownerFilter, setOwnerFilter] = useState(canViewAll ? 'all' : viewerId)
  const [workMode, setWorkMode] = useState(false)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [result, setResult] = useState('spoke')
  const [note, setNote] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpTime, setFollowUpTime] = useState('')
  const [busyId, setBusyId] = useState('')
  const [message, setMessage] = useState('')
  const today = useMemo(() => centralToday(), [])

  const ownerRows = useMemo(() => rows.filter((row) => ownerFilter === 'all' || row.assigned_agent_id === ownerFilter), [rows, ownerFilter])

  const sortedRows = useMemo(() => [...ownerRows].sort((a, b) => {
    function priority(row: CampaignRow) {
      if (row.status === 'follow_up' && row.follow_up_date && row.follow_up_date < today) return 0
      if (row.status === 'follow_up' && row.follow_up_date === today) return 1
      if (row.status === 'not_contacted') return 2
      if (row.status === 'attempted') return 3
      if (row.status === 'spoke') return 4
      if (row.status === 'follow_up') return 5
      return 6
    }
    const difference = priority(a) - priority(b)
    if (difference) return difference
    if (a.status === 'attempted' && b.status === 'attempted') return String(a.last_contacted_at || '').localeCompare(String(b.last_contacted_at || ''))
    if (a.follow_up_date || b.follow_up_date) return String(a.follow_up_date || '9999-12-31').localeCompare(String(b.follow_up_date || '9999-12-31'))
    const aName = `${a.client?.last_name || ''}${a.client?.first_name || ''}`.toLowerCase()
    const bName = `${b.client?.last_name || ''}${b.client?.first_name || ''}`.toLowerCase()
    return aName.localeCompare(bName)
  }), [ownerRows, today])

  const stats = useMemo(() => {
    const count = (status: string) => ownerRows.filter((row) => row.status === status).length
    return {
      total: ownerRows.length,
      notContacted: count('not_contacted'),
      attempted: count('attempted'),
      spoke: count('spoke'),
      followUp: count('follow_up'),
      completed: count('completed'),
      resolved: ownerRows.filter((row) => RESOLVED.has(row.status)).length
    }
  }, [ownerRows])

  const visibleRows = useMemo(() => sortedRows.filter((row) => {
    if (filter === 'all') return true
    if (filter === 'open') return !RESOLVED.has(row.status)
    if (filter === 'resolved') return RESOLVED.has(row.status)
    return row.status === filter
  }), [sortedRows, filter])

  const readyRows = useMemo(() => sortedRows.filter((row) => {
    if (RESOLVED.has(row.status)) return false
    if (row.status !== 'follow_up') return true
    return Boolean(row.follow_up_date && row.follow_up_date <= today)
  }), [sortedRows, today])

  function openConversation(row: CampaignRow) {
    setDialog({ row })
    setResult('spoke')
    setNote('')
    setNextAction('')
    setFollowUpDate('')
    setFollowUpTime('')
    setMessage('')
  }

  async function post(body: Record<string, unknown>) {
    const response = await fetch('/api/outreach-campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'Unable to update campaign.')
    return data
  }

  async function record(row: CampaignRow, outcome: string, options: { note?: string; nextAction?: string; followUpDate?: string; followUpTime?: string } = {}) {
    if (busyId) return
    setBusyId(row.id)
    setMessage('')
    try {
      const data = await post({
        action: 'record',
        member_id: row.id,
        outcome,
        note: options.note || '',
        next_action: options.nextAction || '',
        follow_up_date: options.followUpDate || '',
        follow_up_time: options.followUpTime || ''
      })
      const updated = data.member || {}
      setRows((current) => current.map((item) => item.id === row.id ? {
        ...item,
        status: updated.status || item.status,
        last_outcome: updated.last_outcome ?? outcome,
        last_note: updated.last_note ?? options.note ?? null,
        last_contacted_at: updated.last_contacted_at || new Date().toISOString(),
        next_action: updated.next_action ?? null,
        follow_up_date: updated.follow_up_date ?? null,
        follow_up_time: updated.follow_up_time ?? null,
        attempt_count: Number(updated.attempt_count ?? Number(item.attempt_count || 0) + 1)
      } : item))
      setDialog(null)
      setMessage(outcome === 'follow_up' ? 'Follow-up saved and added to the CRM calendar.' : `${outcomeLabel(outcome)} saved.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save outreach result.')
    } finally {
      setBusyId('')
    }
  }

  async function submitConversation() {
    if (!dialog) return
    let isoDate = ''
    if (result === 'follow_up') {
      isoDate = manualDateToIso(followUpDate)
      if (!isoDate) return setMessage('Enter follow-up date as MM/DD/YYYY.')
    }
    await record(dialog.row, result, { note, nextAction, followUpDate: isoDate, followUpTime })
  }

  async function resetRow(row: CampaignRow) {
    if (busyId) return
    setBusyId(row.id)
    try {
      const data = await post({ action: 'reset_member', member_id: row.id })
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, status: data.member?.status || 'not_contacted', next_action: null, follow_up_date: null, follow_up_time: null } : item))
      setMessage(`${clientName(row.client)} moved back to Not Contacted. History was kept.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to reset client status.')
    } finally {
      setBusyId('')
    }
  }

  async function removeRow(row: CampaignRow) {
    if (busyId) return
    if (!window.confirm(`Remove ${clientName(row.client)} from this campaign? Existing outreach history will remain in the client history.`)) return
    setBusyId(row.id)
    try {
      await post({ action: 'remove_member', member_id: row.id })
      setRows((current) => current.filter((item) => item.id !== row.id))
      setMessage('Client removed from this active campaign.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to remove client from campaign.')
    } finally {
      setBusyId('')
    }
  }

  function ClientCard({ row, focus = false }: { row: CampaignRow; focus?: boolean }) {
    const overdue = row.status === 'follow_up' && Boolean(row.follow_up_date) && String(row.follow_up_date) < today
    const dueToday = row.status === 'follow_up' && row.follow_up_date === today
    const followUpText = row.status === 'follow_up' && row.follow_up_date
      ? `${row.next_action || 'Follow up with client'} · ${formatDate(row.follow_up_date)}${row.follow_up_time ? ` at ${formatTime(row.follow_up_time)}` : ''}`
      : row.next_action || ''

    return (
      <article className={`campaign-client-row${focus ? ' campaign-client-row-focus' : ''}`}>
        <div className="campaign-person-cell">
          <div className="campaign-person-title-line">
            <Link prefetch={false} href={`/clients/${row.client_id}`} className="campaign-client-name">{clientName(row.client)}</Link>
            {overdue ? <span className="campaign-due overdue">Overdue</span> : dueToday ? <span className="campaign-due today">Due today</span> : null}
          </div>
          <div className="campaign-client-phone">{row.client?.phone || 'No phone number'}</div>
          <div className="campaign-person-meta">{products(row.client)}<span>•</span>{[row.client?.county, row.client?.state].filter(Boolean).join(', ') || 'Location not entered'}</div>
          {canViewAll ? <div className="campaign-owner-line">{row.owner_name}</div> : null}
        </div>

        <div className="campaign-status-cell">
          <span className={`campaign-status status-${row.status}`}>{statusLabel(row.status)}</span>
          <div className="campaign-status-meta"><span>{Number(row.attempt_count || 0)} touch{Number(row.attempt_count || 0) === 1 ? '' : 'es'}</span><span>DOB {formatDate(row.client?.date_of_birth)}</span></div>
        </div>

        <div className="campaign-activity-cell">
          <div className="campaign-activity-line"><span>Last activity</span><strong>{formatDateTime(row.last_contacted_at)}</strong></div>
          <div className="campaign-activity-line"><span>Last result</span><strong>{outcomeLabel(row.last_outcome)}</strong></div>
          {followUpText ? <div className={`campaign-next-line${overdue ? ' overdue' : ''}`}><span>Next</span><strong>{followUpText}</strong></div> : null}
          {row.last_note ? <div className="campaign-note-line" title={row.last_note}>{row.last_note}</div> : null}
        </div>

        <div className="campaign-action-cell">
          <button className="campaign-primary-action" type="button" disabled={busyId === row.id} onClick={() => openConversation(row)}>SPOKE / UPDATE</button>
          <div className="campaign-attempt-actions">
            <button type="button" disabled={busyId === row.id} onClick={() => void record(row, 'no_answer')}>No answer</button>
            <button type="button" disabled={busyId === row.id} onClick={() => void record(row, 'voicemail')}>Voicemail</button>
            <button type="button" disabled={busyId === row.id} onClick={() => void record(row, 'busy')}>Busy</button>
          </div>
          <div className="campaign-record-actions">
            <Link prefetch={false} href={`/clients/${row.client_id}`}>Open client</Link>
            {row.status !== 'not_contacted' ? <button type="button" disabled={busyId === row.id} onClick={() => void resetRow(row)}>Reset</button> : null}
            <button type="button" disabled={busyId === row.id} onClick={() => void removeRow(row)}>Remove</button>
          </div>
        </div>
      </article>
    )
  }

  const nextRow = readyRows[0] || null
  const completionPercent = stats.total ? Math.round((stats.resolved / stats.total) * 100) : 0

  return (
    <>
      <div className="campaign-detail-shell">
        <div className="campaign-detail-titlebar">
          <div className="campaign-detail-titlecopy">
            <Link prefetch={false} href="/campaigns" className="campaign-breadcrumb">Outreach</Link>
            <span className="campaign-breadcrumb-separator">/</span>
            <span className="campaign-topic-text">{topicLabel(campaign.topic)}</span>
            <h1>{campaign.name}</h1>
            <p>Track contact progress, follow-ups, and completed outreach.</p>
          </div>
          <div className="campaign-heading-actions">
            <Link prefetch={false} href="/clients" className="campaign-quiet-button">Add clients</Link>
            <button type="button" className="campaign-work-button" onClick={() => setWorkMode((value) => !value)}>{workMode ? 'Show full campaign' : 'Work next client'}</button>
          </div>
        </div>

        <div className="campaign-control-strip">
          <div className="campaign-progress-compact">
            <div className="campaign-progress-label"><strong>{completionPercent}%</strong><span>resolved</span></div>
            <div className="campaign-progress-track"><span style={{ width: `${completionPercent}%` }} /></div>
          </div>
          <div className="campaign-stat-inline"><strong>{stats.total}</strong><span>Total</span></div>
          <div className="campaign-stat-inline"><strong>{stats.notContacted}</strong><span>Not contacted</span></div>
          <div className="campaign-stat-inline"><strong>{stats.attempted}</strong><span>Attempted</span></div>
          <div className="campaign-stat-inline"><strong>{stats.spoke}</strong><span>Spoke</span></div>
          <div className="campaign-stat-inline"><strong>{stats.followUp}</strong><span>Follow-up</span></div>
          <div className="campaign-stat-inline"><strong>{stats.resolved}</strong><span>Resolved</span></div>
          {canViewAll ? (
            <label className="campaign-agent-select"><span>Agent</span><select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}><option value="all">All agents</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}</select></label>
          ) : null}
        </div>

        {message ? <div className="notice campaign-message">{message}</div> : null}

        {workMode ? (
          nextRow ? (
            <section className="campaign-work-panel">
              <div className="campaign-section-heading"><div><span className="campaign-section-kicker">Priority queue</span><strong>Next client</strong></div><span>{readyRows.length} ready now</span></div>
              <ClientCard row={nextRow} focus />
            </section>
          ) : <section className="campaign-empty-state"><strong>No clients need action right now.</strong><span>Future follow-ups remain scheduled and resolved clients stay in campaign history.</span></section>
        ) : (
          <>
            <div className="campaign-list-toolbar">
              <div className="campaign-filter-tabs" role="tablist" aria-label="Campaign client filters">
                {([
                  ['open', 'Open'], ['not_contacted', 'Not contacted'], ['attempted', 'Attempted'], ['spoke', 'Spoke'], ['follow_up', 'Follow-up'], ['resolved', 'Resolved'], ['all', 'All']
                ] as Array<[Filter, string]>).map(([key, label]) => <button key={key} type="button" className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>)}
              </div>
              <span className="campaign-visible-count">{visibleRows.length} client{visibleRows.length === 1 ? '' : 's'}</span>
            </div>

            {!visibleRows.length ? (
              <section className="campaign-empty-state"><strong>No clients match this view.</strong><span>Choose another filter to see the rest of the campaign.</span></section>
            ) : (
              <section className="campaign-client-table">
                <div className="campaign-table-heading" aria-hidden="true"><span>Client</span><span>Status</span><span>Activity / next action</span><span>Actions</span></div>
                {visibleRows.map((row) => <ClientCard key={row.id} row={row} />)}
              </section>
            )}
          </>
        )}
      </div>

      {dialog ? (
        <div className="outreach-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busyId) setDialog(null) }}>
          <div className="outreach-dialog" role="dialog" aria-modal="true" aria-label="Record client conversation">
            <div className="outreach-dialog-head"><div><span>Update outreach</span><strong>{clientName(dialog.row.client)}</strong><p>Record the conversation and the next step, if any.</p></div><button type="button" disabled={Boolean(busyId)} onClick={() => setDialog(null)} aria-label="Close">×</button></div>
            <div className="outreach-dialog-form">
              <label className="label">Conversation result<select className="select" value={result} onChange={(event) => setResult(event.target.value)}><option value="spoke">Spoke — still open</option><option value="follow_up">Follow-Up Needed</option><option value="completed">Completed</option><option value="not_interested">Not Interested</option><option value="do_not_call">Do Not Call</option><option value="unreachable">Unreachable / Close</option></select></label>
              {result === 'follow_up' ? <label className="label">Next action<input className="input" value={nextAction} onChange={(event) => setNextAction(event.target.value)} placeholder="Example: Compare Medicare plans" /></label> : null}
              {result === 'follow_up' ? <div className="outreach-followup-row"><label className="label">Follow-up date<input className="input" inputMode="numeric" value={followUpDate} onChange={(event) => setFollowUpDate(event.target.value)} placeholder="MM/DD/YYYY" /></label><label className="label">Time (optional)<input className="input" type="time" value={followUpTime} onChange={(event) => setFollowUpTime(event.target.value)} /></label></div> : null}
              <label className="label">Notes<textarea className="textarea" value={note} onChange={(event) => setNote(event.target.value)} placeholder="What did you discuss?" /></label>
            </div>
            {message ? <div className="notice" style={{ marginTop: 10 }}>{message}</div> : null}
            <div className="outreach-dialog-actions"><button type="button" className="campaign-quiet-button" disabled={Boolean(busyId)} onClick={() => setDialog(null)}>Cancel</button><button type="button" className="campaign-work-button" disabled={Boolean(busyId)} onClick={() => void submitConversation()}>{busyId ? 'Saving…' : 'Save result'}</button></div>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        .campaign-detail-shell{max-width:1500px;margin:0 auto}.campaign-detail-titlebar{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;padding:2px 0 16px;border-bottom:1px solid #dde4e8}.campaign-detail-titlecopy{min-width:0}.campaign-breadcrumb,.campaign-topic-text,.campaign-breadcrumb-separator{font-size:.72rem;font-weight:800;color:#71808d;text-decoration:none;text-transform:uppercase;letter-spacing:.05em}.campaign-breadcrumb:hover{color:#31485b}.campaign-breadcrumb-separator{padding:0 6px;color:#a0aab3}.campaign-detail-titlecopy h1{margin:7px 0 3px;font-size:clamp(1.55rem,2.3vw,2.2rem);line-height:1.08;letter-spacing:-.025em;color:#172033}.campaign-detail-titlecopy p{margin:0;color:#71808d;font-size:.84rem}.campaign-heading-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.campaign-quiet-button,.campaign-work-button{appearance:none;border-radius:8px;min-height:36px;padding:8px 12px;font:inherit;font-size:.78rem;font-weight:800;text-decoration:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}.campaign-quiet-button{border:1px solid #d5dde3;background:#fff;color:#4f6170}.campaign-quiet-button:hover{background:#f7f9fa;color:#31485b}.campaign-work-button{border:1px solid #526d82;background:#526d82;color:#fff}.campaign-work-button:hover{background:#405b70}.campaign-work-button:disabled,.campaign-quiet-button:disabled{opacity:.55;cursor:default}
        .campaign-control-strip{display:flex;align-items:stretch;gap:0;margin:14px 0 13px;background:#fff;border:1px solid #dfe5e9;border-radius:10px;overflow:hidden;min-height:58px}.campaign-progress-compact{flex:1 1 230px;min-width:210px;padding:10px 14px;display:flex;flex-direction:column;justify-content:center;border-right:1px solid #e5eaed}.campaign-progress-label{display:flex;align-items:baseline;gap:6px;margin-bottom:7px}.campaign-progress-label strong{font-size:1.1rem;color:#344f49}.campaign-progress-label span{font-size:.68rem;font-weight:800;color:#7a8791;text-transform:uppercase;letter-spacing:.04em}.campaign-progress-track{height:4px;background:#e9eeec;border-radius:999px;overflow:hidden}.campaign-progress-track>span{display:block;height:100%;background:#7f9c96}.campaign-stat-inline{min-width:91px;padding:9px 12px;display:flex;flex-direction:column;justify-content:center;border-right:1px solid #e5eaed}.campaign-stat-inline strong{font-size:1rem;color:#273947}.campaign-stat-inline span{margin-top:2px;font-size:.62rem;font-weight:800;color:#7a8791;text-transform:uppercase;letter-spacing:.025em;white-space:nowrap}.campaign-agent-select{min-width:165px;padding:7px 10px;display:flex;flex-direction:column;justify-content:center;gap:3px}.campaign-agent-select>span{font-size:.6rem;font-weight:800;color:#7a8791;text-transform:uppercase}.campaign-agent-select select{border:0;background:transparent;color:#34495a;font:inherit;font-size:.76rem;font-weight:800;outline:none;max-width:180px}.campaign-message{margin:0 0 12px}
        .campaign-list-toolbar{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;margin:4px 0 8px;border-bottom:1px solid #dfe5e9}.campaign-filter-tabs{display:flex;gap:22px;overflow-x:auto;scrollbar-width:none}.campaign-filter-tabs::-webkit-scrollbar{display:none}.campaign-filter-tabs button{appearance:none;border:0;border-bottom:2px solid transparent;background:transparent;color:#70808d;padding:9px 0 8px;font:inherit;font-size:.73rem;font-weight:800;white-space:nowrap;cursor:pointer}.campaign-filter-tabs button:hover{color:#405768}.campaign-filter-tabs button.active{color:#263f53;border-bottom-color:#627f92}.campaign-visible-count{padding-bottom:9px;color:#8a96a0;font-size:.7rem;white-space:nowrap}.campaign-client-table{background:#fff;border:1px solid #dfe5e9;border-radius:10px;overflow:hidden}.campaign-table-heading{display:grid;grid-template-columns:minmax(220px,1.25fr) minmax(145px,.7fr) minmax(250px,1.3fr) minmax(190px,.8fr);gap:16px;padding:8px 14px;background:#f8fafb;border-bottom:1px solid #e4e9ec;color:#83909a;font-size:.6rem;font-weight:900;text-transform:uppercase;letter-spacing:.045em}.campaign-client-row{display:grid;grid-template-columns:minmax(220px,1.25fr) minmax(145px,.7fr) minmax(250px,1.3fr) minmax(190px,.8fr);gap:16px;align-items:start;padding:13px 14px;border-bottom:1px solid #e7ebee;background:#fff}.campaign-client-row:last-child{border-bottom:0}.campaign-client-row:hover{background:#fbfcfd}.campaign-client-row-focus{border:1px solid #9eb0bd!important;border-left:3px solid #627f92!important;border-radius:8px;background:#fbfcfd!important;box-shadow:0 6px 18px rgba(28,48,65,.06)}.campaign-person-cell,.campaign-status-cell,.campaign-activity-cell,.campaign-action-cell{min-width:0}.campaign-person-title-line{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.campaign-client-name{color:#1d3447;text-decoration:none;font-size:.94rem;font-weight:900;line-height:1.2}.campaign-client-name:hover{text-decoration:underline}.campaign-client-phone{margin-top:3px;color:#3f5668;font-size:.82rem;font-weight:800}.campaign-person-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px;color:#7a8791;font-size:.7rem}.campaign-person-meta span{color:#b3bcc3}.campaign-owner-line{margin-top:5px;color:#806a53;font-size:.66rem;font-weight:800}.campaign-status-cell{display:flex;flex-direction:column;align-items:flex-start;gap:7px}.campaign-status,.campaign-due{display:inline-flex;align-items:center;border-radius:999px;padding:4px 7px;border:1px solid #d9e1e6;background:#f7f9fa;color:#566873;font-size:.63rem;font-weight:900;white-space:nowrap}.campaign-due.overdue{background:#fbefef;border-color:#e6c8c8;color:#774747}.campaign-due.today{background:#fff8e6;border-color:#e9d99f;color:#796119}.status-follow_up{background:#fff8e6;border-color:#e9d99f;color:#796119}.status-completed{background:#edf6ef;border-color:#c8dfcd;color:#3c6949}.status-spoke{background:#eef4f8;border-color:#cad9e2;color:#3f6076}.status-attempted{background:#f1f4f6;color:#596a76}.status-not_interested,.status-do_not_call,.status-unreachable{background:#f6f0f0;color:#705454}.campaign-status-meta{display:flex;flex-direction:column;gap:2px;color:#8a969f;font-size:.66rem}.campaign-activity-cell{display:flex;flex-direction:column;gap:5px}.campaign-activity-line{display:flex;align-items:baseline;gap:7px;min-width:0}.campaign-activity-line>span,.campaign-next-line>span{flex:0 0 68px;color:#8a969f;font-size:.62rem;font-weight:800;text-transform:uppercase}.campaign-activity-line strong,.campaign-next-line strong{min-width:0;color:#435766;font-size:.72rem;font-weight:800;overflow-wrap:anywhere}.campaign-next-line{display:flex;align-items:flex-start;gap:7px;padding-top:2px}.campaign-next-line strong{color:#526d5c}.campaign-next-line.overdue strong{color:#824b4b}.campaign-note-line{margin-top:2px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#71808d;font-size:.69rem;font-style:italic}.campaign-action-cell{display:flex;flex-direction:column;gap:7px;align-items:flex-start}.campaign-primary-action{width:100%;border:1px solid #b9cbd3;border-radius:7px;background:#edf3f5;color:#31505b;padding:7px 9px;font:inherit;font-size:.68rem;font-weight:900;cursor:pointer}.campaign-primary-action:hover{background:#e3ecef}.campaign-attempt-actions,.campaign-record-actions{display:flex;gap:8px;flex-wrap:wrap}.campaign-attempt-actions button,.campaign-record-actions button,.campaign-record-actions a{appearance:none;border:0;background:transparent;padding:0;color:#687a87;font:inherit;font-size:.66rem;font-weight:800;text-decoration:none;cursor:pointer}.campaign-attempt-actions button:hover,.campaign-record-actions button:hover,.campaign-record-actions a:hover{color:#2f5066;text-decoration:underline}.campaign-record-actions{padding-top:1px}.campaign-record-actions button:last-child{color:#976565}.campaign-attempt-actions button:disabled,.campaign-record-actions button:disabled,.campaign-primary-action:disabled{opacity:.45;cursor:default}
        .campaign-work-panel{display:grid;gap:8px}.campaign-section-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;color:#71808d;font-size:.7rem}.campaign-section-heading>div{display:flex;align-items:baseline;gap:8px}.campaign-section-heading strong{font-size:.92rem;color:#2b4254}.campaign-section-kicker{text-transform:uppercase;font-size:.61rem;font-weight:900;letter-spacing:.05em}.campaign-empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:150px;padding:28px;border:1px solid #dfe5e9;border-radius:10px;background:#fff;text-align:center}.campaign-empty-state strong{color:#31485b}.campaign-empty-state span{margin-top:4px;color:#83909a;font-size:.78rem}
        .outreach-dialog-backdrop{position:fixed;inset:0;z-index:120;background:rgba(20,31,42,.42);display:flex;align-items:center;justify-content:center;padding:18px}.outreach-dialog{width:min(620px,100%);background:#fff;border:1px solid #d9e1e6;border-radius:12px;padding:17px;box-shadow:0 20px 60px rgba(15,23,42,.23)}.outreach-dialog-head{display:flex;justify-content:space-between;gap:15px;align-items:flex-start;padding-bottom:12px;border-bottom:1px solid #e5eaed}.outreach-dialog-head>div>span{display:block;color:#83909a;font-size:.62rem;font-weight:900;text-transform:uppercase;letter-spacing:.05em}.outreach-dialog-head strong{display:block;margin-top:3px;color:#20384b;font-size:1.08rem}.outreach-dialog-head p{margin:3px 0 0;color:#7a8791;font-size:.75rem}.outreach-dialog-head>button{border:0;background:transparent;color:#71808d;font-size:1.35rem;line-height:1;cursor:pointer}.outreach-dialog-form{display:grid;gap:10px;padding-top:13px}.outreach-followup-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.outreach-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
        @media(max-width:1180px){.campaign-control-strip{flex-wrap:wrap}.campaign-progress-compact{flex:1 1 100%;border-right:0;border-bottom:1px solid #e5eaed}.campaign-stat-inline{flex:1 1 110px}.campaign-agent-select{flex:1 1 180px}.campaign-table-heading,.campaign-client-row{grid-template-columns:minmax(210px,1fr) minmax(130px,.65fr) minmax(230px,1.05fr) minmax(170px,.75fr)}}
        @media(max-width:900px){.campaign-table-heading{display:none}.campaign-client-table{border-radius:9px}.campaign-client-row{grid-template-columns:1fr 1fr;gap:10px 18px}.campaign-person-cell{grid-column:1}.campaign-status-cell{grid-column:2;align-items:flex-end}.campaign-status-meta{align-items:flex-end}.campaign-activity-cell{grid-column:1 / -1;padding-top:8px;border-top:1px solid #edf0f2}.campaign-action-cell{grid-column:1 / -1;flex-direction:row;align-items:center;flex-wrap:wrap}.campaign-primary-action{width:auto;min-width:145px}.campaign-control-strip{border-radius:9px}}
        @media(max-width:680px){.campaign-detail-titlebar{align-items:flex-start;flex-direction:column}.campaign-heading-actions{width:100%}.campaign-heading-actions>*{flex:1}.campaign-control-strip{display:grid;grid-template-columns:repeat(3,1fr)}.campaign-progress-compact{grid-column:1 / -1}.campaign-stat-inline{min-width:0;border-bottom:1px solid #e5eaed;padding:8px 9px}.campaign-agent-select{grid-column:1 / -1;border-top:0;padding:8px 10px}.campaign-agent-select select{max-width:none}.campaign-list-toolbar{align-items:flex-start}.campaign-visible-count{display:none}.campaign-filter-tabs{gap:18px}.campaign-client-row{grid-template-columns:1fr;padding:12px}.campaign-person-cell,.campaign-status-cell,.campaign-activity-cell,.campaign-action-cell{grid-column:1}.campaign-status-cell{align-items:flex-start}.campaign-status-meta{align-items:flex-start;flex-direction:row;gap:10px}.campaign-activity-cell{padding-top:8px}.campaign-action-cell{align-items:stretch}.campaign-primary-action{width:100%}.campaign-attempt-actions,.campaign-record-actions{justify-content:flex-start;gap:12px}.outreach-dialog-backdrop{padding:9px}.outreach-dialog{padding:14px}.outreach-followup-row{grid-template-columns:1fr}.outreach-dialog-actions .campaign-work-button{flex:1}.outreach-dialog-actions .campaign-quiet-button{flex:1}}
      `}</style>
    </>
  )
}
