'use client'

import Link from 'next/link'
import { useMemo, useState, type ChangeEvent, type DragEvent } from 'react'
import { parseCsv, type CsvRow } from '@/lib/csv'
import {
  importRowSummary,
  looksLikeClientDataHeaders,
  looksLikeRelatedExportHeaders,
  sanitizeImportRowForTransport,
  restrictedImportFields
} from '@/lib/client-import'

type Agent = { id: string; full_name: string; role: string }
type Summary = ReturnType<typeof importRowSummary> & { rowIndex: number }
type ResultRow = { source_id: string | null; name: string; status: 'imported' | 'duplicate' | 'failed'; reason?: string; client_id?: string; skipped_sensitive_fields?: string[] }
type FileReport = {
  name: string
  rowCount: number
  kind: 'client' | 'related' | 'ignored'
}

type ParsedUpload = {
  file: File
  headers: string[]
  rows: CsvRow[]
  kind: FileReport['kind']
}

const PAGE_SIZE = 50
const BATCH_SIZE = 20
const MAX_ROWS = 10000
const MAX_FILES = 30
const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_TOTAL_SIZE = 30 * 1024 * 1024

function fileLooksLikeCsv(file: File) {
  return file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv' || file.type === 'application/vnd.ms-excel'
}

function sourceId(row: CsvRow) {
  const entry = Object.entries(row).find(([key]) => key.trim().toLowerCase().replace(/[^a-z0-9]/g, '') === 'mayerinsurancegroupid')
  return String(entry?.[1] || '').trim()
}

function mergeNonEmpty(target: CsvRow, incoming: CsvRow) {
  const next = { ...target }
  for (const [key, value] of Object.entries(incoming)) {
    const cleanValue = String(value ?? '').trim()
    if (!cleanValue) continue
    const existingKey = Object.keys(next).find((candidate) => candidate.trim().toLowerCase().replace(/[^a-z0-9]/g, '') === key.trim().toLowerCase().replace(/[^a-z0-9]/g, ''))
    if (existingKey) {
      if (!String(next[existingKey] ?? '').trim()) next[existingKey] = value
    } else {
      next[key] = value
    }
  }
  return next
}

function classify(headers: string[]): FileReport['kind'] {
  if (looksLikeClientDataHeaders(headers)) return 'client'
  if (looksLikeRelatedExportHeaders(headers)) return 'related'
  return 'ignored'
}

export default function ClientImportForm({ agents }: { agents: Agent[] }) {
  const [files, setFiles] = useState<File[]>([])
  const [fileReports, setFileReports] = useState<FileReport[]>([])
  const [rows, setRows] = useState<CsvRow[]>([])
  const [summaries, setSummaries] = useState<Summary[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [agentId, setAgentId] = useState('')
  const [page, setPage] = useState(0)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [importing, setImporting] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [results, setResults] = useState<ResultRow[]>([])

  const validSummaries = useMemo(() => summaries.filter((item) => item.valid), [summaries])
  const pageCount = Math.max(1, Math.ceil(summaries.length / PAGE_SIZE))
  const pageRows = summaries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const selectedCount = selected.size
  const pageValidIndexes = pageRows.filter((item) => item.valid).map((item) => item.rowIndex)
  const allPageSelected = pageValidIndexes.length > 0 && pageValidIndexes.every((index) => selected.has(index))
  const clientFileCount = fileReports.filter((item) => item.kind === 'client').length
  const relatedFileCount = fileReports.filter((item) => item.kind === 'related').length
  const ignoredFileCount = fileReports.filter((item) => item.kind === 'ignored').length

  async function handleFiles(input: FileList | File[] | null) {
    setFiles([])
    setFileReports([])
    setRows([])
    setSummaries([])
    setSelected(new Set())
    setPage(0)
    setError('')
    setWarning('')
    setResults([])
    setProgress({ done: 0, total: 0 })

    if (!input) return
    const chosen = Array.from(input)
    if (chosen.length === 0) return
    if (chosen.length > MAX_FILES) {
      setError(`Choose no more than ${MAX_FILES} CSV files at one time.`)
      return
    }

    const nonCsv = chosen.filter((file) => !fileLooksLikeCsv(file))
    const csvFiles = chosen.filter(fileLooksLikeCsv)
    if (csvFiles.length === 0) {
      setError('No CSV files were found in the files you selected.')
      return
    }
    if (csvFiles.some((file) => file.size > MAX_FILE_SIZE)) {
      setError('One of the CSV files is larger than 10 MB. Split that export before importing.')
      return
    }
    const totalSize = csvFiles.reduce((total, file) => total + file.size, 0)
    if (totalSize > MAX_TOTAL_SIZE) {
      setError('The selected CSV files are larger than 30 MB combined. Import them in smaller groups.')
      return
    }

    try {
      const parsedUploads: ParsedUpload[] = await Promise.all(csvFiles.map(async (file) => {
        const parsed = parseCsv(await file.text())
        return { file, headers: parsed.headers, rows: parsed.rows, kind: classify(parsed.headers) }
      }))

      const clientUploads = parsedUploads.filter((item) => item.kind === 'client')
      if (clientUploads.length === 0) {
        throw new Error('I could not find the main client CSV. Include the CSV that has FirstName and LastName columns.')
      }

      const mergedBySource = new Map<string, CsvRow>()
      const rowOrder: string[] = []
      let fallbackCounter = 0

      for (const upload of clientUploads) {
        for (const row of upload.rows) {
          const id = sourceId(row)
          const key = id ? `id:${id}` : `row:${upload.file.name}:${fallbackCounter++}`
          if (!mergedBySource.has(key)) rowOrder.push(key)
          mergedBySource.set(key, mergeNonEmpty(mergedBySource.get(key) || {}, row))
        }
      }

      // Match every related CSV to its client using the old MayerInsuranceGroup_Id.
      // Current Cognito attachment tables only contain metadata (filename/content type/id),
      // not the actual PDF/image bytes. Those files are accepted and recognized, but no
      // metadata-only value is forced into an unrelated intake field.
      const clientKeyBySourceId = new Map<string, string>()
      for (const key of rowOrder) {
        const id = sourceId(mergedBySource.get(key) || {})
        if (id) clientKeyBySourceId.set(id, key)
      }
      for (const upload of parsedUploads.filter((item) => item.kind === 'related')) {
        for (const row of upload.rows) {
          const id = sourceId(row)
          const key = id ? clientKeyBySourceId.get(id) : undefined
          if (!key) continue
          mergedBySource.set(key, mergeNonEmpty(mergedBySource.get(key) || {}, row))
        }
      }

      const mergedRows = rowOrder.map((key) => mergedBySource.get(key) || {})
      if (mergedRows.length === 0) throw new Error('No client rows were found in the selected CSV files.')
      if (mergedRows.length > MAX_ROWS) throw new Error(`This importer supports up to ${MAX_ROWS.toLocaleString()} clients at one time.`)

      const mapped = mergedRows.map((row, rowIndex) => ({ ...importRowSummary(row), rowIndex }))
      const recognized = mapped.filter((item) => item.first_name || item.last_name).length
      if (recognized === 0) throw new Error('The selected files did not contain recognizable client names.')

      const selectedRows = new Set(mapped.filter((item) => item.valid).map((item) => item.rowIndex))
      const restrictedCount = mergedRows.reduce((total, row) => total + restrictedImportFields(row).length, 0)
      const sanitizedRows = mergedRows.map(sanitizeImportRowForTransport)

      setFiles(csvFiles)
      setFileReports(parsedUploads.map((item) => ({ name: item.file.name, rowCount: item.rows.length, kind: item.kind })))
      setRows(sanitizedRows)
      setSummaries(mapped)
      setSelected(selectedRows)

      const messages: string[] = []
      if (nonCsv.length) messages.push(`${nonCsv.length} non-CSV file${nonCsv.length === 1 ? ' was' : 's were'} ignored.`)
      if (restrictedCount) messages.push('CVV and Medicare.gov login/registration credentials were detected and excluded for security.')
      if (parsedUploads.some((item) => item.kind === 'related' && item.rows.length > 0)) {
        messages.push('Related attachment CSVs were matched by client ID, but document metadata is not imported because those CSVs do not contain the actual PDF/image files.')
      }
      if (parsedUploads.some((item) => item.kind === 'ignored')) messages.push('CSV files with no current intake fields were accepted but ignored.')
      messages.push('Only data that has a matching field on the current client intake form will be imported.')
      setWarning(messages.join(' '))
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : 'The CSV files could not be read.')
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    if (importing) return
    void handleFiles(event.dataTransfer.files)
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
    if (files.length === 0 || rows.length === 0) {
      setError('Choose the CSV files first.')
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
        <h2>Drop CSV Files</h2>
        <p className="subtle">Select or drag in the entire Mayer Insurance Group CSV export set. The CRM will identify the main client file automatically and match related CSVs by client ID.</p>

        <div
          className={`import-drop-zone${dragging ? ' is-dragging' : ''}`}
          onDragEnter={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(true) }}
          onDragOver={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(true) }}
          onDragLeave={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false) }}
          onDrop={onDrop}
        >
          <strong>Drop all CSV files here</strong>
          <span>or choose all of them at once</span>
          <input
            className="input"
            type="file"
            accept=".csv,text/csv"
            multiple
            disabled={importing}
            onChange={(event: ChangeEvent<HTMLInputElement>) => void handleFiles(event.target.files)}
          />
        </div>

        {files.length ? (
          <div className="import-file-summary">
            <strong>{files.length} CSV file{files.length === 1 ? '' : 's'} loaded</strong>
            <span>{clientFileCount} client data · {relatedFileCount} related · {ignoredFileCount} ignored</span>
            <span>{summaries.length.toLocaleString()} client row{summaries.length === 1 ? '' : 's'} recognized</span>
          </div>
        ) : null}

        {fileReports.length ? (
          <details className="import-file-details">
            <summary>Show recognized files</summary>
            <div>
              {fileReports.map((item) => (
                <span key={item.name}>
                  <strong>{item.name}</strong> — {item.kind === 'client' ? 'Client data' : item.kind === 'related' ? 'Related export' : 'Ignored'} · {item.rowCount.toLocaleString()} row{item.rowCount === 1 ? '' : 's'}
                </span>
              ))}
            </div>
          </details>
        ) : null}

        <div className="import-step-number">2</div>
        <h2>Assign Agent</h2>
        <select className="select" value={agentId} onChange={(event: ChangeEvent<HTMLSelectElement>) => setAgentId(event.target.value)} disabled={importing}>
          <option value="">Choose agent…</option>
          {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}
        </select>
        <p className="subtle import-small-note">Managers are intentionally excluded from client assignment.</p>

        <div className="import-security-box">
          <strong>Import protections</strong>
          <span>Only fields that exist on the current client intake form are imported.</span>
          <span>SSN, Medicare/Medicaid numbers, health member ID, routing/account/card numbers are encrypted before storage.</span>
          <span>CVV and Medicare.gov credentials are never stored or imported.</span>
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
          <div className="empty">Drop in the CSV export files to preview the clients that will be created.</div>
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
