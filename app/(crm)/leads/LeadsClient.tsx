'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

type Agent = { id: string; full_name: string }
type Lead = {
  id: string
  assigned_agent_id: string
  first_name: string
  last_name: string
  date_of_birth: string | null
  phone: string | null
  product_type: 'medicare' | 'life' | 'retirement'
  is_medicare: boolean
  is_life: boolean
  is_retirement: boolean
  notes: string | null
  status: 'lead' | 'converted'
  client_id: string | null
  existing_client_id?: string | null
  photo_storage_path: string | null
  photo_file_name: string | null
  photo_mime_type: string | null
  photo_uploaded_at: string | null
  created_at: string
  updated_at: string
}
type Draft = {
  id?: string
  assigned_agent_id: string
  first_name: string
  last_name: string
  date_of_birth: string
  phone: string
  is_medicare: boolean
  is_life: boolean
  is_retirement: boolean
  notes: string
}

function blankDraft(owner: string): Draft {
  return { assigned_agent_id: owner, first_name: '', last_name: '', date_of_birth: '', phone: '', is_medicare: false, is_life: false, is_retirement: false, notes: '' }
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
}

function formatDate(value: string | null) {
  if (!value) return ''
  const [year, month, day] = value.split('-')
  return year && month && day ? `${month}/${day}/${year}` : value
}

function productLabels(lead: Lead) {
  const values: string[] = []
  if (lead.is_medicare) values.push('Medicare')
  if (lead.is_life) values.push('Life')
  if (lead.is_retirement) values.push('Retirement')
  return values.length ? values : [lead.product_type]
}

export default function LeadsClient({ viewerId, isManager, agents }: { viewerId: string; isManager: boolean; agents: Agent[] }) {
  const searchParams = useSearchParams()
  const defaultOwner = isManager ? agents[0]?.id || '' : viewerId
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [ownerFilter, setOwnerFilter] = useState(isManager ? 'all' : viewerId)
  const [editorOpen, setEditorOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => blankDraft(defaultOwner))
  const [file, setFile] = useState<File | null>(null)
  const [fileKey, setFileKey] = useState(0)
  const autoOpened = useRef(false)

  async function loadLeads() {
    setLoading(true)
    try {
      const response = await fetch('/api/workspace/leads', { cache: 'no-store' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to load leads.')
      setLeads(Array.isArray(result.leads) ? result.leads : [])
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load leads.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadLeads() }, [])

  useEffect(() => {
    if (autoOpened.current || searchParams.get('new') !== '1') return
    autoOpened.current = true
    setDraft(blankDraft(defaultOwner))
    setEditorOpen(true)
  }, [searchParams, defaultOwner])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return leads
      .filter((lead) => lead.status === 'lead')
      .filter((lead) => !isManager || ownerFilter === 'all' || lead.assigned_agent_id === ownerFilter)
      .filter((lead) => !q || `${lead.first_name} ${lead.last_name} ${lead.phone || ''} ${lead.notes || ''}`.toLowerCase().includes(q))
  }, [leads, isManager, ownerFilter, search])

  function newLead() {
    const owner = isManager && ownerFilter !== 'all' ? ownerFilter : defaultOwner
    setDraft(blankDraft(owner))
    setFile(null)
    setFileKey((value) => value + 1)
    setError('')
    setEditorOpen(true)
  }

  function editLead(lead: Lead) {
    setDraft({
      id: lead.id,
      assigned_agent_id: lead.assigned_agent_id,
      first_name: lead.first_name,
      last_name: lead.last_name,
      date_of_birth: lead.date_of_birth || '',
      phone: lead.phone || '',
      is_medicare: Boolean(lead.is_medicare),
      is_life: Boolean(lead.is_life),
      is_retirement: Boolean(lead.is_retirement),
      notes: lead.notes || ''
    })
    setFile(null)
    setFileKey((value) => value + 1)
    setError('')
    setEditorOpen(true)
  }

  async function uploadFile(leadId: string, selected: File) {
    const bytes = await selected.arrayBuffer()
    const params = new URLSearchParams({ file_name: selected.name || 'lead-file' })
    const response = await fetch(`/api/workspace/leads/${encodeURIComponent(leadId)}/photo?${params.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': selected.type || 'application/octet-stream' },
      body: bytes
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || 'Unable to upload lead file.')
  }

  async function saveLead() {
    if (busy) return
    if (!draft.first_name.trim() || !draft.last_name.trim()) return setError('First and last name are required.')
    if (!draft.is_medicare && !draft.is_life && !draft.is_retirement) return setError('Choose at least one product.')
    setBusy(true)
    setError('')
    try {
      const response = await fetch(draft.id ? `/api/workspace/leads/${draft.id}` : '/api/workspace/leads', {
        method: draft.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft)
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to save lead.')
      const saved = result.lead as Lead
      if (file) await uploadFile(saved.id, file)
      setEditorOpen(false)
      setFile(null)
      await loadLeads()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save lead.')
    } finally {
      setBusy(false)
    }
  }

  async function deleteLead(lead: Lead) {
    if (busy || !window.confirm(`Delete lead ${lead.first_name} ${lead.last_name}?`)) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/workspace/leads/${lead.id}`, { method: 'DELETE' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to delete lead.')
      setLeads((current) => current.filter((item) => item.id !== lead.id))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete lead.')
    } finally {
      setBusy(false)
    }
  }

  async function convertLead(lead: Lead) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/workspace/leads/${lead.id}/convert`, { method: 'POST' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to convert lead.')
      if (result.client_id) window.location.href = `/clients/${result.client_id}`
      else await loadLeads()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to convert lead.')
      setBusy(false)
    }
  }

  return (
    <section className="lean-leads">
      <div className="lean-leads-head">
        <div><h1>LEADS</h1><p className="subtle">Fast lead entry, editing and conversion without loading calendar tools.</p></div>
        <button type="button" className="btn btn-primary" onClick={newLead}>+ NEW LEAD</button>
      </div>

      <div className="lean-leads-toolbar">
        <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search lead name, phone or notes" />
        {isManager ? (
          <select className="select" value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
            <option value="all">All agents</option>
            {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}
          </select>
        ) : null}
      </div>

      {error && !editorOpen ? <div className="notice notice-error">{error}</div> : null}
      {loading ? <div className="card card-pad empty">Loading leads…</div> : (
        <div className="lean-leads-list">
          {!visible.length ? <div className="card card-pad empty">No active leads match this view.</div> : visible.map((lead) => {
            const owner = agents.find((agent) => agent.id === lead.assigned_agent_id)?.full_name || 'Agent'
            const existingClientId = lead.existing_client_id || lead.client_id || null
            return (
              <article className="card lean-lead-card" key={lead.id}>
                <div className="lean-lead-main">
                  <div><strong>{lead.first_name} {lead.last_name}</strong><span>{lead.phone || 'No phone'}{lead.date_of_birth ? ` · DOB ${formatDate(lead.date_of_birth)}` : ''}</span></div>
                  <div className="lean-lead-tags">{productLabels(lead).map((product) => <span key={product}>{product}</span>)}</div>
                </div>
                {isManager ? <div className="lean-lead-owner">Assigned: {owner}</div> : null}
                {lead.notes ? <p>{lead.notes}</p> : null}
                <div className="lean-lead-actions">
                  <button type="button" className="btn btn-secondary btn-small" onClick={() => editLead(lead)}>EDIT</button>
                  {existingClientId ? (
                    <Link prefetch={false} className="btn btn-primary btn-small" href={`/clients/${existingClientId}`}>OPEN CLIENT FILE</Link>
                  ) : (
                    <button type="button" className="btn btn-primary btn-small" disabled={busy} onClick={() => void convertLead(lead)}>CONVERT TO CLIENT</button>
                  )}
                  <button type="button" className="btn btn-secondary btn-small lean-delete" disabled={busy} onClick={() => void deleteLead(lead)}>DELETE</button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {editorOpen ? (
        <div className="lean-leads-backdrop" role="dialog" aria-modal="true" aria-label={draft.id ? 'Edit lead' : 'New lead'}>
          <div className="card lean-leads-editor">
            <div className="lean-editor-head"><h2>{draft.id ? 'Edit Lead' : 'New Lead'}</h2><button type="button" className="btn btn-secondary btn-small" onClick={() => setEditorOpen(false)} disabled={busy}>CLOSE</button></div>
            {error ? <div className="notice notice-error">{error}</div> : null}
            <div className="form-grid">
              <label className="label">First name<input className="input" value={draft.first_name} onChange={(event) => setDraft((current) => ({ ...current, first_name: event.target.value }))} autoFocus /></label>
              <label className="label">Last name<input className="input" value={draft.last_name} onChange={(event) => setDraft((current) => ({ ...current, last_name: event.target.value }))} /></label>
              <label className="label">Date of birth<input className="input" type="date" value={draft.date_of_birth} onChange={(event) => setDraft((current) => ({ ...current, date_of_birth: event.target.value }))} /></label>
              <label className="label">Phone<input className="input" inputMode="tel" value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: normalizePhone(event.target.value) }))} placeholder="662-555-1234" /></label>
              {isManager ? <label className="label">Assigned agent<select className="select" value={draft.assigned_agent_id} onChange={(event) => setDraft((current) => ({ ...current, assigned_agent_id: event.target.value }))}>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}</select></label> : null}
            </div>
            <div className="lean-products">
              <label><input type="checkbox" checked={draft.is_medicare} onChange={(event) => setDraft((current) => ({ ...current, is_medicare: event.target.checked }))} /> Medicare</label>
              <label><input type="checkbox" checked={draft.is_life} onChange={(event) => setDraft((current) => ({ ...current, is_life: event.target.checked }))} /> Life Insurance</label>
              <label><input type="checkbox" checked={draft.is_retirement} onChange={(event) => setDraft((current) => ({ ...current, is_retirement: event.target.checked }))} /> Retirement</label>
            </div>
            <label className="label">Notes<textarea className="textarea" rows={5} value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} /></label>
            <label className="label">Lead file / PDF<input key={fileKey} className="input" type="file" accept="image/jpeg,image/png,image/heic,image/heif,application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} /><span className="field-help">JPG, PNG, HEIC/HEIF or PDF · up to 10 MB.</span></label>
            <div className="lean-editor-actions"><button type="button" className="btn btn-secondary" onClick={() => setEditorOpen(false)} disabled={busy}>CANCEL</button><button type="button" className="btn btn-primary" onClick={() => void saveLead()} disabled={busy}>{busy ? 'Saving…' : 'SAVE LEAD'}</button></div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .lean-leads{display:grid;gap:14px}.lean-leads-head{display:flex;align-items:end;justify-content:space-between;gap:12px;flex-wrap:wrap}.lean-leads-head h1{margin:0}.lean-leads-head p{margin:4px 0 0}.lean-leads-toolbar{display:grid;grid-template-columns:minmax(0,1fr) minmax(180px,260px);gap:10px}.lean-leads-list{display:grid;gap:9px}.lean-lead-card{padding:13px;display:grid;gap:9px}.lean-lead-main{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.lean-lead-main strong{display:block;font-size:1rem;color:#253746}.lean-lead-main span,.lean-lead-owner{font-size:.76rem;color:#667788}.lean-lead-tags{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}.lean-lead-tags span{padding:4px 7px;border-radius:999px;background:#eef3f5;border:1px solid #d8e1e5;font-size:.68rem;font-weight:850;color:#48606c}.lean-lead-card p{margin:0;white-space:pre-wrap;color:#465766;font-size:.83rem}.lean-lead-actions{display:flex;gap:7px;flex-wrap:wrap}.lean-delete{color:#a23d3d!important;border-color:#e5bdbd!important}.lean-leads-backdrop{position:fixed;inset:0;z-index:1000;background:rgba(21,31,40,.38);display:grid;place-items:center;padding:18px;overflow:auto}.lean-leads-editor{width:min(760px,100%);max-height:calc(100vh - 36px);overflow:auto;padding:16px;display:grid;gap:13px}.lean-editor-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.lean-editor-head h2{margin:0}.lean-products{display:flex;gap:8px;flex-wrap:wrap}.lean-products label{display:flex;align-items:center;gap:6px;padding:9px 10px;border:1px solid #d7e0e5;border-radius:10px;background:#f8fafb;font-weight:800;font-size:.8rem}.lean-editor-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}@media(max-width:720px){.lean-leads-toolbar{grid-template-columns:1fr}.lean-lead-main{display:grid}.lean-lead-tags{justify-content:flex-start}.lean-lead-actions .btn{flex:1 1 42%}.lean-leads-backdrop{padding:8px}.lean-leads-editor{max-height:calc(100vh - 16px);padding:12px}.lean-editor-actions .btn{flex:1}}
      `}</style>
    </section>
  )
}
