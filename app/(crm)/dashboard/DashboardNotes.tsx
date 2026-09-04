'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type NoteOwner = {
  id: string
  name: string
  is_self: boolean
}

type DashboardNote = {
  id: string
  owner_id: string
  owner_name: string
  title: string
  body: string
  created_at: string
  updated_at: string
  can_edit: boolean
}

function noteDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date)
}

function firstName(value: string) {
  return value.trim().split(/\s+/)[0] || value
}

function newestFirst(notes: DashboardNote[]) {
  return [...notes].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

export default function DashboardNotes() {
  const [tabOpen, setTabOpen] = useState(false)
  const [notes, setNotes] = useState<DashboardNote[]>([])
  const [owners, setOwners] = useState<NoteOwner[]>([])
  const [viewerId, setViewerId] = useState('')
  const [activeOwner, setActiveOwner] = useState('all')
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState('')

  const loadNotes = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/dashboard/notes', { cache: 'no-store' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to load notes.')

      const nextNotes = Array.isArray(result.notes) ? result.notes as DashboardNote[] : []
      const nextOwners = Array.isArray(result.owners) ? result.owners as NoteOwner[] : []
      const nextViewerId = String(result.viewer?.id || '')

      setNotes(newestFirst(nextNotes))
      setOwners(nextOwners)
      setViewerId(nextViewerId)
      setActiveOwner((current) => current === 'all' || nextOwners.some((owner) => owner.id === current) ? current : 'all')
      setLoaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load notes.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tabOpen && !loaded && !loading) void loadNotes()
  }, [tabOpen, loaded, loading, loadNotes])

  const visibleNotes = useMemo(
    () => activeOwner === 'all' ? notes : notes.filter((note) => note.owner_id === activeOwner),
    [activeOwner, notes]
  )

  const ownerCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const note of notes) counts.set(note.owner_id, (counts.get(note.owner_id) || 0) + 1)
    return counts
  }, [notes])

  const sharedNames = owners.filter((owner) => !owner.is_self).map((owner) => firstName(owner.name))
  const selectedOwner = owners.find((owner) => owner.id === activeOwner)

  function newNote() {
    setEditingId(null)
    setTitle('')
    setBody('')
    setError('')
    if (viewerId) setActiveOwner(viewerId)
    setEditorOpen(true)
  }

  function editNote(note: DashboardNote) {
    if (!note.can_edit) return
    setEditingId(note.id)
    setTitle(note.title)
    setBody(note.body)
    setError('')
    setActiveOwner(note.owner_id)
    setEditorOpen(true)
  }

  function closeEditor() {
    if (saving) return
    setEditorOpen(false)
    setEditingId(null)
    setTitle('')
    setBody('')
    setError('')
  }

  async function saveNote() {
    if (saving) return
    if (!title.trim()) return setError('Give the note a name.')
    if (!body.trim()) return setError('Enter a note.')

    setSaving(true)
    setError('')
    try {
      const response = await fetch(editingId ? `/api/dashboard/notes/${editingId}` : '/api/dashboard/notes', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to save note.')

      const saved = result.note as DashboardNote
      setNotes((current) => newestFirst([saved, ...current.filter((note) => note.id !== saved.id)]))
      if (saved.owner_id) setActiveOwner(saved.owner_id)
      setEditorOpen(false)
      setEditingId(null)
      setTitle('')
      setBody('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save note.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteNote(note: DashboardNote) {
    if (!note.can_edit || saving || !window.confirm(`Delete “${note.title}”?`)) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/dashboard/notes/${note.id}`, { method: 'DELETE' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to delete note.')
      setNotes((current) => current.filter((item) => item.id !== note.id))
      if (editingId === note.id) closeEditor()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete note.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="dashboard-notes-shell" data-dashboard-notes-instance="1">
      <button
        type="button"
        className={`dashboard-notes-tab ${tabOpen ? 'open' : ''}`}
        aria-expanded={tabOpen}
        onClick={() => setTabOpen((current) => !current)}
      >
        <span>NOTES</span>
        <span className="dashboard-notes-tab-meta">{loaded ? `${notes.length} visible` : 'Shared access'} <b>{tabOpen ? '−' : '+'}</b></span>
      </button>

      {tabOpen ? (
        <div className="card dashboard-notes-panel">
          <div className="dashboard-notes-head">
            <div>
              <h2>Notes</h2>
              <p className="subtle">
                {sharedNames.length
                  ? `Your notes plus notes shared by ${sharedNames.join(' and ')}. Only the owner can edit or delete a note.`
                  : 'Your dashboard notes, newest first.'}
              </p>
            </div>
            <button type="button" className="btn btn-primary" onClick={newNote} disabled={loading && !loaded}>+ ADD MY NOTE</button>
          </div>

          {error && !editorOpen ? <div className="notice dashboard-notes-error">{error}</div> : null}
          {loading ? <div className="subtle dashboard-notes-loading">Loading notes…</div> : null}

          {loaded && owners.length > 1 ? (
            <div className="dashboard-note-owner-tabs" role="tablist" aria-label="Choose whose notes to view">
              <button type="button" className={activeOwner === 'all' ? 'active' : ''} onClick={() => setActiveOwner('all')}>
                All <span>{notes.length}</span>
              </button>
              {owners.map((owner) => (
                <button
                  type="button"
                  key={owner.id}
                  className={activeOwner === owner.id ? 'active' : ''}
                  onClick={() => setActiveOwner(owner.id)}
                >
                  {owner.is_self ? 'My Notes' : firstName(owner.name)} <span>{ownerCounts.get(owner.id) || 0}</span>
                </button>
              ))}
            </div>
          ) : null}

          {editorOpen ? (
            <div className="dashboard-note-editor">
              <div className="dashboard-note-editor-head">
                <strong>{editingId ? 'Edit My Note' : 'New Note'}</strong>
                <button type="button" className="btn btn-secondary btn-small" onClick={closeEditor} disabled={saving}>Close</button>
              </div>
              {error ? <div className="notice">{error}</div> : null}
              <label className="dashboard-note-field">
                <span>Note Name</span>
                <input
                  value={title}
                  maxLength={180}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Name this note"
                  autoFocus
                />
              </label>
              <label className="dashboard-note-field">
                <span>Note</span>
                <textarea
                  value={body}
                  maxLength={20000}
                  rows={8}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Type your note here…"
                />
              </label>
              <div className="dashboard-note-editor-actions">
                <button type="button" className="btn btn-secondary" onClick={closeEditor} disabled={saving}>CANCEL</button>
                <button type="button" className="btn btn-primary" onClick={() => void saveNote()} disabled={saving}>{saving ? 'Saving…' : 'SAVE NOTE'}</button>
              </div>
            </div>
          ) : null}

          {!loading && loaded ? (
            <div className="dashboard-note-list">
              {!visibleNotes.length ? (
                <div className="card card-pad empty">
                  {activeOwner === 'all' ? 'No notes saved yet.' : `No notes saved for ${selectedOwner?.is_self ? 'you' : selectedOwner?.name || 'this user'} yet.`}
                </div>
              ) : visibleNotes.map((note) => {
                const ownNote = note.owner_id === viewerId
                return (
                  <details className="dashboard-note-card" key={note.id}>
                    <summary className="dashboard-note-summary">
                      <span className="dashboard-note-date">{noteDate(note.created_at)}</span>
                      <span className={`dashboard-note-owner-badge ${ownNote ? 'own' : 'shared'}`}>{ownNote ? 'My Note' : firstName(note.owner_name)}</span>
                      <strong>{note.title}</strong>
                      <span className="dashboard-note-chevron">⌄</span>
                    </summary>
                    <div className="dashboard-note-body">
                      <div className="dashboard-note-name-row"><span>Note Name</span><strong>{note.title}</strong></div>
                      <div className="dashboard-note-owner-row">
                        <span>Owner</span>
                        <strong>{ownNote ? 'You' : note.owner_name}</strong>
                        {!note.can_edit ? <em>Read only</em> : null}
                      </div>
                      <p>{note.body}</p>
                      {note.can_edit ? (
                        <div className="dashboard-note-actions">
                          <button type="button" className="btn btn-primary btn-small" onClick={() => editNote(note)}>EDIT</button>
                          <button type="button" className="btn btn-secondary btn-small dashboard-note-delete" disabled={saving} onClick={() => void deleteNote(note)}>DELETE</button>
                        </div>
                      ) : null}
                    </div>
                  </details>
                )
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      <style>{`
        .dashboard-notes-shell{margin-top:12px}
        .dashboard-notes-tab{width:100%;min-height:50px;border:1px solid #cbd5e1;border-radius:13px;background:#18324a;color:#fff;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;font-weight:900;letter-spacing:.025em;text-align:left;box-shadow:0 2px 8px rgba(15,23,42,.08)}
        .dashboard-notes-tab.open{border-radius:13px 13px 0 0}
        .dashboard-notes-tab-meta{display:flex;align-items:center;gap:10px;font-size:.76rem;letter-spacing:0;color:#dbe7f1}
        .dashboard-notes-tab-meta b{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,.16);font-size:1.1rem}
        .dashboard-notes-panel{border-radius:0 0 15px 15px;padding:16px;border-top:0;overflow:hidden}
        .dashboard-notes-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
        .dashboard-notes-head h2{margin:0}.dashboard-notes-head p{margin:4px 0 0;max-width:720px}
        .dashboard-notes-error,.dashboard-notes-loading{margin-bottom:12px}
        .dashboard-note-owner-tabs{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:0 0 14px;padding-bottom:12px;border-bottom:1px solid #e2e8f0}
        .dashboard-note-owner-tabs button{border:1px solid #d4dde3;border-radius:999px;background:#f7f9fa;color:#536572;padding:7px 11px;font:inherit;font-size:.76rem;font-weight:900;cursor:pointer}
        .dashboard-note-owner-tabs button span{display:inline-grid;place-items:center;min-width:20px;height:20px;margin-left:5px;padding:0 5px;border-radius:999px;background:#e6ebee;font-size:.68rem}
        .dashboard-note-owner-tabs button.active{background:#dfe8ed;border-color:#aabac5;color:#304b5c}
        .dashboard-note-owner-tabs button.active span{background:#fff}
        .dashboard-note-editor{display:grid;gap:12px;border:1px solid #cbd5e1;background:#f8fafc;border-radius:13px;padding:14px;margin-bottom:14px}
        .dashboard-note-editor-head{display:flex;justify-content:space-between;align-items:center;gap:10px}.dashboard-note-editor-head strong{font-size:1.05rem}
        .dashboard-note-field{display:grid;gap:6px;font-size:.84rem;font-weight:900;color:#334155}
        .dashboard-note-field input,.dashboard-note-field textarea{width:100%;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#172033;padding:11px 12px;font:inherit}
        .dashboard-note-field textarea{resize:vertical;min-height:150px;line-height:1.45}
        .dashboard-note-editor-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
        .dashboard-note-list{display:grid;gap:8px}
        .dashboard-note-card{border:1px solid #dce4ea;border-radius:12px;background:#fff;overflow:hidden}
        .dashboard-note-summary{list-style:none;cursor:pointer;display:grid;grid-template-columns:auto auto minmax(0,1fr) auto;align-items:center;gap:9px;padding:13px 14px}
        .dashboard-note-summary::-webkit-details-marker{display:none}
        .dashboard-note-date{font-size:.78rem;font-weight:900;color:#64748b;white-space:nowrap}
        .dashboard-note-owner-badge{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;font-size:.68rem;font-weight:900;white-space:nowrap}
        .dashboard-note-owner-badge.own{background:#e3ebef;color:#395466}.dashboard-note-owner-badge.shared{background:#eee8de;color:#675847}
        .dashboard-note-summary strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#172033}
        .dashboard-note-chevron{font-size:1.1rem;color:#64748b;transition:transform .15s ease}.dashboard-note-card[open] .dashboard-note-chevron{transform:rotate(180deg)}
        .dashboard-note-card[open] .dashboard-note-summary{background:#f8fafc;border-bottom:1px solid #e5eaf0}
        .dashboard-note-body{display:grid;gap:12px;padding:14px}
        .dashboard-note-name-row,.dashboard-note-owner-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .dashboard-note-name-row span,.dashboard-note-owner-row span{font-size:.7rem;font-weight:900;text-transform:uppercase;color:#64748b}
        .dashboard-note-name-row strong,.dashboard-note-owner-row strong{color:#172033}
        .dashboard-note-owner-row em{border-radius:999px;background:#f1f3f4;color:#687782;padding:3px 7px;font-size:.68rem;font-style:normal;font-weight:900}
        .dashboard-note-body p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55;color:#334155}
        .dashboard-note-actions{display:flex;justify-content:flex-end;gap:7px;flex-wrap:wrap}.dashboard-note-delete{border-color:#e4c7c7!important;color:#9b4f4f!important}
        @media(max-width:720px){.dashboard-notes-tab{padding:11px 12px}.dashboard-notes-panel{padding:12px}.dashboard-notes-head{align-items:flex-start}.dashboard-notes-head .btn{flex:none}.dashboard-note-summary{grid-template-columns:auto auto minmax(0,1fr) auto;padding:12px 10px;gap:6px}.dashboard-note-date{font-size:.69rem}.dashboard-note-owner-badge{font-size:.62rem;padding:3px 6px}.dashboard-note-summary strong{font-size:.88rem}.dashboard-note-editor-actions .btn,.dashboard-note-actions .btn{flex:1}}
        @media(max-width:430px){.dashboard-note-summary{grid-template-columns:auto minmax(0,1fr) auto}.dashboard-note-owner-badge{display:none}.dashboard-notes-head{display:grid}.dashboard-notes-head .btn{width:100%}}
      `}</style>
    </section>
  )
}
