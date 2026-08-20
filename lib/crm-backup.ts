type SupabaseLike = any

type BackupStorageFile = {
  storagePath: string
  size: number
  mimeType: string
  driveName: string
}

const PAGE_SIZE = 1000
const STORAGE_PAGE_SIZE = 100
const CLIENT_DOCUMENT_BUCKET = 'client-documents'

async function selectAll(
  supabase: SupabaseLike,
  table: string,
  applyFilter?: (query: any) => any,
) {
  const rows: any[] = []
  let from = 0

  while (true) {
    let query = supabase.from(table).select('*').order('id', { ascending: true })
    if (applyFilter) query = applyFilter(query)
    query = query.range(from, from + PAGE_SIZE - 1)

    const { data, error } = await query
    if (error) throw new Error(`Unable to back up ${table}: ${error.message}`)

    const page = data || []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}

async function selectAllInChunks(
  supabase: SupabaseLike,
  table: string,
  column: string,
  values: string[],
) {
  if (!values.length) return []
  const rows: any[] = []
  const chunkSize = 100

  for (let index = 0; index < values.length; index += chunkSize) {
    const chunk = values.slice(index, index + chunkSize)
    rows.push(...await selectAll(supabase, table, query => query.in(column, chunk)))
  }

  return rows
}

export async function buildAgencyDatabaseBackup(
  supabase: SupabaseLike,
  agencyId: string,
) {
  const tables: Record<string, any[]> = {}

  tables.agencies = await selectAll(supabase, 'agencies', query => query.eq('id', agencyId))
  tables.profiles = await selectAll(supabase, 'profiles', query => query.eq('agency_id', agencyId))
  tables.clients = await selectAll(supabase, 'clients', query => query.eq('agency_id', agencyId))

  const agencyTables = [
    'medicare_info',
    'client_care_info',
    'client_specialists',
    'client_medications',
    'client_life_insurance',
    'client_health_plan_info',
    'client_hospital_indemnity',
    'client_banking_info',
    'documents',
    'audit_log',
    'soa_signature_requests',
    'website_leads',
    'workspace_calendar_events',
    'workspace_leads',
    'dashboard_notes',
  ]

  for (const table of agencyTables) {
    tables[table] = await selectAll(supabase, table, query => query.eq('agency_id', agencyId))
  }

  const clientIds = tables.clients.map(row => String(row.id))
  const profileIds = tables.profiles.map(row => String(row.id))

  tables.client_sms_messages = await selectAllInChunks(
    supabase,
    'client_sms_messages',
    'client_id',
    clientIds,
  )

  tables.crm_mail = await selectAllInChunks(
    supabase,
    'crm_mail',
    'user_id',
    profileIds,
  )

  const tableCounts = Object.fromEntries(
    Object.entries(tables).map(([table, rows]) => [table, rows.length]),
  )

  return {
    version: 1,
    format: 'mayer-crm-agency-backup',
    generated_at: new Date().toISOString(),
    agency_id: agencyId,
    table_counts: tableCounts,
    excluded_for_security: [
      'gmail_connections (OAuth access and refresh tokens)',
      'application environment secrets including DATA_ENCRYPTION_KEY_BASE64',
      'Supabase Auth passwords and sessions',
    ],
    excluded_rebuildable_reference_data: [
      'medicare_plans',
      'medicare_plan_counties',
      'medicare_network_providers',
      'medicare_provider_plan_networks',
      'medicare_data_refresh_state',
      'zip_coordinates',
    ],
    tables,
  }
}

async function listStorageDirectory(
  supabase: SupabaseLike,
  prefix: string,
  files: Array<Omit<BackupStorageFile, 'driveName'>>,
) {
  let offset = 0

  while (true) {
    const { data, error } = await supabase.storage
      .from(CLIENT_DOCUMENT_BUCKET)
      .list(prefix, {
        limit: STORAGE_PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })

    if (error) throw new Error(`Unable to list client documents: ${error.message}`)

    const page = data || []
    for (const item of page) {
      const path = prefix ? `${prefix}/${item.name}` : item.name
      if (item.id !== null && item.id !== undefined) {
        files.push({
          storagePath: path,
          size: Number(item.metadata?.size || 0),
          mimeType: String(item.metadata?.mimetype || item.metadata?.contentType || 'application/octet-stream'),
        })
      } else {
        await listStorageDirectory(supabase, path, files)
      }
    }

    if (page.length < STORAGE_PAGE_SIZE) break
    offset += STORAGE_PAGE_SIZE
  }
}

function safeDriveName(value: string) {
  const cleaned = value
    .replace(/[\\/\u0000-\u001f\u007f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned || 'client-file').slice(0, 230)
}

function buildClientNameMap(clients: any[]) {
  return new Map(
    clients.map(client => [
      String(client.id),
      safeDriveName(`${client.last_name || 'Client'}, ${client.first_name || ''}`),
    ]),
  )
}

export async function listAgencyBackupFiles(
  supabase: SupabaseLike,
  agencyId: string,
  clients: any[],
): Promise<BackupStorageFile[]> {
  const rawFiles: Array<Omit<BackupStorageFile, 'driveName'>> = []
  await listStorageDirectory(supabase, agencyId, rawFiles)

  const clientNames = buildClientNameMap(clients)
  return rawFiles.map(file => {
    const parts = file.storagePath.split('/')
    const clientId = parts[1] || 'unknown-client'
    const originalName = parts.slice(2).join('__') || parts.at(-1) || 'client-file'
    const clientName = clientNames.get(clientId) || 'Unknown Client'
    const driveName = safeDriveName(`${clientName} - ${clientId.slice(0, 8)} - ${originalName}`)

    return {
      ...file,
      driveName,
    }
  })
}

export function backupReadmeText() {
  return [
    'Mayer Insurance Group CRM Backup',
    '',
    'This folder contains a manual point-in-time copy of the CRM database and private client documents.',
    '',
    'DATABASE:',
    '- database.json.gz contains raw database rows used by the CRM.',
    '- Sensitive identifiers remain encrypted exactly as they are stored in the live CRM.',
    '- Restoring encrypted values requires the matching DATA_ENCRYPTION_KEY_BASE64 configured in the CRM hosting environment.',
    '- That encryption key is intentionally NOT stored in this Google Drive backup.',
    '',
    'DOCUMENTS:',
    '- Client Documents contains copies of the private files stored in Supabase Storage.',
    '- The database backup preserves each original Supabase storage path for restoration.',
    '',
    'SECURITY EXCLUSIONS:',
    '- Google OAuth tokens are not included.',
    '- Login passwords, sessions, and hosting secrets are not included.',
    '- Rebuildable Medicare plan/provider reference datasets are not included.',
    '',
    'Keep access to this Google Drive folder restricted to authorized agency personnel.',
  ].join('\n')
}

export function summarizeStorageFiles(files: BackupStorageFile[]) {
  return {
    file_count: files.length,
    total_bytes: files.reduce((sum, file) => sum + file.size, 0),
  }
}
