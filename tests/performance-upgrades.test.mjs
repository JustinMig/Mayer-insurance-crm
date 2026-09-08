import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = (relativePath) => readFile(path.join(root, relativePath), 'utf8')

test('Leads uses the dedicated lightweight client instead of legacy WorkspaceClient', async () => {
  const page = await source('app/(crm)/leads/page.tsx')
  const leads = await source('app/(crm)/leads/LeadsClient.tsx')
  assert.match(page, /LeadsClient/)
  assert.doesNotMatch(page, /WorkspaceClient/)
  assert.doesNotMatch(page, /WorkspaceLeadCollapseController/)
  assert.match(leads, /\/api\/workspace\/leads/)
  assert.doesNotMatch(leads, /\/api\/workspace\/events/)
  assert.doesNotMatch(leads, /\/api\/workspace\/queues/)
})

test('Client Records uses one count RPC and paginates every result set', async () => {
  const page = await source('app/(crm)/clients/page.tsx')
  assert.match(page, /rpc\('crm_client_counts'/)
  assert.doesNotMatch(page, /\.limit\(250\)/)
  assert.match(page, /select\([^\n]+\{ count: 'exact' \}\)/)
  assert.match(page, /query = query\.range\(from, from \+ pageSize - 1\)/)
  assert.match(page, /pagination=\{\{ page, pageSize, total: filteredTotal/)
})

test('Calendar client source no longer has a 1000-client hard limit', async () => {
  const route = await source('app/api/workspace/clients/route.ts')
  assert.match(route, /crm_client_search/)
  assert.match(route, /BATCH_SIZE = 500/)
  assert.match(route, /while \(true\)/)
  assert.doesNotMatch(route, /\.limit\(1000\)/)
})

test('Dashboard statistics are aggregated in the database', async () => {
  const page = await source('app/(crm)/dashboard/page.tsx')
  assert.match(page, /crm_dashboard_agent_stats/)
  assert.doesNotMatch(page, /from\('clients'\).*is_medicare.*date_of_birth/s)
  assert.match(page, /<DashboardQuickTools \/>/)
  assert.doesNotMatch(page, /<DashboardNotes \/>/)
})

test('Dashboard Notes and Text SOA no longer use DOM bridge files', async () => {
  const enhancer = await source('app/(crm)/components/RouteScopedEnhancers.tsx')
  const soa = await source('app/(crm)/components/ClientSoaTextAction.tsx')
  assert.doesNotMatch(enhancer, /DashboardNotesBridge/)
  assert.doesNotMatch(enhancer, /SoaTextBridge/)
  assert.match(enhancer, /ClientSoaTextAction/)
  assert.doesNotMatch(soa, /MutationObserver/)
  assert.doesNotMatch(soa, /createPortal/)
})

test('New Client heavy form is split into a deferred client chunk', async () => {
  const page = await source('app/(crm)/clients/new/page.tsx')
  const loader = await source('app/(crm)/clients/new/NewClientFormLoader.tsx')
  assert.match(page, /NewClientFormLoader/)
  assert.doesNotMatch(page, /from '\.\/NewClientForm'/)
  assert.match(loader, /dynamic\(\(\) => import\('\.\/NewClientForm'\)/)
  assert.match(loader, /ssr: false/)
})

test('Mass texting is queued as background work with progress endpoint', async () => {
  const bulk = await source('app/api/sms/bulk/route.ts')
  const jobs = await source('lib/background-jobs.ts')
  const progress = await source('app/api/jobs/[id]/route.ts')
  const ui = await source('app/(crm)/clients/MassTextSelected.tsx')
  assert.match(bulk, /crm_background_jobs/)
  assert.match(bulk, /after\(async/)
  assert.match(bulk, /status: 'queued'/)
  assert.match(jobs, /processBulkSmsJob/)
  assert.match(progress, /crm_background_jobs/)
  assert.match(ui, /\/api\/jobs\/\$\{job\.id\}/)
})

test('System Health collects real-device performance and storage integrity', async () => {
  const layout = await source('app/(crm)/layout.tsx')
  const reporter = await source('app/(crm)/components/WebVitalsReporter.tsx')
  const health = await source('app/api/system-health/route.ts')
  assert.match(layout, /WebVitalsReporter/)
  assert.match(reporter, /PerformanceObserver/)
  assert.match(reporter, /LONG_TASK/)
  assert.match(health, /crm_storage_integrity/)
  assert.match(health, /crm_performance_events/)
})

test('Medicare network status uses persistent exact plan-NPI-office cache', async () => {
  const route = await source('app/api/providers/network-status/route.ts')
  assert.match(route, /medicare_network_verification_cache/)
  assert.match(route, /exactLocationKey/)
  assert.match(route, /persistExactResult/)
  assert.match(route, /exact_cache_hits/)
})

test('performance CSS skips offscreen long-form rendering', async () => {
  const css = await source('app/performance-lite.css')
  assert.match(css, /content-visibility:\s*auto/)
  assert.match(css, /contain-intrinsic-size/)
})
