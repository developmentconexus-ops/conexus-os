// The rerunnable Q3.5 and Q3.6 proof on the pilot. Each case sends a real request as a real person
// and records the request, the answer and whether the expected result held. Output: a JSON list of cases.
//
//   node scripts/q3-negative-proof.mjs --app <slug> --other-app <slug> --project <id> --out <file.json>
//     --employee-state <state.json>    the app-only employee, from scripts/q3-sign-in.mjs
//     [--phase main|caller|control|expired|disabled|revoke]   default main
//   main:     --member-state <state.json> (a member of the Project's Workspace, no grant)
//             --workspace <id> --preview-url <url>
//   control:  --member-state <state.json> --control-app <slug of an application in another Workspace>
//   caller:   --employee-name <display name> --order <order number> [--shot <file.png>]
//   expired:  --session-state <state.json> (a live application session this run may age by 8 hours)
//   disabled: --disabled-at <ISO time the employee was disabled in Keycloak>
//   revoke:   --employee-email <email>; polls while the Owner revokes the grant in the Hub
//
// No password is typed or read here. Saved browser state reaches the application host through the
// Keycloak session it already holds. The expired and revoke phases read or age one application session
// row in the pilot database through `docker exec conexus-s7-postgres`.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import dns from 'node:dns'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

// Chromium resolves every *.localhost name to loopback (RFC 6761); Node reads /etc/hosts only.
const systemLookup = dns.lookup
dns.lookup = (hostname, options, callback) => {
  if (!hostname.endsWith('.conexus.localhost')) return systemLookup(hostname, options, callback)
  const done = typeof options === 'function' ? options : callback
  process.nextTick(() => options?.all ? done(null, [{ address: '127.0.0.1', family: 4 }]) : done(null, '127.0.0.1', 4))
}

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
const statePath = { member: argument('--member-state'), employee: argument('--employee-state'), session: argument('--session-state') }
if (!slug || !/^[0-9a-f-]{36}$/.test(projectId ?? '') || !out || (phase !== 'control' && !statePath.employee) || (phase === 'main' && !statePath.member)) {
  console.error('usage: see the header of scripts/q3-negative-proof.mjs')
  process.exit(2)
}
const APP = `https://${slug}.conexus.localhost:${PORT}`
const OTHER = otherSlug ? `https://${otherSlug}.conexus.localhost:${PORT}` : null
const ANY_OPERATION = `${APP}/__conexus/api/anyOperation`

const readState = (path) => JSON.parse(readFileSync(path, 'utf8'))
const cookieHeader = (state, origin) => {
  const { hostname } = new URL(origin)
  return state.cookies.filter((cookie) => cookie.domain.replace(/^[.]/, '') === hostname).map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
}
const cookieNames = (header) => header ? header.split('; ').map((pair) => pair.split('=')[0]) : []
const sql = (text) => execFileSync('docker', ['exec', 'conexus-s7-postgres', 'psql', '-U', 'postgres', '-d', 'conexus_s7', '-q', '-Atc', text], { encoding: 'utf8' }).trim()
const sessionDigest = (state) => {
  const token = state.cookies.find((cookie) => cookie.name === '__Host-conexus_app' && cookie.domain === new URL(APP).hostname)?.value
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('APPLICATION_SESSION_NOT_IN_STATE')
  return createHash('sha256').update(token).digest('hex')
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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
// Polls one application request until it is refused; keeps the last allowed and first refused answer.
const pollUntilRefused = async (cookie, { everyMs, untilMs }) => {
  let lastAllowed = null
  let firstRefused = null
  let probes = 0
  while (!firstRefused && Date.now() < untilMs) {
    const startedAt = new Date().toISOString()
    const answer = await call('POST', ANY_OPERATION, { cookie, origin: APP, body: {} })
    probes += 1
    const seen = { startedAt, status: answer.status, code: answer.body?.error?.code ?? null }
    if (answer.status === 401) firstRefused = seen
    else lastAllowed = seen
    if (!firstRefused) await sleep(everyMs)
  }
  return { probes, lastAllowed, firstRefused }
}

const browser = await chromium.launch({ headless: true })
const contextFor = (path) => browser.newContext({ storageState: path })

// Signs a saved browser in to an application host through its Keycloak session; answers where it ended.
const signInToApplication = async (context, origin, { stopAtHandoff = false } = {}) => {
  const page = await context.newPage()
  let handoffUrl = null
  if (stopAtHandoff) {
    // page.route never sees a request reached through a redirect, and the handoff always is one.
    const cdp = await context.newCDPSession(page)
    cdp.on('Fetch.requestPaused', ({ requestId, request }) => {
      handoffUrl = request.url
      cdp.send('Fetch.failRequest', { requestId, errorReason: 'Aborted' }).catch(() => {})
    })
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: `${origin}/__conexus/sign-in/complete?*`, requestStage: 'Request' }] })
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
    const workspaceId = argument('--workspace')
    const previewUrl = argument('--preview-url')

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
      if (previewUrl) {
        const response = await page.goto(previewUrl).catch(() => null)
        const status = response?.status() ?? null
        record('employee-opens-preview-host', { method: 'GET', url: previewUrl, as: 'employee' }, { status, landed: page.url() }, status === 401 || status === 403)
      }
      await context.close()
    }

    // Control Plane operations with everything the employee's browser holds for the Hub.
    const hubCookie = cookieHeader(employee, HUB)
    for (const [id, method, path, body] of [
      ['employee-reads-access-context', 'GET', '/api/control/access-context'],
      ['employee-creates-workspace', 'POST', '/api/control/workspaces', { name: 'Tentativa' }],
      ...(workspaceId ? [['employee-lists-projects', 'GET', `/api/control/workspaces/${workspaceId}/projects`]] : []),
      ['employee-reads-project', 'GET', `/api/control/projects/${projectId}`],
      ['employee-opens-builder', 'GET', `/api/control/projects/${projectId}/builder-session`],
      ['employee-launches-preview', 'POST', `/api/control/projects/${projectId}/builder-session/preview`, {}],
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

    // The session value planted before sign-in: the redirect to sign in clears it, and it opens nothing.
    if (employeeMeta.plantedSession) {
      const plantedCookie = `__Host-conexus_app=${employeeMeta.plantedSession}`
      const redirect = await call('GET', `${APP}/`, { cookie: plantedCookie })
      const planted = await call('POST', ANY_OPERATION, { cookie: plantedCookie, origin: APP, body: {} })
      record('pre-sign-in-session-value', { cookie: '__Host-conexus_app=<planted before sign-in>' },
        { redirect: { status: redirect.status, setCookie: redirect.setCookie }, api: planted, replacedAtSignIn: employeeMeta.sessionReplaced },
        redirect.status === 303 && redirect.setCookie.includes('__Host-conexus_app') && planted.status === 401 && employeeMeta.sessionReplaced === true)
    }

    // The member's browser: a member of the Project's Workspace enters without a grant (answer 8), the
    // Hub cookie never reaches the application host, and state changes need the application's exact Origin.
    {
      const context = await contextFor(statePath.member)
      const { landed } = await signInToApplication(context, APP)
      record('member-enters-without-grant', { url: `${APP}/`, as: 'member of the Project Workspace, no grant' }, { landed }, landed === `${APP}/`)
      const page = await context.newPage()
      const sent = []
      const onRequest = (request) => { if (request.url().startsWith(APP)) sent.push(request.allHeaders().then((headers) => cookieNames(headers.cookie), () => [])) }
      page.on('request', onRequest)
      await page.goto(`${APP}/`)
      await page.waitForLoadState('networkidle').catch(() => {})
      page.off('request', onRequest)
      sent.splice(0, sent.length, ...(await Promise.all(sent)))
      const readable = await page.evaluate(() => document.cookie)
      const names = [...new Set(sent.flat())]
      record('hub-cookie-on-application-host', { url: `${APP}/`, as: 'member with a Hub session' }, { landed, cookiesSentToApplication: names, documentCookie: readable },
        landed === `${APP}/` && names.length > 0 && !names.some((name) => name.startsWith('__Host-conexus_session') || name.startsWith('__Host-conexus_csrf')) && !readable.includes('conexus_session'))
      const memberApp = cookieHeader(await context.storageState(), APP)
      const sameOrigin = await call('POST', ANY_OPERATION, { cookie: memberApp, origin: APP, body: {} })
      record('same-origin-baseline', { url: ANY_OPERATION, origin: APP, as: 'member' }, sameOrigin, sameOrigin.status !== 401 && sameOrigin.status !== 403)
      for (const [id, origin] of [['cross-origin-from-hub', HUB], ['cross-origin-from-other-application', OTHER ?? `https://other.conexus.localhost:${PORT}`], ['cross-origin-missing', undefined]]) {
        const answer = await call('POST', ANY_OPERATION, { cookie: memberApp, ...(origin ? { origin } : {}), body: {} })
        record(id, { url: ANY_OPERATION, origin: origin ?? null }, answer, answer.status === 403)
      }
      const signOut = await call('POST', `${APP}/__conexus/sign-out`, { cookie: memberApp, origin: HUB })
      record('cross-origin-sign-out', { url: `${APP}/__conexus/sign-out`, origin: HUB }, signOut, signOut.status === 403)

      // Fresh handoffs, stopped before the browser redeems them. The browser keeps its Keycloak session
      // and loses its application session, so the host mints a new handoff each time.
      const freshHandoff = async () => {
        const kept = (await context.cookies()).filter((cookie) => cookie.name !== '__Host-conexus_app')
        await context.clearCookies()
        await context.addCookies(kept)
        const { handoffUrl, landed: handoffLanded } = await signInToApplication(context, APP, { stopAtHandoff: true })
        return { handoffUrl, handoffLanded, binding: cookieHeader(await context.storageState(), APP) }
      }
      if (OTHER) {
        const brief = (answer) => answer && { status: answer.status, location: answer.location, setCookie: answer.setCookie }
        const stolen = await freshHandoff()
        const elsewhere = stolen.handoffUrl ? await call('GET', stolen.handoffUrl.replace(APP, OTHER), { cookie: stolen.binding }) : null
        const burned = stolen.handoffUrl ? await call('GET', stolen.handoffUrl, { cookie: stolen.binding }) : null
        const control = await freshHandoff()
        const redeemed = control.handoffUrl ? await call('GET', control.handoffUrl, { cookie: control.binding }) : null
        record('handoff-on-other-host', { url: '<handoff for the first application> on the other host, then on its own host; a second fresh handoff on its own host as control' },
          { otherHost: brief(elsewhere), sameHandoffOnOwnHostAfterwards: brief(burned), freshHandoffOnOwnHost: brief(redeemed), landed: [stolen.handoffLanded, control.handoffLanded] },
          elsewhere?.status === 403 && burned?.status === 403 && redeemed?.status === 303 && redeemed.setCookie.includes('__Host-conexus_app'))
      }
      {
        const { handoffUrl, handoffLanded, binding } = await freshHandoff()
        if (handoffUrl) await sleep(61_000)
        const late = handoffUrl ? await call('GET', handoffUrl, { cookie: binding }) : null
        record('handoff-after-expiry', { url: '<an unused handoff>', waitedSeconds: 61 }, late ?? { error: 'NO_HANDOFF_MINTED', landed: handoffLanded }, late?.status === 403)
      }
      await context.close()
    }
  }

  if (phase === 'caller') {
    const name = argument('--employee-name')
    const orderNumber = argument('--order')
    if (!name || !orderNumber) throw new Error('--employee-name and --order are required for the caller phase')
    const employeeApp = cookieHeader(readState(statePath.employee), APP)
    const stamp = new Date().toISOString().slice(11, 19)
    const notes = async () => (await call('POST', `${APP}/__conexus/api/listNotes`, { cookie: employeeApp, origin: APP, body: { orderNumber } })).body
    const authorOf = async (text) => {
      const list = await notes()
      return Array.isArray(list) ? list.find((note) => note.note === text)?.author ?? null : null
    }

    // Q3.5: the employee writes a note in the application and sees their own name on it.
    {
      const context = await contextFor(statePath.employee)
      const page = await context.newPage()
      const text = `Nota escrita pelo funcionário ${stamp}`
      await page.goto(`${APP}/`)
      await page.getByRole('textbox', { name: /conteúdo da nota/i }).first().fill(text)
      await page.getByRole('button', { name: /adicionar nota/i }).click()
      await page.getByText(text).waitFor({ timeout: 15_000 })
      await page.reload()
      await page.getByText(text).waitFor({ timeout: 15_000 })
      const shown = await page.locator('body').innerText()
      const nameShown = shown.includes(`${name} •`)
      if (argument('--shot')) await page.screenshot({ path: argument('--shot'), fullPage: true })
      const author = await authorOf(text)
      record('employee-writes-note', { url: `${APP}/`, as: 'employee', note: text }, { storedAuthor: author, nameShownAfterReload: nameShown }, author === name && nameShown)
      await context.close()
    }

    // A caller, author or other person's identifier in the input: refused by the operation's schema.
    for (const [id, extra] of [
      ['caller-in-input', { caller: { accountId: '00000000-0000-4000-8000-000000000000', email: 'forjado@example.com', displayName: 'Forjado' } }],
      ['author-in-input', { author: 'Forjado' }],
    ]) {
      const text = `Tentativa ${id} ${stamp}`
      const answer = await call('POST', `${APP}/__conexus/api/addNote`, { cookie: employeeApp, origin: APP, body: { orderNumber, note: text, ...extra } })
      const stored = await authorOf(text)
      record(id, { url: `${APP}/__conexus/api/addNote`, body: { orderNumber, note: text, ...extra } }, { status: answer.status, body: answer.body, storedAuthor: stored }, answer.status >= 400 && answer.status < 500 && stored === null)
    }

    // Identifiers the employee controls in the URL and headers: the stored author is still the platform's caller.
    {
      const text = `Tentativa identificadores ${stamp}`
      const url = `${APP}/__conexus/api/addNote?projectId=00000000-0000-4000-8000-000000000001&accountId=00000000-0000-4000-8000-000000000000&application=${otherSlug ?? 'other'}`
      const headers = {
        'x-conexus-caller': JSON.stringify({ accountId: '00000000-0000-4000-8000-000000000000', displayName: 'Forjado' }),
        'x-conexus-account-id': '00000000-0000-4000-8000-000000000000',
        'x-conexus-project-id': '00000000-0000-4000-8000-000000000001',
        'x-forwarded-host': OTHER ? new URL(OTHER).host : 'other.conexus.localhost:3445',
        forwarded: `host=${OTHER ? new URL(OTHER).host : 'other.conexus.localhost:3445'}`,
      }
      const answer = await call('POST', url, { cookie: employeeApp, origin: APP, headers, body: { orderNumber, note: text } })
      const stored = await authorOf(text)
      record('identifiers-in-url-and-headers', { url, headers: Object.keys(headers), body: { orderNumber, note: text } }, { status: answer.status, storedAuthor: stored }, stored === name)
    }
  }

  if (phase === 'control') {
    const controlSlug = argument('--control-app')
    if (!controlSlug || !statePath.member) throw new Error('--control-app and --member-state are required for the control phase')
    const CONTROL = `https://${controlSlug}.conexus.localhost:${PORT}`
    const context = await contextFor(statePath.member)
    const own = await signInToApplication(context, APP)
    const refused = await signInToApplication(context, CONTROL)
    const jar = await context.storageState()
    const ownApi = await call('POST', ANY_OPERATION, { cookie: cookieHeader(jar, APP), origin: APP, body: {} })
    const controlApi = await call('POST', `${CONTROL}/__conexus/api/anyOperation`, { cookie: cookieHeader(jar, CONTROL), origin: CONTROL, body: {} })
    record('control-member-of-another-workspace', { url: `${CONTROL}/`, as: 'member of the Project Workspace of the first application only, no grant on the control application' },
      { ownApplication: { landed: own.landed, api: ownApi.status }, controlApplication: { landed: refused.landed, api: controlApi.status, code: controlApi.body?.error?.code ?? null, cookies: cookieNames(cookieHeader(jar, CONTROL)) } },
      own.landed === `${APP}/` && ownApi.status === 404 && refused.landed === `${CONTROL}/__conexus/no-access` && controlApi.status === 401)
    await context.close()
  }

  if (phase === 'expired') {
    if (!statePath.session) throw new Error('--session-state is required for the expired phase')
    const state = readState(statePath.session)
    const cookie = cookieHeader(state, APP)
    const digestHex = sessionDigest(state)
    const before = await call('POST', ANY_OPERATION, { cookie, origin: APP, body: {} })
    const limit = sql(`SELECT absolute_expires_at - authenticated_at FROM iam.application_session WHERE token_digest = decode('${digestHex}', 'hex')`)
    // Age the session as if eight hours and one minute had passed since sign-in.
    const aged = sql(`UPDATE iam.application_session SET authenticated_at = authenticated_at - interval '8 hours 1 minute', absolute_expires_at = absolute_expires_at - interval '8 hours 1 minute' WHERE token_digest = decode('${digestHex}', 'hex') AND ended_at IS NULL RETURNING absolute_expires_at < now()`)
    const after = await call('POST', ANY_OPERATION, { cookie, origin: APP, body: {} })
    record('session-older-than-eight-hours', { url: ANY_OPERATION, as: 'a live application session aged by 8 hours 1 minute in the database' },
      { limit, before: before.status, agedPastLimit: aged === 't', after: after.status, afterBody: after.body },
      limit === '08:00:00' && before.status !== 401 && aged === 't' && after.status === 401)
  }

  if (phase === 'disabled') {
    const disabledAt = Date.parse(argument('--disabled-at') ?? '')
    if (Number.isNaN(disabledAt)) throw new Error('--disabled-at is required for the disabled phase')
    const employee = readState(statePath.employee)
    const polled = await pollUntilRefused(cookieHeader(employee, APP), { everyMs: 20_000, untilMs: disabledAt + 8 * 60_000 })
    const ended = sql(`SELECT coalesce(ended_reason, 'open') FROM iam.application_session WHERE token_digest = decode('${sessionDigest(employee)}', 'hex')`)
    const refusedAfterSeconds = polled.firstRefused ? Math.round((Date.parse(polled.firstRefused.startedAt) - disabledAt) / 1000) : null
    record('disabled-in-keycloak-within-five-minutes', { url: ANY_OPERATION, as: 'employee, polled every 20 s after being disabled in Keycloak', disabledAt: new Date(disabledAt).toISOString() },
      { ...polled, refusedAfterSeconds, sessionEnded: ended },
      Boolean(polled.firstRefused) && (!polled.lastAllowed || Date.parse(polled.lastAllowed.startedAt) - disabledAt < 300_000) && ended === 'PROVIDER_REFUSED')
  }

  if (phase === 'revoke') {
    const email = argument('--employee-email')
    if (!/^[^'\s]+@[^'\s]+$/.test(email ?? '')) throw new Error('--employee-email is required for the revoke phase')
    const employeeApp = cookieHeader(readState(statePath.employee), APP)
    console.log(`REVOKE THE GRANT NOW, as an Owner: ${HUB}/projects/${projectId}/settings/access`)
    const polled = await pollUntilRefused(employeeApp, { everyMs: 1_000, untilMs: Date.now() + 30 * 60_000 })
    const revokedAt = sql(`SELECT g.revoked_at FROM iam.application_grant g JOIN iam.account a USING (account_id) WHERE g.project_id = '${projectId}' AND a.email = '${email}' ORDER BY g.granted_at DESC LIMIT 1`)
    const revoked = Date.parse(revokedAt.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'))
    record('revoked-grant-next-request', { poll: `POST ${ANY_OPERATION} every second as the employee`, revoke: `${HUB}/projects/${projectId}/settings/access` },
      { ...polled, revokedAt },
      Boolean(polled.lastAllowed && polled.firstRefused) && Date.parse(polled.lastAllowed.startedAt) < revoked)
  }
} finally {
  await browser.close()
  writeFileSync(out, `${JSON.stringify(cases, null, 2)}\n`)
}
