// Opens a visible browser for one Q3 person and waits for a human to sign in through Keycloak. The
// script never types or reads a password. When the sign-in lands it saves the browser's storage state
// (mode 600) for scripts/q3-negative-proof.mjs and exits.
//
//   node scripts/q3-sign-in.mjs --role owner    --out <state.json>
//   node scripts/q3-sign-in.mjs --role employee --app <slug> --out <state.json>
//
// For the employee it also records what the negative proof needs from the sign-in itself: the
// application session value planted before sign-in, and the handoff URL, which the browser redeems.
import { chmodSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const HUB = 'https://hub.conexus.localhost:3443'
const APPLICATION_PORT = 3445
const WAIT_MS = 30 * 60 * 1000
const PLANTED = 'p'.repeat(43)

const argument = (flag) => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}
const role = argument('--role')
const out = argument('--out')
const slug = argument('--app')
if ((role !== 'owner' && role !== 'employee') || !out || (role === 'employee' && !slug)) {
  console.error('usage: q3-sign-in.mjs --role owner|employee [--app <slug>] --out <state.json>')
  process.exit(2)
}

const browser = await chromium.launch({ headless: false })
const context = await browser.newContext()
const page = await context.newPage()
const record = { role, startedAt: new Date().toISOString() }

try {
  if (role === 'owner') {
    await page.goto(`${HUB}/protocol/oidc/login`)
    console.log(`SIGN IN AS THE OWNER HERE: ${HUB}/protocol/oidc/login`)
    await page.waitForURL((url) => url.origin === HUB && !url.pathname.startsWith('/protocol/'), { timeout: WAIT_MS })
    const probe = await page.evaluate(async () => {
      const response = await fetch('/api/control/access-context', { credentials: 'same-origin' })
      return { status: response.status, body: response.ok ? await response.json() : null }
    })
    record.account = probe.body?.account ?? null
    if (probe.status !== 200) throw new Error(`OWNER_SESSION_MISSING:${probe.status}`)
  } else {
    const origin = `https://${slug}.conexus.localhost:${APPLICATION_PORT}`
    // A session value chosen before sign-in: the proof later shows it was never honoured.
    await context.addCookies([{ name: '__Host-conexus_app', value: PLANTED, url: `${origin}/`, secure: true, httpOnly: true, sameSite: 'Lax' }])
    record.plantedSession = PLANTED
    page.on('request', (request) => {
      if (request.url().startsWith(`${origin}/__conexus/sign-in/complete?`)) record.handoffUrl = request.url()
    })
    await page.goto(`${origin}/`)
    console.log(`SIGN IN AS THE EMPLOYEE HERE: ${page.url().split('?')[0]}`)
    await page.waitForURL((url) => url.origin === origin && !url.pathname.startsWith('/__conexus/'), { timeout: WAIT_MS })
    const session = (await context.cookies(`${origin}/`)).find((cookie) => cookie.name === '__Host-conexus_app')
    record.sessionReplaced = Boolean(session) && session.value !== PLANTED
    if (!session) throw new Error('APPLICATION_SESSION_MISSING')
  }
  await context.storageState({ path: out })
  chmodSync(out, 0o600)
  record.finishedAt = new Date().toISOString()
  writeFileSync(`${out}.meta.json`, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 })
  console.log(`SIGNED IN ${JSON.stringify({ ...record, handoffUrl: record.handoffUrl ? 'captured' : undefined })}`)
} catch (error) {
  console.log(`SIGN-IN NOT COMPLETED: ${error.message.split('\n')[0]}`)
  process.exitCode = 1
} finally {
  await browser.close()
}
