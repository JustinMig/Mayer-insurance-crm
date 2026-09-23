import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Sheena can assign dashboard and campaign appointments to Sheena, Justin, or Isaiah', async () => {
  const access = await readFile('lib/calendar-access.ts', 'utf8')
  const dashboardPage = await readFile('app/(crm)/dashboard/page.tsx', 'utf8')
  const dashboardCalendar = await readFile('app/(crm)/dashboard/DashboardCalendar.tsx', 'utf8')
  const campaignPage = await readFile('app/(crm)/campaigns/[id]/page.tsx', 'utf8')
  const campaignClient = await readFile('app/(crm)/campaigns/[id]/CampaignDetailClient.tsx', 'utf8')
  const memberActions = await readFile('app/api/outreach-campaigns/member-actions/route.ts', 'utf8')

  assert.match(access, /APPOINTMENT_AGENT_IDS = \[SHEENA_CALENDAR_USER_ID, JUSTIN_CALENDAR_USER_ID, ISAIAH_CALENDAR_USER_ID\]/)
  assert.match(access, /Choose Sheena, Justin, or Isaiah/)
  assert.match(dashboardPage, /\[sheenaCalendarAgent, \.\.\.targetAgents\]/)
  assert.match(dashboardPage, /appointmentAgents=\{isCalendarCoordinator \? calendarAvailableAgents : calendarAgents\}/)
  assert.match(dashboardCalendar, /appointmentAgents = agents/)
  assert.match(dashboardCalendar, /Appointment For/)
  assert.match(campaignPage, /appointmentAgents=\{appointmentAgents\}/)
  assert.match(campaignClient, /Appointment For/)
  assert.match(campaignClient, /assigned_agent_id: appointmentOwnerId/)
  assert.match(memberActions, /resolveCalendarOwner/)
  assert.match(memberActions, /appointmentOwnerId/)
})
