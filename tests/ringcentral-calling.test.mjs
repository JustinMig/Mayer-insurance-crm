import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getCallPlatform, requiresAppleCallingSetup, ringCentralCallHref, toRingCentralNumber } from '../lib/ringcentral-call-target.ts'

const devices = [
  ['mac', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.0 Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 0 }],
  ['mac', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/140 Safari/537.36', platform: 'MacIntel', maxTouchPoints: 0 }],
  ['ios', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) Version/18 Safari/604.1', platform: 'iPhone', maxTouchPoints: 5 }],
  ['ios', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18 Safari/605.1', platform: 'MacIntel', maxTouchPoints: 5 }],
  ['ios', { userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X)', platform: 'iPad', maxTouchPoints: 5 }],
  ['android', { userAgent: 'Mozilla/5.0 (Linux; Android 15) Chrome/140 Mobile Safari/537.36', platform: 'Linux armv8l' }],
  ['desktop', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140 Safari/537.36', platform: 'Win32' }]
]

for (const [expected, device] of devices) {
  test(`detect ${expected}: ${device.platform} / touch ${device.maxTouchPoints || 0}`, () => {
    assert.equal(getCallPlatform(device), expected)
  })
}

test('every Apple device uses standard tel without private app protocols or web URLs', () => {
  for (const [platform] of devices.filter(([p]) => p === 'mac' || p === 'ios')) {
    assert.equal(ringCentralCallHref('(662) 555-0100', platform), 'tel:+16625550100')
    assert.equal(requiresAppleCallingSetup(platform), true)
  }
})

test('non-Apple native call targets remain unchanged', () => {
  assert.equal(ringCentralCallHref('16625550100', 'desktop'), 'rcapp://r/call?number=16625550100')
  assert.equal(ringCentralCallHref('16625550100', 'android'), 'rcmobile://call?number=16625550100')
  assert.equal(requiresAppleCallingSetup('desktop'), false)
  assert.equal(requiresAppleCallingSetup('android'), false)
})

test('normalization retains the client number and adds the US country code only once', () => {
  assert.equal(toRingCentralNumber('(662) 555-0100'), '16625550100')
  assert.equal(toRingCentralNumber('+1 (662) 555-0100'), '16625550100')
  assert.equal(toRingCentralNumber('+44 20 7946 0100'), '442079460100')
})

test('invalid/empty numbers cannot create a dial link', () => {
  for (const phone of ['', 'No phone number', '123', '1234567890123456']) {
    for (const platform of ['mac', 'ios', 'desktop', 'android']) assert.equal(ringCentralCallHref(phone, platform), '')
  }
})

const source = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('client and campaign buttons use the same shared action without duplicating schemes', () => {
  for (const path of ['app/(crm)/components/RingCentralOutboundCallBridge.tsx', 'app/(crm)/campaigns/[id]/CampaignRingCentralCallBridge.tsx']) {
    const code = source(path)
    assert.match(code, /<RingCentralCallLink/)
    assert.doesNotMatch(code, /rcmobile:\/\/|rcapp:\/\/|app\.ringcentral\.com|RingCentral app requested/)
  }
})

test('shared action blocks unconfirmed Apple calls and does not assert launch success', () => {
  const code = source('app/(crm)/components/RingCentralCallLink.tsx')
  assert.match(code, /apple && !hasConfirmedSetup\(\)/)
  assert.match(code, /event\.preventDefault\(\)\s*\n\s*openSetup\(\)/)
  assert.doesNotMatch(code, /window\.open\(|setTimeout\(|RingCentral app requested|app\.ringcentral\.com/)
  assert.match(code, /navigator\.clipboard\.writeText/)
})
