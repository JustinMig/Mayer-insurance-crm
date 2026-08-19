'use client'

import { useEffect } from 'react'

export default function LeadsAutoOpen() {
  useEffect(() => {
    let attempts = 0

    const openLeads = () => {
      attempts += 1
      const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.workspace-tabs button'))
      const leadsButton = tabButtons.find((button) => (button.textContent || '').trim().startsWith('LEADS'))
      if (leadsButton) {
        leadsButton.click()
        return
      }
      if (attempts < 30) window.setTimeout(openLeads, 50)
    }

    openLeads()
  }, [])

  return null
}
