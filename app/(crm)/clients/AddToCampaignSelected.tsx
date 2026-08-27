'use client'

import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'

type Campaign = {
  id: string
  name: string
  topic: string
  status: string
}

export default function AddToCampaignSelected({ selectedClientIds }: { selectedClientIds: string[] }) {
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaignId, setCampaignId] = useState('')
  const [createNew, setCreateNew] = useState(false)
  const [name, setName] = useState('')
  const [topic, setTopic] = useState('general')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch('/api/outreach-campaigns', { cache: 'no-store' })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'Unable to load campaigns.')
        if (cancelled) return
        const next = Array.isArray(data.campaigns) ? data.campaigns : []
        setCampaigns(next)
        setCampaignId((current) => current || next[0]?.id || '')
        if (!next.length) setCreateNew(true)
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : 'Unable to load campaigns.')
      }
    })()
    return () => { cancelled = true }
  }, [open])

  useEffect(() => {
    if (!open || !mounted) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, mounted, busy])

  async function submit() {
    if (!selectedClientIds.length || busy) return
    if (createNew && name.trim().length < 2) return setMessage('Enter a campaign name.')
    if (!createNew && !campaignId) return setMessage('Choose a campaign.')

    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/outreach-campaigns/agent-scoped', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createNew
          ? { action: 'create_and_add', name: name.trim(), topic, client_ids: selectedClientIds }
          : { action: 'add_members', campaign_id: campaignId, client_ids: selectedClientIds })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to add clients to campaign.')

      const added = Number(data.added || data.added_count || 0)
      const existing = Number(data.existing || 0)
      const unavailable = Number(data.unavailable || 0)
      setMessage(`${added} client${added === 1 ? '' : 's'} added${existing ? ` · ${existing} already in campaign` : ''}${unavailable ? ` · ${unavailable} belong to another agent` : ''}.`)
      setOpen(false)
      setName('')
      setCreateNew(false)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to add clients to campaign.')
    } finally {
      setBusy(false)
    }
  }

  const modal = open && mounted ? createPortal(
    <div
      className="campaign-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false) }}
    >
      <div className="campaign-modal" role="dialog" aria-modal="true" aria-label="Add selected clients to outreach campaign">
        <div className="campaign-modal-heading">
          <div><strong>Add to Outreach Campaign</strong><span>{selectedClientIds.length} selected client{selectedClientIds.length === 1 ? '' : 's'}</span></div>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setOpen(false)}>Close</button>
        </div>

        <div className="campaign-mode-row">
          <label><input type="radio" checked={!createNew} onChange={() => setCreateNew(false)} disabled={!campaigns.length} /> Existing campaign</label>
          <label><input type="radio" checked={createNew} onChange={() => setCreateNew(true)} /> New campaign</label>
        </div>

        {!createNew ? (
          <label className="label">Campaign
            <select className="select" value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
              {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
            </select>
          </label>
        ) : (
          <div className="form-grid">
            <label className="label">Campaign name<input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Example: 2026 Medicare Client Review" autoFocus /></label>
            <label className="label">Topic
              <select className="select" value={topic} onChange={(event) => setTopic(event.target.value)}>
                <option value="medicare">Medicare</option>
                <option value="life">Life</option>
                <option value="health">Health</option>
                <option value="retirement">Retirement</option>
                <option value="general">General client review</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>
        )}

        {message ? <div className="notice" style={{ marginTop: 12 }}>{message}</div> : null}
        <div className="campaign-modal-actions">
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void submit()}>{busy ? 'Saving…' : 'ADD CLIENTS'}</button>
        </div>
      </div>
      <style jsx global>{`
        .campaign-modal-backdrop{position:fixed;inset:0;z-index:1000;background:rgba(15,23,42,.42);display:flex;align-items:center;justify-content:center;padding:18px;overflow-y:auto}
        .campaign-modal{position:relative;z-index:1;width:min(620px,100%);max-height:calc(100vh - 36px);overflow-y:auto;background:#fff;border-radius:16px;border:1px solid #dbe3ea;padding:18px;box-shadow:0 20px 60px rgba(15,23,42,.24)}
        .campaign-modal-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px}.campaign-modal-heading strong{display:block;font-size:1.05rem}.campaign-modal-heading span{display:block;color:#64748b;font-size:.82rem;margin-top:3px}
        .campaign-mode-row{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:14px}.campaign-mode-row label{display:flex;align-items:center;gap:7px;font-weight:800;font-size:.86rem}
        .campaign-modal-actions{display:flex;justify-content:flex-end;margin-top:16px}
        @media(max-width:640px){.campaign-modal-backdrop{padding:10px;align-items:flex-start}.campaign-modal{max-height:calc(100vh - 20px);padding:14px;margin:auto 0}.campaign-modal-heading{align-items:center}.campaign-modal-actions .btn{width:100%}.campaign-mode-row{display:grid;gap:10px}}
      `}</style>
    </div>,
    document.body
  ) : null

  return (
    <>
      <button
        className="btn btn-secondary"
        type="button"
        disabled={!selectedClientIds.length}
        onClick={() => { setMessage(''); setOpen(true) }}
      >
        ADD TO CAMPAIGN{selectedClientIds.length ? ` (${selectedClientIds.length})` : ''}
      </button>
      {message ? <span className="subtle" style={{ fontWeight: 700 }}>{message}</span> : null}
      {modal}
    </>
  )
}
