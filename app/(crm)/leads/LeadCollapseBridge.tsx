'use client'

import { useEffect } from 'react'

type LeadLookup = {
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  existing_client_id?: string | null
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function phoneDigits(value: string | null | undefined) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.length > 10 ? digits.slice(-10) : digits
}

function cardIdentity(card: HTMLElement) {
  const name = normalizeName(card.querySelector<HTMLElement>('.lean-lead-main strong')?.textContent || '')
  const meta = card.querySelector<HTMLElement>('.lean-lead-main span')?.textContent || ''
  const phone = phoneDigits(meta.split('·')[0] || '')
  return { name, phone }
}

function leadIdentity(lead: LeadLookup) {
  return {
    name: normalizeName(`${lead.first_name || ''} ${lead.last_name || ''}`),
    phone: phoneDigits(lead.phone)
  }
}

export default function LeadCollapseBridge() {
  useEffect(() => {
    const cleanups = new Map<HTMLElement, () => void>()
    let leads: LeadLookup[] = []
    let listSignature = ''
    let refreshTimer: number | null = null

    const applyClientActions = () => {
      document.querySelectorAll<HTMLElement>('.lean-lead-card').forEach((card) => {
        const identity = cardIdentity(card)
        if (!identity.name) return

        const lead = leads.find((candidate) => {
          const candidateIdentity = leadIdentity(candidate)
          if (candidateIdentity.name !== identity.name) return false
          if (candidateIdentity.phone && identity.phone) return candidateIdentity.phone === identity.phone
          return true
        })
        if (!lead) return

        const existingClientId = String(lead.existing_client_id || '').trim()
        const actions = card.querySelector<HTMLElement>('.lean-lead-actions')
        const convertButton = Array.from(card.querySelectorAll<HTMLButtonElement>('button'))
          .find((button) => (button.textContent || '').trim() === 'CONVERT TO CLIENT') || null
        const leadFileLink = Array.from(card.querySelectorAll<HTMLAnchorElement>('a'))
          .find((link) => ['OPEN LEAD FILE', 'OPEN CLIENT FILE'].includes((link.textContent || '').trim())) || null
        const injectedClientLink = card.querySelector<HTMLAnchorElement>('[data-open-client-file="1"]')

        if (existingClientId) {
          if (convertButton) convertButton.hidden = true

          if (leadFileLink) {
            leadFileLink.hidden = false
            leadFileLink.href = `/clients/${encodeURIComponent(existingClientId)}`
            leadFileLink.textContent = 'OPEN CLIENT FILE'
            leadFileLink.removeAttribute('target')
            leadFileLink.removeAttribute('rel')
          } else if (actions && !injectedClientLink) {
            const link = document.createElement('a')
            link.href = `/clients/${encodeURIComponent(existingClientId)}`
            link.className = 'btn btn-primary btn-small'
            link.textContent = 'OPEN CLIENT FILE'
            link.dataset.openClientFile = '1'
            actions.insertBefore(link, actions.children[1] || null)
          }
        } else {
          if (convertButton) convertButton.hidden = false
          if (leadFileLink) leadFileLink.hidden = true
          injectedClientLink?.remove()
        }
      })
    }

    const loadClientLinks = async () => {
      try {
        const response = await fetch('/api/workspace/leads', { cache: 'no-store' })
        const result = await response.json().catch(() => ({}))
        if (!response.ok) return
        leads = Array.isArray(result.leads) ? result.leads : []
        applyClientActions()
      } catch {
        // The normal Leads screen still works if this enhancement cannot refresh.
      }
    }

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
      const cards = Array.from(document.querySelectorAll<HTMLElement>('.lean-lead-card'))
      cards.forEach(bindCard)
      applyClientActions()

      const nextSignature = cards.map((card) => {
        const identity = cardIdentity(card)
        return `${identity.name}:${identity.phone}`
      }).join('|')

      if (nextSignature !== listSignature) {
        listSignature = nextSignature
        if (refreshTimer !== null) window.clearTimeout(refreshTimer)
        refreshTimer = window.setTimeout(() => void loadClientLinks(), 120)
      }
    }

    bindAll()
    void loadClientLinks()
    const observer = new MutationObserver(bindAll)
    const root = document.querySelector<HTMLElement>('.lean-leads') || document.body
    observer.observe(root, { childList: true, subtree: true, characterData: true })

    return () => {
      observer.disconnect()
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
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
      .lean-lead-card [hidden]{display:none!important}
      @media(max-width:720px){
        .lean-lead-card.lead-collapsible>.lean-lead-main{padding:11px 12px;grid-template-columns:minmax(0,1fr) auto}
        .lean-lead-card.lead-collapsible>.lean-lead-main::after{grid-column:2;grid-row:1 / span 2;align-self:center}
      }
    `}</style>
  )
}
