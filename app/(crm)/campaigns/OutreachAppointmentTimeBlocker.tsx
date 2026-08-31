'use client'

import { useEffect } from 'react'

type CalendarBlock = {
  id: string
  title: string | null
  start_time: string | null
  end_time: string | null
}

const SLOT_MINUTES = 15
const WORKDAY_START_MINUTES = 8 * 60
const WORKDAY_END_MINUTES = 20 * 60
const CLIENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CAMPAIGN_ID_PATTERN = CLIENT_ID_PATTERN
const SPOKE_APPOINTMENT_VALUE = '__appointment__'

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

function isoDateToManual(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return ''
  return `${match[2]}/${match[3]}/${match[1]}`
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
  const parsedEnd = timeToMinutes(block.end_time)
  return {
    start,
    end: parsedEnd !== null && parsedEnd > start ? parsedEnd : start + SLOT_MINUTES
  }
}

function isSlotBlocked(value: string, blocks: CalendarBlock[]) {
  const start = timeToMinutes(value)
  if (start === null) return false
  const end = start + SLOT_MINUTES

  return blocks.some((block) => {
    const range = blockRange(block)
    return Boolean(range && start < range.end && range.start < end)
  })
}

function setControlledInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (setter) setter.call(input, value)
  else input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function directLabelText(label: HTMLLabelElement) {
  return Array.from(label.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent || '')
    .join(' ')
    .trim()
}

function findLabel(dialog: HTMLElement, name: string) {
  return Array.from(dialog.querySelectorAll<HTMLLabelElement>('label')).find((label) => directLabelText(label) === name) || null
}

function clientIdFromRow(row: Element | null) {
  const link = row?.querySelector<HTMLAnchorElement>('a.campaign-client-name[href^="/clients/"]')
  if (!link) return ''
  const match = link.getAttribute('href')?.match(/^\/clients\/([^/?#]+)/)
  const clientId = match ? decodeURIComponent(match[1]) : ''
  return CLIENT_ID_PATTERN.test(clientId) ? clientId : ''
}

function campaignIdFromPath() {
  const match = window.location.pathname.match(/^\/campaigns\/([^/?#]+)/)
  const campaignId = match ? decodeURIComponent(match[1]) : ''
  return CAMPAIGN_ID_PATTERN.test(campaignId) ? campaignId : ''
}

function enhanceAppointmentDialog(dialog: HTMLElement, clientId: string) {
  if (dialog.dataset.outreachAvailability === '1' || !clientId) return

  const dateLabel = findLabel(dialog, 'Appointment date')
  const timeLabel = findLabel(dialog, 'Time (optional)')
  const dateInput = dateLabel?.querySelector<HTMLInputElement>('input') || null
  const timeInput = timeLabel?.querySelector<HTMLInputElement>('input[type="time"]') || null
  if (!dateInput || !timeInput || !dateLabel || !timeLabel) return

  const appointmentDateInput = dateInput
  const appointmentTimeInput = timeInput
  dialog.dataset.outreachAvailability = '1'

  const datePicker = document.createElement('input')
  datePicker.type = 'date'
  datePicker.className = `${appointmentDateInput.className} outreach-appointment-date-picker`
  datePicker.setAttribute('aria-label', 'Appointment date')
  datePicker.value = manualDateToIso(appointmentDateInput.value)

  appointmentDateInput.style.display = 'none'
  appointmentDateInput.setAttribute('aria-hidden', 'true')
  appointmentDateInput.insertAdjacentElement('afterend', datePicker)

  const select = document.createElement('select')
  select.className = `${appointmentTimeInput.className} outreach-appointment-time-select`
  select.setAttribute('aria-label', 'Available appointment time')

  const help = document.createElement('small')
  help.className = 'outreach-appointment-time-help'
  help.textContent = 'Choose a date to see available times from 8:00 AM to 8:00 PM.'

  appointmentTimeInput.style.display = 'none'
  appointmentTimeInput.setAttribute('aria-hidden', 'true')
  appointmentTimeInput.insertAdjacentElement('afterend', select)
  select.insertAdjacentElement('afterend', help)

  let blocks: CalendarBlock[] = []
  let requestNumber = 0

  function renderOptions(enabled: boolean) {
    let selected = appointmentTimeInput.value.slice(0, 5)
    const selectedMinutes = timeToMinutes(selected)
    const outsideWorkday = selectedMinutes !== null && (selectedMinutes < WORKDAY_START_MINUTES || selectedMinutes > WORKDAY_END_MINUTES)
    if (selected && (outsideWorkday || isSlotBlocked(selected, blocks))) {
      selected = ''
      setControlledInputValue(appointmentTimeInput, '')
    }

    select.replaceChildren()
    const empty = document.createElement('option')
    empty.value = ''
    empty.textContent = enabled ? 'Select appointment time' : 'Choose a date first'
    select.appendChild(empty)

    for (let minutes = WORKDAY_START_MINUTES; minutes <= WORKDAY_END_MINUTES; minutes += SLOT_MINUTES) {
      const value = minutesToTime(minutes)
      const booked = isSlotBlocked(value, blocks)
      const option = document.createElement('option')
      option.value = value
      option.disabled = booked
      option.textContent = `${formatTime(value)}${booked ? ' — BOOKED' : ''}`
      select.appendChild(option)
    }

    select.value = selected
    select.disabled = !enabled
  }

  async function loadAvailability() {
    const requestId = ++requestNumber
    const isoDate = datePicker.value
    blocks = []
    setControlledInputValue(appointmentTimeInput, '')

    if (!isoDate) {
      help.textContent = 'Choose an appointment date to see available times from 8:00 AM to 8:00 PM.'
      renderOptions(false)
      return
    }

    help.textContent = 'Checking the assigned agent’s calendar…'
    renderOptions(false)

    try {
      const params = new URLSearchParams({ client_id: clientId, date: isoDate })
      const response = await fetch(`/api/outreach-campaigns/appointment-availability?${params.toString()}`, { cache: 'no-store' })
      const result = await response.json().catch(() => ({}))
      if (requestId !== requestNumber || !dialog.isConnected) return
      if (!response.ok) throw new Error(result.error || 'Unable to load scheduled appointment times.')

      blocks = Array.isArray(result.blocks) ? result.blocks as CalendarBlock[] : []
      const count = blocks.length
      help.textContent = count
        ? `${count} appointment${count === 1 ? '' : 's'} already scheduled. Booked times are disabled. Hours shown: 8:00 AM–8:00 PM.`
        : 'No appointment times are blocked on this date. Hours shown: 8:00 AM–8:00 PM.'
      renderOptions(true)
    } catch (error) {
      if (requestId !== requestNumber || !dialog.isConnected) return
      blocks = []
      help.textContent = error instanceof Error
        ? `${error.message} Time selection is locked until availability can be checked.`
        : 'Unable to check the calendar. Time selection is locked until availability can be checked.'
      renderOptions(false)
    }
  }

  select.addEventListener('change', () => {
    if (select.value && isSlotBlocked(select.value, blocks)) {
      select.value = ''
      setControlledInputValue(appointmentTimeInput, '')
      return
    }
    setControlledInputValue(appointmentTimeInput, select.value)
  })

  datePicker.addEventListener('change', () => {
    setControlledInputValue(appointmentDateInput, isoDateToManual(datePicker.value))
    void loadAvailability()
  })

  renderOptions(Boolean(datePicker.value))
  void loadAvailability()
}

function ensureSpokeAppointment(dialog: HTMLElement, clientId: string) {
  if (!clientId) return

  const resultLabel = findLabel(dialog, 'Conversation result')
  const resultSelect = resultLabel?.querySelector<HTMLSelectElement>('select') || null
  const form = dialog.querySelector<HTMLElement>('.outreach-dialog-form')
  if (!resultSelect || !form) return

  if (!resultSelect.querySelector(`option[value="${SPOKE_APPOINTMENT_VALUE}"]`)) {
    const option = document.createElement('option')
    option.value = SPOKE_APPOINTMENT_VALUE
    option.textContent = 'Appointment — schedule on calendar'
    resultSelect.appendChild(option)
  }

  let fields = form.querySelector<HTMLElement>('[data-spoke-appointment-fields]') || null
  if (!fields) {
    fields = document.createElement('div')
    fields.className = 'outreach-followup-row outreach-spoke-appointment-fields'
    fields.dataset.spokeAppointmentFields = '1'
    fields.innerHTML = `
      <label class="label">Appointment date<input class="input" inputmode="numeric" value="${centralTodayManual()}" placeholder="MM/DD/YYYY" /></label>
      <label class="label">Time (optional)<input class="input" type="time" /></label>
    `
    const notesLabel = findLabel(dialog, 'Notes')
    if (notesLabel?.parentElement === form) form.insertBefore(fields, notesLabel)
    else form.appendChild(fields)
  }

  const syncVisibility = () => {
    if (!fields) return
    const appointmentMode = resultSelect.value === SPOKE_APPOINTMENT_VALUE
    fields.style.display = appointmentMode ? '' : 'none'
    if (appointmentMode) enhanceAppointmentDialog(dialog, clientId)
  }

  if (resultSelect.dataset.spokeAppointmentBound !== '1') {
    resultSelect.dataset.spokeAppointmentBound = '1'
    resultSelect.addEventListener('change', syncVisibility)
  }
  syncVisibility()

  const saveButton = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    button.textContent?.trim().toLowerCase().includes('save result')
  ) || null

  if (!saveButton || saveButton.dataset.spokeAppointmentBound === '1') return
  saveButton.dataset.spokeAppointmentBound = '1'

  saveButton.addEventListener('click', async (event) => {
    if (resultSelect.value !== SPOKE_APPOINTMENT_VALUE) return

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()

    const campaignId = campaignIdFromPath()
    const datePicker = fields?.querySelector<HTMLInputElement>('.outreach-appointment-date-picker') || null
    const timeSelect = fields?.querySelector<HTMLSelectElement>('.outreach-appointment-time-select') || null
    const notes = findLabel(dialog, 'Notes')?.querySelector<HTMLTextAreaElement>('textarea')?.value?.trim() || ''

    let status = dialog.querySelector<HTMLElement>('[data-spoke-appointment-status]') || null
    if (!status) {
      status = document.createElement('div')
      status.className = 'notice outreach-spoke-appointment-status'
      status.dataset.spokeAppointmentStatus = '1'
      form.insertAdjacentElement('afterend', status)
    }

    if (!campaignId || !datePicker?.value || !timeSelect?.value) {
      status.textContent = 'Choose an appointment date and an available appointment time.'
      return
    }

    const previousText = saveButton.textContent || 'Save result'
    saveButton.disabled = true
    saveButton.textContent = 'Saving appointment…'
    status.textContent = 'Saving appointment to the calendar…'

    try {
      const response = await fetch('/api/outreach-campaigns/spoke-appointment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campaignId,
          client_id: clientId,
          event_date: datePicker.value,
          start_time: timeSelect.value,
          note: notes
        })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to create appointment.')
      status.textContent = 'Appointment saved to the calendar.'
      window.location.reload()
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Unable to create appointment.'
      saveButton.disabled = false
      saveButton.textContent = previousText
    }
  }, true)
}

export default function OutreachAppointmentTimeBlocker() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.content')
    if (!root) return

    let activeClientId = ''

    const captureAppointmentClient = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null
      const button = target?.closest<HTMLButtonElement>('button') || null
      const text = button?.textContent?.trim().toLowerCase() || ''
      if (!button || (text !== 'appointment' && text !== 'spoke / update')) return
      activeClientId = clientIdFromRow(button.closest('.campaign-client-row'))
    }

    const enhance = () => {
      root.querySelectorAll<HTMLElement>('.outreach-dialog[aria-label="Create client appointment"]')
        .forEach((dialog) => enhanceAppointmentDialog(dialog, activeClientId))
      root.querySelectorAll<HTMLElement>('.outreach-dialog[aria-label="Record client conversation"]')
        .forEach((dialog) => ensureSpokeAppointment(dialog, activeClientId))
    }

    root.addEventListener('click', captureAppointmentClient, true)
    enhance()

    const observer = new MutationObserver(enhance)
    observer.observe(root, { childList: true, subtree: true })

    return () => {
      root.removeEventListener('click', captureAppointmentClient, true)
      observer.disconnect()
    }
  }, [])

  return (
    <style>{`
      .outreach-appointment-date-picker,
      .outreach-appointment-time-select{width:100%}
      .outreach-appointment-date-picker{cursor:pointer;color-scheme:light}
      .outreach-appointment-time-select:disabled{background:#eef1f3!important;color:#7b8790!important;cursor:not-allowed}
      .outreach-appointment-time-select option:disabled{color:#9b4f4f;background:#f7eded}
      .outreach-appointment-time-help{display:block;margin-top:6px;color:#61717e;font-size:.72rem;font-weight:700;line-height:1.35}
      .outreach-spoke-appointment-fields{margin-top:2px}
      .outreach-spoke-appointment-status{margin-top:10px}
    `}</style>
  )
}
