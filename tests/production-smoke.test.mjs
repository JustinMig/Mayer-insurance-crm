import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const port = 3217
const base = `http://127.0.0.1:${port}`

async function waitForServer(child) {
  const deadline = Date.now() + 25_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next start exited early with code ${child.exitCode}`)
    try {
      const response = await fetch(`${base}/pay`, { redirect: 'manual' })
      if (response.status > 0) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Production server did not become ready within 25 seconds.')
}

test('production build serves public CRM surfaces', { timeout: 40_000 }, async (t) => {
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port), '-H', '127.0.0.1'], {
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  let logs = ''
  child.stdout.on('data', (chunk) => { logs += String(chunk) })
  child.stderr.on('data', (chunk) => { logs += String(chunk) })

  t.after(() => {
    if (child.exitCode === null) child.kill('SIGTERM')
  })

  try {
    await waitForServer(child)
    // Keep this test independent of deployment-only Supabase/Twilio secrets.
    // Authenticated routes are verified by Vercel preview/production after env injection.
    for (const path of ['/pay', '/manifest.webmanifest', '/sw.js', '/leads.webmanifest', '/calendar.webmanifest']) {
      const response = await fetch(`${base}${path}`, { redirect: 'manual' })
      assert.ok(response.status >= 200 && response.status < 400, `${path} returned HTTP ${response.status}`)
    }
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${logs}`)
  }
})
