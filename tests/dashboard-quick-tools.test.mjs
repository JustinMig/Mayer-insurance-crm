import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const source = (relativePath) => readFile(path.join(root, relativePath), 'utf8')

test('Justin dashboard uses icon quick tools above the calendar instead of dashboard boxes', async () => {
  const page = await source('app/(crm)/dashboard/page.tsx')
  const quick = await source('app/(crm)/dashboard/DashboardQuickTools.tsx')

  assert.match(page, /isJustinPortal \? <DashboardQuickTools \/>/)
  assert.ok(page.indexOf('<DashboardQuickTools />') < page.indexOf('<DashboardCalendar'), 'Quick tool icons should render above the calendar')
  assert.doesNotMatch(page, /<DashboardNotes \/>/)
  assert.doesNotMatch(page, /dashboard-fex-home-tab/)
  assert.match(page, /!isJustinPortal \? <DeferredDashboardTools \/>/)

  for (const label of ['Notes', 'FEX Quotes', 'Company Directory', 'Height & Weight']) {
    assert.match(quick, new RegExp(label.replace(/[&]/g, '&')))
  }
  assert.match(quick, /dashboard-quick-backdrop/)
  assert.match(quick, /event\.target === event\.currentTarget/)
  assert.match(quick, /event\.key === 'Escape'/)
  assert.match(quick, /src="\/api\/fex-embed"/)
  assert.match(quick, /dynamic\(\(\) => import\('\.\/CompanyDirectory'\)/)
  assert.match(quick, /dynamic\(\(\) => import\('\.\/BuildChartLookup'\)/)
})
