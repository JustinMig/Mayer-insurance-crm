import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Justin dashboard keeps premium totals and uses Medicare commission card instead of client count tiles', async () => {
  const page = await readFile('app/(crm)/dashboard/page.tsx', 'utf8')
  const card = await readFile('app/(crm)/dashboard/JustinMedicareCommissionCard.tsx', 'utf8')
  assert.match(page, /isJustinPortal \? \(/)
  assert.match(page, /<JustinMedicareCommissionCard \/>/)
  assert.match(page, /dashboard-justin-financial-stats/)
  assert.match(card, /2027: \{ initial: 725, renewal: 363 \}/)
  assert.match(card, /Medicare Commissions/)
  assert.match(card, /AEP/)
  assert.match(card, /OEP/)
  assert.match(card, /SEP/)
  assert.match(card, /T65 \/ IEP/)
  assert.match(card, /Monthly Renewal Equivalent/)
  assert.match(card, /Projected January/)
  assert.match(card, /CMS MAXIMUM ESTIMATE/)
})
