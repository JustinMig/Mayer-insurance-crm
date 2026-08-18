'use client'

import { useEffect } from 'react'

export default function CalendarAutoOpen() {
  useEffect(() => {
    let attempts = 0
    const openCalendar = () => {
      attempts += 1
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.workspace-tabs button'))
      const calendarButton = buttons.find((button) => (button.textContent || '').trim().startsWith('CALENDAR'))
      if (calendarButton) {
        calendarButton.click()
        return
      }
      if (attempts < 20) window.setTimeout(openCalendar, 50)
    }
    openCalendar()
  }, [])

  return null
}
