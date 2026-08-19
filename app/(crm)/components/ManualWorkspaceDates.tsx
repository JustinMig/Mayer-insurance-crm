'use client'

import { useEffect } from 'react'

const DATE_SELECTOR = '.workspace-modal input[type="date"], .dash-cal-editor input[type="date"]'

function formatManualDate(value: string) {
  const trimmed = value.trim()
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`

  const digits = trimmed.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

function manualDateToIso(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) {
    const year = Number(iso[1])
    const month = Number(iso[2])
    const day = Number(iso[3])
    const date = new Date(Date.UTC(year, month - 1, day))
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
      ? `${iso[1]}-${iso[2]}-${iso[3]}`
      : ''
  }

  const us = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!us) return ''

  const month = Number(us[1])
  const day = Number(us[2])
  const year = Number(us[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return ''

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function setNativeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (setter) setter.call(input, value)
  else input.value = value
}

export default function ManualWorkspaceDates() {
  useEffect(() => {
    const enhanced = new WeakSet<HTMLInputElement>()

    function enhance(source: HTMLInputElement) {
      if (enhanced.has(source)) return
      enhanced.add(source)

      const proxy = document.createElement('input')
      proxy.type = 'text'
      proxy.inputMode = 'numeric'
      proxy.autocomplete = 'off'
      proxy.placeholder = 'MM/DD/YYYY'
      proxy.maxLength = 10
      proxy.title = 'Enter date as MM/DD/YYYY'
      proxy.setAttribute('aria-label', source.getAttribute('aria-label') || 'Date in MM/DD/YYYY format')
      proxy.className = source.className
      proxy.value = formatManualDate(source.value)
      proxy.dataset.manualDateProxy = '1'

      source.style.display = 'none'
      source.tabIndex = -1
      source.setAttribute('aria-hidden', 'true')
      source.insertAdjacentElement('beforebegin', proxy)

      const pushToReact = () => {
        const formatted = formatManualDate(proxy.value)
        if (proxy.value !== formatted) proxy.value = formatted

        const iso = manualDateToIso(formatted)
        const nextValue = formatted ? iso : ''
        setNativeValue(source, nextValue)
        source.dispatchEvent(new Event('input', { bubbles: true }))
        source.dispatchEvent(new Event('change', { bubbles: true }))
      }

      proxy.addEventListener('input', pushToReact)
      proxy.addEventListener('blur', () => {
        if (proxy.value && !manualDateToIso(proxy.value)) {
          proxy.setCustomValidity('Enter a valid date as MM/DD/YYYY')
        } else {
          proxy.setCustomValidity('')
        }
      })
      proxy.addEventListener('focus', () => proxy.setCustomValidity(''))
    }

    function scan(root: ParentNode = document) {
      root.querySelectorAll<HTMLInputElement>(DATE_SELECTOR).forEach(enhance)
    }

    scan()
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (!(node instanceof Element)) continue
          if (node.matches(DATE_SELECTOR)) enhance(node as HTMLInputElement)
          scan(node)
        }
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [])

  return null
}
