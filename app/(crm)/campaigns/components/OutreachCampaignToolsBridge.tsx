'use client'

import { createPortal } from 'react-dom'
import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'

type ToolMember = {
  id: string
  client_id: string
  attempt_count: number
}

type HostEntry = {
  host: HTMLElement
  memberId: string
  clientId: string
  clientName: string
  ownerName: string
  attemptCount: number
}

type AppointmentState = HostEntry | null

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function campaignIdFromPath(pathname: string) {
  const match = pathname.match(/^\/campaigns\/([^/]+)$/)
  return match && UUID_PATTERN.test(match[1]) ? match[1] : ''
}

function clientIdFromHref(href: string | null) {
  const match = String(href || '').match(/^\/clients\/([^/?#]+)/)
  return match && UUID_PATTERN.test(match[1]) ? match[1] : ''
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

function centralTodayManual() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.month}/${values.day}/${values.year}`
}

export default function OutreachCampaignToolsBridge() {
  const pathname = usePathname()
  const campaignId = useMemo(() => campaignIdFromPath(pathname), [pathname])
  const [members, setMembers] = useState<ToolMember[]>([])
  const [hosts, setHosts] = useState<HostEntry[]>([])
  const [appointment, setAppointment] = useState<AppointmentState>(null)
  const [appointmentDate, setAppointmentDate] = useState('')
  const [appointmentTime, setAppointmentTime] = useState('')
  const [appointmentNotes, setAppointmentNotes] = useState('')
  const [busyMemberId, setBusyMemberId] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!campaignId) return
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch(`/api/outreach-campaigns/campaign-tools?campaign_id=${encodeURIComponent(campaignId)}`, { cache: 'no-store' })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'Unable to load campaign controls.')
        if (!cancelled) setMembers(Array.isArray(data.members) ? data.members : [])
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : 'Unable to load campaign controls.')
      }
    })()
    return () => { cancelled = true }
  }, [campaignId])

  useEffect(() => {
    if (!campaignId || !members.length) return
    const memberByClient = new Map(members.map((member) => [member.client_id, member]))
    let frame = 0

    const sync = () => {
      frame = 0
      const next: HostEntry[] = []
      const rows = Array.from(document.querySelectorAll<HTMLElement>('.campaign-client-row'))

      for (const row of rows) {
        const clientLink = row.querySelector<HTMLAnchorElement>('a.campaign-client-name')
        const clientId = clientIdFromHref(clientLink?.getAttribute('href') || null)
        if (!clientId) continue
        const member = memberByClient.get(clientId)
        if (!member) continue
        const actions = row.querySelector<HTMLElement>('.campaign-record-actions')
        if (!actions) continue

        for (const button of Array.from(actions.querySelectorAll<HTMLButtonElement>('button'))) {
          if (button.textContent?.trim() === 'Reset') {
            button.dataset.outreachLegacyReset = 'hidden'
            button.style.display = 'none'
          }
        }

        let host = actions.querySelector<HTMLElement>(`[data-outreach-tools-member="${member.id}"]`)
        if (!host) {
          host = document.createElement('span')
          host.className = 'outreach-tools-host'
          host.dataset.outreachToolsMember = member.id
          actions.appendChild(host)
        }

        next.push({
          host,
          memberId: member.id,
          clientId,
          clientName: clientLink?.textContent?.trim() || 'Client',
          ownerName: row.querySelector<HTMLElement>('.campaign-owner-line')?.textContent?.trim() || 'assigned agent',
          attemptCount: Number(member.attempt_count || 0)
        })
      }

      setHosts((current) => {
        if (
          current.length === next.length &&
          current.every((entry, index) => entry.host === next[index]?.host && entry.attemptCount === next[index]?.attemptCount)
        ) return current
        return next
      })
    }

    const scheduleSync = () => {
      if (frame) return
      frame = window.requestAnimationFrame(sync)
    }

    sync()
    const root = document.querySelector<HTMLElement>('.campaign-detail-shell') || document.body
    const observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) => {
        const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement
        return !target?.closest('.outreach-tools-host')
      })
      if (relevant) scheduleSync()
    })
    observer.observe(root, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
      document.querySelectorAll<HTMLElement>('.outreach-tools-host').forEach((host) => host.remove())
      document.querySelectorAll<HTMLButtonElement>('button[data-outreach-legacy-reset="hidden"]').forEach((button) => {
        button.style.display = ''
        delete button.dataset.outreachLegacyReset
      })
      setHosts([])
    }
  }, [campaignId, members])

  async function postAction(body: Record<string, unknown>) {
    const response = await fetch('/api/outreach-campaigns/member-actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'Unable to update Outreach.')
    return data
  }

  async function undoLast(entry: HostEntry) {
    if (busyMemberId) return
    const confirmed = window.confirm(
      `Undo the last Outreach result for ${entry.clientName}?\n\n` +
      'This removes the most recent status/result so you can choose the correct one. ' +
      'If that result created a follow-up calendar item, that calendar item will also be removed.'
    )
    if (!confirmed) return

    setBusyMemberId(entry.memberId)
    setMessage('')
    try {
      await postAction({ action: 'undo_last', member_id: entry.memberId })
      window.location.reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to undo the last Outreach result.')
      setBusyMemberId('')
    }
  }

  function openAppointment(entry: HostEntry) {
    setAppointment(entry)
    setAppointmentDate(centralTodayManual())
    setAppointmentTime('')
    setAppointmentNotes('')
    setMessage('')
  }

  async function saveAppointment() {
    if (!appointment || busyMemberId) return
    const isoDate = manualDateToIso(appointmentDate)
    if (!isoDate) return setMessage('Enter appointment date as MM/DD/YYYY.')

    setBusyMemberId(appointment.memberId)
    setMessage('')
    try {
      await postAction({
        action: 'create_appointment',
        member_id: appointment.memberId,
        event_date: isoDate,
        start_time: appointmentTime,
        notes: appointmentNotes
      })
      const owner = appointment.ownerName === 'assigned agent' ? 'assigned agent' : appointment.ownerName
      setAppointment(null)
      setMessage(`Appointment added directly to ${owner}'s calendar.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create appointment.')
    } finally {
      setBusyMemberId('')
    }
  }

  if (!campaignId) return null

  return (
    <>
      {hosts.map((entry) => createPortal(
        <>
          {entry.attemptCount > 0 ? (
            <button
              type="button"
              className="campaign-tool-action campaign-tool-undo"
              disabled={busyMemberId === entry.memberId}
              onClick={() => void undoLast(entry)}
            >
              {busyMemberId === entry.memberId ? 'Working…' : 'Undo last'}
            </button>
          ) : null}
          <button
            type="button"
            className="campaign-tool-action campaign-tool-appointment"
            disabled={busyMemberId === entry.memberId}
            onClick={() => openAppointment(entry)}
          >
            Appointment
          </button>
        </>,
        entry.host,
        `${entry.memberId}:${entry.clientId}`
      ))}

      {message ? createPortal(<div className="outreach-tools-toast" role="status">{message}</div>, document.body) : null}

      {appointment ? createPortal(
        <div className="outreach-tools-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busyMemberId) setAppointment(null) }}>
          <div className="outreach-tools-dialog" role="dialog" aria-modal="true" aria-label="Create client appointment">
            <div className="outreach-tools-dialog-head">
              <div><span>Create appointment</span><strong>{appointment.clientName}</strong><p>Adds directly to the {appointment.ownerName === 'assigned agent' ? 'assigned agent' : appointment.ownerName} calendar.</p></div>
              <button type="button" disabled={Boolean(busyMemberId)} onClick={() => setAppointment(null)} aria-label="Close">×</button>
            </div>
            <div className="outreach-tools-dialog-form">
              <label className="label">Appointment date<input className="input" inputMode="numeric" value={appointmentDate} onChange={(event) => setAppointmentDate(event.target.value)} placeholder="MM/DD/YYYY" /></label>
              <label className="label">Time (optional)<input className="input" type="time" value={appointmentTime} onChange={(event) => setAppointmentTime(event.target.value)} /></label>
              <label className="label">Notes (optional)<textarea className="textarea" value={appointmentNotes} onChange={(event) => setAppointmentNotes(event.target.value)} placeholder="Purpose of appointment or anything to remember" /></label>
            </div>
            {message ? <div className="notice" style={{ marginTop: 10 }}>{message}</div> : null}
            <div className="outreach-tools-dialog-actions">
              <button type="button" className="campaign-quiet-button" disabled={Boolean(busyMemberId)} onClick={() => setAppointment(null)}>Cancel</button>
              <button type="button" className="campaign-work-button" disabled={Boolean(busyMemberId)} onClick={() => void saveAppointment()}>{busyMemberId ? 'Saving…' : 'Add to calendar'}</button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}

      <style jsx global>{`
        .outreach-tools-host{display:contents}.campaign-tool-action{appearance:none;border:0;background:transparent;padding:0;color:#536f82!important;font:inherit;font-size:.66rem;font-weight:900;text-decoration:none;cursor:pointer}.campaign-tool-action:hover{color:#294a60!important;text-decoration:underline}.campaign-tool-action:disabled{opacity:.45;cursor:default}.campaign-tool-undo{color:#8a653f!important}.campaign-tool-undo:hover{color:#694821!important}.campaign-tool-appointment{color:#3f6b59!important}.campaign-tool-appointment:hover{color:#28503f!important}
        .outreach-tools-toast{position:fixed;right:18px;bottom:18px;z-index:180;max-width:min(430px,calc(100vw - 36px));padding:10px 13px;border:1px solid #bfd2c7;border-radius:9px;background:#f1f8f4;color:#315742;font-size:.78rem;font-weight:800;box-shadow:0 10px 28px rgba(20,43,32,.15)}
        .outreach-tools-backdrop{position:fixed;inset:0;z-index:170;background:rgba(20,31,42,.42);display:flex;align-items:center;justify-content:center;padding:18px}.outreach-tools-dialog{width:min(540px,100%);max-height:calc(100dvh - 36px);overflow-y:auto;background:#fff;border:1px solid #d9e1e6;border-radius:12px;padding:17px;box-shadow:0 20px 60px rgba(15,23,42,.23)}.outreach-tools-dialog-head{display:flex;justify-content:space-between;gap:15px;align-items:flex-start;padding-bottom:12px;border-bottom:1px solid #e5eaed}.outreach-tools-dialog-head>div>span{display:block;color:#83909a;font-size:.62rem;font-weight:900;text-transform:uppercase;letter-spacing:.05em}.outreach-tools-dialog-head strong{display:block;margin-top:3px;color:#20384b;font-size:1.08rem}.outreach-tools-dialog-head p{margin:3px 0 0;color:#7a8791;font-size:.75rem}.outreach-tools-dialog-head>button{border:0;background:transparent;color:#71808d;font-size:1.35rem;line-height:1;cursor:pointer}.outreach-tools-dialog-form{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding-top:13px}.outreach-tools-dialog-form .label:last-child{grid-column:1/-1}.outreach-tools-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
        @media(max-width:680px){.outreach-tools-toast{right:10px;bottom:calc(68px + env(safe-area-inset-bottom))}.outreach-tools-backdrop{padding:9px}.outreach-tools-dialog{padding:14px;max-height:calc(100dvh - 18px)}.outreach-tools-dialog-form{grid-template-columns:1fr}.outreach-tools-dialog-form .label:last-child{grid-column:auto}.outreach-tools-dialog-actions>*{flex:1}}
      `}</style>
    </>
  )
}
