'use client'

import { useEffect } from 'react'

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
}

export default function ClientPhoneAutoFormat() {
  useEffect(() => {
    const selector = '.add-client-form input[name="phone"], .client-profile-form input[name="phone"]'

    const formatInput = (input: HTMLInputElement) => {
      const next = formatPhone(input.value)
      if (input.value !== next) input.value = next
    }

    const onInput = (event: Event) => {
      const input = event.target
      if (!(input instanceof HTMLInputElement) || !input.matches(selector)) return
      formatInput(input)
    }

    document.querySelectorAll<HTMLInputElement>(selector).forEach(formatInput)
    document.addEventListener('input', onInput, true)

    return () => {
      document.removeEventListener('input', onInput, true)
    }
  }, [])

  return null
}
