'use client'

import { useEffect } from 'react'

const CLASS_BY_LABEL: Record<string, string> = {
  Agent: 'appt-field-agent',
  Type: 'appt-field-type',
  Title: 'appt-field-title',
  Date: 'appt-field-date',
  'Start Time': 'appt-field-start',
  'End Time': 'appt-field-end',
  'Find Client (optional)': 'appt-field-client-search',
  'Tagged Client': 'appt-field-client-tag',
  'Find Lead (optional)': 'appt-field-lead-search',
  'Tagged Lead': 'appt-field-lead-tag',
  Notes: 'appt-field-notes'
}

const FIELD_CLASSES = Object.values(CLASS_BY_LABEL)
const LABEL_SELECTOR = '.dash-cal-editor .dash-cal-form-grid label'
const SLOT_MINUTES = 15

type CalendarBlock = {
  id: string
  title: string | null
  start_time: string | null
  end_time: string | null
}

function styleLabel(label: HTMLLabelElement) {
  const name = label.querySelector(':scope > span')?.textContent?.trim() || ''
  const nextClass = CLASS_BY_LABEL[name] || ''
  const currentClass = label.dataset.apptFieldClass || ''
  if (currentClass === nextClass) return

  if (currentClass) label.classList.remove(currentClass)
  else FIELD_CLASSES.forEach((className) => label.classList.remove(className))

  if (nextClass) label.classList.add(nextClass)
  label.dataset.apptFieldClass = nextClass
}

function styleWithin(node: Node) {
  const element = node instanceof Element ? node : node.parentElement
  if (!element) return

  const nearestLabel = element.closest<HTMLLabelElement>(LABEL_SELECTOR)
  if (nearestLabel) styleLabel(nearestLabel)

  if (element.matches(LABEL_SELECTOR)) styleLabel(element as HTMLLabelElement)
  element.querySelectorAll<HTMLLabelElement>(LABEL_SELECTOR).forEach(styleLabel)
}

function labelByName(editor: HTMLElement, name: string) {
  return Array.from(editor.querySelectorAll<HTMLLabelElement>('.dash-cal-form-grid label')).find((label) =>
    label.querySelector(':scope > span')?.textContent?.trim() === name
  ) || null
}

function timeToMinutes(value: string | null | undefined) {
  const match = String(value || '').slice(0, 5).match(/^(\d{2}):(\d{2})$/)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function minutesToTime(minutes: number) {
  const normalized = Math.max(0, Math.min(23 * 60 + 59, minutes))
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`
}

function formatTimeLabel(value: string) {
  const minutes = timeToMinutes(value)
  if (minutes === null) return value
  const hour24 = Math.floor(minutes / 60)
  const minute = minutes % 60
  const suffix = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 || 12
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`
}

function effectiveRange(start: string | null | undefined, end: string | null | undefined) {
  const startMinutes = timeToMinutes(start)
  if (startMinutes === null) return null
  const parsedEnd = timeToMinutes(end)
  return {
    start: startMinutes,
    end: parsedEnd !== null && parsedEnd > startMinutes ? parsedEnd : startMinutes + SLOT_MINUTES
  }
}

function rangesOverlap(start: string, end: string, block: CalendarBlock) {
  const first = effectiveRange(start, end)
  const second = effectiveRange(block.start_time, block.end_time)
  if (!first || !second) return false
  return first.start < second.end && second.start < first.end
}

function setControlledInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (setter) setter.call(input, value)
  else input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function buildTimeValues(current: string) {
  const values: string[] = []
  for (let minutes = 0; minutes < 24 * 60; minutes += SLOT_MINUTES) values.push(minutesToTime(minutes))
  const normalizedCurrent = String(current || '').slice(0, 5)
  if (normalizedCurrent && !values.includes(normalizedCurrent)) values.push(normalizedCurrent)
  return values.sort()
}

function attachBookedTimePicker(editor: HTMLElement) {
  if (editor.dataset.bookedTimePicker === '1') return

  const startLabel = labelByName(editor, 'Start Time')
  const endLabel = labelByName(editor, 'End Time')
  const dateLabel = labelByName(editor, 'Date')
  const typeLabel = labelByName(editor, 'Type')
  if (!startLabel || !endLabel || !dateLabel || !typeLabel) return

  const startInput = startLabel.querySelector<HTMLInputElement>('input[type="time"]')
  const endInput = endLabel.querySelector<HTMLInputElement>('input[type="time"]')
  const dateInput = dateLabel.querySelector<HTMLInputElement>('input[type="date"]')
  const typeSelect = typeLabel.querySelector<HTMLSelectElement>('select')
  const agentSelect = labelByName(editor, 'Agent')?.querySelector<HTMLSelectElement>('select') || null
  const titleInput = labelByName(editor, 'Title')?.querySelector<HTMLInputElement>('input') || null
  if (!startInput || !endInput || !dateInput || !typeSelect) return

  const startTimeInput: HTMLInputElement = startInput
  const endTimeInput: HTMLInputElement = endInput
  const appointmentDateInput: HTMLInputElement = dateInput
  const appointmentTypeSelect: HTMLSelectElement = typeSelect

  editor.dataset.bookedTimePicker = '1'

  const startSelect = document.createElement('select')
  const endSelect = document.createElement('select')
  startSelect.className = `${startTimeInput.className} appt-booked-time-select`
  endSelect.className = `${endTimeInput.className} appt-booked-time-select`
  startSelect.setAttribute('aria-label', 'Start Time')
  endSelect.setAttribute('aria-label', 'End Time')

  const help = document.createElement('small')
  help.className = 'appt-booked-time-help'
  help.textContent = 'Scheduled appointment times will be blocked.'

  startTimeInput.style.display = 'none'
  endTimeInput.style.display = 'none'
  startTimeInput.setAttribute('aria-hidden', 'true')
  endTimeInput.setAttribute('aria-hidden', 'true')
  startTimeInput.insertAdjacentElement('afterend', startSelect)
  endTimeInput.insertAdjacentElement('afterend', endSelect)
  startSelect.insertAdjacentElement('afterend', help)

  let blocks: CalendarBlock[] = []
  let requestNumber = 0
  let selfBlockId = ''
  const editing = (editor.querySelector('.dash-cal-modal-head h2')?.textContent || '').toLowerCase().includes('edit')
  const initial = {
    date: appointmentDateInput.value,
    owner: agentSelect?.value || '',
    title: titleInput?.value || '',
    start: startTimeInput.value.slice(0, 5),
    end: endTimeInput.value.slice(0, 5)
  }

  const filteredBlocks = () => blocks.filter((block) => block.id !== selfBlockId)

  function populate() {
    const startValue = startTimeInput.value.slice(0, 5)
    const endValue = endTimeInput.value.slice(0, 5)
    const isAppointment = appointmentTypeSelect.value === 'appointment'
    const activeBlocks = isAppointment ? filteredBlocks() : []

    startSelect.replaceChildren()
    const emptyStart = document.createElement('option')
    emptyStart.value = ''
    emptyStart.textContent = 'Select start time'
    startSelect.appendChild(emptyStart)

    for (const value of buildTimeValues(startValue)) {
      const option = document.createElement('option')
      option.value = value
      const next = minutesToTime((timeToMinutes(value) || 0) + SLOT_MINUTES)
      const booked = activeBlocks.some((block) => rangesOverlap(value, next, block))
      option.disabled = booked && value !== startValue
      option.textContent = `${formatTimeLabel(value)}${booked && value !== startValue ? ' — BOOKED' : ''}`
      startSelect.appendChild(option)
    }
    startSelect.value = startValue

    endSelect.replaceChildren()
    const emptyEnd = document.createElement('option')
    emptyEnd.value = ''
    emptyEnd.textContent = 'Select end time'
    endSelect.appendChild(emptyEnd)

    const startMinutes = timeToMinutes(startValue)
    for (const value of buildTimeValues(endValue)) {
      const option = document.createElement('option')
      option.value = value
      const endMinutes = timeToMinutes(value)
      const beforeStart = startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes
      const conflicts = Boolean(startValue) && activeBlocks.some((block) => rangesOverlap(startValue, value, block))
      const unavailable = beforeStart || conflicts
      option.disabled = unavailable && value !== endValue
      option.textContent = `${formatTimeLabel(value)}${unavailable && value !== endValue ? ' — UNAVAILABLE' : ''}`
      endSelect.appendChild(option)
    }
    endSelect.value = endValue
  }

  async function loadAvailability() {
    const currentRequest = ++requestNumber
    const date = appointmentDateInput.value
    if (!date || appointmentTypeSelect.value !== 'appointment') {
      blocks = []
      help.textContent = appointmentTypeSelect.value === 'appointment'
        ? 'Choose a date to see blocked appointment times.'
        : 'Activities can overlap appointment times.'
      populate()
      return
    }

    help.textContent = 'Checking scheduled appointment times…'
    try {
      const params = new URLSearchParams({ date })
      if (agentSelect?.value) params.set('owner', agentSelect.value)
      const response = await fetch(`/api/workspace/calendar-availability?${params.toString()}`, { cache: 'no-store' })
      const result = await response.json().catch(() => ({}))
      if (currentRequest !== requestNumber) return
      if (!response.ok) throw new Error(result.error || 'Unable to load booked appointment times.')
      blocks = Array.isArray(result.blocks) ? result.blocks as CalendarBlock[] : []

      if (editing && !selfBlockId && date === initial.date && (agentSelect?.value || '') === initial.owner) {
        const exact = blocks.find((block) =>
          String(block.start_time || '').slice(0, 5) === initial.start &&
          String(block.end_time || '').slice(0, 5) === initial.end &&
          (!initial.title || block.title === initial.title)
        )
        const fallback = blocks.find((block) =>
          String(block.start_time || '').slice(0, 5) === initial.start &&
          String(block.end_time || '').slice(0, 5) === initial.end
        )
        selfBlockId = exact?.id || fallback?.id || ''
      }

      const count = filteredBlocks().length
      help.textContent = count
        ? `${count} scheduled appointment${count === 1 ? '' : 's'} on this date. Booked times are disabled.`
        : 'No appointment times are blocked on this date.'
      populate()
    } catch (error) {
      if (currentRequest !== requestNumber) return
      blocks = []
      help.textContent = error instanceof Error
        ? `${error.message} Conflicts will still be checked when you save.`
        : 'Unable to load booked times. Conflicts will still be checked when you save.'
      populate()
    }
  }

  startSelect.addEventListener('change', () => {
    setControlledInputValue(startTimeInput, startSelect.value)
    const endValue = endTimeInput.value.slice(0, 5)
    const endMinutes = timeToMinutes(endValue)
    const startMinutes = timeToMinutes(startSelect.value)
    if (endValue && startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes) {
      setControlledInputValue(endTimeInput, '')
    }
    populate()
  })

  endSelect.addEventListener('change', () => {
    setControlledInputValue(endTimeInput, endSelect.value)
    populate()
  })

  appointmentDateInput.addEventListener('change', () => void loadAvailability())
  appointmentDateInput.addEventListener('input', () => void loadAvailability())
  appointmentTypeSelect.addEventListener('change', () => void loadAvailability())
  agentSelect?.addEventListener('change', () => void loadAvailability())
  startTimeInput.addEventListener('input', populate)
  endTimeInput.addEventListener('input', populate)

  populate()
  void loadAvailability()
}

function enhanceEditors(root: ParentNode) {
  root.querySelectorAll<HTMLElement>('.dash-cal-editor').forEach(attachBookedTimePicker)
}

export default function AppointmentFormStyler() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.content')
    if (!root) return

    styleWithin(root)
    enhanceEditors(root)

    const pending = new Set<Node>()
    let frame = 0
    const flush = () => {
      frame = 0
      for (const node of pending) styleWithin(node)
      pending.clear()
      enhanceEditors(root)
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) pending.add(node)
      }
      if (pending.size && !frame) frame = window.requestAnimationFrame(flush)
    })

    observer.observe(root, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
      pending.clear()
    }
  }, [])

  return (
    <style>{`
      .dash-cal-editor .dash-cal-form-grid label{
        padding:10px!important;
        border-radius:12px!important;
        border:1px solid transparent!important;
        transition:box-shadow .15s ease,border-color .15s ease;
      }
      .dash-cal-editor .dash-cal-form-grid label:focus-within{
        box-shadow:0 0 0 3px rgba(37,99,235,.10)!important;
      }
      .dash-cal-editor .dash-cal-form-grid label>span{
        font-weight:900!important;
        color:#334155!important;
      }

      .dash-cal-editor .appt-field-agent{background:#f5f3ff!important;border-color:#ddd6fe!important}
      .dash-cal-editor .appt-field-type{background:#ecfeff!important;border-color:#bae6fd!important}
      .dash-cal-editor .appt-field-title{background:#fffbeb!important;border-color:#fde68a!important}
      .dash-cal-editor .appt-field-date{background:#eff6ff!important;border-color:#bfdbfe!important}
      .dash-cal-editor .appt-field-start{background:#f0fdf4!important;border-color:#bbf7d0!important}
      .dash-cal-editor .appt-field-end{background:#fff7ed!important;border-color:#fed7aa!important}
      .dash-cal-editor .appt-field-notes{background:#f8fafc!important;border-color:#e2e8f0!important}

      .dash-cal-editor .appt-field-client-search,
      .dash-cal-editor .appt-field-client-tag{
        background:#eaf3ff!important;
        border-color:#93c5fd!important;
        border-left:5px solid #3b82f6!important;
      }
      .dash-cal-editor .appt-field-client-search>span,
      .dash-cal-editor .appt-field-client-tag>span{color:#1d4ed8!important}
      .dash-cal-editor .appt-field-client-search{margin-top:2px!important}

      .dash-cal-editor .appt-field-lead-search,
      .dash-cal-editor .appt-field-lead-tag{
        background:#ecfdf5!important;
        border-color:#86efac!important;
        border-left:5px solid #22c55e!important;
      }
      .dash-cal-editor .appt-field-lead-search>span,
      .dash-cal-editor .appt-field-lead-tag>span{color:#15803d!important}

      .dash-cal-editor .appt-field-client-search input,
      .dash-cal-editor .appt-field-client-tag select,
      .dash-cal-editor .appt-field-lead-search input,
      .dash-cal-editor .appt-field-lead-tag select{
        background:#fff!important;
        border-width:2px!important;
      }
      .dash-cal-editor .appt-field-client-search input:focus,
      .dash-cal-editor .appt-field-client-tag select:focus{border-color:#3b82f6!important;outline:none!important}
      .dash-cal-editor .appt-field-lead-search input:focus,
      .dash-cal-editor .appt-field-lead-tag select:focus{border-color:#22c55e!important;outline:none!important}

      .dash-cal-editor .dash-cal-tag-divider{
        margin:2px 0!important;
        color:#64748b!important;
      }
      .dash-cal-editor .dash-cal-tag-divider span{
        background:#fff!important;
        border:1px solid #e2e8f0!important;
        border-radius:999px!important;
        padding:4px 10px!important;
      }
      .dash-cal-editor .appt-booked-time-select{
        width:100%;
        border:1px solid #cbd5e1;
        border-radius:10px;
        padding:10px 11px;
        background:#fff;
        color:#172033;
        font:inherit;
      }
      .dash-cal-editor .appt-booked-time-select option:disabled{color:#9f3f3f;background:#f7e8e8}
      .dash-cal-editor .appt-booked-time-help{display:block;margin-top:6px;color:#64748b;font-size:.72rem;font-weight:700;line-height:1.25}

      @media(max-width:720px){
        .dash-cal-editor .dash-cal-form-grid label{padding:9px!important}
      }
    `}</style>
  )
}
