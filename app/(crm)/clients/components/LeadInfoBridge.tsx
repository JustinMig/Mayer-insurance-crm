'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'

type LeadInfo = {
  id: string
  assigned_agent_id: string | null
  agent_name: string
  first_name: string | null
  last_name: string | null
  date_of_birth: string | null
  phone: string | null
  product_type: string | null
  is_medicare: boolean | null
  is_life: boolean | null
  is_retirement: boolean | null
  notes: string | null
  status: string | null
  photo_file_name: string | null
  photo_mime_type: string | null
  photo_uploaded_at: string | null
  created_at: string | null
  converted_at: string | null
  has_file: boolean
  file_url: string | null
}

function formatDate(value: string | null, includeTime = false) {
  if (!value) return '—'
  const date = new Date(value.includes('T') ? value : `${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', includeTime
    ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric' }
  ).format(date)
}

function products(lead: LeadInfo) {
  const list: string[] = []
  if (lead.is_life || lead.product_type === 'life') list.push('Life Insurance')
  if (lead.is_medicare || lead.product_type === 'medicare') list.push('Medicare')
  if (lead.is_retirement || lead.product_type === 'retirement') list.push('Retirement')
  return Array.from(new Set(list))
}

export default function LeadInfoBridge() {
  const pathname = usePathname()
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [lead, setLead] = useState<LeadInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const clientId = useMemo(() => {
    const match = pathname.match(/^\/clients\/([^/]+)$/)
    return match?.[1] || ''
  }, [pathname])
  const isNewClient = pathname === '/clients/new'
  const shouldShow = isNewClient || Boolean(clientId)

  useEffect(() => {
    if (!shouldShow) {
      setHost(null)
      return
    }

    let disposed = false
    let observer: MutationObserver | null = null
    let createdHost: HTMLElement | null = null

    const attach = () => {
      const section = document.querySelector<HTMLElement>('form.add-client-form > details.section-client, form.client-profile-form > details.section-client')
      if (!section || !section.parentElement) return false

      let target = section.parentElement.querySelector<HTMLElement>(':scope > .lead-info-bridge-host')
      if (!target) {
        target = document.createElement('div')
        target.className = 'lead-info-bridge-host'
        section.insertAdjacentElement('afterend', target)
        createdHost = target
      }
      if (!disposed) setHost(target)
      return true
    }

    if (!attach()) {
      observer = new MutationObserver(() => {
        if (attach()) observer?.disconnect()
      })
      observer.observe(document.body, { childList: true, subtree: true })
    }

    return () => {
      disposed = true
      observer?.disconnect()
      setHost(null)
      if (createdHost?.isConnected) createdHost.remove()
    }
  }, [pathname, shouldShow])

  useEffect(() => {
    if (!clientId) {
      setLead(null)
      setError('')
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')
    fetch(`/api/clients/${encodeURIComponent(clientId)}/lead-info`, { cache: 'no-store' })
      .then(async response => {
        const result = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(result.error || 'Unable to load lead information.')
        if (!cancelled) setLead(result.lead || null)
      })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load lead information.') })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [clientId])

  useEffect(() => {
    if (!pathname.startsWith('/leads') && !pathname.startsWith('/workspace')) return

    const helpText = 'Take a picture, choose an image, or upload a PDF. JPG, PNG, HEIC, HEIF, or PDF up to 10 MB.'
    const accepted = 'image/*,.jpg,.jpeg,.png,.heic,.heif,.pdf,application/pdf'

    const adaptLeadFileUi = () => {
      document.querySelectorAll<HTMLElement>('.workspace-photo-box').forEach(box => {
        const heading = box.querySelector('strong')
        const help = box.querySelector('p.subtle')
        const input = box.querySelector<HTMLInputElement>('input[type="file"]')
        const uploadLabel = box.querySelector<HTMLLabelElement>('label[for="workspace-lead-photo-input"]')
        if (heading && heading.textContent !== 'Lead file') heading.textContent = 'Lead file'
        if (help && help.textContent !== helpText) help.textContent = helpText
        if (input) {
          if (input.accept !== accepted) input.accept = accepted
          if (input.hasAttribute('capture')) input.removeAttribute('capture')
        }
        if (uploadLabel && uploadLabel.textContent !== '📎 TAKE PHOTO / UPLOAD FILE') uploadLabel.textContent = '📎 TAKE PHOTO / UPLOAD FILE'
        box.querySelectorAll<HTMLElement>('a,button').forEach(item => {
          const text = item.textContent || ''
          if (text.includes('VIEW CURRENT PHOTO')) item.textContent = 'VIEW CURRENT FILE'
          if (text.includes('REMOVE PHOTO')) item.textContent = 'REMOVE FILE'
        })
      })

      document.querySelectorAll<HTMLElement>('.workspace-photo-link').forEach(link => {
        if ((link.textContent || '').includes('PHOTO')) link.textContent = 'VIEW LEAD FILE'
      })

      document.querySelectorAll<HTMLButtonElement>('.workspace-modal-actions .btn-primary').forEach(button => {
        if (button.textContent === 'SAVE LEAD + PHOTO') button.textContent = 'SAVE LEAD + FILE'
      })
    }

    adaptLeadFileUi()
    const observer = new MutationObserver(adaptLeadFileUi)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [pathname])

  if (!host) return null

  const content = (
    <details className="section-details section-lead-info">
      <summary><span>Lead Info</span><small>Original lead details, notes &amp; file</small></summary>
      <div className="section-body intake-section-body">
        {isNewClient ? (
          <div className="intake-group">
            <div className="intake-group-heading"><div><strong>Lead Information</strong><span>Lead history is preserved automatically.</span></div></div>
            <p className="subtle" style={{ margin: 0, lineHeight: 1.55 }}>
              If this client comes from the Leads screen, the original lead information and uploaded lead file will appear here automatically after you save the lead to Client Records. The client name, date of birth, phone number, and selected products are also copied into Client Information.
            </p>
          </div>
        ) : loading ? (
          <div className="intake-group"><p className="subtle" style={{ margin: 0 }}>Loading lead information…</p></div>
        ) : error ? (
          <div className="notice">{error}</div>
        ) : !lead ? (
          <div className="intake-group"><p className="subtle" style={{ margin: 0 }}>No linked lead information. This client was created directly in Client Records.</p></div>
        ) : (
          <>
            <div className="intake-group">
              <div className="intake-group-heading"><div><strong>Original Lead</strong><span>Snapshot of what was saved in Leads.</span></div></div>
              <div className="form-grid lead-info-grid">
                <div className="label">Lead name<div className="input input-readonly">{[lead.first_name, lead.last_name].filter(Boolean).join(' ') || '—'}</div></div>
                <div className="label">Assigned agent<div className="input input-readonly">{lead.agent_name || '—'}</div></div>
                <div className="label">Date added<div className="input input-readonly">{formatDate(lead.created_at, true)}</div></div>
                <div className="label">Converted to client<div className="input input-readonly">{formatDate(lead.converted_at, true)}</div></div>
                <div className="label">Date of birth<div className="input input-readonly">{formatDate(lead.date_of_birth)}</div></div>
                <div className="label">Phone<div className="input input-readonly">{lead.phone || '—'}</div></div>
                <div className="label span-2">Interested in<div className="input input-readonly">{products(lead).join(' · ') || '—'}</div></div>
              </div>
            </div>

            <div className="intake-group">
              <div className="intake-group-heading"><div><strong>Lead Notes</strong><span>Original notes saved on the lead.</span></div></div>
              <div className="lead-info-notes">{lead.notes || 'No lead notes were entered.'}</div>
            </div>

            <div className="intake-group intake-group-files">
              <div className="intake-group-heading"><div><strong>Lead File</strong><span>Original image or PDF saved with the lead.</span></div></div>
              {lead.has_file && lead.file_url ? (
                <div className="lead-info-file-row">
                  <div><strong>{lead.photo_file_name || 'Lead file'}</strong><span>{lead.photo_mime_type === 'application/pdf' ? 'PDF document' : (lead.photo_mime_type || 'Lead attachment')}</span></div>
                  <a className="btn btn-secondary" href={lead.file_url} target="_blank" rel="noreferrer">OPEN LEAD FILE</a>
                </div>
              ) : <p className="subtle" style={{ margin: 0 }}>No file was attached to this lead.</p>}
            </div>
          </>
        )}
      </div>
      <style>{`
        .section-lead-info{border-left:4px solid #475569}
        .section-lead-info>summary{background:#f8fafc}
        .lead-info-notes{white-space:pre-wrap;line-height:1.55;border:1px solid #dbe3ec;border-radius:10px;padding:12px;background:#fff;color:#172033;min-height:46px}
        .lead-info-file-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;border:1px solid #dbe3ec;border-radius:10px;padding:12px;background:#fff}
        .lead-info-file-row>div{display:grid;gap:3px;min-width:0}.lead-info-file-row>div span{color:#64748b;font-size:.82rem}.lead-info-file-row>div strong{overflow-wrap:anywhere}
        @media(max-width:720px){.lead-info-file-row .btn{width:100%}}
      `}</style>
    </details>
  )

  return createPortal(content, host)
}
