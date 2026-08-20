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

export default function AppointmentFormStyler() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.content')
    if (!root) return

    const apply = () => {
      root.querySelectorAll<HTMLLabelElement>('.dash-cal-editor .dash-cal-form-grid label').forEach((label) => {
        const name = label.querySelector(':scope > span')?.textContent?.trim() || ''
        Object.values(CLASS_BY_LABEL).forEach((className) => label.classList.remove(className))
        const className = CLASS_BY_LABEL[name]
        if (className) label.classList.add(className)
      })
    }

    apply()
    const observer = new MutationObserver(apply)
    observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
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

      @media(max-width:720px){
        .dash-cal-editor .dash-cal-form-grid label{padding:9px!important}
      }
    `}</style>
  )
}
