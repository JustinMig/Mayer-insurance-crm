'use client'

import { useEffect } from 'react'

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

    // Force the main Monthly Premium / Yearly Total pair into one row. These are
    // the two primary premium boxes the Isaiah dashboard should show.
    const premiumCard = content.querySelector<HTMLElement>('.dashboard-monthly-premium-stat')
    if (premiumCard) {
      premiumCard.style.setProperty('display', 'grid', 'important')
      premiumCard.style.setProperty('grid-template-columns', 'minmax(0,1fr) minmax(0,1fr)', 'important')
      premiumCard.style.setProperty('gap', '0', 'important')
      premiumCard.querySelectorAll<HTMLElement>(':scope > div').forEach((item) => {
        item.style.setProperty('min-width', '0', 'important')
        item.style.setProperty('padding', '2px 16px', 'important')
      })
      const yearly = premiumCard.querySelector<HTMLElement>('.dashboard-premium-divider')
      if (yearly) {
        yearly.style.setProperty('border-top', '0', 'important')
        yearly.style.setProperty('border-left', '1px solid rgba(255,255,255,.28)', 'important')
        yearly.style.setProperty('padding-top', '2px', 'important')
      }
    }

    return () => content.classList.remove('isaiah-dashboard-clean')
  }, [])

  return (
    <style>{`
      .isaiah-dashboard-clean .dashboard-personal-stats{
        display:block!important;
        max-width:820px;
        margin-left:auto!important;
        margin-right:auto!important;
      }
      .isaiah-dashboard-clean .dashboard-personal-stats>.stat:not(.dashboard-monthly-premium-stat){display:none!important}
      .isaiah-dashboard-clean .dashboard-monthly-premium-stat{
        width:100%!important;
        max-width:820px!important;
        margin:0 auto!important;
        padding:18px 8px!important;
        border-radius:15px!important;
        box-shadow:0 6px 18px rgba(15,23,42,.12)!important;
        display:grid!important;
        grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;
        gap:0!important;
        align-items:stretch!important;
      }
      .isaiah-dashboard-clean .dashboard-monthly-premium-stat>div{
        min-width:0!important;
        gap:6px!important;
        padding:2px 16px!important;
        display:grid!important;
        align-content:center!important;
      }
      .isaiah-dashboard-clean .dashboard-monthly-premium-stat>.dashboard-premium-divider{
        border-top:0!important;
        border-left:1px solid rgba(255,255,255,.28)!important;
        padding-top:2px!important;
      }
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
        display:flex!important;
        flex-direction:row!important;
        align-items:stretch!important;
        gap:10px!important;
        width:100%!important;
      }
      .isaiah-dashboard-clean .isaiah-premium-inline-results>div{
        flex:1 1 0!important;
        width:50%!important;
        min-width:0!important;
        padding:14px 15px!important;
        border:1px solid #dbe4eb!important;
        border-radius:12px!important;
        background:#f8fafc!important;
        display:grid!important;
        align-content:start!important;
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
      .isaiah-dashboard-clean .isaiah-premium-inline-results .subtle{
        margin:3px 0 0!important;
        font-size:.68rem!important;
        line-height:1.25!important;
      }

      @media(max-width:640px){
        .isaiah-dashboard-clean .dashboard-personal-stats,
        .isaiah-dashboard-clean .isaiah-premium-tools{max-width:none!important}
        .isaiah-dashboard-clean .dashboard-monthly-premium-stat{
          padding:14px 5px!important;
          grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;
        }
        .isaiah-dashboard-clean .dashboard-monthly-premium-stat>div{padding:2px 9px!important}
        .isaiah-dashboard-clean .dashboard-monthly-premium-stat span{font-size:.62rem!important;letter-spacing:.02em!important}
        .isaiah-dashboard-clean .dashboard-monthly-premium-stat strong{font-size:1.2rem!important}
        .isaiah-dashboard-clean .isaiah-premium-history-card{padding:12px!important;gap:11px!important}
        .isaiah-dashboard-clean .isaiah-premium-history-card>.premium-period-controls{
          grid-template-columns:1fr 1fr!important;
          padding:9px!important;
        }
        .isaiah-dashboard-clean .premium-period-controls .btn{grid-column:1 / -1!important;width:100%!important}
        .isaiah-dashboard-clean .isaiah-premium-inline-results{
          display:flex!important;
          flex-direction:row!important;
          gap:7px!important;
        }
        .isaiah-dashboard-clean .isaiah-premium-inline-results>div{
          flex:1 1 0!important;
          width:50%!important;
          min-width:0!important;
          padding:10px 8px!important;
        }
        .isaiah-dashboard-clean .isaiah-premium-inline-results .premium-card-label{font-size:.58rem!important;letter-spacing:.015em!important}
        .isaiah-dashboard-clean .isaiah-premium-inline-results .premium-total-value{font-size:1rem!important}
        .isaiah-dashboard-clean .isaiah-premium-inline-results .subtle{font-size:.56rem!important}
      }
    `}</style>
  )
}
