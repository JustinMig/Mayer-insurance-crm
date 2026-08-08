'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
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
  errorMessage
}: {
  clients: ClientRow[]
  agentNames: Record<string, string>
  filters: ExportFilters
  errorMessage: string
}) {
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([])

  const visibleIds = useMemo(() => clients.map((client) => client.id), [clients])
  const selectedSet = useMemo(() => new Set(selectedClientIds), [selectedClientIds])
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id))

  function toggleClient(id: string) {
    setSelectedClientIds((current) => current.includes(id)
      ? current.filter((clientId) => clientId !== id)
      : [...current, id])
  }

  function toggleAllVisible() {
    if (allSelected) {
      setSelectedClientIds([])
      return
    }
    setSelectedClientIds(visibleIds)
  }

  return (
    <section className="card">
      {errorMessage ? <div className="notice notice-error" style={{ margin: 16 }}>{errorMessage}</div> : null}

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
                aria-label="Select all clients on this page"
              />
              <span>Select all on this page</span>
            </label>

            <div className="client-selection-actions">
              <span className="client-selection-count">
                {selectedClientIds.length} of {clients.length} selected
              </span>
              <ClientExportControls
                filters={filters}
                selectedClientIds={selectedClientIds}
              />
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
                      aria-label="Select all clients on this page"
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
