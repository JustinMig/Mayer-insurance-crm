'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import ClientExportControls from './ClientExportControls'

type ClientRow = {
  id: string
  assigned_agent_id: string | null
  first_name: string | null
  last_name: string | null
  date_of_birth: string | null
  phone: string | null
  county: string | null
  state: string | null
  is_medicare: boolean
  is_life: boolean
  is_retirement: boolean
}

type ExportFilters = {
  q: string
  product: string
  turn65: boolean
  agent: string
}

export default function ClientsResults({
  clients,
  agentNames,
  filters,
  errorMessage,
  canBulkDelete
}: {
  clients: ClientRow[]
  agentNames: Record<string, string>
  filters: ExportFilters
  errorMessage: string
  canBulkDelete: boolean
}) {
  const router = useRouter()
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const [deleteMessage, setDeleteMessage] = useState('')

  const visibleIds = useMemo(() => clients.map((client) => client.id), [clients])
  const selectedSet = useMemo(() => new Set(selectedClientIds), [selectedClientIds])
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id))

  function toggleClient(id: string) {
    setDeleteMessage('')
    setSelectedClientIds((current) => current.includes(id)
      ? current.filter((clientId) => clientId !== id)
      : [...current, id])
  }

  function toggleAllVisible() {
    setDeleteMessage('')
    if (allSelected) {
      setSelectedClientIds([])
      return
    }
    setSelectedClientIds(visibleIds)
  }

  async function deleteSelectedClients() {
    if (!canBulkDelete || selectedClientIds.length === 0 || deleting) return

    const count = selectedClientIds.length
    const confirmed = window.confirm(
      `Permanently delete ${count} selected client${count === 1 ? '' : 's'}?\n\n` +
      'This deletes the client records and their uploaded CRM files. This cannot be undone.'
    )
    if (!confirmed) return

    setDeleting(true)
    setDeleteMessage('')

    try {
      const response = await fetch('/api/clients/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_ids: selectedClientIds })
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || `Delete failed with HTTP ${response.status}.`)

      setSelectedClientIds([])
      setDeleteMessage(
        `${payload?.deleted_count || count} client${(payload?.deleted_count || count) === 1 ? '' : 's'} deleted.` +
        (payload?.storage_warning ? ' One or more stored file objects could not be cleaned up automatically.' : '')
      )
      router.refresh()
    } catch (deleteError) {
      setDeleteMessage(deleteError instanceof Error ? deleteError.message : 'Unable to delete the selected clients.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="card">
      {errorMessage ? <div className="notice notice-error" style={{ margin: 16 }}>{errorMessage}</div> : null}
      {deleteMessage ? <div className="notice" style={{ margin: 16 }}>{deleteMessage}</div> : null}

      {clients.length === 0 ? (
        <div className="empty">No matching clients found.</div>
      ) : (
        <>
          <div className="client-selection-bar">
            <label className="client-select-all">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAllVisible}
                aria-label="Select all matching clients"
              />
              <span>Select all clients</span>
            </label>

            <div className="client-selection-actions">
              <span className="client-selection-count">
                {selectedClientIds.length} of {clients.length} selected
              </span>
              <ClientExportControls
                filters={filters}
                selectedClientIds={selectedClientIds}
              />
              {canBulkDelete ? (
                <button
                  className="btn btn-danger"
                  type="button"
                  disabled={selectedClientIds.length === 0 || deleting}
                  onClick={deleteSelectedClients}
                >
                  {deleting ? 'Deleting…' : `Delete Selected${selectedClientIds.length ? ` (${selectedClientIds.length})` : ''}`}
                </button>
              ) : null}
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="client-select-cell">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAllVisible}
                      aria-label="Select all matching clients"
                    />
                  </th>
                  <th>Client Name</th>
                  <th>Agent</th>
                  <th>DOB</th>
                  <th>Phone</th>
                  <th>County</th>
                  <th>State</th>
                  <th>Products</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => {
                  const selected = selectedSet.has(client.id)
                  return (
                    <tr key={client.id} className={selected ? 'client-row-selected' : undefined}>
                      <td className="client-select-cell">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleClient(client.id)}
                          aria-label={`Select ${client.first_name || ''} ${client.last_name || ''}`.trim() || 'Select client'}
                        />
                      </td>
                      <td>
                        <Link prefetch={false} className="client-name-link" href={`/clients/${client.id}`}>
                          {client.first_name || ''} {client.last_name || ''}
                        </Link>
                      </td>
                      <td><strong>{agentNames[client.assigned_agent_id || ''] || 'Unassigned'}</strong></td>
                      <td>{client.date_of_birth || '—'}</td>
                      <td>{client.phone || '—'}</td>
                      <td>{client.county || '—'}</td>
                      <td>{client.state || '—'}</td>
                      <td>
                        {client.is_medicare ? <span className="badge badge-gold">Medicare</span> : null}
                        {client.is_life ? <span className="badge">Life</span> : null}
                        {client.is_retirement ? <span className="badge">Retirement</span> : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
