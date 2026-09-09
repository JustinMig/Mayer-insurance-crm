'use client'

import { useEffect, useMemo, useState } from 'react'

type ClientOption = {
  id: string
  assigned_agent_id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
}

type CalendarBlock = {
  id: string
  title: string | null
  start_time: string | null
  end_time: string | null
}

const SLOT_MINUTES = 15
const WORKDAY_START = 8 * 60
const WORKDAY_END = 20 * 60

function clientName(client: ClientOption | null) {
  if (!client) return ''
  return [client.first_name, client.last_name].filter(Boolean).join(' ').trim() || 'Client'
}

function timeToMinutes(value: string | null | undefined) {
  const match = String(value || '').slice(0, 5).match(/^(\d{2}):(\d{2})$/)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function minutesToTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

function formatTime(value: string) {
  const minutes = timeToMinutes(value)
  if (minutes === null) return value
  const hour24 = Math.floor(minutes / 60)
  const minute = minutes % 60
  const suffix = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 || 12
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`
}

function blockRange(block: CalendarBlock) {
  const start = timeToMinutes(block.start_time)
  if (start === null) return null
  const end = timeToMinutes(block.end_time)
  return { start, end: end !== null && end > start ? end : start + SLOT_MINUTES }
}

function isBlocked(value: string, blocks: CalendarBlock[]) {
  const start = timeToMinutes(value)
  if (start === null) return false
  const end = start + SLOT_MINUTES
  return blocks.some((block) => {
    const range = blockRange(block)
    return Boolean(range && start < range.end && range.start < end)
  })
}

export default function AppointmentQuickSetter() {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [clients, setClients] = useState<ClientOption[]>([])
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null)
  const [eventDate, setEventDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [notes, setNotes] = useState('')
  const [blocks, setBlocks] = useState<CalendarBlock[]>([])
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('Search for a client, then choose a date and available time.')

  const times = useMemo(() => {
    const output: string[] = []
    for (let minutes = WORKDAY_START; minutes <= WORKDAY_END; minutes += SLOT_MINUTES) output.push(minutesToTime(minutes))
    return output
  }, [])

  useEffect(() => {
    if (selectedClient && query === clientName(selectedClient)) return
    const value = query.trim()
    setSelectedClient(null)
    setStartTime('')
    if (value.length < 1) {
      setClients([])
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      setSearching(true)
      void fetch(`/api/workspace/clients?q=${encodeURIComponent(value)}`, { cache: 'no-store' })
        .then(async (response) => {
          const result = await response.json().catch(() => ({}))
          if (!response.ok) throw new Error(result.error || 'Unable to search clients.')
          if (!cancelled) setClients((Array.isArray(result.clients) ? result.clients : []).slice(0, 30))
        })
        .catch((error) => {
          if (!cancelled) {
            setClients([])
            setStatus(error instanceof Error ? error.message : 'Unable to search clients.')
          }
        })
        .finally(() => { if (!cancelled) setSearching(false) })
    }, 220)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query, selectedClient])

  useEffect(() => {
    setBlocks([])
    setStartTime('')
    if (!selectedClient || !eventDate) {
      if (selectedClient) setStatus('Choose an appointment date to check the calendar.')
      return
    }

    let cancelled = false
    setChecking(true)
    setStatus('Checking the calendar for booked times…')
    const params = new URLSearchParams({ client_id: selectedClient.id, date: eventDate })
    void fetch(`/api/outreach-campaigns/appointment-availability?${params.toString()}`, { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(result.error || 'Unable to check appointment availability.')
        if (cancelled) return
        const nextBlocks = Array.isArray(result.blocks) ? result.blocks as CalendarBlock[] : []
        setBlocks(nextBlocks)
        setStatus(nextBlocks.length
          ? `${nextBlocks.length} appointment${nextBlocks.length === 1 ? '' : 's'} already scheduled. Booked times are disabled.`
          : 'No appointment times are blocked on this date. Hours shown: 8:00 AM–8:00 PM.')
      })
      .catch((error) => {
        if (!cancelled) setStatus(error instanceof Error ? error.message : 'Unable to check appointment availability.')
      })
      .finally(() => { if (!cancelled) setChecking(false) })

    return () => { cancelled = true }
  }, [selectedClient, eventDate])

  function selectClient(client: ClientOption) {
    setSelectedClient(client)
    setQuery(clientName(client))
    setClients([])
    setStatus('Choose an appointment date to check the calendar.')
  }

  async function saveAppointment() {
    if (!selectedClient) return setStatus('Choose a client first.')
    if (!eventDate) return setStatus('Choose an appointment date.')
    if (!startTime) return setStatus('Choose an available appointment time.')
    if (isBlocked(startTime, blocks)) return setStatus('That time is already booked. Choose another time.')

    setSaving(true)
    setStatus('Saving appointment to the main calendar…')
    try {
      const response = await fetch('/api/workspace/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assigned_agent_id: selectedClient.assigned_agent_id,
          client_id: selectedClient.id,
          lead_id: '',
          title: `Appointment: ${clientName(selectedClient)}`,
          event_type: 'appointment',
          event_date: eventDate,
          start_time: startTime,
          end_time: '',
          notes
        })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to save appointment.')
      setStatus(`Appointment saved for ${clientName(selectedClient)} on ${eventDate} at ${formatTime(startTime)}.`)
      setStartTime('')
      setNotes('')
      setBlocks((current) => [...current, {
        id: String(result.event?.id || `new-${Date.now()}`),
        title: String(result.event?.title || `Appointment: ${clientName(selectedClient)}`),
        start_time: String(result.event?.start_time || startTime),
        end_time: result.event?.end_time ? String(result.event.end_time) : null
      }])
      if (window.location.pathname === '/dashboard') window.setTimeout(() => window.location.reload(), 650)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to save appointment.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="quick-appointment-setter">
      <div className="quick-appointment-intro">
        <strong>Set Client Appointment</strong>
        <span>Uses the same main calendar and booked-time protection as Outreach.</span>
      </div>

      <label className="label quick-appointment-client">
        <span>Client</span>
        <input
          className="input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Type client name or phone"
          autoComplete="off"
        />
        {searching ? <small>Searching…</small> : null}
        {clients.length ? (
          <div className="quick-appointment-results">
            {clients.map((client) => (
              <button type="button" key={client.id} onClick={() => selectClient(client)}>
                <strong>{clientName(client)}</strong>
                <span>{client.phone || 'No phone number'}</span>
              </button>
            ))}
          </div>
        ) : null}
      </label>

      {selectedClient ? (
        <div className="quick-appointment-selected">Selected: <strong>{clientName(selectedClient)}</strong>{selectedClient.phone ? ` · ${selectedClient.phone}` : ''}</div>
      ) : null}

      <div className="quick-appointment-grid">
        <label className="label">
          <span>Appointment date</span>
          <input className="input" type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} />
        </label>
        <label className="label">
          <span>Appointment time</span>
          <select className="select" value={startTime} onChange={(event) => setStartTime(event.target.value)} disabled={!selectedClient || !eventDate || checking}>
            <option value="">{checking ? 'Checking calendar…' : 'Select appointment time'}</option>
            {times.map((value) => {
              const booked = isBlocked(value, blocks)
              return <option key={value} value={value} disabled={booked}>{formatTime(value)}{booked ? ' — BOOKED' : ''}</option>
            })}
          </select>
        </label>
      </div>

      <label className="label">
        <span>Notes (optional)</span>
        <textarea className="textarea" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Purpose of appointment or anything to remember" />
      </label>

      <div className="quick-appointment-status" role="status">{status}</div>
      <div className="quick-appointment-actions">
        <button type="button" className="btn btn-primary" disabled={saving || checking || !selectedClient || !eventDate || !startTime} onClick={() => void saveAppointment()}>
          {saving ? 'Saving…' : 'ADD TO CALENDAR'}
        </button>
      </div>

      <style jsx global>{`
        .quick-appointment-setter{max-width:760px;margin:0 auto;display:grid;gap:14px}
        .quick-appointment-intro{display:grid;gap:3px;padding:13px 14px;border:1px solid #d8e1e8;border-radius:12px;background:#f4f8fb}.quick-appointment-intro strong{color:#263746}.quick-appointment-intro span{font-size:.8rem;color:#657789}
        .quick-appointment-client{position:relative}.quick-appointment-client small{margin-top:4px;color:#667788}
        .quick-appointment-results{position:absolute;z-index:20;left:0;right:0;top:calc(100% + 4px);max-height:280px;overflow:auto;background:#fff;border:1px solid #ccd8e1;border-radius:10px;box-shadow:0 10px 24px rgba(15,23,42,.13)}
        .quick-appointment-results button{width:100%;display:flex;justify-content:space-between;gap:12px;align-items:center;padding:10px 12px;border:0;border-bottom:1px solid #edf1f4;background:#fff;text-align:left;cursor:pointer}.quick-appointment-results button:last-child{border-bottom:0}.quick-appointment-results button:hover{background:#f2f6f8}.quick-appointment-results span{font-size:.76rem;color:#718096}
        .quick-appointment-selected{padding:9px 11px;border-radius:9px;background:#eef6f0;color:#385a42;font-size:.82rem}
        .quick-appointment-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.quick-appointment-grid .input,.quick-appointment-grid .select{min-height:42px}
        .quick-appointment-status{min-height:38px;padding:9px 11px;border-radius:9px;background:#f7f8f9;border:1px solid #e0e5e9;color:#536576;font-size:.8rem;font-weight:700}
        .quick-appointment-actions{display:flex;justify-content:flex-end}.quick-appointment-actions .btn{min-width:190px}
        @media(max-width:640px){.quick-appointment-grid{grid-template-columns:1fr}.quick-appointment-actions .btn{width:100%}.quick-appointment-results button{display:grid;gap:2px}}
      `}</style>
    </div>
  )
}
