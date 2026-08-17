'use client'

import { useEffect } from 'react'

type LookupResult = {
  city?: string
  state?: string
  county?: string
  matched?: boolean
}

function setNativeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

export default function AddressAutoFill() {
  useEffect(() => {
    let controller: AbortController | null = null
    let timer: ReturnType<typeof setTimeout> | null = null

    async function lookup(form: HTMLFormElement) {
      const street = form.elements.namedItem('address_line1') as HTMLInputElement | null
      const city = form.elements.namedItem('city') as HTMLInputElement | null
      const state = form.elements.namedItem('state') as HTMLInputElement | null
      const zip = form.elements.namedItem('zip_code') as HTMLInputElement | null
      const county = form.elements.namedItem('county') as HTMLInputElement | null

      if (!street || !city || !state || !zip || !county) return
      const zipValue = zip.value.trim().replace(/\D/g, '').slice(0, 5)
      if (zipValue.length !== 5 || !street.value.trim()) return

      controller?.abort()
      controller = new AbortController()

      const params = new URLSearchParams({
        street: street.value.trim(),
        zip: zipValue,
      })
      if (city.value.trim()) params.set('city', city.value.trim())
      if (state.value.trim()) params.set('state', state.value.trim())

      try {
        zip.dataset.addressLookup = 'loading'
        const response = await fetch(`/api/address-lookup?${params.toString()}`, {
          signal: controller.signal,
          cache: 'no-store',
        })
        if (!response.ok) return
        const result = await response.json() as LookupResult
        if (!result.matched) return

        // Preserve anything the user already typed unless the lookup can improve an empty field.
        if (result.city && !city.value.trim()) setNativeValue(city, result.city)
        if (result.state && !state.value.trim()) setNativeValue(state, result.state)
        if (result.county && !county.value.trim()) setNativeValue(county, result.county)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      } finally {
        delete zip.dataset.addressLookup
      }
    }

    function queueLookup(target: EventTarget | null) {
      if (!(target instanceof HTMLInputElement)) return
      if (!['address_line1', 'city', 'state', 'zip_code'].includes(target.name)) return
      const form = target.closest('form')
      if (!(form instanceof HTMLFormElement)) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => lookup(form), target.name === 'zip_code' ? 150 : 450)
    }

    function onBlur(event: FocusEvent) {
      queueLookup(event.target)
    }

    function onInput(event: Event) {
      const target = event.target
      if (!(target instanceof HTMLInputElement) || target.name !== 'zip_code') return
      if (target.value.replace(/\D/g, '').length >= 5) queueLookup(target)
    }

    document.addEventListener('focusout', onBlur)
    document.addEventListener('input', onInput)
    return () => {
      if (timer) clearTimeout(timer)
      controller?.abort()
      document.removeEventListener('focusout', onBlur)
      document.removeEventListener('input', onInput)
    }
  }, [])

  return null
}
