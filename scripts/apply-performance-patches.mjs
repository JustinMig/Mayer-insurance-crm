import { readFileSync, writeFileSync } from 'node:fs'

const changedFiles = []

function patchFile(path, transform) {
  const before = readFileSync(path, 'utf8')
  const after = transform(before)
  if (after !== before) {
    writeFileSync(path, after)
    changedFiles.push(path)
  }
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source
  if (!source.includes(before)) {
    throw new Error(`Performance patch target not found: ${label}`)
  }
  return source.replace(before, after)
}

function replaceBetween(source, start, end, replacement, marker, label) {
  if (source.includes(marker)) return source
  const startIndex = source.indexOf(start)
  if (startIndex < 0) throw new Error(`Performance patch start not found: ${label}`)
  const endIndex = source.indexOf(end, startIndex)
  if (endIndex < 0) throw new Error(`Performance patch end not found: ${label}`)
  return source.slice(0, startIndex) + replacement + source.slice(endIndex)
}

// Prevent /clients/new from being treated as a UUID-backed client record.
patchFile('app/(crm)/clients/components/LeadInfoBridge.tsx', (source) => replaceOnce(
  source,
  String.raw`  const clientId = useMemo(() => {
    const match = pathname.match(/^\/clients\/([^/]+)$/)
    return match?.[1] || ''
  }, [pathname])`,
  String.raw`  const clientId = useMemo(() => {
    const match = pathname.match(/^\/clients\/([^/]+)$/)
    const value = match?.[1] || ''
    return value && value !== 'new' ? value : ''
  }, [pathname])`,
  'LeadInfoBridge new-client UUID guard'
))

// Load dashboard totals from compact RLS-aware rollups instead of every client row.
patchFile('app/(crm)/dashboard/page.tsx', (source) => {
  source = replaceOnce(
    source,
    String.raw`type PremiumRollupRow = {
  assigned_agent_id: string | null
  effective_year: number | null
  effective_month: number | null
  premium_total: number | string | null
}`,
    String.raw`type PremiumRollupRow = {
  assigned_agent_id: string | null
  effective_year: number | null
  effective_month: number | null
  premium_total: number | string | null
}

type ClientDashboardRollupRow = {
  assigned_agent_id: string | null
  total_clients: number | string | null
  medicare_clients: number | string | null
  life_clients: number | string | null
  turning_65: number | string | null
}`,
    'dashboard rollup type'
  )

  source = replaceOnce(
    source,
    "  const turn65Year = currentYear - 65\n",
    '',
    'remove dashboard client-row year calculation'
  )

  source = replaceOnce(
    source,
    String.raw`    targetAgentIds.length
      ? supabase
          .from('clients')
          .select('assigned_agent_id,is_medicare,is_life,date_of_birth')
          .in('assigned_agent_id', targetAgentIds)
      : Promise.resolve({ data: [], error: null })`,
    String.raw`    targetAgentIds.length
      ? supabase
          .from('client_dashboard_rollup')
          .select('assigned_agent_id,total_clients,medicare_clients,life_clients,turning_65')
          .in('assigned_agent_id', targetAgentIds)
      : Promise.resolve({ data: [], error: null })`,
    'dashboard compact client rollup query'
  )

  source = replaceOnce(
    source,
    String.raw`  const clientRows = (clientStatsResult.data || []) as Array<{
    assigned_agent_id: string | null
    is_medicare: boolean | null
    is_life: boolean | null
    date_of_birth: string | null
  }>`,
    String.raw`  const clientRollupRows = (clientStatsResult.data || []) as ClientDashboardRollupRow[]`,
    'dashboard rollup result mapping'
  )

  source = replaceOnce(
    source,
    '    for (const client of clientRows) {\n' +
      '      if (client.assigned_agent_id !== agent.id) continue\n' +
      '      totalClients += 1\n' +
      '      if (client.is_medicare) medicareClients += 1\n' +
      '      if (client.is_life) lifeClients += 1\n' +
      '      if (client.date_of_birth?.startsWith(`${turn65Year}-`)) turning65 += 1\n' +
      '    }',
    String.raw`    const clientRollup = clientRollupRows.find((row) => row.assigned_agent_id === agent.id)
    totalClients = numeric(clientRollup?.total_clients)
    medicareClients = numeric(clientRollup?.medicare_clients)
    lifeClients = numeric(clientRollup?.life_clients)
    turning65 = numeric(clientRollup?.turning_65)`,
    'dashboard rollup aggregation'
  )

  return source
})

// Use compact views for Client Records company options and totals.
patchFile('app/(crm)/clients/page.tsx', (source) => {
  source = replaceOnce(
    source,
    String.raw`  const healthCompaniesPromise = supabase
    .from('client_health_plan_info')
    .select('company_name')
    .eq('agency_id', currentProfile.agency_id)
    .not('company_name', 'is', null)
    .order('company_name', { ascending: true })`,
    String.raw`  const healthCompaniesPromise = supabase
    .from('health_plan_company_options')
    .select('company_name')
    .eq('agency_id', currentProfile.agency_id)
    .order('company_name', { ascending: true })`,
    'Client Records distinct health company view'
  )

  const countStart = String.raw`  if (totalCountAgentId || canFilterByAgent) {`
  const countEnd = String.raw`
  let clients: any[] = []`
  const countReplacement = String.raw`  if (totalCountAgentId || canFilterByAgent) {
    let rollupQuery = supabase
      .from('client_dashboard_rollup')
      .select('total_clients,medicare_clients,non_medicare_clients')

    if (totalCountAgentId) {
      rollupQuery = rollupQuery.eq('assigned_agent_id', totalCountAgentId)
    }

    const rollupResult = await rollupQuery
    const rollupRows = rollupResult.data || []

    for (const row of rollupRows) {
      totalClientCount += Number(row.total_clients || 0)
      totalMedicareCount += Number(row.medicare_clients || 0)
      totalNonMedicareCount += Number(row.non_medicare_clients || 0)
    }

    totalCountError = rollupResult.error?.message || ''
  }
`
  source = replaceBetween(
    source,
    countStart,
    countEnd,
    countReplacement,
    ".from('client_dashboard_rollup')\n      .select('total_clients,medicare_clients,non_medicare_clients')",
    'Client Records compact count rollup'
  )

  return source
})

// Fetch the main client row and all detail sections in one concurrent database wave.
patchFile('app/(crm)/clients/[id]/page.tsx', (source) => {
  const start = String.raw`  const { data: client } = await supabase.from('clients').select('*').eq('id', id).maybeSingle()`
  const end = String.raw`  const agentEmail = String(claims.email || '')`
  const replacement = String.raw`  const canAssignAgents = profile?.role === 'admin' || profile?.role === 'manager'
  const [
    { data: client },
    { data: medicare },
    { data: careInfo },
    { data: specialists },
    { data: medications },
    { data: lifeInsurance },
    { data: healthPlan },
    { data: hospitalIndemnity },
    { data: banking },
    { data: documents },
    agentsResult
  ] = await Promise.all([
    supabase.from('clients').select('*').eq('id', id).maybeSingle(),
    supabase.from('medicare_info').select('*').eq('client_id', id).maybeSingle(),
    supabase.from('client_care_info').select('*').eq('client_id', id).maybeSingle(),
    supabase.from('client_specialists').select('*').eq('client_id', id).order('slot'),
    supabase.from('client_medications').select('*').eq('client_id', id).order('sort_order').order('created_at'),
    supabase.from('client_life_insurance').select('*').eq('client_id', id).maybeSingle(),
    supabase.from('client_health_plan_info').select('*').eq('client_id', id).maybeSingle(),
    supabase.from('client_hospital_indemnity').select('*').eq('client_id', id).maybeSingle(),
    supabase.from('client_banking_info').select('*').eq('client_id', id).maybeSingle(),
    supabase.from('documents').select('id, file_name, mime_type, document_type, created_at').eq('client_id', id).order('created_at', { ascending: false }),
    canAssignAgents && profile?.agency_id
      ? supabase.from('profiles').select('id, full_name, role, active').eq('agency_id', profile.agency_id).eq('active', true).in('role', ['admin', 'agent']).order('full_name')
      : Promise.resolve({ data: null, error: null })
  ])

  if (!client) notFound()

`
  return replaceBetween(
    source,
    start,
    end,
    replacement,
    "supabase.from('clients').select('*').eq('id', id).maybeSingle(),\n    supabase.from('medicare_info')",
    'client profile concurrent data load'
  )
})

// Replace four dashboard calendar HTTP requests with one authenticated bootstrap request.
patchFile('app/(crm)/dashboard/DashboardCalendar.tsx', (source) => {
  const start = String.raw`  const loadCalendar = useCallback(async () => {`
  const end = String.raw`
  useEffect(() => { void loadCalendar() }, [loadCalendar])`
  const replacement = String.raw`  const loadCalendar = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        from: isoDate(range.start),
        to: isoDate(range.end),
        date: todayKey,
        owner: defaultOwner
      })
      const response = await fetch('/api/workspace/calendar-bootstrap?' + params.toString(), { cache: 'no-store' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to load dashboard calendar.')

      setEvents(Array.isArray(result.events) ? result.events : [])
      setTodayAppointments(Array.isArray(result.today) ? result.today : [])
      setRescheduledAppointments(Array.isArray(result.rescheduled) ? result.rescheduled : [])
      setClients(Array.isArray(result.clients) ? result.clients : [])
      setLeads(Array.isArray(result.leads) ? result.leads : [])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard calendar.')
    } finally {
      setLoading(false)
    }
  }, [range.start, range.end, todayKey, defaultOwner])
`
  return replaceBetween(
    source,
    start,
    end,
    replacement,
    '/api/workspace/calendar-bootstrap?',
    'dashboard consolidated calendar bootstrap'
  )
})

// The dedicated Leads app only needs leads; skip hidden calendar/client requests.
patchFile('app/(crm)/workspace/WorkspaceClient.tsx', (source) => {
  source = replaceOnce(
    source,
    String.raw`export default function WorkspaceClient({ viewerId, viewerName, isManager, agents }: {
  viewerId: string
  viewerName: string
  isManager: boolean
  agents: Agent[]
}) {`,
    String.raw`export default function WorkspaceClient({ viewerId, viewerName, isManager, agents, leadsOnly = false }: {
  viewerId: string
  viewerName: string
  isManager: boolean
  agents: Agent[]
  leadsOnly?: boolean
}) {`,
    'WorkspaceClient leads-only property'
  )

  source = replaceOnce(
    source,
    String.raw`  const [loadingLeads, setLoadingLeads] = useState(true)
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [loadingQueues, setLoadingQueues] = useState(true)`,
    String.raw`  const [loadingLeads, setLoadingLeads] = useState(true)
  const [loadingEvents, setLoadingEvents] = useState(!leadsOnly)
  const [loadingQueues, setLoadingQueues] = useState(!leadsOnly)`,
    'WorkspaceClient leads-only loading state'
  )

  source = replaceOnce(
    source,
    String.raw`  useEffect(() => { void loadLeads() }, [loadLeads])
  useEffect(() => { void loadClients() }, [loadClients])
  useEffect(() => { void loadEvents() }, [loadEvents])
  useEffect(() => { void loadQueues() }, [loadQueues])`,
    String.raw`  useEffect(() => { void loadLeads() }, [loadLeads])
  useEffect(() => { if (!leadsOnly) void loadClients() }, [loadClients, leadsOnly])
  useEffect(() => { if (!leadsOnly) void loadEvents() }, [loadEvents, leadsOnly])
  useEffect(() => { if (!leadsOnly) void loadQueues() }, [loadQueues, leadsOnly])`,
    'WorkspaceClient skip hidden Leads requests'
  )

  return source
})

patchFile('app/(crm)/leads/page.tsx', (source) => replaceOnce(
  source,
  String.raw`        isManager={isManager}
        agents={agents}
      />`,
  String.raw`        isManager={isManager}
        agents={agents}
        leadsOnly
      />`,
  'Leads page leads-only mode'
))

if (changedFiles.length) {
  console.log(`Applied CRM performance patches to ${changedFiles.length} file(s):`)
  for (const path of changedFiles) console.log(`- ${path}`)
} else {
  console.log('CRM performance patches already applied.')
}
