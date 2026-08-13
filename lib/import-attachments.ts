import type { CsvRow } from './csv'

export type ImportDocumentType =
  | 'scope_of_appointment'
  | 'card_information'
  | 'medicare_document'
  | 'medications'
  | 'life_insurance'
  | 'health_plan'
  | 'hospital_indemnity'
  | 'aca'
  | 'dental'
  | 'hearing'
  | 'vision'
  | 'retirement'

export type ImportAttachmentMeta = {
  source_id: string
  source_csv: string
  document_type: ImportDocumentType
  section_label: string
  name: string
  file_name: string | null
  content_type: string | null
  storage_url: string | null
  external_file_id: string | null
}


export type ImportAttachmentMatch = {
  meta: ImportAttachmentMeta
  file: File | null
  status: 'matched' | 'missing' | 'ambiguous'
}

function normalizedFileName(value: string) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\\/g, '/')
    .split('/')
    .pop()!
    .replace(/\s+\(\d+\)(?=\.[a-z0-9]+$)/i, '')
    .replace(/[^a-z0-9.]+/g, '')
}

function normalizedFileToken(value: string) {
  return value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function matchImportAttachmentFiles(metadata: ImportAttachmentMeta[], documentFiles: File[]): ImportAttachmentMatch[] {
  const used = new Set<number>()

  return metadata.map((meta) => {
    const expectedNames = [meta.name, meta.file_name]
      .filter((value): value is string => Boolean(value))
      .map(normalizedFileName)
    const externalId = meta.external_file_id ? normalizedFileToken(meta.external_file_id) : ''

    let candidates = documentFiles
      .map((file, index) => ({ file, index }))
      .filter(({ file, index }) => {
        if (used.has(index)) return false
        const actual = normalizedFileName(file.name)
        return expectedNames.some((expected) => actual === expected || actual.endsWith(expected))
      })

    if (candidates.length === 0 && externalId) {
      candidates = documentFiles
        .map((file, index) => ({ file, index }))
        .filter(({ file, index }) => {
          if (used.has(index)) return false
          const path = normalizedFileToken((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name)
          return path.includes(externalId)
        })
    }

    if (candidates.length > 1) {
      const sourceToken = normalizedFileToken(meta.source_id)
      const narrowedByClient = candidates.filter(({ file }) => {
        const path = normalizedFileToken((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name)
        return path.includes(sourceToken) || normalizedFileToken(file.name).startsWith(sourceToken)
      })
      if (narrowedByClient.length === 1) candidates = narrowedByClient
      else if (narrowedByClient.length > 1) candidates = narrowedByClient
    }

    if (candidates.length > 1) {
      const sourceCsvToken = normalizedFileToken(meta.source_csv.replace(/\.csv$/i, ''))
      const narrowedByFolder = candidates.filter(({ file }) =>
        normalizedFileToken((file as File & { webkitRelativePath?: string }).webkitRelativePath || '').includes(sourceCsvToken)
      )
      if (narrowedByFolder.length === 1) candidates = narrowedByFolder
    }

    if (candidates.length === 1) {
      used.add(candidates[0].index)
      return { meta, file: candidates[0].file, status: 'matched' as const }
    }
    if (candidates.length > 1) return { meta, file: null, status: 'ambiguous' as const }
    return { meta, file: null, status: 'missing' as const }
  })
}

type Rule = {
  tests: string[]
  document_type: ImportDocumentType
  section_label: string
}

const RULES: Rule[] = [
  { tests: ['soa2', 'soa', 'scopeofappointment'], document_type: 'scope_of_appointment', section_label: 'Medicare Information' },
  { tests: ['cardinformation2', 'cardinformation'], document_type: 'card_information', section_label: 'Medicare Information' },
  { tests: ['medicationsphotos', 'medicationphotos'], document_type: 'medications', section_label: 'Doctors & Medications' },
  { tests: ['policydocuments', 'policydocument'], document_type: 'life_insurance', section_label: 'Life Insurance' },
  { tests: ['hipplandocument2', 'hipplandocument'], document_type: 'hospital_indemnity', section_label: 'Hospital Indemnity Plan' },
  { tests: ['plandocuments', 'planextradocuments2', 'planextradocuments'], document_type: 'health_plan', section_label: 'Health Plan Info' },
  { tests: ['pdpextra', 'pdpplaninfo2', 'pdpplaninfo', 'supplementplaninfo'], document_type: 'medicare_document', section_label: 'Medicare Information' },
  { tests: ['acafiles', 'acafile'], document_type: 'aca', section_label: 'Other Coverage Files · ACA' },
  { tests: ['dentalfiles2', 'dentalfiles'], document_type: 'dental', section_label: 'Other Coverage Files · Dental' },
  { tests: ['hearingfiles', 'hearingfile'], document_type: 'hearing', section_label: 'Other Coverage Files · Hearing' },
  { tests: ['visionfiles', 'visionfile'], document_type: 'vision', section_label: 'Other Coverage Files · Vision' },
  { tests: ['retirementfiles', 'retirementfile'], document_type: 'retirement', section_label: 'Other Coverage Files · Retirement' }
]

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function clean(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

function pick(row: CsvRow, ...keys: string[]) {
  for (const key of keys) {
    const normalizedKey = normalize(key)
    const found = Object.keys(row).find((candidate) => normalize(candidate) === normalizedKey)
    const value = found ? clean(row[found]) : null
    if (value) return value
  }
  return null
}

export function looksLikeAttachmentExportHeaders(headers: string[]) {
  const set = new Set(headers.map(normalize))
  return set.has('mayerinsurancegroupid') && (set.has('name') || set.has('filename')) && (set.has('contenttype') || set.has('storageurl') || set.has('id'))
}

export function attachmentRule(sourceCsv: string, headers: string[]): Pick<ImportAttachmentMeta, 'document_type' | 'section_label'> | null {
  const haystack = [normalize(sourceCsv), ...headers.map(normalize)].join('|')
  const rule = RULES.find((candidate) => candidate.tests.some((test) => haystack.includes(test)))
  return rule ? { document_type: rule.document_type, section_label: rule.section_label } : null
}

export function attachmentMetadataFromRows(sourceCsv: string, headers: string[], rows: CsvRow[]): ImportAttachmentMeta[] {
  const rule = attachmentRule(sourceCsv, headers)
  if (!rule) return []

  return rows.flatMap((row) => {
    const sourceId = pick(row, 'MayerInsuranceGroup_Id')
    const name = pick(row, 'Name', 'File_Name', 'FileName')
    if (!sourceId || !name) return []

    return [{
      source_id: sourceId,
      source_csv: sourceCsv,
      document_type: rule.document_type,
      section_label: rule.section_label,
      name,
      file_name: pick(row, 'File_Name', 'FileName'),
      content_type: pick(row, 'ContentType'),
      storage_url: pick(row, 'StorageUrl'),
      external_file_id: pick(row, 'Id')
    }]
  })
}


export function cognitoBulkAttachmentMatches(documentFiles: File[], sourceIds: Set<string>): ImportAttachmentMatch[] {
  return documentFiles.flatMap((file) => {
    const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    const baseName = relativePath.replace(/\\/g, '/').split('/').pop() || file.name
    // Cognito bulk downloads name files: entryId_fileSequence_originalFileName.
    const match = baseName.match(/^(\d+)_([0-9]+)_(.+)$/)
    if (!match) return []

    const sourceId = match[1]
    if (!sourceIds.has(sourceId)) return []

    const rule = attachmentRule(relativePath, [relativePath]) || {
      document_type: 'medicare_document' as const,
      section_label: 'Medicare Information'
    }
    const originalName = match[3] || file.name

    return [{
      meta: {
        source_id: sourceId,
        source_csv: 'Cognito bulk file download',
        document_type: rule.document_type,
        section_label: rule.section_label,
        name: originalName,
        file_name: originalName,
        content_type: file.type || null,
        storage_url: null,
        external_file_id: null
      },
      file,
      status: 'matched' as const
    }]
  })
}

export function prettyImportDocumentType(type: ImportDocumentType) {
  if (type === 'scope_of_appointment') return 'Scope of Appointment'
  if (type === 'card_information') return 'Card Information'
  if (type === 'medicare_document') return 'Medicare Document'
  if (type === 'medications') return 'Medication File'
  if (type === 'life_insurance') return 'Life Insurance File'
  if (type === 'health_plan') return 'Health Plan File'
  if (type === 'hospital_indemnity') return 'Hospital Indemnity File'
  if (type === 'aca') return 'ACA File'
  if (type === 'dental') return 'Dental File'
  if (type === 'hearing') return 'Hearing File'
  if (type === 'vision') return 'Vision File'
  if (type === 'retirement') return 'Retirement File'
  return 'Document'
}
