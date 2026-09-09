'use client'

import { useEffect } from 'react'

function currencyValue(text: string | null | undefined) {
  const value = Number(String(text || '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(value) ? value : null
}

function money(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}

export default function DeferredDashboardTools() {
  useEffect(() => {
    // This helper is mounted for non-Justin dashboards. Only apply the cleanup
    // to Isaiah's PLATINUM portal so Sheena's manager dashboard is unchanged.
    const isIsaiah = Boolean(document.querySelector('.brand-car, .topbar-car'))
    if (!isIsaiah) return

    const content = document.querySelector<HTMLElement>('.content')
    if (!content) return
    content.classList.add('isaiah-dashboard-clean')

    const headingCopy = content.querySelector<HTMLElement>('.clients-page-heading .subtle')
    if (headingCopy) headingCopy.textContent = 'Appointments and premium production at a glance.'

    const historyCard = content.querySelector<HTMLElement>('.isaiah-premium-history-card')
    const historyIntro = historyCard?.querySelector<HTMLElement>(':scope > div:first-child .subtle')
    if (historyIntro) historyIntro.textContent = 'Choose a month and year to review premium sales.'

    const historyResults = historyCard?.querySelectorAll<HTMLElement>('.isaiah-premium-inline-results > div') || []
    const yearlyResult = historyResults.length > 1 ? historyResults[1] : null
    const yearlyLabel = yearlyResult?.querySelector<HTMLElement>('.premium-card-label') || null
    const yearlyValue = yearlyResult?.querySelector<HTMLElement>('.premium-total-value') || null

    if (yearlyLabel) yearlyLabel.textContent = yearlyLabel.textContent.replace('Annualized Premium', 'Yearly Premium Total')

    // The old UI multiplied the selected year's premium total by 12 before
    // displaying it. Undo that presentation-only calculation so the history
    // card shows the real selected-year total returned by the dashboard query.
    const displayedAnnualized = currencyValue(yearlyValue?.textContent)
    if (yearlyValue && displayedAnnualized !== null) yearlyValue.textContent = money(displayedAnnualized / 12)
    yearlyResult?.querySelector('.subtle')?.remove()

    return () => content.classList.remove('isaiah-dashboard-clean')
  }, [])

  return (
    <style>{`
      .isaiah-dashboard-clean .dashboard-personal-stats{
        display:block!important;
        max-width:680px;
        margin-left:auto!important;
        margin-right:auto!important;
      }
      .isaiah-dashboard-clean .dashboard-personal-stats>.stat:not(.dashboard-monthly-premium-stat){display:none!important}
      .isaiah-dashboard-clean .dashboard-monthly-premium-stat{
        width:100%!important;
        padding:18px 20px!important;
        border-radius:15px!important;
        box-shadow:0 6px 18px rgba(15,23,42,.12)!important;
      }
      .isaiah-dashboard-clean .dashboard-monthly-premium-stat>div{gap:6px!important}
      .isaiah-dashboard-clean .dashboard-monthly-premium-stat span{
        font-size:.76rem!important;
        font-weight:900!important;
        letter-spacing:.035em!important;
        text-transform:uppercase!important;
      }
      .isaiah-dashboard-clean .dashboard-monthly-premium-stat strong{font-size:1.55rem!important}

      .isaiah-dashboard-clean .isaiah-premium-tools{
        max-width:820px;
        margin-left:auto!important;
        margin-right:auto!important;
      }
      .isaiah-dashboard-clean .isaiah-premium-history-card{
        padding:18px!important;
        border:1px solid #d8e1e8!important;
        border-radius:16px!important;
        background:#fff!important;
        box-shadow:0 6px 20px rgba(15,23,42,.08)!important;
        display:grid!important;
        gap:15px!important;
      }
      .isaiah-dashboard-clean .isaiah-premium-history-card>.premium-period-controls{
        display:grid!important;
        grid-template-columns:minmax(0,1.35fr) minmax(120px,.75fr) auto!important;
        gap:8px!important;
        align-items:center!important;
        padding:11px!important;
        border:1px solid #dde5eb!important;
        border-radius:12px!important;
        background:#f6f9fb!important;
      }
      .isaiah-dashboard-clean .premium-period-controls select{
        width:100%!important;
        min-height:42px!important;
        border:1px solid #cbd5df!important;
        border-radius:9px!important;
        background:#fff!important;
        padding:7px 10px!important;
        font-weight:800!important;
        color:#334155!important;
      }
      .isaiah-dashboard-clean .premium-period-controls .btn{
        min-height:42px!important;
        padding:8px 18px!important;
        border-radius:9px!important;
        font-weight:900!important;
      }
      .isaiah-dashboard-clean .isaiah-premium-inline-results{
        display:grid!important;
        grid-template-columns:1fr 1fr!important;
        gap:10px!important;
      }
      .isaiah-dashboard-clean .isaiah-premium-inline-results>div{
        min-width:0!important;
        padding:14px 15px!important;
        border:1px solid #dbe4eb!important;
        border-radius:12px!important;
        background:#f8fafc!important;
        display:grid!important;
        gap:6px!important;
      }
      .isaiah-dashboard-clean .isaiah-premium-inline-results>div:first-child{
        background:#eef5fb!important;
        border-color:#cfdeea!important;
      }
      .isaiah-dashboard-clean .isaiah-premium-inline-results>div:last-child{
        background:#eef6f1!important;
        border-color:#cfdfd4!important;
      }
      .isaiah-dashboard-clean .isaiah-premium-inline-results .premium-card-label{
        color:#5b6b79!important;
        font-size:.7rem!important;
        font-weight:900!important;
        text-transform:uppercase!important;
        letter-spacing:.035em!important;
      }
      .isaiah-dashboard-clean .isaiah-premium-inline-results .premium-total-value{
        color:#18324a!important;
        font-size:1.45rem!important;
        line-height:1.1!important;
      }

      @media(max-width:640px){
        .isaiah-dashboard-clean .dashboard-personal-stats,
        .isaiah-dashboard-clean .isaiah-premium-tools{max-width:none!important}
        .isaiah-dashboard-clean .dashboard-monthly-premium-stat{padding:15px!important}
        .isaiah-dashboard-clean .dashboard-monthly-premium-stat strong{font-size:1.35rem!important}
        .isaiah-dashboard-clean .isaiah-premium-history-card{padding:13px!important;gap:12px!important}
        .isaiah-dashboard-clean .isaiah-premium-history-card>.premium-period-controls{
          grid-template-columns:1fr 1fr!important;
          padding:9px!important;
        }
        .isaiah-dashboard-clean .premium-period-controls .btn{grid-column:1 / -1!important;width:100%!important}
        .isaiah-dashboard-clean .isaiah-premium-inline-results{grid-template-columns:1fr!important}
        .isaiah-dashboard-clean .isaiah-premium-inline-results>div{padding:12px!important}
        .isaiah-dashboard-clean .isaiah-premium-inline-results .premium-total-value{font-size:1.3rem!important}
      }
    `}</style>
  )
}
