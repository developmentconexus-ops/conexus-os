// The rerunnable Q3.6 negative proof on the pilot. Each case sends a real request as a real person
// and records the request, the answer and whether the refusal held. Output: a JSON list of cases.
//
//   node scripts/q3-negative-proof.mjs --app <slug> --other-app <slug> --project <id>
//     --member-state <state.json>      a member of the Project's Workspace (the test operator)
//     --employee-state <state.json>    the app-only employee, from scripts/q3-sign-in.mjs
//     [--owner-state <state.json>]     an Owner, for the revoke case
//     [--phase main|revoke|disabled]   default main
//     --out <file.json>
//
// No password is typed or read here. The member and the employee reach the application host through
// the Keycloak session their saved browser state already holds.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const HUB = 'https://hub.conexus.localhost:3443'
const PORT = 3445
const argument = (flag) => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}
const slug = argument('--app')
const otherSlug = argument('--other-app')
const projectId = argument('--project')
const out = argument('--out')
const phase = argument('--phase') ?? 'main'
const statePath = { member: argument('--member-state'), employee: argument('--employee-state'), owner: argument('--owner-state') }
if (!slug || !projectId || !out || !statePath.member || !statePath.employee) {
  console.error('usage: see the header of scripts/q3-negative-proof.mjs')
  process.exit(2)
}
const APP = `https://${slug}.conexus.localhost:${PORT}`
const OTHER = otherSlug ? `https://${otherSlug}.conexus.localhost:${PORT}` : null

const readState = (path) => JSON.parse(readFileSync(path, 'utf8'))
const cookieHeader = (state, origin) => {
  const { hostname } = new URL(origin)
  return state.cookies.filter((cookie) => cookie.domain.replace(/^[.]/, '') === hostname).map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
}
const cookieNames = (header) => header ? header.split('; ').map((pair) => pair.split('=')[0]) : []
const cases = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : []
const record = (id, request, observed, pass) => {
  const entry = { id, phase, at: new Date().toISOString(), request, observed, pass }
  const index = cases.findIndex((existing) => existing.id === id)
  if (index === -1) cases.push(entry)
  else cases[index] = entry
  console.log(`${pass ? 'HELD ' : 'FAILED'} ${id} ${JSON.stringify(observed).slice(0, 200)}`)
}
const call = async (method, url, { cookie = '', origin, headers = {}, body } = {}) => {
  const response = await fetch(url, {
    method,
    redirect: 'manual',
    headers: { ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  })
  const text = await response.text()
  let parsed = text
  try { parsed = JSON.parse(text) } catch {}
  return { status: response.status, location: response.headers.get('location'), setCookie: cookieNames((response.headers.getSetCookie?.() ?? []).map((line) => line.split(';')[0]).join('; ')), body: typeof parsed === 'string' ? parsed.slice(0, 300) : parsed }
}

const browser = await chromium.launch({ headless: true })
const contextFor = (path) => browser.newContext({ storageState: path })

// Signs a saved browser in to an application host through its Keycloak session; answers where it ended.
const signInToApplication = async (context, origin, { stopAtHandoff = false } = {}) => {
  const page = await context.newPage()
  let handoffUrl = null
  if (stopAtHandoff) {
    await page.route(`${origin}/__conexus/sign-in/complete?**`, (route) => { handoffUrl = route.request().url(); return route.abort() })
  }
  await page.goto(`${origin}/`).catch(() => {})
  await page.waitForLoadState('domcontentloaded').catch(() => {})
  if (stopAtHandoff) await page.waitForTimeout(1_000)
  const landed = page.url()
  await page.close()
  return { landed, handoffUrl }
}

try {
  if (phase === 'main') {
    const employee = readState(statePath.employee)
    const employeeMeta = existsSync(`${statePath.employee}.meta.json`) ? JSON.parse(readFileSync(`${statePath.employee}.meta.json`, 'utf8')) : {}
    const employeeApp = cookieHeader(employee, APP)

    // The employee's own browser at the Hub: Keycloak signs them in, the Hub refuses them a session.
    {
      const context = await contextFor(statePath.employee)
      const page = await context.newPage()
      const statuses = []
      page.on('response', (response) => { if (response.url().startsWith(`${HUB}/protocol/oidc/callback`)) statuses.push(response.status()) })
      await page.goto(`${HUB}/protocol/oidc/login`).catch(() => {})
      await page.waitForTimeout(2_000)
      const hubCookies = (await context.cookies(HUB)).map((cookie) => cookie.name).filter((name) => name.startsWith('__Host-conexus_session') || name.startsWith('__Host-conexus_csrf'))
      record('employee-opens-hub', { method: 'GET', url: `${HUB}/protocol/oidc/login`, as: 'employee' }, { callbackStatuses: statuses, hubCookies }, statuses.includes(403) && hubCookies.length === 0)
      await context.close()
    }

    // Control Plane operations with everything the employee's browser holds for the Hub.
    const hubCookie = cookieHeader(employee, HUB)
    for (const [id, method, path, body] of [
      ['employee-reads-access-context', 'GET', '/api/control/access-context'],
      ['employee-creates-workspace', 'POST', '/api/control/workspaces', { name: 'Tentativa' }],
      ['employee-reads-project', 'GET', `/api/control/projects/${projectId}`],
      ['employee-opens-builder', 'GET', `/api/control/projects/${projectId}/builder-session`],
      ['employee-reads-application-access', 'GET', `/api/control/projects/${projectId}/application-access`],
    ]) {
      const answer = await call(method, `${HUB}${path}`, { cookie: hubCookie, origin: HUB, headers: method === 'POST' ? { 'idempotency-key': crypto.randomUUID() } : {}, body })
      record(id, { method, url: `${HUB}${path}`, as: 'employee', cookieNames: cookieNames(hubCookie) }, { status: answer.status, body: answer.body }, answer.status === 401 || answer.status === 403)
    }

    // Another application's host: signing in there lands on its no-access page.
    if (OTHER) {
      const context = await contextFor(statePath.employee)
      const { landed } = await signInToApplication(context, OTHER)
      record('employee-opens-other-application', { url: `${OTHER}/`, as: 'employee' }, { landed }, landed.startsWith(`${OTHER}/__conexus/no-access`))
      const withCookieA = await call('POST', `${OTHER}/__conexus/api/anyOperation`, { cookie: employeeApp, origin: OTHER, body: {} })
      record('employee-session-on-other-host', { url: `${OTHER}/__conexus/api/anyOperation`, cookie: 'the employee session of the first application' }, withCookieA, withCookieA.status === 401)
      await context.close()
    }

    // The handoff the employee's browser already redeemed, replayed.
    if (employeeMeta.handoffUrl) {
      const replay = await call('GET', employeeMeta.handoffUrl, { cookie: employeeApp })
      record('handoff-redeemed-twice', { url: '<the employee handoff URL>', as: 'employee' }, replay, replay.status === 403)
    }

    // The session value planted before sign-in.
    if (employeeMeta.plantedSession) {
      const planted = await call('POST', `${APP}/__conexus/api/anyOperation`, { cookie: `__Host-conexus_app=${employeeMeta.plantedSession}`, origin: APP, body: {} })
      record('pre-sign-in-session-value', { cookie: '__Host-conexus_app=<planted before sign-in>' }, { ...planted, replacedAtSignIn: employeeMeta.sessionReplaced }, planted.status === 401 && employeeMeta.sessionReplaced === true)
    }

    // The member's browser: the Hub cookie never reaches the application host, and state changes need
    // the application's exact Origin.
    {
      const context = await contextFor(statePath.member)
      const { landed } = await signInToApplication(context, APP)
      const page = await context.newPage()
      const sent = []
      page.on('request', (request) => { if (request.url().startsWith(APP)) sent.push(cookieNames(request.headers().cookie)) })
      await page.goto(`${APP}/`)
      await page.waitForLoadState('networkidle').catch(() => {})
      const readable = await page.evaluate(() => document.cookie)
      const names = [...new Set(sent.flat())]
      record('hub-cookie-on-application-host', { url: `${APP}/`, as: 'member with a Hub session' }, { landed, cookiesSentToApplication: names, documentCookie: readable },
        !names.some((name) => name.startsWith('__Host-conexus_session') || name.startsWith('__Host-conexus_csrf')) && !readable.includes('conexus_session'))
      const memberApp = cookieHeader(await context.storageState(), APP)
      for (const [id, origin] of [['cross-origin-from-hub', HUB], ['cross-origin-from-other-application', OTHER ?? `https://other.conexus.localhost:${PORT}`], ['cross-origin-missing', undefined]]) {
        const answer = await call('POST', `${APP}/__conexus/api/anyOperation`, { cookie: memberApp, ...(origin ? { origin } : {}), body: {} })
        record(id, { url: `${APP}/__conexus/api/anyOperation`, origin: origin ?? null }, answer, answer.status === 403)
      }
      const signOut = await call('POST', `${APP}/__conexus/sign-out`, { cookie: memberApp, origin: HUB })
      record('cross-origin-sign-out', { url: `${APP}/__conexus/sign-out`, origin: HUB }, signOut, signOut.status === 403)

      // A fresh handoff, stopped before the browser redeems it: another host, then after sixty seconds.
      const { handoffUrl } = await signInToApplication(context, APP, { stopAtHandoff: true })
      if (handoffUrl) {
        const binding = cookieHeader(await context.storageState(), APP)
        const elsewhere = OTHER ? await call('GET', handoffUrl.replace(APP, OTHER), { cookie: binding }) : null
        if (elsewhere) record('handoff-on-other-host', { url: '<handoff for the first application> on the other host' }, elsewhere, elsewhere.status === 403)
        await new Promise((resolve) => setTimeout(resolve, 61_000))
        const late = await call('GET', handoffUrl, { cookie: binding })
        record('handoff-after-expiry', { url: '<handoff>', waitedSeconds: 61 }, late, late.status === 403)
      }
      await context.close()
    }
  }

  if (phase === 'revoke') {
    if (!statePath.owner) throw new Error('--owner-state is required for the revoke phase')
    const owner = readState(statePath.owner)
    const ownerHub = cookieHeader(owner, HUB)
    const csrf = owner.cookies.find((cookie) => cookie.name === '__Host-conexus_csrf')?.value ?? ''
    const employee = readState(statePath.employee)
    const employeeApp = cookieHeader(employee, APP)
    const before = await call('POST', `${APP}/__conexus/api/anyOperation`, { cookie: employeeApp, origin: APP, body: {} })
    const access = await call('GET', `${HUB}/api/control/projects/${projectId}/application-access`, { cookie: ownerHub })
    const grant = access.body?.entries?.find((entry) => entry.kind === 'grant' && entry.email === argument('--employee-email'))
    if (!grant) throw new Error('EMPLOYEE_GRANT_NOT_FOUND')
    const revoked = await call('DELETE', `${HUB}/api/control/projects/${projectId}/application-access/grant/${grant.grantId}`, { cookie: ownerHub, origin: HUB, headers: { 'x-conexus-csrf': decodeURIComponent(csrf) } })
    const after = await call('POST', `${APP}/__conexus/api/anyOperation`, { cookie: employeeApp, origin: APP, body: {} })
    record('revoked-grant-next-request', { revoke: `DELETE .../application-access/grant/${grant.grantId}`, next: `POST ${APP}/__conexus/api/anyOperation` }, { before: before.status, revoke: revoked.status, after: after.status, afterBody: after.body },
      before.status !== 401 && revoked.status === 204 && after.status === 401)
  }

  if (phase === 'disabled') {
    const employee = readState(statePath.employee)
    const answer = await call('POST', `${APP}/__conexus/api/anyOperation`, { cookie: cookieHeader(employee, APP), origin: APP, body: {} })
    record('disabled-in-keycloak-after-five-minutes', { url: `${APP}/__conexus/api/anyOperation`, as: 'employee, disabled in Keycloak more than five minutes earlier' }, answer, answer.status === 401)
  }
} finally {
  await browser.close()
  writeFileSync(out, `${JSON.stringify(cases, null, 2)}\n`)
}
