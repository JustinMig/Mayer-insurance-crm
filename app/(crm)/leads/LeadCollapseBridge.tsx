'use client'

import { useEffect } from 'react'

export default function LeadCollapseBridge() {
  useEffect(() => {
    const cleanups = new Map<HTMLElement, () => void>()

    const bindCard = (card: HTMLElement) => {
      if (cleanups.has(card)) return
      const header = card.querySelector<HTMLElement>('.lean-lead-main')
      if (!header) return

      card.classList.add('lead-collapsible')
      card.classList.remove('lead-expanded')
      header.setAttribute('role', 'button')
      header.setAttribute('tabindex', '0')
      header.setAttribute('aria-expanded', 'false')
      header.setAttribute('aria-label', 'Open or close lead details')

      const toggle = () => {
        const expanded = card.classList.toggle('lead-expanded')
        header.setAttribute('aria-expanded', expanded ? 'true' : 'false')
      }

      const onClick = (event: MouseEvent) => {
        if ((event.target as HTMLElement | null)?.closest('button,a,input,select,textarea,label')) return
        toggle()
      }

      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        toggle()
      }

      header.addEventListener('click', onClick)
      header.addEventListener('keydown', onKeyDown)
      cleanups.set(card, () => {
        header.removeEventListener('click', onClick)
        header.removeEventListener('keydown', onKeyDown)
      })
    }

    const bindAll = () => {
      document.querySelectorAll<HTMLElement>('.lean-lead-card').forEach(bindCard)
    }

    bindAll()
    const observer = new MutationObserver(bindAll)
    const root = document.querySelector<HTMLElement>('.lean-leads') || document.body
    observer.observe(root, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      cleanups.forEach((cleanup) => cleanup())
      cleanups.clear()
    }
  }, [])

  return (
    <style jsx global>{`
      .lean-lead-card.lead-collapsible:not(.lead-expanded)>:not(.lean-lead-main){display:none!important}
      .lean-lead-card.lead-collapsible{padding:0!important;gap:0!important;overflow:hidden}
      .lean-lead-card.lead-collapsible>.lean-lead-main{padding:12px 13px;cursor:pointer;position:relative;align-items:center}
      .lean-lead-card.lead-collapsible>.lean-lead-main::after{content:'▾';flex:0 0 auto;margin-left:6px;color:#657785;font-size:.9rem;font-weight:900}
      .lean-lead-card.lead-collapsible.lead-expanded>.lean-lead-main::after{content:'▴'}
      .lean-lead-card.lead-collapsible.lead-expanded>:not(.lean-lead-main){margin-left:13px;margin-right:13px}
      .lean-lead-card.lead-collapsible.lead-expanded>.lean-lead-owner{margin-top:2px}
      .lean-lead-card.lead-collapsible.lead-expanded>.lean-lead-actions{margin-bottom:13px}
      .lean-lead-card.lead-collapsible.lead-expanded>p{margin-top:0}
      @media(max-width:720px){
        .lean-lead-card.lead-collapsible>.lean-lead-main{padding:11px 12px;grid-template-columns:minmax(0,1fr) auto}
        .lean-lead-card.lead-collapsible>.lean-lead-main::after{grid-column:2;grid-row:1 / span 2;align-self:center}
      }
    `}</style>
  )
}
