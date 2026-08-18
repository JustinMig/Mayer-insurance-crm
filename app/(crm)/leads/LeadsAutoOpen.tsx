'use client'

import { useEffect } from 'react'

export default function LeadsAutoOpen() {
  useEffect(() => {
    let attempts = 0

    const openLeadEntry = () => {
      attempts += 1

      const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.workspace-tabs button'))
      const leadsButton = tabButtons.find((button) => (button.textContent || '').trim().startsWith('LEADS'))
      if (leadsButton) leadsButton.click()

      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      const addLeadButton = buttons.find((button) => (button.textContent || '').trim().includes('ADD LEAD'))
      if (addLeadButton) {
        addLeadButton.click()
        return
      }

      if (attempts < 30) window.setTimeout(openLeadEntry, 50)
    }

    openLeadEntry()
  }, [])

  return null
}
