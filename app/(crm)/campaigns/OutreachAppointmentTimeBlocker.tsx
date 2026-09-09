'use client'

import { useEffect } from 'react'

type CalendarBlock = {
  id: string
  title: string | null
  start_time: string | null
  end_time: string | null
}

type AppointmentAgent = { id: string; full_name: string }
type AppointmentContext = { coordinator: boolean; owner_id: string; agents: AppointmentAgent[] }
type SchedulerControls = {
  datePicker: HTMLInputElement
  timeSelect: HTMLSelectElement
  agentSelect: HTMLSelectElement | null
  selectedOwner: () => string
}

const SLOT_MINUTES = 15
const WORKDAY_START_MINUTES = 8 * 60
const WORKDAY_END_MINUTES = 20 * 60
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
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
  return match ? `${match[2]}/${match[3]}/${match[1]}` : ''
}

function centralTodayManual() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.month}/${values.day}/${values.year}`
}

function timeToMinutes(value: string | null | undefined) {
  const match = String(value || '').slice(0, 5).match(/^(\d{2}):(\d{2})$/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

function minutesToTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

function formatTime(value: string) {
  const minutes = timeToMinutes(value)
  if (minutes === null) return value
  const hour24 = Math.floor(minutes / 60)
  const minute = minutes % 60
  return `${hour24 % 12 || 12}:${String(minute).padStart(2, '0')} ${hour24 >= 12 ? 'PM' : 'AM'}`
}

function blockRange(block: CalendarBlock) {
  const start = timeToMinutes(block.start_time)
  if (start === null) return null
  const parsedEnd = timeToMinutes(block.end_time)
  return { start, end: parsedEnd !== null && parsedEnd > start ? parsedEnd : start + SLOT_MINUTES }
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

function normalizedName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function clientIdFromRow(row: Element | null) {
  const link = row?.querySelector<HTMLAnchorElement>('a.campaign-client-name[href^="/clients/"]')
  const match = link?.getAttribute('href')?.match(/^\/clients\/([^/?#]+)/)
  const id = match ? decodeURIComponent(match[1]) : ''
  return UUID_PATTERN.test(id) ? id : ''
}

function campaignIdFromPath() {
  const match = window.location.pathname.match(/^\/campaigns\/([^/?#]+)/)
  const id = match ? decodeURIComponent(match[1]) : ''
  return UUID_PATTERN.test(id) ? id : ''
}

function cleanupAgentSelectors(dialog: HTMLElement) {
  dialog.querySelectorAll('[data-followup-agent-select="1"]').forEach((element) => element.closest('label')?.remove())
  const shared = Array.from(dialog.querySelectorAll<HTMLSelectElement>('[data-outreach-agent-select="1"]'))
  shared.slice(1).forEach((element) => element.closest('label')?.remove())
}

function ensureAgentSelect(dialog: HTMLElement, context: AppointmentContext, preferredOwnerName = '') {
  if (!context.coordinator) return null
  cleanupAgentSelectors(dialog)

  let select = dialog.querySelector<HTMLSelectElement>('[data-outreach-agent-select="1"]')
  if (select) return select

  const form = dialog.querySelector<HTMLElement>('.outreach-dialog-form')
  if (!form) return null

  const label = document.createElement('label')
  label.className = 'label outreach-appointment-agent-label'
  label.dataset.outreachAgentLabel = '1'
  label.append('Agent')

  select = document.createElement('select')
  select.className = 'select outreach-appointment-agent-select'
  select.dataset.outreachAgentSelect = '1'

  const blank = document.createElement('option')
  blank.value = ''
  blank.textContent = 'Select Justin or Isaiah'
  select.appendChild(blank)

  const preferred = normalizedName(preferredOwnerName)
  for (const agent of context.agents) {
    const option = document.createElement('option')
    option.value = agent.id
    option.textContent = agent.full_name
    select.appendChild(option)
    if (preferred && normalizedName(agent.full_name) === preferred) select.value = agent.id
  }

  label.appendChild(select)
  form.insertBefore(label, form.firstChild)
  return select
}

function setAgentVisibility(dialog: HTMLElement, visible: boolean) {
  const label = dialog.querySelector<HTMLElement>('[data-outreach-agent-label="1"]')
  if (label) label.style.display = visible ? '' : 'none'
}

function mountExactAppointmentScheduler(
  dialog: HTMLElement,
  context: AppointmentContext,
  dateLabelName: string,
  timeLabelName: string,
  preferredOwnerName = ''
): SchedulerControls | null {
  const dateLabel = findLabel(dialog, dateLabelName)
  const timeLabel = findLabel(dialog, timeLabelName)
  const dateInput = dateLabel?.querySelector<HTMLInputElement>('input:not(.outreach-appointment-date-picker)') || null
  const timeInput = timeLabel?.querySelector<HTMLInputElement>('input[type="time"]') || null
  if (!dateInput || !timeInput) return null

  const existingDate = dateLabel?.querySelector<HTMLInputElement>('.outreach-appointment-date-picker') || null
  const existingTime = timeLabel?.querySelector<HTMLSelectElement>('.outreach-appointment-time-select') || null
  const agentSelect = ensureAgentSelect(dialog, context, preferredOwnerName)
  const selectedOwner = () => context.coordinator ? String(agentSelect?.value || '') : context.owner_id

  if (existingDate && existingTime) {
    return { datePicker: existingDate, timeSelect: existingTime, agentSelect, selectedOwner }
  }

  const appointmentDateInput: HTMLInputElement = dateInput
  const appointmentTimeInput: HTMLInputElement = timeInput

  const datePicker = document.createElement('input')
  datePicker.type = 'date'
  datePicker.className = `${appointmentDateInput.className} outreach-appointment-date-picker`
  datePicker.value = manualDateToIso(appointmentDateInput.value)
  appointmentDateInput.style.display = 'none'
  appointmentDateInput.setAttribute('aria-hidden', 'true')
  appointmentDateInput.insertAdjacentElement('afterend', datePicker)

  const timeSelect = document.createElement('select')
  timeSelect.className = `${appointmentTimeInput.className} outreach-appointment-time-select`
  const help = document.createElement('small')
  help.className = 'outreach-appointment-time-help'
  appointmentTimeInput.style.display = 'none'
  appointmentTimeInput.setAttribute('aria-hidden', 'true')
  appointmentTimeInput.insertAdjacentElement('afterend', timeSelect)
  timeSelect.insertAdjacentElement('afterend', help)

  let blocks: CalendarBlock[] = []
  let requestNumber = 0

  function renderOptions(enabled: boolean) {
    let selected = appointmentTimeInput.value.slice(0, 5)
    if (selected && isSlotBlocked(selected, blocks)) {
      selected = ''
      setControlledInputValue(appointmentTimeInput, '')
    }

    timeSelect.replaceChildren()
    const empty = document.createElement('option')
    empty.value = ''
    empty.textContent = enabled ? 'Select appointment time' : (selectedOwner() ? 'Choose a date first' : 'Choose an agent first')
    timeSelect.appendChild(empty)

    for (let minutes = WORKDAY_START_MINUTES; minutes <= WORKDAY_END_MINUTES; minutes += SLOT_MINUTES) {
      const value = minutesToTime(minutes)
      const booked = isSlotBlocked(value, blocks)
      const option = document.createElement('option')
      option.value = value
      option.disabled = booked
      option.textContent = `${formatTime(value)}${booked ? ' — BOOKED' : ''}`
      timeSelect.appendChild(option)
    }

    timeSelect.value = selected
    timeSelect.disabled = !enabled
  }

  async function loadAvailability() {
    const requestId = ++requestNumber
    const owner = selectedOwner()
    const date = datePicker.value
    blocks = []
    setControlledInputValue(appointmentTimeInput, '')

    if (!owner) {
      help.textContent = 'Choose Justin or Isaiah first.'
      renderOptions(false)
      return
    }
    if (!date) {
      help.textContent = 'Choose an appointment date to see available times.'
      renderOptions(false)
      return
    }

    help.textContent = 'Checking the selected agent calendar…'
    renderOptions(false)
    try {
      const params = new URLSearchParams({ date, owner })
      const response = await fetch(`/api/workspace/calendar-availability?${params.toString()}`, { cache: 'no-store' })
      const result = await response.json().catch(() => ({}))
      if (requestId !== requestNumber || !dialog.isConnected) return
      if (!response.ok) throw new Error(result.error || 'Unable to load scheduled appointment times.')
      blocks = Array.isArray(result.blocks) ? result.blocks as CalendarBlock[] : []
      help.textContent = blocks.length
        ? `${blocks.length} appointment${blocks.length === 1 ? '' : 's'} already scheduled. Booked times are disabled.`
        : 'No appointment times are blocked on this date. Hours shown: 8:00 AM–8:00 PM.'
      renderOptions(true)
    } catch (error) {
      if (requestId !== requestNumber || !dialog.isConnected) return
      help.textContent = error instanceof Error ? error.message : 'Unable to check the calendar.'
      renderOptions(false)
    }
  }

  timeSelect.addEventListener('change', () => setControlledInputValue(appointmentTimeInput, timeSelect.value))
  datePicker.addEventListener('change', () => {
    setControlledInputValue(appointmentDateInput, isoDateToManual(datePicker.value))
    void loadAvailability()
  })
  agentSelect?.addEventListener('change', () => void loadAvailability())

  renderOptions(false)
  void loadAvailability()

  return { datePicker, timeSelect, agentSelect, selectedOwner }
}

function enhanceStandaloneAppointmentDialog(
  dialog: HTMLElement,
  clientId: string,
  context: AppointmentContext,
  preferredOwnerName: string
) {
  if (!clientId) return
  const controls = mountExactAppointmentScheduler(dialog, context, 'Appointment date', 'Time (optional)', preferredOwnerName)
  if (!controls) return

  if (!context.coordinator) return
  const saveButton = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    (button.textContent || '').trim().toLowerCase().includes('add to calendar')
  ) || null
  const form = dialog.querySelector<HTMLElement>('.outreach-dialog-form')
  if (!saveButton || !form || saveButton.dataset.coordinatorAppointmentBound === '1') return

  saveButton.dataset.coordinatorAppointmentBound = '1'
  saveButton.addEventListener('click', async (event) => {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()

    const campaignId = campaignIdFromPath()
    const owner = controls.selectedOwner()
    const notes = dialog.querySelector<HTMLTextAreaElement>('textarea')?.value?.trim() || ''
    let status = dialog.querySelector<HTMLElement>('[data-coordinator-appointment-status]')
    if (!status) {
      status = document.createElement('div')
      status.className = 'notice outreach-spoke-appointment-status'
      status.dataset.coordinatorAppointmentStatus = '1'
      form.insertAdjacentElement('afterend', status)
    }

    if (!campaignId || !owner || !controls.datePicker.value || !controls.timeSelect.value) {
      status.textContent = 'Choose an agent, appointment date, and available appointment time.'
      return
    }

    const previous = saveButton.textContent || 'Add to calendar'
    saveButton.disabled = true
    saveButton.textContent = 'Saving…'
    status.textContent = 'Saving appointment to the selected agent calendar…'
    try {
      const response = await fetch('/api/outreach-campaigns/coordinator-appointment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campaignId,
          client_id: clientId,
          assigned_agent_id: owner,
          event_date: controls.datePicker.value,
          start_time: controls.timeSelect.value,
          notes
        })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to create appointment.')
      status.textContent = 'Appointment saved.'
      window.location.reload()
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Unable to create appointment.'
      saveButton.disabled = false
      saveButton.textContent = previous
    }
  }, true)
}

function ensureConversationScheduler(
  dialog: HTMLElement,
  clientId: string,
  context: AppointmentContext,
  preferredOwnerName: string
) {
  if (!clientId) return
  cleanupAgentSelectors(dialog)

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

  let appointmentFields = form.querySelector<HTMLElement>('[data-spoke-appointment-fields]')
  if (!appointmentFields) {
    appointmentFields = document.createElement('div')
    appointmentFields.className = 'outreach-followup-row outreach-spoke-appointment-fields'
    appointmentFields.dataset.spokeAppointmentFields = '1'
    appointmentFields.innerHTML = `<label class="label">Appointment date<input class="input" inputmode="numeric" value="${centralTodayManual()}" placeholder="MM/DD/YYYY" /></label><label class="label">Time (optional)<input class="input" type="time" /></label>`
    const notesLabel = findLabel(dialog, 'Notes')
    if (notesLabel?.parentElement === form) form.insertBefore(appointmentFields, notesLabel)
    else form.appendChild(appointmentFields)
  }

  const sync = () => {
    if (!appointmentFields) return
    const isAppointment = resultSelect.value === SPOKE_APPOINTMENT_VALUE
    const isFollowUp = resultSelect.value === 'follow_up'

    appointmentFields.style.display = isAppointment ? '' : 'none'
    setAgentVisibility(dialog, isAppointment || isFollowUp)

    if (isAppointment) {
      mountExactAppointmentScheduler(dialog, context, 'Appointment date', 'Time (optional)', preferredOwnerName)
    } else if (isFollowUp) {
      // Follow-Up uses the exact same scheduler function and exact same time
      // dropdown as Appointment — schedule on calendar. Only the saved result differs.
      mountExactAppointmentScheduler(dialog, context, 'Follow-up date', 'Time (optional)', preferredOwnerName)
    }
  }

  if (resultSelect.dataset.spokeAppointmentBound !== '1') {
    resultSelect.dataset.spokeAppointmentBound = '1'
    resultSelect.addEventListener('change', () => window.requestAnimationFrame(sync))
  }
  sync()

  const saveButton = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    (button.textContent || '').trim().toLowerCase().includes('save result')
  ) || null
  if (!saveButton || saveButton.dataset.spokeAppointmentSaveBound === '1') return
  saveButton.dataset.spokeAppointmentSaveBound = '1'

  saveButton.addEventListener('click', async (event) => {
    if (resultSelect.value !== SPOKE_APPOINTMENT_VALUE) return
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()

    const campaignId = campaignIdFromPath()
    const datePicker = appointmentFields?.querySelector<HTMLInputElement>('.outreach-appointment-date-picker') || null
    const timeSelect = appointmentFields?.querySelector<HTMLSelectElement>('.outreach-appointment-time-select') || null
    const agentSelect = dialog.querySelector<HTMLSelectElement>('[data-outreach-agent-select="1"]')
    const owner = context.coordinator ? String(agentSelect?.value || '') : context.owner_id
    const notes = findLabel(dialog, 'Notes')?.querySelector<HTMLTextAreaElement>('textarea')?.value?.trim() || ''

    let status = dialog.querySelector<HTMLElement>('[data-spoke-appointment-status]')
    if (!status) {
      status = document.createElement('div')
      status.className = 'notice outreach-spoke-appointment-status'
      status.dataset.spokeAppointmentStatus = '1'
      form.insertAdjacentElement('afterend', status)
    }

    if (!campaignId || !owner || !datePicker?.value || !timeSelect?.value) {
      status.textContent = context.coordinator
        ? 'Choose an agent, appointment date, and available appointment time.'
        : 'Choose an appointment date and an available appointment time.'
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
          assigned_agent_id: owner,
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
    let activeOwnerName = ''
    let context: AppointmentContext | null = null
    let disposed = false

    const captureAppointmentClient = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null
      const button = target?.closest<HTMLButtonElement>('button') || null
      const text = button?.textContent?.trim().toLowerCase() || ''
      if (!button || (text !== 'appointment' && text !== 'spoke / update')) return
      const row = button.closest('.campaign-client-row')
      activeClientId = clientIdFromRow(row)
      activeOwnerName = row?.querySelector<HTMLElement>('.campaign-owner-line')?.textContent?.trim() || ''
    }

    const enhance = () => {
      if (!context) return
      root.querySelectorAll<HTMLElement>('.outreach-dialog[aria-label="Create client appointment"]')
        .forEach((dialog) => enhanceStandaloneAppointmentDialog(dialog, activeClientId, context!, activeOwnerName))
      root.querySelectorAll<HTMLElement>('.outreach-dialog[aria-label="Record client conversation"]')
        .forEach((dialog) => ensureConversationScheduler(dialog, activeClientId, context!, activeOwnerName))
    }

    root.addEventListener('click', captureAppointmentClient, true)
    const observer = new MutationObserver(enhance)
    observer.observe(root, { childList: true, subtree: true })

    void fetch('/api/workspace/calendar-context', { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(result.error || 'Unable to load appointment calendar context.')
        if (disposed) return
        context = {
          coordinator: Boolean(result.coordinator),
          owner_id: String(result.owner_id || ''),
          agents: Array.isArray(result.agents) ? result.agents : []
        }
        enhance()
      })
      .catch(() => undefined)

    return () => {
      disposed = true
      root.removeEventListener('click', captureAppointmentClient, true)
      observer.disconnect()
    }
  }, [])

  return (
    <style>{`
      .outreach-appointment-agent-label{padding:10px;border:1px solid #d8d0ef;border-radius:10px;background:#f6f3ff}
      .outreach-appointment-agent-select,.outreach-appointment-date-picker,.outreach-appointment-time-select{width:100%}
      .outreach-appointment-date-picker{cursor:pointer;color-scheme:light}
      .outreach-appointment-time-select:disabled{background:#eef1f3!important;color:#7b8790!important;cursor:not-allowed}
      .outreach-appointment-time-select option:disabled{color:#9b4f4f;background:#f7eded}
      .outreach-appointment-time-help{display:block;margin-top:6px;color:#61717e;font-size:.72rem;font-weight:700;line-height:1.35}
      .outreach-spoke-appointment-fields{margin-top:2px}.outreach-spoke-appointment-status{margin-top:10px}
    `}</style>
  )
}
