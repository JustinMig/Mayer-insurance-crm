'use client'

import { useEffect } from 'react'

type CalendarBlock = {
  id: string
  title: string | null
  start_time: string | null
  end_time: string | null
}

const SLOT_MINUTES = 15
const CLIENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

function enhanceAppointmentDialog(dialog: HTMLElement, clientId: string) {
  if (dialog.dataset.outreachAvailability === '1' || !clientId) return

  const dateLabel = findLabel(dialog, 'Appointment date')
  const timeLabel = findLabel(dialog, 'Time (optional)')
  const dateInput = dateLabel?.querySelector<HTMLInputElement>('input') || null
  const timeInput = timeLabel?.querySelector<HTMLInputElement>('input[type="time"]') || null
  if (!dateInput || !timeInput || !timeLabel) return

  const appointmentDateInput = dateInput
  const appointmentTimeInput = timeInput
  dialog.dataset.outreachAvailability = '1'

  const select = document.createElement('select')
  select.className = `${appointmentTimeInput.className} outreach-appointment-time-select`
  select.setAttribute('aria-label', 'Available appointment time')

  const help = document.createElement('small')
  help.className = 'outreach-appointment-time-help'
  help.textContent = 'Enter the appointment date to check available times.'

  appointmentTimeInput.style.display = 'none'
  appointmentTimeInput.setAttribute('aria-hidden', 'true')
  appointmentTimeInput.insertAdjacentElement('afterend', select)
  select.insertAdjacentElement('afterend', help)

  let blocks: CalendarBlock[] = []
  let requestNumber = 0
  let debounceTimer = 0

  function renderOptions(enabled: boolean) {
    let selected = appointmentTimeInput.value.slice(0, 5)
    if (selected && isSlotBlocked(selected, blocks)) {
      selected = ''
      setControlledInputValue(appointmentTimeInput, '')
    }

    select.replaceChildren()
    const empty = document.createElement('option')
    empty.value = ''
    empty.textContent = enabled ? 'No time selected' : 'Choose a valid date first'
    select.appendChild(empty)

    for (let minutes = 0; minutes < 24 * 60; minutes += SLOT_MINUTES) {
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
    const isoDate = manualDateToIso(appointmentDateInput.value)
    blocks = []
    setControlledInputValue(appointmentTimeInput, '')

    if (!isoDate) {
      help.textContent = 'Enter the appointment date as MM/DD/YYYY to see available times.'
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
        ? `${count} appointment${count === 1 ? '' : 's'} already scheduled. Booked times are disabled.`
        : 'No appointment times are blocked on this date.'
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

  function scheduleAvailabilityCheck() {
    if (debounceTimer) window.clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(() => void loadAvailability(), 120)
  }

  select.addEventListener('change', () => {
    if (select.value && isSlotBlocked(select.value, blocks)) {
      select.value = ''
      setControlledInputValue(appointmentTimeInput, '')
      return
    }
    setControlledInputValue(appointmentTimeInput, select.value)
  })

  appointmentDateInput.addEventListener('input', scheduleAvailabilityCheck)
  appointmentDateInput.addEventListener('change', scheduleAvailabilityCheck)

  renderOptions(false)
  void loadAvailability()
}

export default function OutreachAppointmentTimeBlocker() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.content')
    if (!root) return

    let activeClientId = ''

    const captureAppointmentClient = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null
      const button = target?.closest<HTMLButtonElement>('button') || null
      if (!button || button.textContent?.trim().toLowerCase() !== 'appointment') return
      activeClientId = clientIdFromRow(button.closest('.campaign-client-row'))
    }

    const enhance = () => {
      root.querySelectorAll<HTMLElement>('.outreach-dialog[aria-label="Create client appointment"]')
        .forEach((dialog) => enhanceAppointmentDialog(dialog, activeClientId))
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
      .outreach-appointment-time-select{width:100%}
      .outreach-appointment-time-select:disabled{background:#eef1f3!important;color:#7b8790!important;cursor:not-allowed}
      .outreach-appointment-time-select option:disabled{color:#9b4f4f;background:#f7eded}
      .outreach-appointment-time-help{display:block;margin-top:6px;color:#61717e;font-size:.72rem;font-weight:700;line-height:1.35}
    `}</style>
  )
}
