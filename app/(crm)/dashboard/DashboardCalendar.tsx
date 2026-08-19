'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type Agent = { id: string; full_name: string }
type ClientOption = {
  id: string
  assigned_agent_id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
}
type LeadOption = {
  id: string
  assigned_agent_id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  date_of_birth: string | null
  created_at: string | null
}
type CalendarEvent = {
  id: string
  assigned_agent_id: string
  client_id: string | null
  lead_id: string | null
  title: string
  event_type: 'appointment' | 'activity'
  event_date: string
  start_time: string | null
  end_time: string | null
  notes: string | null
  status: 'scheduled' | 'completed' | 'needs_reschedule'
  reschedule_note: string | null
}
type EventDraft = {
  id?: string
  assigned_agent_id: string
  client_id: string
  lead_id: string
  title: string
  event_type: 'appointment' | 'activity'
  event_date: string
  start_time: string
  end_time: string
  notes: string
}
type ViewMode = 'today' | 'reschedule' | 'day' | null

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

function monthRange(monthDate: Date) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const last = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
  const start = addDays(first, -first.getDay())
  const end = addDays(last, 6 - last.getDay())
  const days: Date[] = []
  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) days.push(cursor)
  return { start, end, days }
}

function formatTime(value: string | null) {
  if (!value) return 'All day'
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number)
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, hours, minutes))
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(parseIsoDate(value))
}

function agentTone(name: string) {
  const normalized = name.trim().toLowerCase()
  if (normalized === 'justin mayer') return 'justin'
  if (normalized === 'isaiah hernandez') return 'isaiah'
  return 'other'
}

function clientName(client: ClientOption | undefined) {
  if (!client) return 'Client'
  return [client.first_name, client.last_name].filter(Boolean).join(' ').trim() || 'Client'
}

function leadName(lead: LeadOption | undefined) {
  if (!lead) return 'Lead'
  return [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim() || 'Lead'
}

export default function DashboardCalendar({ agents, viewerName }: { agents: Agent[]; viewerName: string }) {
  const today = useMemo(() => new Date(), [])
  const todayKey = useMemo(() => isoDate(today), [today])
  const defaultOwner = agents[0]?.id || ''
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [todayAppointments, setTodayAppointments] = useState<CalendarEvent[]>([])
  const [rescheduledAppointments, setRescheduledAppointments] = useState<CalendarEvent[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [leads, setLeads] = useState<LeadOption[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [leadSearch, setLeadSearch] = useState('')
  const [draft, setDraft] = useState<EventDraft>({
    assigned_agent_id: defaultOwner,
    client_id: '',
    lead_id: '',
    title: '',
    event_type: 'appointment',
    event_date: todayKey,
    start_time: '',
    end_time: '',
    notes: ''
  })

  const range = useMemo(() => monthRange(month), [month])
  const agentById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents])
  const clientById = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients])
  const leadById = useMemo(() => new Map(leads.map((lead) => [lead.id, lead])), [leads])

  const loadCalendar = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ from: isoDate(range.start), to: isoDate(range.end) })
      const [eventsResponse, queuesResponse, clientsResponse, leadsResponse] = await Promise.all([
        fetch(`/api/workspace/events?${params.toString()}`, { cache: 'no-store' }),
        fetch(`/api/workspace/queues?date=${encodeURIComponent(todayKey)}`, { cache: 'no-store' }),
        fetch('/api/workspace/clients', { cache: 'no-store' }),
        fetch('/api/workspace/calendar-leads', { cache: 'no-store' })
      ])
      const [eventResult, queueResult, clientResult, leadResult] = await Promise.all([
        eventsResponse.json().catch(() => ({})),
        queuesResponse.json().catch(() => ({})),
        clientsResponse.json().catch(() => ({})),
        leadsResponse.json().catch(() => ({}))
      ])
      if (!eventsResponse.ok) throw new Error(eventResult.error || 'Unable to load calendar.')
      if (!queuesResponse.ok) throw new Error(queueResult.error || 'Unable to load appointments.')
      if (!clientsResponse.ok) throw new Error(clientResult.error || 'Unable to load client names.')
      if (!leadsResponse.ok) throw new Error(leadResult.error || 'Unable to load lead names.')
      setEvents(Array.isArray(eventResult.events) ? eventResult.events : [])
      setTodayAppointments(Array.isArray(queueResult.today) ? queueResult.today : [])
      setRescheduledAppointments(Array.isArray(queueResult.rescheduled) ? queueResult.rescheduled : [])
      setClients(Array.isArray(clientResult.clients) ? clientResult.clients : [])
      setLeads(Array.isArray(leadResult.leads) ? leadResult.leads : [])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard calendar.')
    } finally {
      setLoading(false)
    }
  }, [range.start, range.end, todayKey])

  useEffect(() => { void loadCalendar() }, [loadCalendar])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events.filter((item) => item.status === 'scheduled')) {
      const list = map.get(event.event_date) || []
      list.push(event)
      map.set(event.event_date, list)
    }
    for (const list of map.values()) list.sort((a, b) => (a.start_time || '00:00').localeCompare(b.start_time || '00:00'))
    return map
  }, [events])

  const dayItems = selectedDay ? eventsByDate.get(selectedDay) || [] : []
  const monthTitle = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(month)
  const ownerClients = useMemo(() => clients.filter((client) => client.assigned_agent_id === draft.assigned_agent_id), [clients, draft.assigned_agent_id])
  const clientChoices = useMemo(() => {
    const search = clientSearch.trim().toLowerCase()
    if (!search) return ownerClients.slice(0, 80)
    return ownerClients.filter((client) => `${clientName(client)} ${client.phone || ''}`.toLowerCase().includes(search)).slice(0, 80)
  }, [ownerClients, clientSearch])
  const ownerLeads = useMemo(() => leads.filter((lead) => lead.assigned_agent_id === draft.assigned_agent_id), [leads, draft.assigned_agent_id])
  const leadChoices = useMemo(() => {
    const search = leadSearch.trim().toLowerCase()
    if (!search) return ownerLeads.slice(0, 80)
    return ownerLeads.filter((lead) => `${leadName(lead)} ${lead.phone || ''}`.toLowerCase().includes(search)).slice(0, 80)
  }, [ownerLeads, leadSearch])

  function openDay(day: string) {
    setSelectedDay(day)
    setViewMode('day')
  }

  function closeView() {
    setViewMode(null)
    setSelectedDay(null)
  }

  function openNewEvent(date = todayKey) {
    setDraft({
      assigned_agent_id: defaultOwner,
      client_id: '',
      lead_id: '',
      title: '',
      event_type: 'appointment',
      event_date: date,
      start_time: '',
      end_time: '',
      notes: ''
    })
    setClientSearch('')
    setLeadSearch('')
    setError('')
    setEditorOpen(true)
  }

  function openEditEvent(event: CalendarEvent) {
    setDraft({
      id: event.id,
      assigned_agent_id: event.assigned_agent_id,
      client_id: event.client_id || '',
      lead_id: event.lead_id || '',
      title: event.title,
      event_type: event.event_type,
      event_date: event.event_date,
      start_time: event.start_time?.slice(0, 5) || '',
      end_time: event.end_time?.slice(0, 5) || '',
      notes: event.notes || ''
    })
    setClientSearch('')
    setLeadSearch('')
    setError('')
    setEditorOpen(true)
  }

  function findEvent(id: string | undefined) {
    if (!id) return undefined
    return events.find((item) => item.id === id)
      || todayAppointments.find((item) => item.id === id)
      || rescheduledAppointments.find((item) => item.id === id)
  }

  async function saveEvent() {
    if (busy) return
    if (!draft.title.trim()) return setError('Enter a title for the appointment or activity.')
    if (!draft.event_date) return setError('Choose a date.')
    if (!draft.assigned_agent_id) return setError('Choose an agent.')
    setBusy(true)
    setError('')
    try {
      const response = await fetch(draft.id ? `/api/workspace/events/${draft.id}` : '/api/workspace/events', {
        method: draft.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft)
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to save calendar item.')
      const savedDate = parseIsoDate(draft.event_date)
      setEditorOpen(false)
      if (savedDate.getMonth() !== month.getMonth() || savedDate.getFullYear() !== month.getFullYear()) {
        setMonth(new Date(savedDate.getFullYear(), savedDate.getMonth(), 1))
      }
      await loadCalendar()
      if (viewMode === 'day') setSelectedDay(draft.event_date)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save calendar item.')
    } finally {
      setBusy(false)
    }
  }

  async function completeEvent(event: CalendarEvent) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/workspace/events/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete' })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to mark appointment completed.')
      if (draft.id === event.id) setEditorOpen(false)
      await loadCalendar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to mark appointment completed.')
    } finally {
      setBusy(false)
    }
  }

  async function rescheduleEvent(event: CalendarEvent) {
    if (busy) return
    const note = window.prompt('Why does this appointment need to be rescheduled?')
    if (note === null) return
    if (!note.trim()) {
      setError('Enter a reschedule note.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/workspace/events/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reschedule', note: note.trim() })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to move appointment to Reschedule.')
      if (draft.id === event.id) setEditorOpen(false)
      await loadCalendar()
      setViewMode('reschedule')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to move appointment to Reschedule.')
    } finally {
      setBusy(false)
    }
  }

  async function deleteEvent(event: CalendarEvent) {
    if (busy) return
    if (!window.confirm(`Delete “${event.title}”?`)) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/workspace/events/${event.id}`, { method: 'DELETE' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to delete calendar item.')
      if (draft.id === event.id) setEditorOpen(false)
      await loadCalendar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete calendar item.')
    } finally {
      setBusy(false)
    }
  }

  function actionButtons(event: CalendarEvent, needsReschedule = false) {
    return (
      <div className="dash-cal-card-actions">
        {event.client_id ? <a className="btn btn-secondary btn-small" href={`/clients/${event.client_id}`}>OPEN CLIENT</a> : null}
        {event.lead_id ? <a className="btn btn-secondary btn-small" href="/leads">VIEW LEADS</a> : null}
        {needsReschedule ? (
          <button type="button" className="btn btn-primary btn-small" disabled={busy} onClick={() => openEditEvent(event)}>SET NEW DATE / TIME</button>
        ) : (
          <>
            <button type="button" className="btn btn-success btn-small dash-cal-complete" disabled={busy} onClick={() => void completeEvent(event)}>COMPLETED</button>
            <button type="button" className="btn btn-secondary btn-small dash-cal-reschedule-action" disabled={busy} onClick={() => void rescheduleEvent(event)}>RESCHEDULE</button>
            <button type="button" className="btn btn-secondary btn-small" disabled={busy} onClick={() => openEditEvent(event)}>EDIT</button>
          </>
        )}
        <button type="button" className="btn btn-secondary btn-small dash-cal-delete" disabled={busy} onClick={() => void deleteEvent(event)}>DELETE</button>
      </div>
    )
  }

  function eventCard(event: CalendarEvent, mode?: 'today' | 'reschedule') {
    const agent = agentById.get(event.assigned_agent_id)
    const linkedClient = event.client_id ? clientById.get(event.client_id) : undefined
    const linkedLead = event.lead_id ? leadById.get(event.lead_id) : undefined
    const tone = agentTone(agent?.full_name || '')
    const displayName = linkedClient ? clientName(linkedClient) : linkedLead ? leadName(linkedLead) : event.title
    const displayTime = `${formatTime(event.start_time)}${event.end_time ? ` – ${formatTime(event.end_time)}` : ''}`

    if (mode !== 'reschedule') {
      return (
        <details className={`dash-cal-view-card dash-cal-collapsed-card ${tone}`} key={event.id}>
          <summary className="dash-cal-collapsed-summary">
            <strong>{displayName}</strong>
            <span>{displayTime}</span>
          </summary>
          <div className="dash-cal-collapsed-body">
            <div className="dash-cal-view-pills">
              <span className={`dash-cal-agent ${tone}`}>{agent?.full_name.split(' ')[0] || viewerName.split(' ')[0] || 'Agent'}</span>
              <span className="dash-cal-type">{event.event_type === 'appointment' ? 'Appointment' : 'Activity'}</span>
            </div>
            {linkedClient || linkedLead ? <h3>{event.title}</h3> : null}
            {linkedClient ? <div className="dash-cal-client"><span>Client</span><strong>{clientName(linkedClient)}</strong>{linkedClient.phone ? <small>{linkedClient.phone}</small> : null}</div> : null}
            {linkedLead ? <div className="dash-cal-lead"><span>Lead</span><strong>{leadName(linkedLead)}</strong>{linkedLead.phone ? <small>{linkedLead.phone}</small> : null}</div> : null}
            {event.notes ? <div className="dash-cal-notes"><strong>Notes</strong><p>{event.notes}</p></div> : null}
            {actionButtons(event)}
          </div>
        </details>
      )
    }

    return (
      <article className={`dash-cal-view-card ${tone}`} key={event.id}>
        <div className="dash-cal-view-pills">
          <span className={`dash-cal-agent ${tone}`}>{agent?.full_name.split(' ')[0] || viewerName.split(' ')[0] || 'Agent'}</span>
          <span className="dash-cal-type">{event.event_type === 'appointment' ? 'Appointment' : 'Activity'}</span>
          <span className="dash-cal-reschedule-pill">Needs Reschedule</span>
        </div>
        <h3>{event.title}</h3>
        <strong className="dash-cal-view-time">{formatDate(event.event_date)} · {displayTime}</strong>
        {linkedClient ? <div className="dash-cal-client"><span>Client</span><strong>{clientName(linkedClient)}</strong>{linkedClient.phone ? <small>{linkedClient.phone}</small> : null}</div> : null}
        {linkedLead ? <div className="dash-cal-lead"><span>Lead</span><strong>{leadName(linkedLead)}</strong>{linkedLead.phone ? <small>{linkedLead.phone}</small> : null}</div> : null}
        {event.notes ? <div className="dash-cal-notes"><strong>Notes</strong><p>{event.notes}</p></div> : null}
        {event.reschedule_note ? <div className="dash-cal-reschedule-note"><strong>Reschedule note</strong><p>{event.reschedule_note}</p></div> : null}
        {actionButtons(event, true)}
      </article>
    )
  }

  const editingEvent = findEvent(draft.id)

  return (
    <section className="dashboard-calendar-block">
      <div className="dashboard-calendar-queue-buttons">
        <button type="button" className="dashboard-today-button" onClick={() => setViewMode('today')}>TODAY&apos;S APPOINTMENTS <span>{todayAppointments.length}</span></button>
        <button type="button" className="dashboard-reschedule-button" onClick={() => setViewMode('reschedule')}>RESCHEDULE <span>{rescheduledAppointments.length}</span></button>
      </div>

      <div className="card dashboard-calendar-card">
        <div className="dashboard-calendar-head">
          <div>
            <h2>Calendar</h2>
            <div className="dashboard-calendar-legend">{agents.map((agent) => <span key={agent.id}><i className={agentTone(agent.full_name)} />{agent.full_name.split(' ')[0]}</span>)}</div>
          </div>
          <div className="dashboard-calendar-actions">
            <button type="button" className="btn btn-primary btn-small" onClick={() => openNewEvent()}>+ ADD APPOINTMENT / ACTIVITY</button>
            <div className="dashboard-calendar-controls">
              <button type="button" className="btn btn-secondary btn-small" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}>Today</button>
              <button type="button" className="btn btn-secondary btn-small" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
            </div>
          </div>
        </div>
        <div className="dashboard-calendar-month">{monthTitle}</div>
        {error && !editorOpen ? <div className="notice dashboard-calendar-error">{error}</div> : null}
        {loading ? <div className="subtle dashboard-calendar-loading">Loading calendar…</div> : null}

        <div className="dashboard-calendar-grid">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day) => <div className="dashboard-calendar-weekday" key={day}>{day}</div>)}
          {range.days.map((day) => {
            const key = isoDate(day)
            const items = eventsByDate.get(key) || []
            const outside = day.getMonth() !== month.getMonth()
            const isToday = key === todayKey
            return (
              <button type="button" className={`dashboard-calendar-day${outside ? ' outside' : ''}${isToday ? ' today' : ''}`} key={key} onClick={() => openDay(key)}>
                <span className="dashboard-calendar-day-number">{day.getDate()}</span>
                <div className="dashboard-calendar-day-events">
                  {items.slice(0, 3).map((event) => {
                    const agent = agentById.get(event.assigned_agent_id)
                    const taggedClient = event.client_id ? clientById.get(event.client_id) : undefined
                    const taggedLead = event.lead_id ? leadById.get(event.lead_id) : undefined
                    const compactName = taggedClient ? clientName(taggedClient) : taggedLead ? leadName(taggedLead) : event.title
                    return <div className={`dashboard-calendar-event ${agentTone(agent?.full_name || '')}`} key={event.id}><span>{formatTime(event.start_time)}</span><strong>{compactName}</strong></div>
                  })}
                  {items.length > 3 ? <small>+{items.length - 3} more</small> : null}
                </div>
                {items.length ? <div className="dashboard-calendar-mobile-dots" aria-label={`${items.length} calendar items`}>{items.slice(0, 4).map((event) => <i key={event.id} className={agentTone(agentById.get(event.assigned_agent_id)?.full_name || '')} />)}</div> : null}
              </button>
            )
          })}
        </div>
      </div>

      {viewMode ? (
        <div className="dash-cal-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) closeView() }}>
          <section className="dash-cal-modal" role="dialog" aria-modal="true">
            <div className="dash-cal-modal-head">
              <div><h2>{viewMode === 'today' ? 'Today’s Appointments' : viewMode === 'reschedule' ? 'Reschedule' : selectedDay ? formatDate(selectedDay) : 'Calendar'}</h2>{viewMode === 'today' ? <p className="subtle">{formatDate(todayKey)}</p> : null}</div>
              <button type="button" className="btn btn-secondary btn-small" onClick={closeView} disabled={busy}>Close</button>
            </div>
            {viewMode === 'day' ? <div className="dash-cal-day-add"><button type="button" className="btn btn-primary" onClick={() => openNewEvent(selectedDay || todayKey)}>+ ADD APPOINTMENT / ACTIVITY</button></div> : null}
            <div className="dash-cal-view-list">
              {viewMode === 'today' ? (!todayAppointments.length ? <div className="card card-pad empty">No active appointments for today.</div> : todayAppointments.map((event) => eventCard(event, 'today'))) : null}
              {viewMode === 'reschedule' ? (!rescheduledAppointments.length ? <div className="card card-pad empty">No appointments waiting to be rescheduled.</div> : rescheduledAppointments.map((event) => eventCard(event, 'reschedule'))) : null}
              {viewMode === 'day' ? (!dayItems.length ? <div className="card card-pad empty">Nothing scheduled for this day.</div> : dayItems.map((event) => eventCard(event))) : null}
            </div>
          </section>
        </div>
      ) : null}

      {editorOpen ? (
        <div className="dash-cal-modal-backdrop dash-cal-editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setEditorOpen(false) }}>
          <section className="dash-cal-modal dash-cal-editor" role="dialog" aria-modal="true" aria-label={draft.id ? 'Edit calendar item' : 'Add calendar item'}>
            <div className="dash-cal-modal-head"><div><h2>{draft.id ? 'Edit Calendar Item' : 'Add Appointment / Activity'}</h2></div><button type="button" className="btn btn-secondary btn-small" onClick={() => setEditorOpen(false)} disabled={busy}>Close</button></div>
            {error ? <div className="notice" style={{ marginBottom: 12 }}>{error}</div> : null}
            <div className="dash-cal-form-grid">
              {agents.length > 1 ? <label><span>Agent</span><select value={draft.assigned_agent_id} onChange={(e) => { setDraft((current) => ({ ...current, assigned_agent_id: e.target.value, client_id: '', lead_id: '' })); setClientSearch(''); setLeadSearch('') }}>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}</select></label> : null}
              <label><span>Type</span><select value={draft.event_type} onChange={(e) => setDraft((current) => ({ ...current, event_type: e.target.value as 'appointment' | 'activity' }))}><option value="appointment">Appointment</option><option value="activity">Activity</option></select></label>
              <label className="span-2"><span>Title</span><input value={draft.title} onChange={(e) => setDraft((current) => ({ ...current, title: e.target.value }))} placeholder="Appointment or activity title" /></label>
              <label><span>Date</span><input type="date" value={draft.event_date} onChange={(e) => setDraft((current) => ({ ...current, event_date: e.target.value }))} /></label>
              <label><span>Start Time</span><input type="time" value={draft.start_time} onChange={(e) => setDraft((current) => ({ ...current, start_time: e.target.value }))} /></label>
              <label><span>End Time</span><input type="time" value={draft.end_time} onChange={(e) => setDraft((current) => ({ ...current, end_time: e.target.value }))} /></label>
              <label className="span-2"><span>Find Client (optional)</span><input value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} placeholder="Search client name or phone" /></label>
              <label className="span-2"><span>Tagged Client</span><select value={draft.client_id} onChange={(e) => setDraft((current) => ({ ...current, client_id: e.target.value, lead_id: e.target.value ? '' : current.lead_id }))}><option value="">No tagged client</option>{clientChoices.map((client) => <option key={client.id} value={client.id}>{clientName(client)}{client.phone ? ` · ${client.phone}` : ''}</option>)}</select></label>
              <div className="dash-cal-tag-divider span-2"><span>OR TAG A LEAD</span></div>
              <label className="span-2"><span>Find Lead (optional)</span><input value={leadSearch} onChange={(e) => setLeadSearch(e.target.value)} placeholder="Search lead name or phone" /></label>
              <label className="span-2"><span>Tagged Lead</span><select value={draft.lead_id} onChange={(e) => setDraft((current) => ({ ...current, lead_id: e.target.value, client_id: e.target.value ? '' : current.client_id }))}><option value="">No tagged lead</option>{leadChoices.map((lead) => <option key={lead.id} value={lead.id}>{leadName(lead)}{lead.phone ? ` · ${lead.phone}` : ''}</option>)}</select></label>
              <label className="span-2"><span>Notes</span><textarea rows={4} value={draft.notes} onChange={(e) => setDraft((current) => ({ ...current, notes: e.target.value }))} placeholder="Notes" /></label>
            </div>
            <div className="dash-cal-editor-actions">
              {editingEvent && editingEvent.status === 'scheduled' ? <button type="button" className="btn btn-success dash-cal-complete" disabled={busy} onClick={() => void completeEvent(editingEvent)}>COMPLETED</button> : null}
              {editingEvent && editingEvent.status === 'scheduled' ? <button type="button" className="btn btn-secondary dash-cal-reschedule-action" disabled={busy} onClick={() => void rescheduleEvent(editingEvent)}>RESCHEDULE</button> : null}
              {editingEvent ? <button type="button" className="btn btn-secondary dash-cal-delete" disabled={busy} onClick={() => void deleteEvent(editingEvent)}>DELETE</button> : null}
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void saveEvent()}>{busy ? 'Saving…' : draft.id ? 'SAVE CHANGES' : 'SAVE TO CALENDAR'}</button>
            </div>
          </section>
        </div>
      ) : null}

      <style>{`
        .dashboard-calendar-block{margin-top:20px}.dashboard-calendar-queue-buttons{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}.dashboard-today-button,.dashboard-reschedule-button{border:0;border-radius:13px;padding:15px 18px;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;min-height:52px}.dashboard-today-button{background:#2563eb;color:#fff}.dashboard-reschedule-button{background:#cbd5e1;color:#172033}.dashboard-today-button span,.dashboard-reschedule-button span{display:inline-grid;place-items:center;min-width:24px;height:24px;padding:0 7px;border-radius:999px;background:rgba(255,255,255,.22);font-size:.78rem}.dashboard-reschedule-button span{background:rgba(255,255,255,.65)}.dashboard-calendar-card{padding:16px;overflow:hidden}.dashboard-calendar-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}.dashboard-calendar-head h2{margin:0}.dashboard-calendar-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.dashboard-calendar-controls{display:flex;gap:6px}.dashboard-calendar-legend{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:6px}.dashboard-calendar-legend span{display:flex;align-items:center;gap:5px;font-weight:800;font-size:.82rem}.dashboard-calendar-legend i,.dashboard-calendar-mobile-dots i{width:10px;height:10px;border-radius:50%;background:#64748b}.dashboard-calendar-legend i.justin,.dashboard-calendar-mobile-dots i.justin{background:#2563eb}.dashboard-calendar-legend i.isaiah,.dashboard-calendar-mobile-dots i.isaiah{background:#dc2626}.dashboard-calendar-month{text-align:center;font-weight:900;font-size:1.03rem;margin:10px 0}.dashboard-calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border:1px solid #dce4ea;border-radius:13px;overflow:hidden}.dashboard-calendar-weekday{text-align:center;font-size:.75rem;font-weight:900;color:#64748b;background:#f8fafc;padding:8px 2px;border-bottom:1px solid #dce4ea}.dashboard-calendar-day{min-width:0;min-height:112px;background:#fff;border:0;border-right:1px solid #e5eaf0;border-bottom:1px solid #e5eaf0;padding:6px;text-align:left;cursor:pointer;position:relative}.dashboard-calendar-day:nth-child(7n){border-right:0}.dashboard-calendar-day.outside{background:#f8fafc;color:#94a3b8}.dashboard-calendar-day.today{box-shadow:inset 0 0 0 2px #10263f}.dashboard-calendar-day-number{font-weight:900}.dashboard-calendar-day-events{display:grid;gap:3px;margin-top:5px}.dashboard-calendar-event{display:grid;gap:1px;border-radius:6px;background:#eef2f6;padding:4px 5px;font-size:.66rem;overflow:hidden}.dashboard-calendar-event.justin{background:#dbeafe;color:#1e3a8a;border-left:3px solid #2563eb}.dashboard-calendar-event.isaiah{background:#fee2e2;color:#7f1d1d;border-left:3px solid #dc2626}.dashboard-calendar-event strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dashboard-calendar-event span{font-size:.61rem}.dashboard-calendar-mobile-dots{display:none}.dashboard-calendar-loading,.dashboard-calendar-error{margin-bottom:10px}.dash-cal-modal-backdrop{position:fixed;inset:0;z-index:1700;background:rgba(15,23,42,.58);display:grid;place-items:center;padding:14px}.dash-cal-editor-backdrop{z-index:1800}.dash-cal-modal{width:min(850px,100%);max-height:calc(100dvh - 28px);overflow:auto;background:#fff;border-radius:18px;padding:18px;box-shadow:0 24px 80px rgba(15,23,42,.32)}.dash-cal-editor{width:min(700px,100%)}.dash-cal-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}.dash-cal-modal-head h2{margin:0}.dash-cal-modal-head p{margin:5px 0 0}.dash-cal-day-add{display:flex;justify-content:flex-end;margin-bottom:12px}.dash-cal-view-list{display:grid;gap:10px}.dash-cal-view-card{border:1px solid #dce4ea;border-left:5px solid #64748b;border-radius:13px;padding:14px;display:grid;gap:9px}.dash-cal-view-card.justin{border-left-color:#2563eb}.dash-cal-view-card.isaiah{border-left-color:#dc2626}.dash-cal-view-card h3{margin:0}.dash-cal-collapsed-card{padding:0;display:block;overflow:hidden}.dash-cal-collapsed-summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px;background:#fff}.dash-cal-collapsed-summary::-webkit-details-marker{display:none}.dash-cal-collapsed-summary strong{font-size:1rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dash-cal-collapsed-summary span{flex:none;font-weight:900;color:#475569;font-size:.9rem}.dash-cal-collapsed-card[open] .dash-cal-collapsed-summary{background:#f8fafc;border-bottom:1px solid #e5eaf0}.dash-cal-collapsed-body{padding:14px;display:grid;gap:9px}.dash-cal-view-pills{display:flex;gap:6px;flex-wrap:wrap}.dash-cal-agent,.dash-cal-type,.dash-cal-reschedule-pill{font-size:.72rem;font-weight:900;border-radius:999px;padding:4px 8px;background:#eef2f6}.dash-cal-agent.justin{background:#dbeafe;color:#1d4ed8}.dash-cal-agent.isaiah{background:#fee2e2;color:#b91c1c}.dash-cal-reschedule-pill{background:#ffedd5;color:#9a3412}.dash-cal-view-time{color:#475569}.dash-cal-client,.dash-cal-lead,.dash-cal-notes,.dash-cal-reschedule-note{border-radius:10px;padding:9px 11px;background:#f8fafc}.dash-cal-client,.dash-cal-lead{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.dash-cal-client{background:#eff6ff}.dash-cal-lead{background:#f0fdf4;border:1px solid #bbf7d0}.dash-cal-client span,.dash-cal-lead span{font-size:.7rem;font-weight:900;text-transform:uppercase;color:#64748b}.dash-cal-notes p,.dash-cal-reschedule-note p{margin:5px 0 0;white-space:pre-wrap}.dash-cal-reschedule-note{background:#fff7ed}.dash-cal-card-actions{display:flex;gap:7px;flex-wrap:wrap;padding-top:3px}.dash-cal-complete{background:#15803d!important;border-color:#15803d!important;color:#fff!important}.dash-cal-reschedule-action{background:#f59e0b!important;border-color:#f59e0b!important;color:#111827!important}.dash-cal-delete{border-color:#fecaca!important;color:#b91c1c!important}.dash-cal-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.dash-cal-form-grid label{display:grid;gap:6px;font-weight:800;font-size:.84rem}.dash-cal-form-grid .span-2{grid-column:1/-1}.dash-cal-form-grid input,.dash-cal-form-grid select,.dash-cal-form-grid textarea{width:100%;border:1px solid #cbd5e1;border-radius:10px;padding:10px 11px;background:#fff;color:#172033;font:inherit}.dash-cal-form-grid textarea{resize:vertical}.dash-cal-tag-divider{display:flex;align-items:center;gap:10px;color:#64748b;font-size:.72rem;font-weight:900;letter-spacing:.06em}.dash-cal-tag-divider:before,.dash-cal-tag-divider:after{content:'';height:1px;background:#e2e8f0;flex:1}.dash-cal-editor-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px;flex-wrap:wrap}
        @media(max-width:720px){.dashboard-calendar-card{padding:10px}.dashboard-calendar-queue-buttons{gap:7px}.dashboard-today-button,.dashboard-reschedule-button{padding:10px 5px;font-size:.72rem;min-height:46px}.dashboard-calendar-actions{width:100%;justify-content:space-between}.dashboard-calendar-actions>.btn{flex:1}.dashboard-calendar-controls{flex:none}.dashboard-calendar-weekday{padding:7px 0;font-size:.62rem}.dashboard-calendar-day{min-height:58px;padding:4px 2px;text-align:center}.dashboard-calendar-day-number{font-size:.78rem}.dashboard-calendar-day-events{display:none}.dashboard-calendar-mobile-dots{display:flex;justify-content:center;gap:2px;margin-top:5px;min-height:7px}.dashboard-calendar-mobile-dots i{width:6px;height:6px}.dash-cal-modal{padding:14px}.dash-cal-form-grid{grid-template-columns:1fr}.dash-cal-form-grid .span-2{grid-column:auto}.dash-cal-tag-divider.span-2{grid-column:auto}.dash-cal-day-add .btn{width:100%}.dash-cal-card-actions .btn{flex:1;min-width:120px}.dash-cal-editor-actions .btn{flex:1}.dashboard-calendar-head{gap:8px}.dash-cal-collapsed-summary{padding:12px 11px;gap:8px}.dash-cal-collapsed-summary strong{font-size:.92rem}.dash-cal-collapsed-summary span{font-size:.8rem}}
      `}</style>
    </section>
  )
}
