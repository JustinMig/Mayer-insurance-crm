'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

export default function NewClientRingCentralPrefill() {
  const searchParams = useSearchParams()
  const source = searchParams.get('source') || ''
  const rawPhone = searchParams.get('phone') || ''

  useEffect(() => {
    if (source !== 'ringcentral' || !rawPhone) return

    const digits = rawPhone.replace(/\D/g, '').slice(-10)
    if (digits.length !== 10) return
    const formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`

    let tries = 0
    let timer: number | null = null
    const fill = () => {
      tries += 1
      const input = document.querySelector<HTMLInputElement>('.add-client-form input[name="phone"]')
      if (input) {
        input.value = formatted
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
        input.scrollIntoView({ behavior: 'smooth', block: 'center' })
        input.focus()
        return
      }
      if (tries < 40) timer = window.setTimeout(fill, 150)
    }

    fill()
    return () => { if (timer !== null) window.clearTimeout(timer) }
  }, [rawPhone, source])

  return null
}
