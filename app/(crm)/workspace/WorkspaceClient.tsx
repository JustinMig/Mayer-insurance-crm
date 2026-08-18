'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type Agent = { id: string; full_name: string }
type Tab = 'leads' | 'calendar'
type Lead = {
  id: string
  assigned_agent_id: string
  first_name: string
  last_name: string
  date_of_birth: string | null
  product_type: 'medicare' | 'life' | 'retirement'
  notes: string | null
  status: 'lead' | 'converted'
  client_id: string | null
  created_at: string
  updated_at: string
}
type CalendarEvent = {
  id: string
  assigned_agent_id: string
  title: string
  event_type: 'appointment' | 'activity'
  event_date: string
  start_time: string | null
  end_time: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

type LeadDraft = {
  id?: string
  assigned_agent_id: string
  first_name: string
  last_name: string
  date_of_birth: string
  product_type: 'medicare' | 'life' | 'retirement'
  notes: string
}

type EventDraft = {
  id?: string
  assigned_agent_id: string
  title: string
  event_type: 'appointment' | 'activity'
  event_date: string
  start_time: string
  end_time: string
  notes: string
}

function isoDate(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function formatDob(value: string | null) {
  if (!value) return 'DOB not entered'
  const date = parseIsoDate(value)
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function formatCreated(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function formatTime(value: string | null) {
  if (!value) return 'All day'
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number)
  const date = new Date(2000, 0, 1, hours, minutes)
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date)
}

function productLabel(value: Lead['product_type']) {
  if (value === 'medicare') return 'Medicare'
  if (value === 'life') return 'Life'
  return 'Retirement'
}

function agentTone(name: string) {
  const normalized = name.trim().toLowerCase()
  if (normalized === 'justin mayer') return 'justin'
  if (normalized === 'isaiah hernandez') return 'isaiah'
  return 'other'
}

function monthRange(monthDate: Date) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const last = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
  const start = addDays(first, -first.getDay())
  const end = addDays(last, 6 - last.getDay())
  const days: Date[] = []
  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) days.push(cursor)
  return { start, end, days }
}

export default function WorkspaceClient({ viewerId, viewerName, isManager, agents }: {
  viewerId: string
  viewerName: string
  isManager: boolean
  agents: Agent[]
}) {
  const today = useMemo(() => new Date(), [])
  const defaultOwner = isManager ? agents[0]?.id || '' : viewerId
  const [tab, setTab] = useState<Tab>('leads')
  const [leads, setLeads] = useState<Lead[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [ownerFilter, setOwnerFilter] = useState('all')
  const [leadOpen, setLeadOpen] = useState(false)
  const [eventOpen, setEventOpen] = useState(false)
  const [leadDraft, setLeadDraft] = useState<LeadDraft>({
    assigned_agent_id: defaultOwner,
    first_name: '', last_name: '', date_of_birth: '', product_type: 'medicare', notes: ''
  })
  const [eventDraft, setEventDraft] = useState<EventDraft>({
    assigned_agent_id: defaultOwner,
    title: '', event_type: 'appointment', event_date: isoDate(today), start_time: '', end_time: '', notes: ''
  })
  const [loadingLeads, setLoadingLeads] = useState(true)
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const agentById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents])
  const calendarRange = useMemo(() => monthRange(month), [month])

  const loadLeads = useCallback(async () => {
    setLoadingLeads(true)
    try {
      const response = await fetch('/api/workspace/leads', { cache: 'no-store' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to load leads.')
      setLeads(Array.isArray(result.leads) ? result.leads : [])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load leads.')
    } finally {
      setLoadingLeads(false)
    }
  }, [])

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true)
    try {
      const params = new URLSearchParams({ from: isoDate(calendarRange.start), to: isoDate(calendarRange.end) })
      const response = await fetch(`/api/workspace/events?${params.toString()}`, { cache: 'no-store' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to load calendar.')
      setEvents(Array.isArray(result.events) ? result.events : [])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load calendar.')
    } finally {
      setLoadingEvents(false)
    }
  }, [calendarRange.start, calendarRange.end])

  useEffect(() => { void loadLeads() }, [loadLeads])
  useEffect(() => { void loadEvents() }, [loadEvents])

  const visibleLeads = useMemo(() => {
    const active = leads.filter((lead) => lead.status === 'lead')
    if (!isManager || ownerFilter === 'all') return active
    return active.filter((lead) => lead.assigned_agent_id === ownerFilter)
  }, [leads, isManager, ownerFilter])

  const visibleEvents = useMemo(() => {
    if (!isManager || ownerFilter === 'all') return events
    return events.filter((event) => event.assigned_agent_id === ownerFilter)
  }, [events, isManager, ownerFilter])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of visibleEvents) {
      const list = map.get(event.event_date) || []
      list.push(event)
      map.set(event.event_date, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.start_time || '00:00').localeCompare(b.start_time || '00:00'))
    }
    return map
  }, [visibleEvents])

  function openNewLead() {
    setLeadDraft({ assigned_agent_id: defaultOwner, first_name: '', last_name: '', date_of_birth: '', product_type: 'medicare', notes: '' })
    setLeadOpen(true)
    setError('')
  }

  function openEditLead(lead: Lead) {
    setLeadDraft({
      id: lead.id,
      assigned_agent_id: lead.assigned_agent_id,
      first_name: lead.first_name,
      last_name: lead.last_name,
      date_of_birth: lead.date_of_birth || '',
      product_type: lead.product_type,
      notes: lead.notes || ''
    })
    setLeadOpen(true)
    setError('')
  }

  async function saveLead() {
    if (busy) return
    if (!leadDraft.first_name.trim() || !leadDraft.last_name.trim()) {
      setError('Enter the lead first and last name.')
      return
    }
    if (isManager && !leadDraft.assigned_agent_id) {
      setError('Choose Justin or Isaiah for this lead.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const response = await fetch(leadDraft.id ? `/api/workspace/leads/${leadDraft.id}` : '/api/workspace/leads', {
        method: leadDraft.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leadDraft)
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to save lead.')
      setLeadOpen(false)
      await loadLeads()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save lead.')
    } finally {
      setBusy(false)
    }
  }

  async function deleteLead(lead: Lead) {
    if (!window.confirm(`Delete lead ${lead.first_name} ${lead.last_name}?`)) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/workspace/leads/${lead.id}`, { method: 'DELETE' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to delete lead.')
      await loadLeads()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete lead.')
    } finally {
      setBusy(false)
    }
  }

  async function convertLead(lead: Lead) {
    if (busy) return
    if (!window.confirm(`Save ${lead.first_name} ${lead.last_name} to Client Records?`)) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/workspace/leads/${lead.id}/convert`, { method: 'POST' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to create client record.')
      if (!result.client_id) throw new Error('Client record was created without an ID.')
      window.location.href = `/clients/${result.client_id}?created=1`
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create client record.')
      setBusy(false)
    }
  }

  function openNewEvent(date = isoDate(today)) {
    setEventDraft({
      assigned_agent_id: defaultOwner,
      title: '', event_type: 'appointment', event_date: date, start_time: '', end_time: '', notes: ''
    })
    setEventOpen(true)
    setError('')
  }

  function openEditEvent(event: CalendarEvent) {
    setEventDraft({
      id: event.id,
      assigned_agent_id: event.assigned_agent_id,
      title: event.title,
      event_type: event.event_type,
      event_date: event.event_date,
      start_time: event.start_time?.slice(0, 5) || '',
      end_time: event.end_time?.slice(0, 5) || '',
      notes: event.notes || ''
    })
    setEventOpen(true)
    setError('')
  }

  async function saveEvent() {
    if (busy) return
    if (!eventDraft.title.trim()) {
      setError('Enter a title for the appointment or activity.')
      return
    }
    if (!eventDraft.event_date) {
      setError('Choose a date.')
      return
    }
    if (isManager && !eventDraft.assigned_agent_id) {
      setError('Choose Justin or Isaiah for this calendar item.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const response = await fetch(eventDraft.id ? `/api/workspace/events/${eventDraft.id}` : '/api/workspace/events', {
        method: eventDraft.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventDraft)
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to save calendar item.')
      setEventOpen(false)
      const savedDate = parseIsoDate(eventDraft.event_date)
      if (savedDate.getMonth() !== month.getMonth() || savedDate.getFullYear() !== month.getFullYear()) {
        setMonth(new Date(savedDate.getFullYear(), savedDate.getMonth(), 1))
      } else {
        await loadEvents()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save calendar item.')
    } finally {
      setBusy(false)
    }
  }

  async function deleteEvent() {
    if (!eventDraft.id || busy) return
    if (!window.confirm('Delete this calendar item?')) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/workspace/events/${eventDraft.id}`, { method: 'DELETE' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to delete calendar item.')
      setEventOpen(false)
      await loadEvents()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete calendar item.')
    } finally {
      setBusy(false)
    }
  }

  const monthTitle = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(month)

  return (
    <>
      <div className="workspace-heading">
        <div>
          <h1>Workspace</h1>
          <p className="subtle">Quick leads, follow-up work, appointments, and activities.</p>
        </div>
        <a className="btn btn-secondary" href="/dashboard">Back to Dashboard</a>
      </div>

      <div className="workspace-tabs">
        <button type="button" className={tab === 'leads' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setTab('leads')}>LEADS</button>
        <button type="button" className={tab === 'calendar' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setTab('calendar')}>CALENDAR</button>
      </div>

      {isManager ? (
        <div className="workspace-owner-bar">
          <strong>View:</strong>
          <button type="button" className={ownerFilter === 'all' ? 'workspace-owner-filter active' : 'workspace-owner-filter'} onClick={() => setOwnerFilter('all')}>Both</button>
          {agents.map((agent) => (
            <button key={agent.id} type="button" className={`workspace-owner-filter ${agentTone(agent.full_name)}${ownerFilter === agent.id ? ' active' : ''}`} onClick={() => setOwnerFilter(agent.id)}>
              {agent.full_name.split(' ')[0]}
            </button>
          ))}
        </div>
      ) : null}

      {error ? <div className="notice" style={{ marginTop: 14 }}>{error}</div> : null}

      {tab === 'leads' ? (
        <section className="workspace-panel">
          <div className="workspace-panel-head">
            <div><h2>Leads</h2><p className="subtle">Keep the first contact simple. Convert it to a full client when ready.</p></div>
            <button type="button" className="btn btn-primary" onClick={openNewLead}>+ ADD LEAD</button>
          </div>

          {loadingLeads ? <div className="card card-pad">Loading leads…</div> : null}
          {!loadingLeads && !visibleLeads.length ? <div className="card card-pad empty">No active leads yet.</div> : null}
          <div className="workspace-lead-list">
            {visibleLeads.map((lead) => {
              const agent = agentById.get(lead.assigned_agent_id)
              const tone = agentTone(agent?.full_name || '')
              return (
                <article className="card workspace-lead-card" key={lead.id}>
                  <div className="workspace-lead-main">
                    <div className="workspace-lead-title-row">
                      <strong>{lead.first_name} {lead.last_name}</strong>
                      <span className="workspace-product-pill">{productLabel(lead.product_type)}</span>
                      {isManager && agent ? <span className={`workspace-agent-pill ${tone}`}>{agent.full_name.split(' ')[0]}</span> : null}
                    </div>
                    <span className="subtle">{formatDob(lead.date_of_birth)} · Added {formatCreated(lead.created_at)}</span>
                    {lead.notes ? <p>{lead.notes}</p> : <p className="subtle">No notes yet.</p>}
                  </div>
                  <div className="workspace-lead-actions">
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => openEditLead(lead)}>Edit</button>
                    <button type="button" className="btn btn-primary btn-small" disabled={busy} onClick={() => void convertLead(lead)}>SAVE TO CLIENT RECORD</button>
                    <button type="button" className="btn btn-secondary btn-small" disabled={busy} onClick={() => void deleteLead(lead)}>Delete</button>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ) : (
        <section className="workspace-panel">
          <div className="workspace-panel-head calendar-head">
            <div>
              <h2>Calendar</h2>
              <div className="workspace-calendar-legend">
                {agents.map((agent) => <span key={agent.id}><i className={agentTone(agent.full_name)} />{agent.full_name.split(' ')[0]}</span>)}
              </div>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => openNewEvent()}>+ ADD APPOINTMENT / ACTIVITY</button>
          </div>

          <div className="workspace-calendar-controls">
            <div className="workspace-calendar-nav">
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}>Today</button>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
            </div>
            <strong>{monthTitle}</strong>
          </div>

          {loadingEvents ? <div className="subtle" style={{ marginBottom: 10 }}>Loading calendar…</div> : null}
          <div className="workspace-calendar-scroll">
            <div className="workspace-calendar-grid">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day) => <div className="workspace-calendar-weekday" key={day}>{day}</div>)}
              {calendarRange.days.map((day) => {
                const key = isoDate(day)
                const dayEvents = eventsByDate.get(key) || []
                const outside = day.getMonth() !== month.getMonth()
                const isToday = key === isoDate(today)
                return (
                  <div className={`workspace-calendar-day${outside ? ' outside' : ''}${isToday ? ' today' : ''}`} key={key}>
                    <button type="button" className="workspace-day-number" onClick={() => openNewEvent(key)} aria-label={`Add calendar item on ${key}`}>{day.getDate()}</button>
                    <div className="workspace-day-events">
                      {dayEvents.map((event) => {
                        const agent = agentById.get(event.assigned_agent_id)
                        const tone = agentTone(agent?.full_name || '')
                        return (
                          <button key={event.id} type="button" className={`workspace-event ${tone}`} onClick={() => openEditEvent(event)}>
                            <span>{formatTime(event.start_time)}</span>
                            <strong>{event.title}</strong>
                            <small>{event.event_type === 'appointment' ? 'Appointment' : 'Activity'}{isManager && agent ? ` · ${agent.full_name.split(' ')[0]}` : ''}</small>
                          </button>
                        )
                      })}
                    </div>
                    <button type="button" className="workspace-day-add" onClick={() => openNewEvent(key)}>+</button>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {leadOpen ? (
        <div className="workspace-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setLeadOpen(false) }}>
          <section className="workspace-modal" role="dialog" aria-modal="true" aria-label={leadDraft.id ? 'Edit lead' : 'Add lead'}>
            <div className="workspace-modal-head"><h2>{leadDraft.id ? 'Edit Lead' : 'Add Lead'}</h2><button type="button" className="btn btn-secondary btn-small" onClick={() => setLeadOpen(false)} disabled={busy}>Close</button></div>
            <div className="workspace-form-grid">
              {isManager ? (
                <label className="label span-2">Agent
                  <select className="select" value={leadDraft.assigned_agent_id} onChange={(e) => setLeadDraft((current) => ({ ...current, assigned_agent_id: e.target.value }))}>
                    <option value="">Choose Justin or Isaiah</option>
                    {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}
                  </select>
                </label>
              ) : null}
              <label className="label">First name<input className="input" value={leadDraft.first_name} onChange={(e) => setLeadDraft((current) => ({ ...current, first_name: e.target.value }))} /></label>
              <label className="label">Last name<input className="input" value={leadDraft.last_name} onChange={(e) => setLeadDraft((current) => ({ ...current, last_name: e.target.value }))} /></label>
              <label className="label">Date of birth<input className="input" type="date" value={leadDraft.date_of_birth} onChange={(e) => setLeadDraft((current) => ({ ...current, date_of_birth: e.target.value }))} /></label>
              <label className="label">Product
                <select className="select" value={leadDraft.product_type} onChange={(e) => setLeadDraft((current) => ({ ...current, product_type: e.target.value as LeadDraft['product_type'] }))}>
                  <option value="medicare">Medicare</option>
                  <option value="life">Life</option>
                  <option value="retirement">Retirement</option>
                </select>
              </label>
              <label className="label span-2">Notes<textarea className="textarea" rows={6} value={leadDraft.notes} onChange={(e) => setLeadDraft((current) => ({ ...current, notes: e.target.value }))} placeholder="Quick lead notes, follow-up information, best time to call, etc." /></label>
            </div>
            <div className="workspace-modal-actions"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void saveLead()}>{busy ? 'Saving…' : 'SAVE LEAD'}</button></div>
          </section>
        </div>
      ) : null}

      {eventOpen ? (
        <div className="workspace-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setEventOpen(false) }}>
          <section className="workspace-modal" role="dialog" aria-modal="true" aria-label={eventDraft.id ? 'Edit calendar item' : 'Add calendar item'}>
            <div className="workspace-modal-head"><h2>{eventDraft.id ? 'Edit Calendar Item' : 'Add Calendar Item'}</h2><button type="button" className="btn btn-secondary btn-small" onClick={() => setEventOpen(false)} disabled={busy}>Close</button></div>
            <div className="workspace-form-grid">
              {isManager ? (
                <label className="label span-2">Calendar owner
                  <select className="select" value={eventDraft.assigned_agent_id} onChange={(e) => setEventDraft((current) => ({ ...current, assigned_agent_id: e.target.value }))}>
                    <option value="">Choose Justin or Isaiah</option>
                    {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}
                  </select>
                </label>
              ) : null}
              <label className="label">Type
                <select className="select" value={eventDraft.event_type} onChange={(e) => setEventDraft((current) => ({ ...current, event_type: e.target.value as EventDraft['event_type'] }))}>
                  <option value="appointment">Appointment</option>
                  <option value="activity">Activity</option>
                </select>
              </label>
              <label className="label">Date<input className="input" type="date" value={eventDraft.event_date} onChange={(e) => setEventDraft((current) => ({ ...current, event_date: e.target.value }))} /></label>
              <label className="label span-2">Title<input className="input" value={eventDraft.title} onChange={(e) => setEventDraft((current) => ({ ...current, title: e.target.value }))} placeholder="Example: Medicare review with Mary Smith" /></label>
              <label className="label">Start time<input className="input" type="time" value={eventDraft.start_time} onChange={(e) => setEventDraft((current) => ({ ...current, start_time: e.target.value }))} /></label>
              <label className="label">End time<input className="input" type="time" value={eventDraft.end_time} onChange={(e) => setEventDraft((current) => ({ ...current, end_time: e.target.value }))} /></label>
              <label className="label span-2">Notes<textarea className="textarea" rows={5} value={eventDraft.notes} onChange={(e) => setEventDraft((current) => ({ ...current, notes: e.target.value }))} placeholder="Appointment or activity details" /></label>
            </div>
            <div className="workspace-modal-actions">
              {eventDraft.id ? <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void deleteEvent()}>DELETE</button> : null}
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void saveEvent()}>{busy ? 'Saving…' : 'SAVE'}</button>
            </div>
          </section>
        </div>
      ) : null}

      <style>{`
        .workspace-heading{display:flex;justify-content:space-between;gap:16px;align-items:end;flex-wrap:wrap}.workspace-heading h1{margin-bottom:4px}.workspace-tabs{display:flex;gap:8px;margin-top:18px;flex-wrap:wrap}.workspace-owner-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px}.workspace-owner-filter{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:7px 12px;font-weight:800;cursor:pointer}.workspace-owner-filter.active{box-shadow:0 0 0 2px #10263f inset}.workspace-owner-filter.justin{border-color:#2563eb;color:#1d4ed8}.workspace-owner-filter.isaiah{border-color:#dc2626;color:#b91c1c}.workspace-panel{margin-top:18px}.workspace-panel-head{display:flex;justify-content:space-between;gap:14px;align-items:end;flex-wrap:wrap;margin-bottom:14px}.workspace-panel-head h2{margin:0 0 3px}.workspace-lead-list{display:grid;gap:12px}.workspace-lead-card{padding:16px;display:flex;justify-content:space-between;gap:18px;align-items:center}.workspace-lead-main{display:grid;gap:7px;min-width:0}.workspace-lead-main p{margin:0;white-space:pre-wrap}.workspace-lead-title-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:1.06rem}.workspace-product-pill,.workspace-agent-pill{font-size:.72rem;font-weight:900;border-radius:999px;padding:4px 8px;background:#eef2f6;color:#334155}.workspace-agent-pill.justin{background:#dbeafe;color:#1d4ed8}.workspace-agent-pill.isaiah{background:#fee2e2;color:#b91c1c}.workspace-lead-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.workspace-calendar-legend{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-top:6px}.workspace-calendar-legend span{display:flex;align-items:center;gap:6px;font-size:.86rem;font-weight:800}.workspace-calendar-legend i{width:11px;height:11px;border-radius:999px;background:#64748b}.workspace-calendar-legend i.justin{background:#2563eb}.workspace-calendar-legend i.isaiah{background:#dc2626}.workspace-calendar-controls{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:2px 0 12px;flex-wrap:wrap}.workspace-calendar-nav{display:flex;gap:6px}.workspace-calendar-scroll{overflow-x:auto;border:1px solid #dce4ea;border-radius:14px;background:#fff}.workspace-calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(118px,1fr));min-width:826px}.workspace-calendar-weekday{padding:9px 8px;text-align:center;font-size:.76rem;font-weight:900;color:#64748b;border-bottom:1px solid #dce4ea;background:#f8fafc}.workspace-calendar-day{min-height:132px;padding:6px;border-right:1px solid #e5eaf0;border-bottom:1px solid #e5eaf0;position:relative;background:#fff}.workspace-calendar-day:nth-child(7n+7){border-right:0}.workspace-calendar-day.outside{background:#f8fafc;color:#94a3b8}.workspace-calendar-day.today{box-shadow:inset 0 0 0 2px #10263f}.workspace-day-number{border:0;background:transparent;font-weight:900;cursor:pointer;padding:2px 5px;border-radius:7px}.workspace-day-number:hover{background:#eef2f6}.workspace-day-events{display:grid;gap:4px;margin-top:4px}.workspace-event{border:0;text-align:left;border-radius:7px;padding:5px 6px;display:grid;gap:1px;cursor:pointer;background:#eef2f6;color:#334155;font-size:.72rem;overflow:hidden}.workspace-event.justin{background:#dbeafe;color:#1e3a8a;border-left:4px solid #2563eb}.workspace-event.isaiah{background:#fee2e2;color:#7f1d1d;border-left:4px solid #dc2626}.workspace-event span,.workspace-event small{font-size:.66rem;opacity:.88}.workspace-event strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.workspace-day-add{position:absolute;right:5px;top:4px;border:0;background:transparent;color:#94a3b8;font-size:18px;cursor:pointer}.workspace-modal-backdrop{position:fixed;inset:0;z-index:1500;background:rgba(15,23,42,.58);display:grid;place-items:center;padding:14px}.workspace-modal{width:min(680px,100%);max-height:calc(100dvh - 28px);overflow:auto;background:#fff;border-radius:18px;box-shadow:0 24px 80px rgba(15,23,42,.3);padding:18px}.workspace-modal-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:16px}.workspace-modal-head h2{margin:0}.workspace-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.workspace-form-grid .span-2{grid-column:1/-1}.workspace-modal-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:18px}.workspace-modal .textarea{width:100%;resize:vertical}
        @media(max-width:720px){.workspace-lead-card{align-items:stretch;flex-direction:column}.workspace-lead-actions{justify-content:flex-start}.workspace-form-grid{grid-template-columns:1fr}.workspace-form-grid .span-2{grid-column:auto}.workspace-modal{padding:15px}.workspace-panel-head.calendar-head{align-items:flex-start}.workspace-calendar-controls{align-items:flex-start}.workspace-calendar-grid{grid-template-columns:repeat(7,minmax(108px,1fr));min-width:756px}}
      `}</style>
    </>
  )
}
