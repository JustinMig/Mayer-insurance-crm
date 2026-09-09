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

    const ownerIdForDialog = () => {
      if (!context) return ''
      if (!context.coordinator) return context.owner_id
      const wanted = normalizedName(activeOwnerName)
      if (!wanted) return ''
      return context.agents.find((agent) => normalizedName(agent.full_name) === wanted)?.id || ''
    }

    const enhanceDialog = (dialog: HTMLElement) => {
      if (!context) return
      const resultSelect = findLabel(dialog, 'Conversation result')?.querySelector<HTMLSelectElement>('select') || null
      if (!resultSelect || resultSelect.value !== 'follow_up') return

      const dateInput = findLabel(dialog, 'Follow-up date')?.querySelector<HTMLInputElement>('input') || null
      const timeInput = findLabel(dialog, 'Time (optional)')?.querySelector<HTMLInputElement>('input[type="time"]') || null
      if (!dateInput || !timeInput || dateInput.dataset.followupAvailability === '1') return

      dateInput.dataset.followupAvailability = '1'
      const ownerId = ownerIdForDialog()

      const datePicker = document.createElement('input')
      datePicker.type = 'date'
      datePicker.className = `${dateInput.className} outreach-followup-date-picker`
      datePicker.value = manualDateToIso(dateInput.value)
      dateInput.style.display = 'none'
      dateInput.setAttribute('aria-hidden', 'true')
      dateInput.insertAdjacentElement('afterend', datePicker)

      const timeSelect = document.createElement('select')
      timeSelect.className = `${timeInput.className} outreach-followup-time-select`
      const help = document.createElement('small')
      help.className = 'outreach-followup-time-help'
      timeInput.style.display = 'none'
      timeInput.setAttribute('aria-hidden', 'true')
      timeInput.insertAdjacentElement('afterend', timeSelect)
      timeSelect.insertAdjacentElement('afterend', help)

      let blocks: CalendarBlock[] = []
      let requestNumber = 0

      function renderOptions(enabled: boolean) {
        let selected = timeInput.value.slice(0, 5)
        if (selected && isSlotBlocked(selected, blocks)) {
          selected = ''
          setControlledInputValue(timeInput, '')
        }
        timeSelect.replaceChildren()
        const empty = document.createElement('option')
        empty.value = ''
        empty.textContent = enabled ? 'Select follow-up time' : (ownerId ? 'Choose a date first' : 'Assigned agent calendar unavailable')
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
        blocks = []
        setControlledInputValue(timeInput, '')

        if (!ownerId) {
          help.textContent = context?.coordinator
            ? 'Unable to identify this campaign client’s assigned agent calendar.'
            : 'Unable to load the assigned agent calendar.'
          renderOptions(false)
          return
        }
        if (!datePicker.value) {
          help.textContent = 'Choose a follow-up date to see available appointment times.'
          renderOptions(false)
          return
        }

        help.textContent = 'Checking the assigned agent calendar…'
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

      timeSelect.addEventListener('change', () => setControlledInputValue(timeInput, timeSelect.value))
      datePicker.addEventListener('change', () => {
        setControlledInputValue(dateInput, isoDateToManual(datePicker.value))
        void loadAvailability()
      })
      renderOptions(false)
      void loadAvailability()
    }

    const enhance = () => {
      root.querySelectorAll<HTMLElement>('.outreach-dialog[aria-label="Record client conversation"]')
        .forEach(enhanceDialog)
    }

    const onChange = (event: Event) => {
      const target = event.target instanceof HTMLSelectElement ? event.target : null
      if (!target || directLabelText(target.closest('label') as HTMLLabelElement) !== 'Conversation result') return
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

  return (
    <style>{`
      .outreach-followup-date-picker,.outreach-followup-time-select{width:100%}
      .outreach-followup-date-picker{cursor:pointer;color-scheme:light}
      .outreach-followup-time-select:disabled{background:#eef1f3!important;color:#7b8790!important;cursor:not-allowed}
      .outreach-followup-time-select option:disabled{color:#9b4f4f;background:#f7eded}
      .outreach-followup-time-help{display:block;margin-top:6px;color:#61717e;font-size:.72rem;font-weight:700;line-height:1.35}
    `}</style>
  )
}
