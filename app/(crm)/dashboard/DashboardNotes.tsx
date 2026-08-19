'use client'

import { useCallback, useEffect, useState } from 'react'

type DashboardNote = {
  id: string
  title: string
  body: string
  created_at: string
  updated_at: string
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

export default function DashboardNotes() {
  const [tabOpen, setTabOpen] = useState(false)
  const [notes, setNotes] = useState<DashboardNote[]>([])
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
      setNotes(Array.isArray(result.notes) ? result.notes : [])
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

  function newNote() {
    setEditingId(null)
    setTitle('')
    setBody('')
    setError('')
    setEditorOpen(true)
  }

  function editNote(note: DashboardNote) {
    setEditingId(note.id)
    setTitle(note.title)
    setBody(note.body)
    setError('')
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
      setNotes((current) => {
        const withoutSaved = current.filter((note) => note.id !== saved.id)
        return [saved, ...withoutSaved].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      })
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
    if (saving || !window.confirm(`Delete “${note.title}”?`)) return
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
    <section className="dashboard-notes-shell">
      <button
        type="button"
        className={`dashboard-notes-tab ${tabOpen ? 'open' : ''}`}
        aria-expanded={tabOpen}
        onClick={() => setTabOpen((current) => !current)}
      >
        <span>NOTES</span>
        <span className="dashboard-notes-tab-meta">{loaded ? `${notes.length} saved` : 'Private'} <b>{tabOpen ? '−' : '+'}</b></span>
      </button>

      {tabOpen ? (
        <div className="card dashboard-notes-panel">
          <div className="dashboard-notes-head">
            <div>
              <h2>Notes</h2>
              <p className="subtle">Private dashboard notes, newest first.</p>
            </div>
            <button type="button" className="btn btn-primary" onClick={newNote}>+ ADD NOTE</button>
          </div>

          {error && !editorOpen ? <div className="notice dashboard-notes-error">{error}</div> : null}
          {loading ? <div className="subtle dashboard-notes-loading">Loading notes…</div> : null}

          {editorOpen ? (
            <div className="dashboard-note-editor">
              <div className="dashboard-note-editor-head">
                <strong>{editingId ? 'Edit Note' : 'New Note'}</strong>
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
              {!notes.length ? <div className="card card-pad empty">No notes saved yet.</div> : notes.map((note) => (
                <details className="dashboard-note-card" key={note.id}>
                  <summary className="dashboard-note-summary">
                    <span className="dashboard-note-date">{noteDate(note.created_at)}</span>
                    <strong>{note.title}</strong>
                    <span className="dashboard-note-chevron">⌄</span>
                  </summary>
                  <div className="dashboard-note-body">
                    <div className="dashboard-note-name-row"><span>Note Name</span><strong>{note.title}</strong></div>
                    <p>{note.body}</p>
                    <div className="dashboard-note-actions">
                      <button type="button" className="btn btn-primary btn-small" onClick={() => editNote(note)}>EDIT</button>
                      <button type="button" className="btn btn-secondary btn-small dashboard-note-delete" disabled={saving} onClick={() => void deleteNote(note)}>DELETE</button>
                    </div>
                  </div>
                </details>
              ))}
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
        .dashboard-notes-head h2{margin:0}.dashboard-notes-head p{margin:4px 0 0}
        .dashboard-notes-error,.dashboard-notes-loading{margin-bottom:12px}
        .dashboard-note-editor{display:grid;gap:12px;border:1px solid #cbd5e1;background:#f8fafc;border-radius:13px;padding:14px;margin-bottom:14px}
        .dashboard-note-editor-head{display:flex;justify-content:space-between;align-items:center;gap:10px}.dashboard-note-editor-head strong{font-size:1.05rem}
        .dashboard-note-field{display:grid;gap:6px;font-size:.84rem;font-weight:900;color:#334155}
        .dashboard-note-field input,.dashboard-note-field textarea{width:100%;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#172033;padding:11px 12px;font:inherit}
        .dashboard-note-field textarea{resize:vertical;min-height:150px;line-height:1.45}
        .dashboard-note-editor-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
        .dashboard-note-list{display:grid;gap:8px}
        .dashboard-note-card{border:1px solid #dce4ea;border-radius:12px;background:#fff;overflow:hidden}
        .dashboard-note-summary{list-style:none;cursor:pointer;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:13px 14px}
        .dashboard-note-summary::-webkit-details-marker{display:none}
        .dashboard-note-date{font-size:.78rem;font-weight:900;color:#64748b;white-space:nowrap}
        .dashboard-note-summary strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#172033}
        .dashboard-note-chevron{font-size:1.1rem;color:#64748b;transition:transform .15s ease}.dashboard-note-card[open] .dashboard-note-chevron{transform:rotate(180deg)}
        .dashboard-note-card[open] .dashboard-note-summary{background:#f8fafc;border-bottom:1px solid #e5eaf0}
        .dashboard-note-body{display:grid;gap:12px;padding:14px}
        .dashboard-note-name-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.dashboard-note-name-row span{font-size:.7rem;font-weight:900;text-transform:uppercase;color:#64748b}.dashboard-note-name-row strong{color:#172033}
        .dashboard-note-body p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55;color:#334155}
        .dashboard-note-actions{display:flex;justify-content:flex-end;gap:7px;flex-wrap:wrap}.dashboard-note-delete{border-color:#fecaca!important;color:#b91c1c!important}
        @media(max-width:720px){.dashboard-notes-tab{padding:11px 12px}.dashboard-notes-panel{padding:12px}.dashboard-notes-head{align-items:flex-start}.dashboard-notes-head .btn{flex:none}.dashboard-note-summary{grid-template-columns:auto minmax(0,1fr) auto;padding:12px 10px;gap:7px}.dashboard-note-date{font-size:.7rem}.dashboard-note-summary strong{font-size:.9rem}.dashboard-note-editor-actions .btn,.dashboard-note-actions .btn{flex:1}}
      `}</style>
    </section>
  )
}
