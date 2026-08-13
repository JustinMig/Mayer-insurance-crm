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
import {
  attachmentMetadataFromRows,
  cognitoBulkAttachmentMatches,
  looksLikeAttachmentExportHeaders,
  prettyImportDocumentType,
  matchImportAttachmentFiles,
  type ImportAttachmentMatch
} from '@/lib/import-attachments'

type Agent = { id: string; full_name: string; role: string }
type Summary = ReturnType<typeof importRowSummary> & { rowIndex: number; source_id: string }
type ResultRow = {
  source_id: string | null
  name: string
  status: 'imported' | 'merged' | 'failed'
  reason?: string
  client_id?: string
  skipped_sensitive_fields?: string[]
  fields_added?: string[]
  documents_uploaded?: number
  documents_skipped?: number
  document_errors?: string[]
  cognito_files_found?: number
}
type FileReport = {
  name: string
  rowCount: number
  kind: 'client' | 'attachment' | 'related' | 'ignored'
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
const MAX_FILES = 5000
const MAX_CSV_FILE_SIZE = 10 * 1024 * 1024
const MAX_DOCUMENT_FILE_SIZE = 10 * 1024 * 1024
const MAX_CSV_TOTAL_SIZE = 30 * 1024 * 1024
const MAX_ALL_FILES_TOTAL_SIZE = 2 * 1024 * 1024 * 1024

const DOCUMENT_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.pdf', '.txt', '.doc', '.docx']
const DIRECTORY_INPUT_PROPS = { webkitdirectory: '', directory: '' } as Record<string, string>
type CognitoSource = 'mayer' | 'isaiah'

const COGNITO_SOURCE_OPTIONS: Array<{ value: CognitoSource; label: string }> = [
  { value: 'mayer', label: 'Mayer Insurance Group' },
  { value: 'isaiah', label: 'Isaiah Hernandez' }
]

function fileLooksLikeCsv(file: File) {
  return file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv' || file.type === 'application/vnd.ms-excel'
}

function fileLooksLikeSupportedDocument(file: File) {
  const lower = file.name.toLowerCase()
  return DOCUMENT_EXTENSIONS.some((extension) => lower.endsWith(extension))
}



function sourceId(row: CsvRow) {
  const allowed = new Set(['mayerinsurancegroupid', 'isaiahhernandezid'])
  const entry = Object.entries(row).find(([key]) => allowed.has(key.trim().toLowerCase().replace(/[^a-z0-9]/g, '')))
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
  if (looksLikeAttachmentExportHeaders(headers)) return 'attachment'
  if (looksLikeRelatedExportHeaders(headers)) return 'related'
  return 'ignored'
}



async function pullCognitoDocuments(clientId: string, sourceId: string, cognitoSource: CognitoSource) {
  const response = await fetch('/api/clients/import/cognito-files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, source_id: sourceId, cognito_source: cognitoSource })
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error || `Cognito file pull stopped with HTTP ${response.status}.`)
  return {
    filesFound: Number(payload?.files_found || 0),
    uploaded: Number(payload?.uploaded || 0),
    skipped: Number(payload?.skipped || 0),
    errors: Array.isArray(payload?.errors) ? payload.errors.map((item: unknown) => String(item)) : []
  }
}

async function uploadMatchedDocuments(clientId: string, matches: ImportAttachmentMatch[]) {
  let uploaded = 0
  let skipped = 0
  const errors: string[] = []

  for (const match of matches) {
    if (match.status !== 'matched' || !match.file) continue
    try {
      const form = new FormData()
      form.set('file', match.file)
      form.set('document_type', match.meta.document_type)
      form.set('file_name', match.meta.name || match.file.name)
      const response = await fetch(`/api/clients/${clientId}/documents`, { method: 'POST', body: form })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`)
      if (payload?.duplicate) skipped += 1
      else uploaded += 1
    } catch (error) {
      errors.push(`${match.meta.name}: ${error instanceof Error ? error.message : 'Upload failed.'}`)
    }
  }

  return { uploaded, skipped, errors }
}

export default function ClientImportForm({ agents }: { agents: Agent[] }) {
  const [files, setFiles] = useState<File[]>([])
  const [fileReports, setFileReports] = useState<FileReport[]>([])
  const [rows, setRows] = useState<CsvRow[]>([])
  const [summaries, setSummaries] = useState<Summary[]>([])
  const [attachmentMatches, setAttachmentMatches] = useState<ImportAttachmentMatch[]>([])
  const [unmatchedDocumentCount, setUnmatchedDocumentCount] = useState(0)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [agentId, setAgentId] = useState('')
  const [cognitoSource, setCognitoSource] = useState<CognitoSource>('mayer')
  const [page, setPage] = useState(0)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [importing, setImporting] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0, documentsDone: 0, documentsTotal: 0 })
  const [results, setResults] = useState<ResultRow[]>([])

  const validSummaries = useMemo(() => summaries.filter((item) => item.valid), [summaries])
  const pageCount = Math.max(1, Math.ceil(summaries.length / PAGE_SIZE))
  const pageRows = summaries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const selectedCount = selected.size
  const pageValidIndexes = pageRows.filter((item) => item.valid).map((item) => item.rowIndex)
  const allPageSelected = pageValidIndexes.length > 0 && pageValidIndexes.every((index) => selected.has(index))
  const clientFileCount = fileReports.filter((item) => item.kind === 'client').length
  const attachmentCsvCount = fileReports.filter((item) => item.kind === 'attachment').length
  const relatedFileCount = fileReports.filter((item) => item.kind === 'related').length
  const ignoredFileCount = fileReports.filter((item) => item.kind === 'ignored').length
  const matchedAttachmentCount = attachmentMatches.filter((item) => item.status === 'matched').length
  const missingAttachmentCount = attachmentMatches.filter((item) => item.status === 'missing').length
  const ambiguousAttachmentCount = attachmentMatches.filter((item) => item.status === 'ambiguous').length
  const selectedDocumentFileCount = files.filter((file) => !fileLooksLikeCsv(file) && fileLooksLikeSupportedDocument(file)).length
  const clientsWithNoMatchedFiles = selectedDocumentFileCount
    ? summaries.filter((item) => item.source_id && !attachmentMatches.some((match) => match.meta.source_id === item.source_id && match.status === 'matched')).length
    : 0

  async function handleFiles(input: FileList | File[] | null, append = false) {
    setFiles([])
    setFileReports([])
    setRows([])
    setSummaries([])
    setAttachmentMatches([])
    setUnmatchedDocumentCount(0)
    setSelected(new Set())
    setPage(0)
    setError('')
    setWarning('')
    setResults([])
    setProgress({ done: 0, total: 0, documentsDone: 0, documentsTotal: 0 })

    if (!input) return
    const incoming = Array.from(input)
    const chosen = append
      ? Array.from(new Map([...files, ...incoming].map((file) => [`${(file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name}:${file.size}:${file.lastModified}`, file])).values())
      : incoming
    if (chosen.length === 0) return
    if (chosen.length > MAX_FILES) {
      setError(`Choose no more than ${MAX_FILES} files at one time.`)
      return
    }

    const csvFiles = chosen.filter(fileLooksLikeCsv)
    const documentFiles = chosen.filter((file) => !fileLooksLikeCsv(file) && fileLooksLikeSupportedDocument(file))
    const unsupportedFiles = chosen.filter((file) => !fileLooksLikeCsv(file) && !fileLooksLikeSupportedDocument(file))

    if (csvFiles.length === 0) {
      setError('No CSV files were found. Include the main Mayer Insurance Group client CSV.')
      return
    }
    if (csvFiles.some((file) => file.size > MAX_CSV_FILE_SIZE)) {
      setError('One of the CSV files is larger than 10 MB. Split that export before importing.')
      return
    }
    if (documentFiles.some((file) => file.size > MAX_DOCUMENT_FILE_SIZE)) {
      setError('One of the client documents is larger than 10 MB. That file must be reduced before importing.')
      return
    }
    const csvTotalSize = csvFiles.reduce((total, file) => total + file.size, 0)
    if (csvTotalSize > MAX_CSV_TOTAL_SIZE) {
      setError('The selected CSV files are larger than 30 MB combined. Import them in smaller groups.')
      return
    }
    const allSize = chosen.reduce((total, file) => total + file.size, 0)
    if (allSize > MAX_ALL_FILES_TOTAL_SIZE) {
      setError('The selected files are larger than 250 MB combined. Import them in smaller groups.')
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

      // Related non-attachment CSVs may contain current intake fields. Attachment CSVs
      // are handled separately so metadata such as file IDs is never copied into a client field.
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

      const metadata = parsedUploads
        .filter((item) => item.kind === 'attachment')
        .flatMap((item) => attachmentMetadataFromRows(item.file.name, item.headers, item.rows))
        .filter((item) => clientKeyBySourceId.has(item.source_id))
      const metadataMatches = matchImportAttachmentFiles(metadata, documentFiles)
      const metadataUsedFiles = new Set(metadataMatches.filter((item) => item.file).map((item) => item.file))
      const cognitoBulkMatches = cognitoBulkAttachmentMatches(
        documentFiles.filter((file) => !metadataUsedFiles.has(file)),
        new Set(clientKeyBySourceId.keys())
      )
      const matched = [...metadataMatches, ...cognitoBulkMatches]
      const usedFiles = new Set(matched.filter((item) => item.file).map((item) => item.file))

      const mergedRows = rowOrder.map((key) => mergedBySource.get(key) || {})
      if (mergedRows.length === 0) throw new Error('No client rows were found in the selected CSV files.')
      if (mergedRows.length > MAX_ROWS) throw new Error(`This importer supports up to ${MAX_ROWS.toLocaleString()} clients at one time.`)

      const mapped = mergedRows.map((row, rowIndex) => ({ ...importRowSummary(row), rowIndex, source_id: sourceId(row) }))
      const recognized = mapped.filter((item) => item.first_name || item.last_name).length
      if (recognized === 0) throw new Error('The selected files did not contain recognizable client names.')

      const selectedRows = new Set(mapped.filter((item) => item.valid).map((item) => item.rowIndex))
      const restrictedCount = mergedRows.reduce((total, row) => total + restrictedImportFields(row).length, 0)
      const sanitizedRows = mergedRows.map(sanitizeImportRowForTransport)

      setFiles(chosen)
      setFileReports(parsedUploads.map((item) => ({ name: item.file.name, rowCount: item.rows.length, kind: item.kind })))
      setRows(sanitizedRows)
      setSummaries(mapped)
      setAttachmentMatches(matched)
      setUnmatchedDocumentCount(documentFiles.filter((file) => !usedFiles.has(file)).length)
      setSelected(selectedRows)

      const messages: string[] = []
      if (unsupportedFiles.length) messages.push(`${unsupportedFiles.length} unsupported file${unsupportedFiles.length === 1 ? ' was' : 's were'} ignored.`)
      if (restrictedCount) messages.push('CVV and Medicare.gov login/registration credentials were detected and excluded for security.')
      if (metadata.length) {
        messages.push(`${metadata.length} attachment record${metadata.length === 1 ? '' : 's'} found in the CSV exports.`)
      }
      if (cognitoBulkMatches.length) messages.push(`${cognitoBulkMatches.length} Cognito bulk-download file${cognitoBulkMatches.length === 1 ? '' : 's'} matched by Entry ID and folder name.`)
      if (matched.some((item) => item.status !== 'matched')) {
        messages.push('Some attachment CSV records do not have a matching PDF/image/document in the selected files. Those are marked below and cannot be recreated from CSV metadata alone.')
      }
      if (documentFiles.some((file) => !usedFiles.has(file))) messages.push('Some selected documents could not be tied to an attachment CSV record and will not be uploaded.')
      const zeroFileClients = mapped.filter((item) => item.source_id && !matched.some((match) => match.meta.source_id === item.source_id && match.status === 'matched')).length
      if (documentFiles.length && zeroFileClients) messages.push(`${zeroFileClients} client${zeroFileClients === 1 ? '' : 's'} have no Cognito files matched from the selected folder. Review the Files column before importing.`)
      if (parsedUploads.some((item) => item.kind === 'ignored')) messages.push('CSV files with no current intake fields or recognized file mapping were accepted but ignored.')
      messages.push('Only data that has a matching field on the current client intake form will be imported. The CSV field Level is normalized into Medicaid Level (QMB, SLMB, QI, FBDE, or Other).')
      setWarning(messages.join(' '))
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : 'The import files could not be read.')
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
      setError('Choose the CSV export files first.')
      return
    }
    if (!agentId) {
      setError('Choose the agent that should receive any newly created clients.')
      return
    }

    const indexes = Array.from(selected).sort((a, b) => a - b)
    if (indexes.length === 0) {
      setError('Select at least 1 client to import.')
      return
    }

    const selectedSourceIds = new Set(indexes.map((index) => summaries[index]?.source_id).filter(Boolean))
    const directCognitoTotal = Array.from(selectedSourceIds).length

    setImporting(true)
    setProgress({ done: 0, total: indexes.length, documentsDone: 0, documentsTotal: directCognitoTotal })
    const allResults: ResultRow[] = []
    let documentsDone = 0

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

        const batchResults: ResultRow[] = Array.isArray(payload?.results) ? payload.results : []
        for (const result of batchResults) {
          if (!['imported', 'merged'].includes(result.status) || !result.client_id || !result.source_id) continue

          const errors: string[] = []
          let shouldUseFolderFallback = false
          try {
            const direct = await pullCognitoDocuments(result.client_id, result.source_id, cognitoSource)
            result.cognito_files_found = direct.filesFound
            result.documents_uploaded = direct.uploaded
            result.documents_skipped = direct.skipped
            errors.push(...direct.errors)
            shouldUseFolderFallback = direct.filesFound === 0 || direct.errors.length > 0
          } catch (directError) {
            errors.push(`Direct Cognito pull: ${directError instanceof Error ? directError.message : 'Failed.'}`)
            shouldUseFolderFallback = true
          }

          const clientMatches = attachmentMatches.filter((item) => item.status === 'matched' && item.meta.source_id === result.source_id)
          if (shouldUseFolderFallback && clientMatches.length) {
            const upload = await uploadMatchedDocuments(result.client_id, clientMatches)
            result.documents_uploaded = (result.documents_uploaded || 0) + upload.uploaded
            result.documents_skipped = (result.documents_skipped || 0) + upload.skipped
            errors.push(...upload.errors)
          }
          result.document_errors = errors
          documentsDone += 1
          setProgress({ done: Math.min(offset + batchIndexes.length, indexes.length), total: indexes.length, documentsDone, documentsTotal: directCognitoTotal })
        }

        allResults.push(...batchResults)
        setResults([...allResults])
        setProgress({ done: Math.min(offset + batchIndexes.length, indexes.length), total: indexes.length, documentsDone, documentsTotal: directCognitoTotal })
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'The import could not be completed.')
    } finally {
      setImporting(false)
    }
  }

  const importedCount = results.filter((item) => item.status === 'imported').length
  const mergedCount = results.filter((item) => item.status === 'merged').length
  const failedCount = results.filter((item) => item.status === 'failed').length
  const uploadedDocumentCount = results.reduce((total, item) => total + (item.documents_uploaded || 0), 0)
  const skippedDocumentCount = results.reduce((total, item) => total + (item.documents_skipped || 0), 0)
  const documentErrorCount = results.reduce((total, item) => total + (item.document_errors?.length || 0), 0)

  return (
    <div className="import-layout">
      <section className="card card-pad import-settings-card">
        <div className="import-step-number">1</div>
        <h2>Import Clients + Pull Cognito Files</h2>
        <p className="subtle">Choose which Cognito form these clients came from, then load the client CSV. For every selected client with that Cognito form's Entry ID column, the CRM securely pulls the current files directly from that Cognito form and places them in the correct CRM section. The old Cognito export folder is optional and used only as a fallback.</p>

        <label className="field">
          <span>Cognito source</span>
          <select
            className="input"
            value={cognitoSource}
            disabled={importing}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setCognitoSource(event.target.value as CognitoSource)}
          >
            {COGNITO_SOURCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <div
          className={`import-drop-zone${dragging ? ' is-dragging' : ''}`}
          onDragEnter={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(true) }}
          onDragOver={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(true) }}
          onDragLeave={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false) }}
          onDrop={onDrop}
        >
          <strong>Drop or choose the {cognitoSource === 'isaiah' ? 'Isaiah Hernandez' : 'Mayer Insurance Group'} client CSV here</strong>
          <span>No Cognito ZIP or folder is required. This works the same on iPhone, iPad, Android, Mac, and Windows.</span>
          <input
            className="input"
            type="file"
            accept=".csv,text/csv,image/*,.pdf,.txt,.doc,.docx"
            multiple
            disabled={importing}
            onChange={(event: ChangeEvent<HTMLInputElement>) => void handleFiles(event.target.files, true)}
          />
          <label className={`btn btn-secondary upload-button ${importing ? 'is-disabled' : ''}`}>
            Optional: Add Cognito Export Folder
            <input
              type="file"
              hidden
              multiple
              disabled={importing}
              {...DIRECTORY_INPUT_PROPS}
              onChange={(event: ChangeEvent<HTMLInputElement>) => void handleFiles(event.target.files, true)}
            />
          </label>
        </div>

        {files.length ? (
          <div className="import-file-summary">
            <strong>{files.length} total file{files.length === 1 ? '' : 's'} loaded</strong>
            <span>{clientFileCount} client CSV · {attachmentCsvCount} attachment CSV · {relatedFileCount} related data CSV · {ignoredFileCount} ignored CSV</span>
            <span>{summaries.length.toLocaleString()} client row{summaries.length === 1 ? '' : 's'} recognized</span>
            <span>{matchedAttachmentCount} client file{matchedAttachmentCount === 1 ? '' : 's'} matched · {missingAttachmentCount} missing · {ambiguousAttachmentCount} ambiguous · {unmatchedDocumentCount} selected but unmatched</span>
          </div>
        ) : null}

        {fileReports.length ? (
          <details className="import-file-details">
            <summary>Show recognized CSV files</summary>
            <div>
              {fileReports.map((item) => (
                <span key={item.name}>
                  <strong>{item.name}</strong> — {item.kind === 'client' ? 'Client data' : item.kind === 'attachment' ? 'Attachment map' : item.kind === 'related' ? 'Related data' : 'Ignored'} · {item.rowCount.toLocaleString()} row{item.rowCount === 1 ? '' : 's'}
                </span>
              ))}
            </div>
          </details>
        ) : null}

        {attachmentMatches.length ? (
          <details className="import-file-details" open={missingAttachmentCount + ambiguousAttachmentCount > 0}>
            <summary>Show attachment matching ({matchedAttachmentCount} matched / {attachmentMatches.length} records)</summary>
            <div>
              {attachmentMatches.slice(0, 250).map((item, index) => (
                <span key={`${item.meta.source_csv}-${item.meta.source_id}-${item.meta.name}-${index}`}>
                  <strong>{item.meta.name}</strong> — {item.meta.section_label} · {prettyImportDocumentType(item.meta.document_type)} · {item.status === 'matched' ? `Matched to ${item.file?.name}` : item.status === 'ambiguous' ? 'More than one possible file — not uploaded' : 'Actual file missing — not uploaded'}
                </span>
              ))}
            </div>
          </details>
        ) : null}

        <div className="import-step-number">2</div>
        <h2>Assign Agent</h2>
        <select className="select" value={agentId} onChange={(event: ChangeEvent<HTMLSelectElement>) => setAgentId(event.target.value)} disabled={importing}>
          <option value="">Agent for new clients…</option>
          {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}
        </select>
        <p className="subtle import-small-note">This assignment is used only when the importer creates a new client. Existing clients keep their current assigned agent.</p>

        <div className="import-security-box">
          <strong>Import protections</strong>
          <span>CSV Level is mapped directly to Medicaid Level and standardized to QMB, SLMB, QI, FBDE, or Other.</span>
          <span>Only client data fields that exist on the current intake form are imported.</span>
          <span>Cognito files are pulled directly on the server by Cognito Entry ID; the optional export folder is only a fallback.</span>
          <span>SSN, Medicare/Medicaid numbers, health member ID, routing/account/card numbers are encrypted before storage.</span>
          <span>CVV and Medicare.gov credentials are never stored or imported.</span>
          <span>Existing clients are matched by email, phone, or name + DOB. Blank CRM fields are filled, existing values are never overwritten.</span>
          <span>Matching files are added to existing clients too; files already present with the same name and section are skipped.</span>
        </div>

        {error ? <div className="notice notice-error">{error}</div> : null}
        {warning ? <div className="notice">{warning}</div> : null}

        <div className="import-actions">
          <button className="btn btn-primary" type="button" onClick={startImport} disabled={importing || selectedCount === 0}>
            {importing
              ? `Importing ${progress.done} of ${progress.total} clients${progress.documentsTotal ? ` · ${progress.documentsDone} of ${progress.documentsTotal} Cognito entries checked` : ''}…`
              : `Import ${selectedCount.toLocaleString()} Selected Clients`}
          </button>
          <Link prefetch={false} className="btn btn-secondary" href="/clients">Back to Clients</Link>
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
          <div className="empty">Choose the main client CSV to preview clients. Cognito files will be pulled directly during import using each client’s Cognito ID.</div>
        ) : (
          <>
            <div className="import-summary-strip">
              <strong>{summaries.length.toLocaleString()} rows</strong>
              <span>{validSummaries.length.toLocaleString()} valid</span>
              <span>{selectedCount.toLocaleString()} selected</span>
              <span>{(summaries.length - validSummaries.length).toLocaleString()} missing name</span>
              {selectedDocumentFileCount ? <span><strong>{clientsWithNoMatchedFiles}</strong> with no matched Cognito files</span> : null}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th className="client-select-cell"><input type="checkbox" checked={allPageSelected} onChange={togglePage} aria-label="Select all valid clients on this preview page" /></th>
                    <th>Client</th>
                    <th>Cognito ID</th>
                    <th>DOB</th>
                    <th>Phone</th>
                    <th>County</th>
                    <th>State</th>
                    <th>Products</th>
                    <th>Files</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((item) => {
                    const clientFiles = item.source_id ? attachmentMatches.filter((match) => match.meta.source_id === item.source_id) : []
                    const matchedFiles = clientFiles.filter((match) => match.status === 'matched').length
                    const missingFiles = clientFiles.filter((match) => match.status !== 'matched').length
                    const noMatchedCognitoFiles = Boolean(selectedDocumentFileCount && item.source_id && matchedFiles === 0)
                    return (
                      <tr key={item.rowIndex} className={selected.has(item.rowIndex) ? 'client-row-selected' : undefined}>
                        <td className="client-select-cell">
                          <input type="checkbox" checked={selected.has(item.rowIndex)} disabled={!item.valid || importing} onChange={() => toggle(item.rowIndex)} />
                        </td>
                        <td><strong>{[item.first_name, item.last_name].filter(Boolean).join(' ') || 'Missing name'}</strong></td>
                        <td>{item.source_id || '—'}</td>
                        <td>{item.date_of_birth || '—'}</td>
                        <td>{item.phone || '—'}</td>
                        <td>{item.county || '—'}</td>
                        <td>{item.state || '—'}</td>
                        <td>{item.products || '—'}</td>
                        <td>{noMatchedCognitoFiles
                          ? <span className="import-invalid">0 matched — check Cognito export</span>
                          : clientFiles.length
                            ? `${matchedFiles}/${clientFiles.length} matched${missingFiles ? ` · ${missingFiles} missing` : ''}`
                            : item.source_id ? 'Direct from Cognito' : '—'}</td>
                        <td>{item.valid ? (noMatchedCognitoFiles ? <span className="import-invalid">Review files</span> : 'Ready') : <span className="import-invalid">Needs first + last name</span>}</td>
                      </tr>
                    )
                  })}
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
            <span><strong>{uploadedDocumentCount}</strong> files uploaded</span>
            <span><strong>{skippedDocumentCount}</strong> duplicate files skipped</span>
            <span><strong>{mergedCount}</strong> existing clients updated</span>
            <span><strong>{failedCount}</strong> client failures</span>
            <span><strong>{documentErrorCount}</strong> file failures</span>
          </div>
          {results.some((item) => item.status === 'merged' || item.status === 'failed' || (item.documents_skipped || 0) > 0 || (item.document_errors?.length || 0) > 0) ? (
            <div className="import-result-list">
              {results.filter((item) => item.status === 'merged' || item.status === 'failed' || (item.documents_skipped || 0) > 0 || (item.document_errors?.length || 0) > 0).slice(0, 100).map((item, index) => (
                <div key={`${item.source_id || item.name}-${index}`}>
                  <strong>{item.name}</strong> — {item.status === 'failed'
                    ? (item.reason || 'Import failed')
                    : item.status === 'merged'
                      ? `${item.reason || 'Existing client updated.'}${item.documents_uploaded ? ` ${item.documents_uploaded} files uploaded.` : ''}${item.documents_skipped ? ` ${item.documents_skipped} existing files skipped.` : ''}${item.document_errors?.length ? ` File errors: ${item.document_errors.join(' | ')}` : ''}`
                      : `${item.documents_uploaded || 0} files uploaded${item.documents_skipped ? `; ${item.documents_skipped} existing files skipped` : ''}${item.document_errors?.length ? `; ${item.document_errors.join(' | ')}` : ''}`}
                </div>
              ))}
            </div>
          ) : <div className="notice">All selected clients were created or matched successfully, and all available missing files were handled.</div>}
        </section>
      ) : null}
    </div>
  )
}
