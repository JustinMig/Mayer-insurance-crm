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

test('client-record startup helpers share one bootstrap request', async () => {
  const bootstrap = await source('app/api/clients/[id]/bootstrap/route.ts')
  const enhancer = await source('app/(crm)/components/RouteScopedEnhancers.tsx')
  const deceased = await source('app/(crm)/clients/components/DeceasedStatusBridge.tsx')
  const medicareGov = await source('app/(crm)/clients/components/MedicareGovCredentialsBridge.tsx')

  assert.match(bootstrap, /Promise\.all\(/)
  assert.match(bootstrap, /from\('clients'\)/)
  assert.match(bootstrap, /from\('medicare_info'\)/)
  assert.match(enhancer, /ClientRecordBootstrapProvider/)
  assert.equal((deceased.match(/fetch\(/g) || []).length, 0, 'Deceased helper should not launch its own startup API request')
  assert.equal((medicareGov.match(/fetch\(/g) || []).length, 1, 'Medicare.gov helper should only fetch for an explicit secure reveal')
  assert.match(medicareGov, /method:\s*'POST'/)
})

test('client-record visual styling is static CSS, not client-side React', async () => {
  const layout = await source('app/layout.tsx')
  const enhancer = await source('app/(crm)/components/RouteScopedEnhancers.tsx')
  const css = await source('app/client-record-visual.css')

  assert.match(layout, /client-record-visual\.css/)
  assert.doesNotMatch(enhancer, /ClientRecordVisualStyler/)
  assert.match(css, /\.client-profile-form/)
  assert.match(css, /section-outreach-history/)
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
