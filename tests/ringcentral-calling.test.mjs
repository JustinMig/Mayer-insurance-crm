import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
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
  test(`restored one-click target: ${expected} / ${device.platform} / touch ${device.maxTouchPoints || 0}`, () => {
    const platform = getCallPlatform(device)
    assert.equal(platform, expected)
    assert.equal(ringCentralCallHref('(662) 555-0100', platform), 'https://app.ringcentral.com/r/call?number=16625550100')
    assert.equal(requiresAppleCallingSetup(platform), false)
  })
}

test('the original call target is available without device detection or browser settings', () => {
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

test('call targets stay on RingCentral and never use the personal dialer or app-only schemes', () => {
  for (const phone of ['(662) 555-0100', '+1 662 555 0101', '+44 20 7946 0100']) {
    const url = new URL(ringCentralCallHref(phone))
    assert.equal(url.protocol, 'https:')
    assert.equal(url.hostname, 'app.ringcentral.com')
    assert.equal(url.pathname, '/r/call')
    assert.equal(url.searchParams.get('number'), toRingCentralNumber(phone))
    assert.equal([...url.searchParams.keys()].length, 1)
  }
})

const source = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const componentSource = source('app/(crm)/components/RingCentralCallLink.tsx')

// Evaluate the actual stateless component with a minimal JSX element factory.
// This checks the rendered link contract, not native app launch on a device.
const { outputText, diagnostics } = ts.transpileModule(componentSource, {
  fileName: 'RingCentralCallLink.tsx',
  reportDiagnostics: true,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
})
assert.equal((diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0)
const componentModule = { exports: {} }
const jsx = (type, props) => ({ type, props })
runInNewContext(outputText, {
  module: componentModule,
  exports: componentModule.exports,
  require(id) {
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (id === '@/lib/ringcentral-call-target') return { ringCentralCallHref }
    throw new Error(`Unexpected dependency in one-click control: ${id}`)
  }
})
const CallLink = componentModule.exports.default

function elements(node) {
  if (!node || typeof node !== 'object' || !node.type) return []
  const children = node.props?.children
  return [node, ...(Array.isArray(children) ? children : [children]).flatMap(elements)]
}

test('a valid client renders exactly one immediately usable call link and no setup controls', () => {
  const tree = elements(CallLink({ phone: '(662) 555-0100', className: 'client-call', children: 'Call with RingCentral' }))
  const links = tree.filter((node) => node.type === 'a')
  assert.equal(links.length, 1)
  assert.equal(links[0].props.href, 'https://app.ringcentral.com/r/call?number=16625550100')
  assert.equal(links[0].props.target, '_blank')
  assert.equal(links[0].props.rel, 'noopener noreferrer')
  assert.equal(links[0].props.onClick, undefined)
  assert.equal(links[0].props.children, 'Call with RingCentral')
  assert.equal(tree.filter((node) => ['button', 'input', 'dialog'].includes(node.type) || node.props?.role === 'dialog').length, 0)
})

test('changing clients changes the number immediately, with no cached previous number', () => {
  for (const phone of ['16625550100', '16625550101']) {
    const link = elements(CallLink({ phone, className: 'campaign-call', children: 'Call' })).find((node) => node.type === 'a')
    assert.equal(new URL(link.props.href).searchParams.get('number'), phone)
    assert.equal(link.props.className, 'campaign-call')
  }
})

test('invalid numbers render no call action', () => {
  assert.equal(CallLink({ phone: '', className: 'client-call', children: 'Call' }), null)
})

test('client and campaign buttons use the same shared action without separate device routing', () => {
  for (const path of ['app/(crm)/components/RingCentralOutboundCallBridge.tsx', 'app/(crm)/campaigns/[id]/CampaignRingCentralCallBridge.tsx']) {
    const code = source(path)
    assert.match(code, /<RingCentralCallLink/)
    assert.doesNotMatch(code, /rcmobile:\/\/|rcapp:\/\/|app\.ringcentral\.com|RingCentral app requested/)
  }
})

test('the shared control adds no setup, launch timer, redirect, or extra click handler', () => {
  assert.doesNotMatch(componentSource, /localStorage|sessionStorage|navigator|setTimeout\(|onClick=|createPortal|ringcentral-call-setup|RingCentral app requested/)
})
