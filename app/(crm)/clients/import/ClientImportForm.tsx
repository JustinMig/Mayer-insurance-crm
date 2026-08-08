'use client'

import Link from 'next/link'
import { useMemo, useState, type ChangeEvent } from 'react'
import { parseCsv, type CsvRow } from '@/lib/csv'
import { importRowSummary } from '@/lib/client-import'

type Agent = { id: string; full_name: string; role: string }
type Summary = ReturnType<typeof importRowSummary> & { rowIndex: number }
type ResultRow = { source_id: string | null; name: string; status: 'imported' | 'duplicate' | 'failed'; reason?: string; client_id?: string; skipped_sensitive_fields?: string[] }

const PAGE_SIZE = 50
const BATCH_SIZE = 20
const MAX_ROWS = 10000

const NEVER_UPLOAD_COLUMNS = new Set(['debitcardcvv', 'medicaregovlogininfo', 'registrationinfomedicaregov', 'memberid'])

function sanitizeRowForImport(row: CsvRow): CsvRow {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !NEVER_UPLOAD_COLUMNS.has(key.trim().toLowerCase())))
}

function fileLooksLikeCsv(file: File) {
  return file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv' || file.type === 'application/vnd.ms-excel'
}

export default function ClientImportForm({ agents }: { agents: Agent[] }) {
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<CsvRow[]>([])
  const [summaries, setSummaries] = useState<Summary[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [agentId, setAgentId] = useState('')
  const [page, setPage] = useState(0)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [results, setResults] = useState<ResultRow[]>([])

  const validSummaries = useMemo(() => summaries.filter((item) => item.valid), [summaries])
  const pageCount = Math.max(1, Math.ceil(summaries.length / PAGE_SIZE))
  const pageRows = summaries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const selectedCount = selected.size
  const pageValidIndexes = pageRows.filter((item) => item.valid).map((item) => item.rowIndex)
  const allPageSelected = pageValidIndexes.length > 0 && pageValidIndexes.every((index) => selected.has(index))

  async function handleFile(nextFile: File | null) {
    setFile(null)
    setRows([])
    setSummaries([])
    setSelected(new Set())
    setPage(0)
    setError('')
    setWarning('')
    setResults([])

    if (!nextFile) return
    if (!fileLooksLikeCsv(nextFile)) {
      setError('Choose a CSV file. The Cognito/MayerInsuranceGroup CSV export is supported.')
      return
    }
    if (nextFile.size > 10 * 1024 * 1024) {
      setError('The CSV is larger than 10 MB. Split it into smaller CSV files before importing.')
      return
    }

    try {
      const text = await nextFile.text()
      const parsed = parseCsv(text)
      if (parsed.rows.length === 0) throw new Error('No client rows were found in the CSV.')
      if (parsed.rows.length > MAX_ROWS) throw new Error(`This importer supports up to ${MAX_ROWS.toLocaleString()} clients per CSV.`)

      const mapped = parsed.rows.map((row, rowIndex) => ({ ...importRowSummary(row), rowIndex }))
      const recognized = mapped.filter((item) => item.first_name || item.last_name).length
      if (recognized === 0) throw new Error('This CSV does not contain recognized FirstName / LastName columns.')

      const selectedRows = new Set(mapped.filter((item) => item.valid).map((item) => item.rowIndex))
      const skippedSensitive = mapped.reduce((total, item) => total + item.skipped_sensitive_count, 0)

      const sanitizedRows = parsed.rows.map(sanitizeRowForImport)
      setFile(nextFile)
      setRows(sanitizedRows)
      setSummaries(mapped)
      setSelected(selectedRows)
      if (skippedSensitive > 0) {
        setWarning('Security protection: CVV, Medicare.gov login/registration credentials, and unsupported previous-plan member IDs are intentionally not imported.')
      }
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : 'The CSV could not be read.')
    }
  }

  function toggle(index: number) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function togglePage() {
    setSelected((current) => {
      const next = new Set(current)
      if (allPageSelected) pageValidIndexes.forEach((index) => next.delete(index))
      else pageValidIndexes.forEach((index) => next.add(index))
      return next
    })
  }

  function selectAllValid() {
    setSelected(new Set(validSummaries.map((item) => item.rowIndex)))
  }

  async function startImport() {
    setError('')
    setResults([])
    if (!file || rows.length === 0) {
      setError('Choose a CSV file first.')
      return
    }
    if (!agentId) {
      setError('Choose the agent these clients should be assigned to.')
      return
    }

    const indexes = Array.from(selected).sort((a, b) => a - b)
    if (indexes.length === 0) {
      setError('Select at least 1 client to import.')
      return
    }

    setImporting(true)
    setProgress({ done: 0, total: indexes.length })
    const allResults: ResultRow[] = []

    try {
      for (let offset = 0; offset < indexes.length; offset += BATCH_SIZE) {
        const batchIndexes = indexes.slice(offset, offset + BATCH_SIZE)
        const batchRows = batchIndexes.map((index) => rows[index])
        const response = await fetch('/api/clients/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assigned_agent_id: agentId, rows: batchRows })
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.error || `Import stopped with HTTP ${response.status}.`)

        allResults.push(...(payload?.results || []))
        setResults([...allResults])
        setProgress({ done: Math.min(offset + batchIndexes.length, indexes.length), total: indexes.length })
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'The import could not be completed.')
    } finally {
      setImporting(false)
    }
  }

  const importedCount = results.filter((item) => item.status === 'imported').length
  const duplicateCount = results.filter((item) => item.status === 'duplicate').length
  const failedCount = results.filter((item) => item.status === 'failed').length

  return (
    <div className="import-layout">
      <section className="card card-pad import-settings-card">
        <div className="import-step-number">1</div>
        <h2>Choose CSV</h2>
        <p className="subtle">Use the main <strong>MayerInsuranceGroup.csv</strong> client export.</p>
        <input
          className="input"
          type="file"
          accept=".csv,text/csv"
          disabled={importing}
          onChange={(event: ChangeEvent<HTMLInputElement>) => handleFile(event.target.files?.[0] || null)}
        />
        {file ? <div className="import-file-name">{file.name} · {summaries.length.toLocaleString()} rows recognized</div> : null}

        <div className="import-step-number">2</div>
        <h2>Assign Agent</h2>
        <select className="select" value={agentId} onChange={(event: ChangeEvent<HTMLSelectElement>) => setAgentId(event.target.value)} disabled={importing}>
          <option value="">Choose agent…</option>
          {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}
        </select>
        <p className="subtle import-small-note">Managers are intentionally excluded from client assignment.</p>

        <div className="import-security-box">
          <strong>Import protections</strong>
          <span>SSN, Medicare/Medicaid numbers, health member ID, routing/account/card numbers are encrypted before storage.</span>
          <span>CVV and Medicare.gov credentials are never imported.</span>
          <span>Possible duplicates are skipped using email, phone, or name + DOB.</span>
        </div>

        {error ? <div className="notice notice-error">{error}</div> : null}
        {warning ? <div className="notice">{warning}</div> : null}

        <div className="import-actions">
          <button className="btn btn-primary" type="button" onClick={startImport} disabled={importing || selectedCount === 0}>
            {importing ? `Importing ${progress.done} of ${progress.total}…` : `Import ${selectedCount.toLocaleString()} Selected Clients`}
          </button>
          <Link className="btn btn-secondary" href="/clients">Back to Clients</Link>
        </div>

        {importing || progress.total > 0 ? (
          <div className="import-progress" aria-label="Import progress">
            <div style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
          </div>
        ) : null}
      </section>

      <section className="card import-preview-card">
        <div className="import-preview-header">
          <div>
            <div className="import-step-number">3</div>
            <h2>Review Clients</h2>
            <p className="subtle">Nothing is added until you click Import.</p>
          </div>
          {summaries.length ? (
            <div className="import-selection-controls">
              <button className="btn btn-secondary" type="button" onClick={selectAllValid} disabled={importing}>Select All Valid</button>
              <button className="btn btn-secondary" type="button" onClick={() => setSelected(new Set())} disabled={importing}>Clear</button>
            </div>
          ) : null}
        </div>

        {!summaries.length ? (
          <div className="empty">Choose a CSV to preview the clients that will be created.</div>
        ) : (
          <>
            <div className="import-summary-strip">
              <strong>{summaries.length.toLocaleString()} rows</strong>
              <span>{validSummaries.length.toLocaleString()} valid</span>
              <span>{selectedCount.toLocaleString()} selected</span>
              <span>{(summaries.length - validSummaries.length).toLocaleString()} missing name</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th className="client-select-cell"><input type="checkbox" checked={allPageSelected} onChange={togglePage} aria-label="Select all valid clients on this preview page" /></th>
                    <th>Client</th>
                    <th>DOB</th>
                    <th>Phone</th>
                    <th>County</th>
                    <th>State</th>
                    <th>Products</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((item) => (
                    <tr key={item.rowIndex} className={selected.has(item.rowIndex) ? 'client-row-selected' : undefined}>
                      <td className="client-select-cell">
                        <input type="checkbox" checked={selected.has(item.rowIndex)} disabled={!item.valid || importing} onChange={() => toggle(item.rowIndex)} />
                      </td>
                      <td><strong>{[item.first_name, item.last_name].filter(Boolean).join(' ') || 'Missing name'}</strong></td>
                      <td>{item.date_of_birth || '—'}</td>
                      <td>{item.phone || '—'}</td>
                      <td>{item.county || '—'}</td>
                      <td>{item.state || '—'}</td>
                      <td>{item.products || '—'}</td>
                      <td>{item.valid ? 'Ready' : <span className="import-invalid">Needs first + last name</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="import-pagination">
              <button className="btn btn-secondary" type="button" disabled={page === 0 || importing} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</button>
              <span>Page {page + 1} of {pageCount}</span>
              <button className="btn btn-secondary" type="button" disabled={page >= pageCount - 1 || importing} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>Next</button>
            </div>
          </>
        )}
      </section>

      {results.length ? (
        <section className="card card-pad import-results-card">
          <h2>Import Results</h2>
          <div className="import-result-counts">
            <span><strong>{importedCount}</strong> imported</span>
            <span><strong>{duplicateCount}</strong> duplicates skipped</span>
            <span><strong>{failedCount}</strong> failed</span>
          </div>
          {results.some((item) => item.status !== 'imported') ? (
            <div className="import-result-list">
              {results.filter((item) => item.status !== 'imported').slice(0, 100).map((item, index) => (
                <div key={`${item.source_id || item.name}-${index}`}><strong>{item.name}</strong> — {item.reason || item.status}</div>
              ))}
            </div>
          ) : <div className="notice">All selected clients imported successfully.</div>}
        </section>
      ) : null}
    </div>
  )
}
