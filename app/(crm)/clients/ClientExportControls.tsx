'use client'

import { useMemo, useState } from 'react'

type ExportField = {
  key: string
  label: string
  defaultChecked?: boolean
}

type ExportFilters = {
  q: string
  product: string
  turn65: boolean
  agent: string
}

const EXPORT_FIELDS: ExportField[] = [
  { key: 'first_name', label: 'First Name', defaultChecked: true },
  { key: 'last_name', label: 'Last Name', defaultChecked: true },
  { key: 'mailing_address', label: 'Mailing Address', defaultChecked: true },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'date_of_birth', label: 'Date of Birth' },
  { key: 'county', label: 'County' },
  { key: 'products', label: 'Products' }
]

export default function ClientExportControls({ filters, hasActiveFilters }: { filters: ExportFilters; hasActiveFilters: boolean }) {
  const defaultFields = useMemo(
    () => EXPORT_FIELDS.filter((field) => field.defaultChecked).map((field) => field.key),
    []
  )
  const [open, setOpen] = useState(false)
  const [selectedFields, setSelectedFields] = useState<string[]>(defaultFields)
  const [workingFormat, setWorkingFormat] = useState<'csv' | 'pdf' | null>(null)
  const [message, setMessage] = useState('')

  function toggleField(key: string) {
    setSelectedFields((current) => current.includes(key)
      ? current.filter((field) => field !== key)
      : [...current, key])
  }

  async function download(format: 'csv' | 'pdf') {
    if (selectedFields.length === 0) {
      setMessage('Select at least 1 field to export.')
      return
    }

    setWorkingFormat(format)
    setMessage('')

    try {
      const response = await fetch('/api/clients/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, fields: selectedFields, ...filters })
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error || 'Unable to export clients.')
      }

      const blob = await response.blob()
      const disposition = response.headers.get('content-disposition') || ''
      const fileMatch = disposition.match(/filename="?([^";]+)"?/i)
      const fallback = `mayer-clients-${new Date().toISOString().slice(0, 10)}.${format}`
      const fileName = fileMatch?.[1] || fallback

      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = fileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage(`${format.toUpperCase()} export downloaded.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to export clients.')
    } finally {
      setWorkingFormat(null)
    }
  }

  return (
    <>
      <button className="btn btn-secondary" type="button" onClick={() => setOpen(true)}>Export Clients</button>

      {open ? (
        <div className="export-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false)
        }}>
          <section className="export-modal" role="dialog" aria-modal="true" aria-labelledby="export-clients-title">
            <div className="export-modal-header">
              <div>
                <h2 id="export-clients-title">Export Client Information</h2>
                <p className="subtle">Choose exactly which non-sensitive fields you want included.</p>
              </div>
              <button className="btn btn-secondary btn-small" type="button" onClick={() => setOpen(false)}>Close</button>
            </div>

            {!hasActiveFilters ? (
              <div className="notice" style={{ marginTop: 16 }}>
                No client filter is active. This export will include every client your login is authorized to view.
              </div>
            ) : (
              <div className="notice" style={{ marginTop: 16 }}>
                The export will use your current client search, product, Turn 65, and agent filters.
              </div>
            )}

            <div className="export-field-grid">
              {EXPORT_FIELDS.map((field) => (
                <label className="export-field-option" key={field.key}>
                  <input
                    type="checkbox"
                    checked={selectedFields.includes(field.key)}
                    onChange={() => toggleField(field.key)}
                  />
                  <span>{field.label}</span>
                </label>
              ))}
            </div>

            <p className="export-security-note">
              Sensitive fields such as SSN, Medicare/Medicaid numbers, driver&apos;s license numbers, and banking/card information are intentionally excluded from client exports.
            </p>

            {message ? <div className="notice" style={{ marginTop: 14 }}>{message}</div> : null}

            <div className="export-actions">
              <button className="btn btn-primary" type="button" disabled={workingFormat !== null} onClick={() => download('csv')}>
                {workingFormat === 'csv' ? 'Creating CSV…' : 'Download CSV'}
              </button>
              <button className="btn btn-secondary" type="button" disabled={workingFormat !== null} onClick={() => download('pdf')}>
                {workingFormat === 'pdf' ? 'Creating PDF…' : 'Download PDF'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
