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
    return (
      <article className={`outreach-client-card${focus ? ' outreach-client-focus' : ''}`}>
        <div className="outreach-client-top">
          <div className="outreach-client-person">
            <div className="outreach-client-name">{clientName(row.client)}</div>
            <div className="outreach-client-phone">{row.client?.phone || 'No phone number entered'}</div>
            <div className="outreach-client-meta">{products(row.client)} · {[row.client?.county, row.client?.state].filter(Boolean).join(', ') || 'Location not entered'}</div>
            {canViewAll ? <div className="outreach-client-owner">Assigned to {row.owner_name}</div> : null}
          </div>
          <div className="outreach-status-wrap">
            {overdue ? <span className="outreach-due overdue">OVERDUE</span> : dueToday ? <span className="outreach-due today">DUE TODAY</span> : null}
            <span className={`outreach-status status-${row.status}`}>{statusLabel(row.status)}</span>
          </div>
        </div>

        <div className="outreach-client-info">
          <div><span>DOB</span><strong>{formatDate(row.client?.date_of_birth)}</strong></div>
          <div><span>Attempts / Touches</span><strong>{Number(row.attempt_count || 0)}</strong></div>
          <div><span>Last Activity</span><strong>{formatDateTime(row.last_contacted_at)}</strong></div>
          <div><span>Last Result</span><strong>{outcomeLabel(row.last_outcome)}</strong></div>
        </div>

        {row.status === 'follow_up' && row.follow_up_date ? (
          <div className={`outreach-next-action${overdue ? ' overdue' : ''}`}><strong>Next Action:</strong> {row.next_action || 'Follow up with client'} · {formatDate(row.follow_up_date)}{row.follow_up_time ? ` at ${formatTime(row.follow_up_time)}` : ''}</div>
        ) : row.next_action ? <div className="outreach-next-action"><strong>Next Action:</strong> {row.next_action}</div> : null}
        {row.last_note ? <div className="outreach-last-note"><strong>Last Note:</strong> {row.last_note}</div> : null}

        <div className="outreach-quick-actions">
          <button className="btn outreach-outcome attempted" type="button" disabled={busyId === row.id} onClick={() => void record(row, 'no_answer')}>NO ANSWER</button>
          <button className="btn outreach-outcome attempted" type="button" disabled={busyId === row.id} onClick={() => void record(row, 'voicemail')}>VOICEMAIL</button>
          <button className="btn outreach-outcome attempted" type="button" disabled={busyId === row.id} onClick={() => void record(row, 'busy')}>BUSY</button>
          <button className="btn outreach-outcome spoke" type="button" disabled={busyId === row.id} onClick={() => openConversation(row)}>SPOKE / UPDATE</button>
        </div>
        <div className="outreach-secondary-actions">
          <Link prefetch={false} className="btn btn-secondary" href={`/clients/${row.client_id}`}>OPEN CLIENT</Link>
          {row.status !== 'not_contacted' ? <button className="btn btn-secondary" type="button" disabled={busyId === row.id} onClick={() => void resetRow(row)}>RESET TO NOT CONTACTED</button> : null}
          <button className="btn btn-secondary" type="button" disabled={busyId === row.id} onClick={() => void removeRow(row)}>REMOVE</button>
        </div>
      </article>
    )
  }

  const nextRow = readyRows[0] || null
  const completionPercent = stats.total ? Math.round((stats.resolved / stats.total) * 100) : 0

  return (
    <>
      <div className="campaign-detail-heading">
        <div><span className="campaign-detail-topic">{topicLabel(campaign.topic)}</span><h1>{campaign.name}</h1><p className="subtle">Track attempts, real conversations, follow-ups, and completed outreach.</p></div>
        <div className="campaign-heading-actions"><Link prefetch={false} href="/campaigns" className="btn btn-secondary">ALL CAMPAIGNS</Link><Link prefetch={false} href="/clients" className="btn btn-secondary">ADD CLIENTS</Link><button type="button" className="btn btn-primary" onClick={() => setWorkMode((value) => !value)}>{workMode ? 'SHOW FULL CAMPAIGN' : 'WORK NEXT CLIENT'}</button></div>
      </div>

      {canViewAll ? <div className="campaign-agent-filter"><label>Agent<select className="select" value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}><option value="all">All agents</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}</select></label></div> : null}

      <div className="campaign-progress-row">
        <div className="campaign-progress-main"><div><span>Campaign resolved</span><strong>{completionPercent}%</strong></div><div className="campaign-detail-progress"><span style={{ width: `${completionPercent}%` }} /></div></div>
        <div className="campaign-mini-stat"><span>Total</span><strong>{stats.total}</strong></div>
        <div className="campaign-mini-stat"><span>Not Contacted</span><strong>{stats.notContacted}</strong></div>
        <div className="campaign-mini-stat"><span>Attempted</span><strong>{stats.attempted}</strong></div>
        <div className="campaign-mini-stat"><span>Spoke</span><strong>{stats.spoke}</strong></div>
        <div className="campaign-mini-stat"><span>Follow-Up</span><strong>{stats.followUp}</strong></div>
        <div className="campaign-mini-stat"><span>Completed</span><strong>{stats.completed}</strong></div>
      </div>

      {message ? <div className="notice" style={{ marginBottom: 14 }}>{message}</div> : null}

      {workMode ? (
        nextRow ? <section className="campaign-work-next"><div className="campaign-next-label">NEXT CLIENT · {readyRows.length} ready now</div><ClientCard row={nextRow} focus /></section>
          : <section className="card"><div className="empty"><strong>No clients need action right now.</strong><br />Future follow-ups remain scheduled and resolved clients stay in campaign history.</div></section>
      ) : (
        <>
          <div className="campaign-filter-tabs">
            {([
              ['open', 'OPEN'], ['not_contacted', 'NOT CONTACTED'], ['attempted', 'ATTEMPTED'], ['spoke', 'SPOKE'], ['follow_up', 'FOLLOW-UP'], ['resolved', 'RESOLVED'], ['all', 'ALL']
            ] as Array<[Filter, string]>).map(([key, label]) => <button key={key} type="button" className={`btn ${filter === key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter(key)}>{label}</button>)}
          </div>
          {!visibleRows.length ? <section className="card"><div className="empty">No clients match this campaign view.</div></section> : <div className="outreach-client-list">{visibleRows.map((row) => <ClientCard key={row.id} row={row} />)}</div>}
        </>
      )}

      {dialog ? (
        <div className="outreach-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busyId) setDialog(null) }}>
          <div className="outreach-dialog" role="dialog" aria-modal="true" aria-label="Record client conversation">
            <div className="outreach-dialog-head"><div><strong>{clientName(dialog.row.client)}</strong><span>Record what happened and what needs to happen next.</span></div><button type="button" className="btn btn-secondary" disabled={Boolean(busyId)} onClick={() => setDialog(null)}>Close</button></div>
            <div className="form-grid">
              <label className="label">Conversation result<select className="select" value={result} onChange={(event) => setResult(event.target.value)}><option value="spoke">Spoke — still open</option><option value="follow_up">Follow-Up Needed</option><option value="completed">Completed</option><option value="not_interested">Not Interested</option><option value="do_not_call">Do Not Call</option><option value="unreachable">Unreachable / Close</option></select></label>
              {result === 'follow_up' ? <label className="label">Next action<input className="input" value={nextAction} onChange={(event) => setNextAction(event.target.value)} placeholder="Example: Compare Medicare plans" /></label> : null}
              {result === 'follow_up' ? <label className="label">Follow-up date<input className="input" inputMode="numeric" value={followUpDate} onChange={(event) => setFollowUpDate(event.target.value)} placeholder="MM/DD/YYYY" /></label> : null}
              {result === 'follow_up' ? <label className="label">Time (optional)<input className="input" type="time" value={followUpTime} onChange={(event) => setFollowUpTime(event.target.value)} /></label> : null}
              <label className="label span-2">Notes<textarea className="textarea" value={note} onChange={(event) => setNote(event.target.value)} placeholder="What did you discuss?" /></label>
            </div>
            {message ? <div className="notice" style={{ marginTop: 12 }}>{message}</div> : null}
            <div className="outreach-dialog-actions"><button type="button" className="btn btn-primary" disabled={Boolean(busyId)} onClick={() => void submitConversation()}>{busyId ? 'Saving…' : 'SAVE RESULT'}</button></div>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        .campaign-detail-heading{display:flex;justify-content:space-between;align-items:end;gap:14px;flex-wrap:wrap;margin-bottom:14px}.campaign-detail-heading h1{margin:5px 0 4px}.campaign-detail-topic{display:inline-flex;padding:4px 8px;border-radius:999px;border:1px solid #d7e0e7;background:#f8fafc;color:#526271;font-size:.7rem;font-weight:900;text-transform:uppercase}.campaign-heading-actions{display:flex;gap:8px;flex-wrap:wrap}.campaign-agent-filter{display:flex;justify-content:flex-end;margin-bottom:10px}.campaign-agent-filter label{font-size:.75rem;font-weight:900;color:#64748b}.campaign-agent-filter .select{display:block;margin-top:4px;min-width:210px}
        .campaign-progress-row{display:grid;grid-template-columns:minmax(220px,2fr) repeat(6,minmax(88px,1fr));gap:8px;margin-bottom:14px}.campaign-progress-main,.campaign-mini-stat{background:#fff;border:1px solid #dfe6eb;border-radius:12px;padding:11px}.campaign-progress-main>div:first-child{display:flex;justify-content:space-between;gap:10px}.campaign-progress-main span,.campaign-mini-stat span{display:block;color:#718096;font-size:.68rem;font-weight:900;text-transform:uppercase}.campaign-progress-main strong,.campaign-mini-stat strong{display:block;color:#253646;font-size:1.08rem;margin-top:2px}.campaign-detail-progress{height:7px;background:#e9eef1;border-radius:999px;overflow:hidden;margin-top:8px}.campaign-detail-progress span{display:block;height:100%;background:#7f9c96}.campaign-filter-tabs{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:12px}.campaign-filter-tabs .btn{font-size:.75rem;padding:7px 10px}.outreach-client-list{display:grid;gap:12px}
        .outreach-client-card{background:#fff;border:1px solid #dfe6eb;border-radius:14px;padding:14px}.outreach-client-focus{border:2px solid #7890a3;padding:13px}.outreach-client-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.outreach-client-person{min-width:0}.outreach-client-name{font-size:1.08rem;font-weight:900;color:#172033}.outreach-client-phone{font-size:1rem;font-weight:900;color:#31485b;margin-top:3px}.outreach-client-meta{font-size:.78rem;color:#64748b;margin-top:3px}.outreach-client-owner{font-size:.72rem;font-weight:800;color:#7a5b3e;margin-top:4px}.outreach-status-wrap{display:flex;flex-direction:column;align-items:flex-end;gap:5px}.outreach-status,.outreach-due{display:inline-flex;border-radius:999px;padding:5px 8px;font-size:.68rem;font-weight:900;white-space:nowrap;border:1px solid #d9e1e7;background:#f7f9fa;color:#526271}.outreach-due.overdue{background:#f8e8e8;color:#7a3e3e;border-color:#e5bcbc}.outreach-due.today{background:#fff6db;color:#775c17;border-color:#e7d394}.status-follow_up{background:#fff6db;color:#775c17;border-color:#e7d394}.status-completed{background:#e7f3ea;color:#376246;border-color:#bfd8c6}.status-attempted{background:#eef2f5;color:#526271}.status-spoke{background:#eaf0f6;color:#3d5870}.status-not_interested,.status-do_not_call,.status-unreachable{background:#f3eeee;color:#6b5050}
        .outreach-client-info{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:12px}.outreach-client-info div{border:1px solid #e5eaee;border-radius:9px;background:#fbfcfd;padding:8px;min-width:0}.outreach-client-info span{display:block;color:#718096;font-size:.65rem;font-weight:900;text-transform:uppercase}.outreach-client-info strong{display:block;color:#344454;font-size:.8rem;margin-top:2px;overflow-wrap:anywhere}.outreach-next-action,.outreach-last-note{margin-top:9px;border-radius:9px;padding:9px 10px;background:#f7faf8;border:1px solid #dde8e0;color:#46574b;font-size:.8rem}.outreach-next-action.overdue{background:#fbefef;border-color:#e8cccc;color:#704343}.outreach-last-note{background:#f8f9fb;border-color:#e1e6eb;color:#526271}.outreach-quick-actions,.outreach-secondary-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px}.outreach-outcome{font-size:.75rem;font-weight:900;background:#f0f3f5;color:#455765;border:1px solid #d7e0e5}.outreach-outcome.spoke{background:#e5edef;color:#34535b;border-color:#bfd0d5}.outreach-secondary-actions .btn{font-size:.72rem}.campaign-work-next{display:grid;gap:8px}.campaign-next-label{font-size:.75rem;font-weight:900;color:#64748b;text-transform:uppercase;letter-spacing:.04em}
        .outreach-dialog-backdrop{position:fixed;inset:0;z-index:120;background:rgba(15,23,42,.42);display:flex;align-items:center;justify-content:center;padding:18px}.outreach-dialog{width:min(680px,100%);background:#fff;border:1px solid #dbe3ea;border-radius:16px;padding:18px;box-shadow:0 20px 60px rgba(15,23,42,.25)}.outreach-dialog-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:14px}.outreach-dialog-head strong{display:block;font-size:1.06rem}.outreach-dialog-head span{display:block;color:#64748b;font-size:.8rem;margin-top:3px}.outreach-dialog-actions{display:flex;justify-content:flex-end;margin-top:14px}
        @media(max-width:1050px){.campaign-progress-row{grid-template-columns:repeat(3,minmax(0,1fr))}.campaign-progress-main{grid-column:span 3}.outreach-client-info{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:680px){.campaign-heading-actions{width:100%}.campaign-heading-actions .btn{flex:1;min-width:120px}.campaign-progress-row{grid-template-columns:repeat(2,minmax(0,1fr))}.campaign-progress-main{grid-column:span 2}.outreach-client-top{display:grid}.outreach-status-wrap{align-items:flex-start;flex-direction:row;flex-wrap:wrap}.outreach-client-info{grid-template-columns:1fr 1fr}.outreach-quick-actions .btn{flex:1;min-width:120px}.outreach-secondary-actions .btn{flex:1;min-width:130px}.outreach-dialog-backdrop{padding:10px}.outreach-dialog{padding:14px}.outreach-dialog-actions .btn{width:100%}}
      `}</style>
    </>
  )
}
