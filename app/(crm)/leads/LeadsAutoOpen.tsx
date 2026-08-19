'use client'

import { useEffect } from 'react'

export default function LeadsAutoOpen() {
  useEffect(() => {
    let attempts = 0
    let formAttempts = 0
    let stopped = false

    const shouldOpenInput =
      new URLSearchParams(window.location.search).get('new') === '1' ||
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)

    const openLeadInput = () => {
      if (stopped || !shouldOpenInput) return
      formAttempts += 1

      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      const addLeadButton = buttons.find((button) => (button.textContent || '').trim().includes('ADD LEAD'))

      if (addLeadButton) {
        addLeadButton.click()
        stopped = true
        return
      }

      if (formAttempts < 40) window.setTimeout(openLeadInput, 50)
    }

    const openLeads = () => {
      if (stopped) return
      attempts += 1
      const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.workspace-tabs button'))
      const leadsButton = tabButtons.find((button) => (button.textContent || '').trim().startsWith('LEADS'))

      if (leadsButton) {
        leadsButton.click()
        if (shouldOpenInput) window.setTimeout(openLeadInput, 0)
        return
      }

      if (attempts < 30) window.setTimeout(openLeads, 50)
    }

    openLeads()

    return () => {
      stopped = true
    }
  }, [])

  return null
}
