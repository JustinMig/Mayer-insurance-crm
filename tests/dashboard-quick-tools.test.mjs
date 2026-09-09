import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const source = (relativePath) => readFile(path.join(root, relativePath), 'utf8')

test('Justin quick tools stay in the global CRM header and page-specific controls live on their pages', async () => {
  const layout = await source('app/(crm)/layout.tsx')
  const dashboard = await source('app/(crm)/dashboard/page.tsx')
  const quick = await source('app/(crm)/dashboard/DashboardQuickTools.tsx')
  const appointment = await source('app/(crm)/dashboard/AppointmentQuickSetter.tsx')
  const clients = await source('app/(crm)/clients/page.tsx')
  const notifications = await source('app/(crm)/notifications/page.tsx')
  const campaignPage = await source('app/(crm)/campaigns/[id]/page.tsx')

  assert.match(layout, /isJustinAdmin \? <DashboardQuickTools compact \/>/)
  assert.doesNotMatch(layout, /COMPARE CLIENTS/)
  assert.doesNotMatch(layout, /<PushNotificationManager \/>/)
  assert.doesNotMatch(dashboard, /<DashboardQuickTools/)
  assert.match(quick, /compact = false/)
  assert.match(quick, /dashboard-quick-tools\$\{compact/)

  for (const label of ['Appointments', 'Notes', 'FEX Quotes', 'Company Directory', 'Height & Weight']) {
    assert.match(quick, new RegExp(label.replace(/[&]/g, '&')))
  }
  assert.match(quick, /AppointmentQuickSetter/)
  assert.match(quick, /dashboard-quick-tool-appointments/)
  assert.match(quick, /dashboard-quick-backdrop/)
  assert.match(quick, /event\.target === event\.currentTarget/)
  assert.match(quick, /event\.key === 'Escape'/)

  assert.match(appointment, /\/api\/workspace\/clients\?q=/)
  assert.match(appointment, /\/api\/workspace\/calendar-availability/)
  assert.match(appointment, /\/api\/workspace\/events/)
  assert.match(appointment, /WORKDAY_START = 8 \* 60/)
  assert.match(appointment, /WORKDAY_END = 20 \* 60/)
  assert.match(appointment, /BOOKED/)
  assert.match(appointment, /event_type: 'appointment'/)
  assert.match(appointment, /NEW \/ NON-CLIENT/)
  assert.match(appointment, /New client name/)
  assert.match(appointment, /Phone number/)
  assert.match(appointment, /Phone: \$\{phone\}/)
  assert.match(appointment, /client_id: mode === 'existing'/)

  assert.match(campaignPage, /campaign-record-actions>button:nth-last-child\(2\)/)
  assert.match(clients, /COMPARE CLIENTS/)
  assert.match(clients, /href="\/clients\/duplicates"/)
  assert.match(notifications, /PushNotificationManager/)
  assert.match(notifications, /<PushNotificationManager \/>/)
})
