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

const SLOT_MINUTES = 15
const WORKDAY_START_MINUTES = 8 * 60
const WORKDAY_END_MINUTES = 20 * 60

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

function ensureSharedAgentSelect(dialog: HTMLElement, context: AppointmentContext, activeOwnerName: string) {
  if (!context.coordinator) return null

  // Always remove any legacy Follow-Up-only selector before looking for the
  // shared Appointment selector. This prevents an old client-side modal from
  // keeping two Agent boxes after a deployment or route transition.
  dialog.querySelectorAll('[data-followup-agent-select="1"]').forEach((legacy) => {
    legacy.closest('label')?.remove()
  })

  const shared = Array.from(dialog.querySelectorAll<HTMLSelectElement>('[data-outreach-agent-select="1"]'))
  if (shared.length) {
    // Keep exactly one shared selector even if an older bundle managed to add
    // more than one before the new code loaded.
    shared.slice(1).forEach((duplicate) => duplicate.closest('label')?.remove())
    const select = shared[0]
    if (!select.value) {
      const wanted = normalizedName(activeOwnerName)
      const match = context.agents.find((agent) => wanted && normalizedName(agent.full_name) === wanted)
      if (match) select.value = match.id
    }
    return select
  }

  const form = dialog.querySelector<HTMLElement>('.outreach-dialog-form')
  if (!form) return null

  const label = document.createElement('label')
  label.className = 'label outreach-appointment-agent-label'
  label.append('Agent')

  const select = document.createElement('select')
  select.className = 'select outreach-appointment-agent-select'
  select.dataset.outreachAgentSelect = '1'

  const blank = document.createElement('option')
  blank.value = ''
  blank.textContent = 'Select Justin or Isaiah'
  select.appendChild(blank)

  const wanted = normalizedName(activeOwnerName)
  for (const agent of context.agents) {
    const option = document.createElement('option')
    option.value = agent.id
    option.textContent = agent.full_name
    select.appendChild(option)
    if (wanted && normalizedName(agent.full_name) === wanted) select.value = agent.id
  }

  label.appendChild(select)
  form.insertBefore(label, form.firstChild)
  return select
}

export default function OutreachFollowUpAvailability() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.content')
    if (!root) return

    let context: AppointmentContext | null = null
    let activeOwnerName = ''
    let disposed = false

    const captureRow = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null
      const button = target?.closest<HTMLButtonElement>('button') || null
      if (!button || (button.textContent || '').trim().toLowerCase() !== 'spoke / update') return
      const row = button.closest<HTMLElement>('.campaign-client-row')
      activeOwnerName = row?.querySelector<HTMLElement>('.campaign-owner-line')?.textContent?.trim() || ''
    }

    const enhanceDialog = (dialog: HTMLElement) => {
      if (!context) return
      const resultSelect = findLabel(dialog, 'Conversation result')?.querySelector<HTMLSelectElement>('select') || null
      if (!resultSelect || resultSelect.value !== 'follow_up') return

      const dateLabel = findLabel(dialog, 'Follow-up date')
      const timeLabel = findLabel(dialog, 'Time (optional)')
      const dateInput = dateLabel?.querySelector<HTMLInputElement>('input:not(.outreach-appointment-date-picker):not(.outreach-followup-date-picker)') || null
      const timeInput = timeLabel?.querySelector<HTMLInputElement>('input[type="time"]:not(.outreach-followup-time-input)') || null
      if (!dateInput || !timeInput) return

      const followUpDateInput: HTMLInputElement = dateInput
      const followUpTimeInput: HTMLInputElement = timeInput
      const agentSelect = ensureSharedAgentSelect(dialog, context, activeOwnerName)
      const selectedOwner = () => context?.coordinator ? String(agentSelect?.value || '') : String(context?.owner_id || '')

      // If the current modal already has the correct Appointment-style controls,
      // leave them in place after cleaning duplicate Agent selectors above.
      const existingDatePicker = dateLabel?.querySelector<HTMLInputElement>('.outreach-appointment-date-picker') || null
      const existingTimeSelect = timeLabel?.querySelector<HTMLSelectElement>('.outreach-appointment-time-select') || null
      if (existingDatePicker && existingTimeSelect) return

      // Remove controls left by the old Follow-Up implementation, restore the
      // React-controlled source inputs, then rebuild with the exact same UI
      // classes and behavior used by Appointment — schedule on calendar.
      dateLabel?.querySelectorAll('.outreach-followup-date-picker').forEach((node) => node.remove())
      timeLabel?.querySelectorAll('.outreach-followup-time-select,.outreach-followup-time-help').forEach((node) => node.remove())
      followUpDateInput.style.display = ''
      followUpDateInput.removeAttribute('aria-hidden')
      followUpTimeInput.style.display = ''
      followUpTimeInput.removeAttribute('aria-hidden')
      delete followUpDateInput.dataset.followupAvailability
      followUpDateInput.dataset.followupAvailability = '1'

      const datePicker = document.createElement('input')
      datePicker.type = 'date'
      datePicker.className = `${followUpDateInput.className} outreach-appointment-date-picker`
      datePicker.value = manualDateToIso(followUpDateInput.value)
      followUpDateInput.style.display = 'none'
      followUpDateInput.setAttribute('aria-hidden', 'true')
      followUpDateInput.insertAdjacentElement('afterend', datePicker)

      const timeSelect = document.createElement('select')
      timeSelect.className = `${followUpTimeInput.className} outreach-appointment-time-select`
      const help = document.createElement('small')
      help.className = 'outreach-appointment-time-help'
      followUpTimeInput.style.display = 'none'
      followUpTimeInput.setAttribute('aria-hidden', 'true')
      followUpTimeInput.insertAdjacentElement('afterend', timeSelect)
      timeSelect.insertAdjacentElement('afterend', help)

      let blocks: CalendarBlock[] = []
      let requestNumber = 0

      function renderOptions(enabled: boolean) {
        let selected = followUpTimeInput.value.slice(0, 5)
        if (selected && isSlotBlocked(selected, blocks)) {
          selected = ''
          setControlledInputValue(followUpTimeInput, '')
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
        const ownerId = selectedOwner()
        blocks = []
        setControlledInputValue(followUpTimeInput, '')

        if (!ownerId) {
          help.textContent = context?.coordinator ? 'Choose Justin or Isaiah first.' : 'Unable to load the assigned agent calendar.'
          renderOptions(false)
          return
        }
        if (!datePicker.value) {
          help.textContent = 'Choose a follow-up date to see available times.'
          renderOptions(false)
          return
        }

        help.textContent = 'Checking the selected agent calendar…'
        renderOptions(false)
        try {
          const params = new URLSearchParams({ date: datePicker.value, owner: ownerId })
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

      timeSelect.addEventListener('change', () => setControlledInputValue(followUpTimeInput, timeSelect.value))
      datePicker.addEventListener('change', () => {
        setControlledInputValue(followUpDateInput, isoDateToManual(datePicker.value))
        void loadAvailability()
      })
      agentSelect?.addEventListener('change', () => void loadAvailability())

      renderOptions(false)
      void loadAvailability()
    }

    const enhance = () => {
      root.querySelectorAll<HTMLElement>('.outreach-dialog[aria-label="Record client conversation"]')
        .forEach(enhanceDialog)
    }

    const onChange = (event: Event) => {
      const target = event.target instanceof HTMLSelectElement ? event.target : null
      const label = target?.closest<HTMLLabelElement>('label') || null
      if (!target || !label || directLabelText(label) !== 'Conversation result') return
      window.requestAnimationFrame(enhance)
    }

    root.addEventListener('click', captureRow, true)
    root.addEventListener('change', onChange, true)
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
      root.removeEventListener('click', captureRow, true)
      root.removeEventListener('change', onChange, true)
      observer.disconnect()
    }
  }, [])

  return null
}
