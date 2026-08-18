'use client'

import { useEffect } from 'react'

const CARD_SELECTOR = '.workspace-lead-card'
const INTERACTIVE_SELECTOR = 'a,button,input,select,textarea,label'

function prepareCard(card: HTMLElement) {
  if (card.dataset.leadCollapseReady === '1') return
  card.dataset.leadCollapseReady = '1'
  card.tabIndex = 0
  card.setAttribute('role', 'button')
  card.setAttribute('aria-expanded', 'false')
  card.setAttribute('aria-label', 'Open lead details')
}

function toggleCard(card: HTMLElement) {
  const expanded = card.classList.toggle('is-expanded')
  card.setAttribute('aria-expanded', expanded ? 'true' : 'false')
  card.setAttribute('aria-label', expanded ? 'Close lead details' : 'Open lead details')
}

export default function WorkspaceLeadCollapseController() {
  useEffect(() => {
    const prepareAll = () => {
      document.querySelectorAll<HTMLElement>(CARD_SELECTOR).forEach(prepareCard)
    }

    prepareAll()

    const observer = new MutationObserver(prepareAll)
    observer.observe(document.body, { childList: true, subtree: true })

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const card = target?.closest<HTMLElement>(CARD_SELECTOR)
      if (!card || target?.closest(INTERACTIVE_SELECTOR)) return
      toggleCard(card)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      const target = event.target as HTMLElement | null
      const card = target?.closest<HTMLElement>(CARD_SELECTOR)
      if (!card || target?.closest(INTERACTIVE_SELECTOR)) return
      event.preventDefault()
      toggleCard(card)
    }

    document.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      observer.disconnect()
      document.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return (
    <style jsx global>{`
      .workspace-lead-card {
        position: relative;
      }

      .workspace-lead-card:not(.is-expanded) {
        min-height: 54px;
        padding: 11px 46px 11px 15px !important;
        align-items: center !important;
        cursor: pointer;
      }

      .workspace-lead-card:not(.is-expanded) .workspace-lead-main {
        width: 100%;
      }

      .workspace-lead-card:not(.is-expanded) .workspace-lead-main > :not(.workspace-lead-title-row),
      .workspace-lead-card:not(.is-expanded) .workspace-lead-actions,
      .workspace-lead-card:not(.is-expanded) .workspace-agent-pill {
        display: none !important;
      }

      .workspace-lead-card:not(.is-expanded) .workspace-lead-title-row {
        width: 100%;
        gap: 7px;
      }

      .workspace-lead-card:not(.is-expanded)::after {
        content: '›';
        position: absolute;
        right: 16px;
        top: 50%;
        transform: translateY(-52%);
        font-size: 27px;
        line-height: 1;
        font-weight: 700;
        color: #64748b;
      }

      .workspace-lead-card.is-expanded::after {
        content: '⌃';
        position: absolute;
        right: 15px;
        top: 12px;
        font-size: 20px;
        line-height: 1;
        font-weight: 800;
        color: #64748b;
        pointer-events: none;
      }

      .workspace-lead-card:focus-visible {
        outline: 3px solid rgba(15, 76, 129, .28);
        outline-offset: 2px;
      }

      @media (max-width: 720px) {
        .workspace-lead-card:not(.is-expanded) {
          flex-direction: row !important;
          align-items: center !important;
        }

        .workspace-lead-card:not(.is-expanded) .workspace-lead-title-row strong {
          width: 100%;
        }
      }
    `}</style>
  )
}
