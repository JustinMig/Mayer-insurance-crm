import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getCallPlatform, requiresAppleCallingSetup, ringCentralCallHref, toRingCentralNumber } from '../lib/ringcentral-call-target.ts'

const devices = [
  ['mac', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.0 Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 0 }],
  ['mac', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/140 Safari/537.36', platform: 'MacIntel', maxTouchPoints: 0 }],
  ['ios', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) Version/18 Safari/604.1', platform: 'iPhone', maxTouchPoints: 5 }],
  ['ios', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18 Safari/605.1', platform: 'MacIntel', maxTouchPoints: 5 }],
  ['android', { userAgent: 'Mozilla/5.0 (Linux; Android 15) Chrome/140 Mobile Safari/537.36', platform: 'Linux armv8l' }],
  ['desktop', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140 Safari/537.36', platform: 'Win32' }]
]

for (const [expected, device] of devices) {
  test(`detect ${expected}: ${device.platform} / touch ${device.maxTouchPoints || 0}`, () => {
    assert.equal(getCallPlatform(device), expected)
  })
}

test('macOS uses the standard native telephone handoff instead of a web or unregistered custom URI', () => {
  assert.equal(ringCentralCallHref('(662) 555-0100', 'mac'), 'tel:+16625550100')
  assert.equal(requiresAppleCallingSetup('mac'), false)
})

test('non-macOS platforms retain the existing RingCentral web call target', () => {
  for (const platform of ['ios', 'android', 'desktop']) {
    assert.equal(ringCentralCallHref('(662) 555-0100', platform), 'https://app.ringcentral.com/r/call?number=16625550100')
    assert.equal(requiresAppleCallingSetup(platform), false)
  }
})

test('default target remains unchanged when no platform is supplied', () => {
  assert.equal(ringCentralCallHref('16625550100'), 'https://app.ringcentral.com/r/call?number=16625550100')
})

test('normalization retains the client number and adds the US country code only once', () => {
  assert.equal(toRingCentralNumber('(662) 555-0100'), '16625550100')
  assert.equal(toRingCentralNumber('+1 (662) 555-0100'), '16625550100')
  assert.equal(toRingCentralNumber('+44 20 7946 0100'), '442079460100')
})

test('invalid/empty numbers cannot create a dial link', () => {
  for (const phone of ['', 'No phone number', '123', '1234567890123456', '012345678901']) {
    for (const platform of ['mac', 'ios', 'desktop', 'android']) assert.equal(ringCentralCallHref(phone, platform), '')
  }
})

const source = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const componentSource = source('app/(crm)/components/RingCentralCallLink.tsx')

test('shared call control detects macOS and passes platform into the call target', () => {
  assert.match(componentSource, /getCallPlatform\(navigator\)/)
  assert.match(componentSource, /ringCentralCallHref\(phone, platform\)/)
  assert.match(componentSource, /platform === 'mac'/)
})

test('macOS call link has no browser-tab target while non-macOS keeps the existing target', () => {
  assert.match(componentSource, /mac \? \{\} : \{ target: '_blank', rel: 'noopener noreferrer' \}/)
})

test('Chrome on macOS uses a direct location handoff', () => {
  assert.match(componentSource, /chromeOnMac/)
  assert.match(componentSource, /targetWindow\.location\.assign\(href\)/)
})

test('client and campaign buttons still use the same shared call action', () => {
  for (const path of ['app/(crm)/components/RingCentralOutboundCallBridge.tsx', 'app/(crm)/campaigns/[id]/CampaignRingCentralCallBridge.tsx']) {
    const code = source(path)
    assert.match(code, /<RingCentralCallLink/)
    assert.doesNotMatch(code, /RingCentral app requested|ringcentral-call-setup/)
  }
})
