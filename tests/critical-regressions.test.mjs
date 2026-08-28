import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

async function source(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

test('Deceased status is always submitted while Medicare credential helpers wait for the Medicare section', async () => {
  const bootstrap = await source('app/api/clients/[id]/bootstrap/route.ts')
  const enhancer = await source('app/(crm)/components/RouteScopedEnhancers.tsx')
  const deceased = await source('app/(crm)/clients/components/DeceasedStatusBridge.tsx')
  const medicareGov = await source('app/(crm)/clients/components/MedicareGovCredentialsBridge.tsx')

  assert.match(bootstrap, /Promise\.all\(/)
  assert.match(bootstrap, /from\('clients'\)/)
  assert.match(bootstrap, /from\('medicare_info'\)/)
  assert.match(enhancer, /useClientRecordActivation/)
  assert.match(enhancer, /isClientForm \? <DeceasedStatusBridge/)
  assert.match(enhancer, /isClientRecord && sections\.medicare/)
  assert.doesNotMatch(enhancer, /sections\.client \? <DeceasedStatusBridge/)
  assert.equal((deceased.match(/fetch\(/g) || []).length, 1, 'Deceased helper should load the saved status exactly once')
  assert.match(deceased, /\/api\/clients\/\$\{encodeURIComponent\(clientId\)\}\/status/)
  assert.equal((medicareGov.match(/fetch\(/g) || []).length, 1, 'Medicare.gov helper should only fetch for an explicit secure reveal')
  assert.match(medicareGov, /method:\s*'POST'/)
})

test('global CSS is partitioned so public pages do not receive the full CRM stylesheet', async () => {
  const rootLayout = await source('app/layout.tsx')
  const crmLayout = await source('app/(crm)/layout.tsx')
  const clientLayout = await source('app/(crm)/clients/[id]/layout.tsx')
  const soaLayout = await source('app/soa/layout.tsx')

  assert.match(rootLayout, /public-base\.css/)
  assert.doesNotMatch(rootLayout, /globals\.css/)
  assert.doesNotMatch(rootLayout, /performance-lite\.css/)
  assert.doesNotMatch(rootLayout, /client-record-visual\.css/)
  assert.match(crmLayout, /globals\.css/)
  assert.match(crmLayout, /performance-lite\.css/)
  assert.match(clientLayout, /client-record-visual\.css/)
  assert.match(soaLayout, /globals\.css/)
})

test('client-record visual styling is static route CSS, not client-side React', async () => {
  const enhancer = await source('app/(crm)/components/RouteScopedEnhancers.tsx')
  const layout = await source('app/(crm)/clients/[id]/layout.tsx')
  const css = await source('app/client-record-visual.css')

  assert.match(layout, /client-record-visual\.css/)
  assert.doesNotMatch(enhancer, /ClientRecordVisualStyler/)
  assert.match(css, /\.client-profile-form/)
  assert.match(css, /section-outreach-history/)
})

test('lightweight layer removes effects without overriding semantic card colors', async () => {
  const layout = await source('app/(crm)/layout.tsx')
  const enhancer = await source('app/(crm)/components/RouteScopedEnhancers.tsx')
  const lite = await source('app/performance-lite.css')
  const dashboard = await source('app/(crm)/dashboard/page.tsx')

  assert.match(layout, /performance-lite\.css/)
  assert.doesNotMatch(enhancer, /AppointmentFormStyler/)
  assert.match(lite, /backdrop-filter:\s*none !important/)
  assert.match(lite, /box-shadow:\s*none !important/)
  assert.match(lite, /transition:\s*none !important/)
  assert.match(lite, /animation:\s*none !important/)
  assert.doesNotMatch(lite, /\.crm-shell \.card[^\{]*\{[^}]*background\s*:/s)
  assert.match(dashboard, /dashboard-premium-combined/)
  assert.match(dashboard, /Monthly Premium/)
  assert.match(dashboard, /Yearly Total/)
})

test('Dashboard calendar uses one bootstrap request and defers full picker datasets until the editor opens', async () => {
  const calendar = await source('app/(crm)/dashboard/DashboardCalendar.tsx')
  const bootstrap = await source('app/api/workspace/calendar-bootstrap/route.ts')

  assert.match(calendar, /\/api\/workspace\/calendar-bootstrap/)
  assert.match(calendar, /fetchPickerOptions/)
  assert.match(calendar, /void loadPickerOptions\(\)/)
  assert.match(calendar, /pickerCache/)
  assert.match(calendar, /\/api\/workspace\/clients/)
  assert.match(calendar, /\/api\/workspace\/calendar-leads/)
  assert.doesNotMatch(calendar, /fetch\(`\/api\/workspace\/events\?/)
  assert.doesNotMatch(calendar, /fetch\(`\/api\/workspace\/queues\?/)
  assert.match(bootstrap, /Promise\.all\(/)
  assert.match(bootstrap, /linkedClients/)
  assert.match(bootstrap, /linkedLeads/)
})

test('Dashboard lookup tools and large static datasets load only when opened', async () => {
  const page = await source('app/(crm)/dashboard/page.tsx')
  const deferred = await source('app/(crm)/dashboard/DeferredDashboardTools.tsx')
  const directory = await source('app/(crm)/dashboard/CompanyDirectory.tsx')
  const endpoint = await source('app/api/dashboard/company-contacts/route.ts')
  const dashboardLayout = await source('app/(crm)/dashboard/layout.tsx')

  assert.match(page, /DeferredDashboardTools/)
  assert.doesNotMatch(page, /COMPANY_CONTACTS/)
  assert.doesNotMatch(page, /<CompanyDirectory/)
  assert.match(deferred, /dynamic\(\(\) => import\('\.\/CompanyDirectory'\)/)
  assert.match(deferred, /dynamic\(\(\) => import\('\.\/BuildChartLookup'\)/)
  assert.match(deferred, /onToggle/)
  assert.match(directory, /\/api\/dashboard\/company-contacts/)
  assert.match(endpoint, /COMPANY_CONTACTS/)
  assert.match(dashboardLayout, /dashboard-performance\.css/)
})

test('client record uses one RLS-preserving database bundle instead of many startup table requests', async () => {
  const page = await source('app/(crm)/clients/[id]/page.tsx')
  const migration = await source('supabase/migrations/20260827214500_client_record_bundle.sql')

  assert.match(page, /rpc\('crm_client_record_bundle'/)
  assert.doesNotMatch(page, /supabase\.from\('medicare_info'\)/)
  assert.doesNotMatch(page, /supabase\.from\('client_care_info'\)/)
  assert.doesNotMatch(page, /supabase\.from\('client_life_insurance'\)/)
  assert.match(migration, /security invoker/i)
  assert.match(migration, /grant execute on function public\.crm_client_record_bundle\(uuid\) to authenticated/i)
  assert.match(migration, /'documents'/)
})

test('global navigation is rendered directly without portal or mutation work', async () => {
  const layout = await source('app/(crm)/layout.tsx')
  const enhancer = await source('app/(crm)/components/RouteScopedEnhancers.tsx')
  const previous = await source('app/(crm)/components/PreviousPageButton.tsx')

  assert.match(layout, /<PreviousPageButton/)
  assert.match(layout, /href="\/campaigns"/)
  assert.doesNotMatch(enhancer, /PreviousPageButton/)
  assert.doesNotMatch(enhancer, /CallListNavLinks/)
  assert.doesNotMatch(previous, /createPortal/)
  assert.doesNotMatch(previous, /document\.createElement/)
})

test('iPhone keeps only bottom navigation fixed and save controls in document flow', async () => {
  const ios = await source('app/iphone-crm-fixes.css')
  assert.match(ios, /\.mobile-nav\s*\{[\s\S]*position:\s*fixed !important/)
  assert.match(ios, /\.topbar\s*\{[\s\S]*position:\s*relative !important/)
  assert.match(ios, /\.add-client-form > \.add-client-save-row,[\s\S]*\.client-profile-form > \.sticky-save-bar\s*\{[\s\S]*position:\s*relative !important/)
  assert.doesNotMatch(ios, /\.add-client-form \.add-client-save-row\s*\{[\s\S]*position:\s*fixed/)
  assert.match(ios, /padding-bottom:\s*calc\(64px \+ env\(safe-area-inset-bottom\)\)/)
})

test('push notification setup is cached within the browser session', async () => {
  const push = await source('app/(crm)/components/PushNotificationManager.tsx')
  assert.match(push, /CONFIG_CACHE_KEY/)
  assert.match(push, /SYNCED_ENDPOINT_KEY/)
  assert.match(push, /sessionStorage\.getItem/)
  assert.match(push, /sessionStorage\.setItem/)
})

test('CRM session lookup remains request-deduplicated', async () => {
  const session = await source('lib/crm-session.ts')
  assert.match(session, /import \{ cache \} from 'react'/)
  assert.match(session, /getCrmSession = cache\(async \(\) =>/)
})

test('notification polling remains throttled to five minutes or slower', async () => {
  const notifications = await source('app/(crm)/components/NotificationsNavLink.tsx')
  const match = notifications.match(/const POLL_INTERVAL_MS = (\d+) \* 60_000/)
  assert.ok(match, 'Expected a minute-based notification poll interval')
  assert.ok(Number(match[1]) >= 5, `Notification polling regressed to ${match[1]} minute(s)`)
})

test('Mail Center background sync remains five minutes or slower', async () => {
  const mail = await source('app/(crm)/mail-center/MailCenterRefresh.tsx')
  const match = mail.match(/const POLL_INTERVAL_MS = (\d+) \* 60_000/)
  assert.ok(match, 'Expected a minute-based Mail Center interval')
  assert.ok(Number(match[1]) >= 5, `Mail Center polling regressed to ${match[1]} minute(s)`)
  assert.match(mail, /VISIBILITY_REFRESH_MIN_MS/)
})

test('sensitive reveal endpoint stays no-store and audited', async () => {
  const sensitive = await source('app/api/clients/[id]/sensitive/route.ts')
  assert.match(sensitive, /Cache-Control': 'no-store, no-cache, must-revalidate, private'/)
  assert.match(sensitive, /action: 'sensitive\.revealed'/)
  assert.match(sensitive, /RLS decides whether this user is allowed to view the client/)
})

test('public edge protection headers remain configured', async () => {
  const config = await source('next.config.ts')
  assert.match(config, /X-Content-Type-Options/)
  assert.match(config, /X-Frame-Options/)
  assert.match(config, /Referrer-Policy/)
  assert.match(config, /Permissions-Policy/)
})
