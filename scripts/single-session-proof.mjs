// The pilot proof of the single session qualification (step S6) for the cases the Q3 script does not
// hold: a Preview across a Hub restart, and a Hub person disabled or signed out in Keycloak losing the Hub
// and their Preview within five minutes. Each case sends real requests and records the request, the
// answer and whether the expected result held. Output: a JSON list of cases, appended by id.
//
//   node scripts/single-session-proof.mjs --phase <phase> --member-state <state.json> --out <file.json> [...]
//     preview-open     --project <id> --save <file>    launches the Project's Preview as the person, enters it,
//                                                       reads its page, and saves the Preview cookie (mode 600)
//     preview-restart  --save <file>                   after the Hub was restarted: the saved Preview cookie
//                                                       still reads the page, with no new sign-in
//     hub-refused      --save <file> --since <ISO time> --expect USER_DISABLED|SESSION_ENDED
//                                                     the caller disabled the person or signed them out in
//                                                     Keycloak at --since; polls the Hub and the Preview every
//                                                     10 s until both refuse, and reads how the sessions ended.
//                                                     Holds when a request was allowed first, no request that
//                                                     started five minutes or more after --since was allowed,
//                                                     and one that started within one polling interval after
//                                                     five minutes was refused; the Preview ends with its Hub.
//     concurrent       --app <slug>                    signs the person into the application, makes its
//                                                     Keycloak check due, sends four page requests at once,
//                                                     and counts Keycloak's REFRESH_TOKEN events for them
//                                                     (the realm's events must be on)
//     grant            --owner-state <state.json> --project <id> --email <address> --id <case id> --expect grant|invitation
//                                                     the Owner grants the application in the Hub (IAM-12),
//                                                     and lists access (IAM-11) before and after
//     employee-lands   --employee-state <state.json> --app <slug> --id <case id> --expect app|no-access
//                                                     opens the application with the person's browser state,
//                                                     which signs in again through Keycloak when needed
//     revoke           --owner-state <state.json> --project <id> --email <address>
//                                                     the Owner revokes that person's grant in the Hub (IAM-13)
//
// No password is typed or read here. The saved browser state holds the Hub session; the pilot database is
// read through `docker exec conexus-s7-postgres`.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import dns from 'node:dns'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

// Chromium resolves every *.localhost name to loopback (RFC 6761); Node reads /etc/hosts only.
const systemLookup = dns.lookup
dns.lookup = (hostname, options, callback) => {
  if (!hostname.endsWith('.conexus.localhost')) return systemLookup(hostname, options, callback)
  const done = typeof options === 'function' ? options : callback
  process.nextTick(() => options?.all ? done(null, [{ address: '127.0.0.1', family: 4 }]) : done(null, '127.0.0.1', 4))
}

const HUB = 'https://hub.conexus.localhost:3443'
const { values } = parseArgs({
  options: {
    phase: { type: 'string' }, 'member-state': { type: 'string' }, out: { type: 'string' }, project: { type: 'string' },
    save: { type: 'string' }, since: { type: 'string' }, expect: { type: 'string' }, 'owner-state': { type: 'string' },
    email: { type: 'string' }, id: { type: 'string' }, 'employee-state': { type: 'string' }, app: { type: 'string' },
  },
})
const need = (name) => values[name] ?? (() => { throw new Error(`--${name} is required`) })()
const phase = need('phase')
const out = need('out')

const sql = (text) => execFileSync('docker', ['exec', 'conexus-s7-postgres', 'psql', '-U', 'postgres', '-d', 'conexus_s7', '-q', '-Atc', text], { encoding: 'utf8' }).trim()
const digestHex = (token) => createHash('sha256').update(token).digest('hex')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const cases = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : []
const ran = []
// Every case this run records decides the exit status: a run that records no case, or a failed one, fails.
process.on('exit', (code) => { if (code === 0 && (ran.length === 0 || ran.includes(false))) process.exitCode = 1 })
const record = (id, request, observed, pass) => {
  ran.push(pass)
  const entry = { id, phase, at: new Date().toISOString(), request, observed, pass }
  const index = cases.findIndex((existing) => existing.id === id)
  if (index === -1) cases.push(entry)
  else cases[index] = entry
  writeFileSync(out, `${JSON.stringify(cases, null, 2)}\n`)
  console.log(`${pass ? 'HELD ' : 'FAILED'} ${id} ${JSON.stringify(observed).slice(0, 240)}`)
}

const hubCookies = (flag = 'member-state') => {
  const state = JSON.parse(readFileSync(need(flag), 'utf8'))
  const cookie = (name) => state.cookies.find((entry) => entry.name === name && entry.domain.replace(/^[.]/, '') === 'hub.conexus.localhost')?.value
  const session = cookie('__Host-conexus_session')
  const csrf = cookie('__Host-conexus_csrf')
  if (!session || !csrf) throw new Error('HUB_SESSION_NOT_IN_STATE')
  return { session, csrf, header: `__Host-conexus_session=${session}; __Host-conexus_csrf=${csrf}` }
}
const call = async (method, url, { cookie = '', headers = {}, body } = {}) => {
  const response = await fetch(url, { method, redirect: 'manual', headers: { ...(cookie ? { cookie } : {}), ...headers }, ...(body === undefined ? {} : { body }) })
  const text = await response.text()
  let parsed = text
  try { parsed = JSON.parse(text) } catch {}
  return {
    status: response.status,
    location: response.headers.get('location'),
    setCookie: (response.headers.getSetCookie?.() ?? []).map((line) => line.split(';')[0]),
    body: typeof parsed === 'string' ? parsed.slice(0, 200) : parsed,
  }
}
const readSaved = () => JSON.parse(readFileSync(need('save'), 'utf8'))
const brief = (answer) => ({ status: answer.status, code: answer.body?.error?.code ?? answer.body?.type ?? null })

if (phase === 'preview-open') {
  const hub = hubCookies()
  const projectId = need('project')
  const launch = await call('POST', `${HUB}/api/control/projects/${projectId}/builder-session/preview`, {
    cookie: hub.header, headers: { origin: HUB, 'x-conexus-csrf': hub.csrf, 'content-type': 'application/json' }, body: '{}',
  })
  const { entryUrl, previewUrl, entryGrant, expiresAt } = launch.body ?? {}
  if (launch.status !== 201 || !entryUrl) {
    record('preview-opens', { method: 'POST', url: `${HUB}/api/control/projects/${projectId}/builder-session/preview` }, brief(launch), false)
    process.exit(1)
  }
  // The Hub page posts the entry handoff into the Preview's frame, from the Hub's origin.
  const entered = await call('POST', entryUrl, { headers: { origin: HUB, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ entryGrant }).toString() })
  const previewCookie = entered.setCookie.find((pair) => pair.startsWith('__Host-conexus_preview='))
  const page = previewCookie ? await call('GET', previewUrl, { cookie: previewCookie }) : { status: null }
  const replay = await call('POST', entryUrl, { headers: { origin: HUB, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ entryGrant }).toString() })
  const row = previewCookie ? sql(`SELECT kind || '|' || coalesce(ended_reason, 'open') || '|' || (absolute_expires_at - started_at) FROM iam.host_session WHERE token_digest = decode('${digestHex(previewCookie.split('=')[1])}', 'hex')`) : ''
  const hubStartedAtLaunch = execFileSync('bash', ['-c', 'head -1 $HOME/wt-single-session-hub.log'], { encoding: 'utf8' }).trim()
  writeFileSync(need('save'), JSON.stringify({ previewUrl, previewCookie, launchedAt: new Date().toISOString(), hubStartedAtLaunch }), { mode: 0o600, flag: 'w' })
  record('preview-opens', { launch: `POST ${HUB}/api/control/projects/${projectId}/builder-session/preview`, entry: `POST ${entryUrl} (Origin ${HUB})`, page: `GET ${previewUrl}` },
    { previewHost: new URL(previewUrl).hostname, hubSession: digestHex(hub.session).slice(0, 12), launch: launch.status, previewExpiresAt: expiresAt, entry: { status: entered.status, location: entered.location, setCookie: entered.setCookie.map((pair) => pair.split('=')[0]) }, page: page.status, entryReplay: replay.status, session: row },
    launch.status === 201 && entered.status === 303 && Boolean(previewCookie) && page.status === 200 && replay.status === 403 && row.startsWith('PREVIEW|open|'))
}

if (phase === 'preview-restart') {
  const { previewUrl, previewCookie, launchedAt, hubStartedAtLaunch } = readSaved()
  const hubStarted = execFileSync('bash', ['-c', 'head -1 $HOME/wt-single-session-hub.log'], { encoding: 'utf8' }).trim()
  const page = await call('GET', previewUrl, { cookie: previewCookie })
  const startOf = (line) => Date.parse(line?.split(' ')[2] ?? '')
  record('preview-survives-hub-restart', { url: previewUrl, as: 'the Preview cookie from before the restart, no new entry' },
    { launchedAt, hubBeforeRestart: hubStartedAtLaunch ?? null, hubAfterRestart: hubStarted, page: page.status },
    page.status === 200 && startOf(hubStartedAtLaunch) < Date.parse(launchedAt) && startOf(hubStarted) > Date.parse(launchedAt))
}

if (phase === 'hub-refused') {
  const POLL_SECONDS = 10
  const hub = hubCookies()
  const { previewUrl, previewCookie } = readSaved()
  const since = Date.parse(need('since'))
  const expected = need('expect')
  const polled = { hub: null, preview: null, hubLastAllowedAfterSeconds: null, previewLastAllowedAfterSeconds: null }
  for (let at = Date.now(); Date.now() - since < 7 * 60 * 1000; at = Date.now()) {
    const [hubAnswer, previewAnswer] = await Promise.all([
      call('GET', `${HUB}/api/control/access-context`, { cookie: hub.header }),
      call('GET', previewUrl, { cookie: previewCookie }),
    ])
    const seconds = Math.round((at - since) / 1000)
    if (hubAnswer.status === 200) polled.hubLastAllowedAfterSeconds = seconds
    if (previewAnswer.status === 200) polled.previewLastAllowedAfterSeconds = seconds
    if (!polled.hub && hubAnswer.status === 401) polled.hub = { refusedAfterSeconds: seconds, ...brief(hubAnswer) }
    if (!polled.preview && previewAnswer.status === 403) polled.preview = { refusedAfterSeconds: seconds, status: previewAnswer.status }
    if (polled.hub && polled.preview) break
    await sleep(POLL_SECONDS * 1000)
  }
  const ended = sql(`SELECT coalesce(ended_reason, 'open') || '|' || (provider_refresh_token IS NULL) FROM iam.host_session WHERE token_digest = decode('${digestHex(hub.session)}', 'hex')`)
  const previewEnded = sql(`SELECT coalesce(ended_reason, 'open') FROM iam.host_session WHERE token_digest = decode('${digestHex(previewCookie.split('=')[1])}', 'hex')`)
  const reason = { USER_DISABLED: 'PROVIDER_USER_DISABLED', SESSION_ENDED: 'PROVIDER_SESSION_ENDED' }[expected]
  const id = expected === 'USER_DISABLED' ? 'hub-user-disabled-loses-hub-and-preview' : 'keycloak-logout-ends-hub-and-preview'
  // Five minutes, as task section 8 states it: allowed before, never at or after 300 s, and refused by the
  // first request after 300 s, which the 10-second polling places within 310 s.
  const withinFiveMinutes = (lastAllowed, refused) => lastAllowed !== null && lastAllowed < 300 && refused !== null && refused <= 300 + POLL_SECONDS
  record(id, { hub: `GET ${HUB}/api/control/access-context`, preview: `GET ${previewUrl}`, every: `${POLL_SECONDS} s`, since: new Date(since).toISOString() },
    { ...polled, hubSession: ended, previewSession: previewEnded },
    withinFiveMinutes(polled.hubLastAllowedAfterSeconds, polled.hub?.refusedAfterSeconds ?? null) &&
      withinFiveMinutes(polled.previewLastAllowedAfterSeconds, polled.preview?.refusedAfterSeconds ?? null) &&
      ended === `${reason}|true` && previewEnded === 'PARENT_ENDED')
}

if (phase === 'grant' || phase === 'revoke') {
  const owner = hubCookies('owner-state')
  const projectId = need('project')
  const email = need('email').toLowerCase()
  const access = `${HUB}/api/control/projects/${projectId}/application-access`
  const writing = { origin: HUB, 'x-conexus-csrf': owner.csrf, 'content-type': 'application/json' }
  const listFor = async () => {
    const listed = await call('GET', access, { cookie: owner.header })
    return (listed.body?.entries ?? []).filter((entry) => (entry.email ?? '').toLowerCase() === email)
      .map(({ kind, grantId, invitationId }) => ({ kind, id: grantId ?? invitationId }))
  }
  const before = await listFor()
  if (phase === 'grant') {
    const granted = await call('POST', access, { cookie: owner.header, headers: writing, body: JSON.stringify({ email }) })
    const after = await listFor()
    const expected = need('expect')
    record(need('id'), { method: 'POST', url: access, body: { email }, as: 'the Owner' },
      { status: granted.status, answer: { kind: granted.body?.kind ?? null }, before, after },
      (granted.status === 200 || granted.status === 201) && granted.body?.kind === expected && after.length === 1 && after[0].kind === expected)
  } else {
    const held = before.find((entry) => entry.kind === 'grant')
    const revoked = held ? await call('DELETE', `${access}/grant/${held.id}`, { cookie: owner.header, headers: { origin: HUB, 'x-conexus-csrf': owner.csrf } }) : { status: null }
    const after = await listFor()
    record('owner-revokes-grant', { method: 'DELETE', url: `${access}/grant/<grantId>`, as: 'the Owner' },
      { status: revoked.status, before, after }, Boolean(held) && revoked.status === 204 && after.length === 0)
  }
}

if (phase === 'employee-lands') {
  const { chromium } = await import('@playwright/test')
  const origin = `https://${need('app')}.conexus.localhost:3445`
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ storageState: need('employee-state'), ignoreHTTPSErrors: false })
    const page = await context.newPage()
    const response = await page.goto(`${origin}/`)
    await page.waitForLoadState('networkidle').catch(() => {})
    const landed = page.url().split('?')[0]
    const expected = need('expect') === 'app' ? `${origin}/` : `${origin}/__conexus/no-access`
    record(need('id'), { url: `${origin}/`, as: 'the employee, from their browser state' }, { status: response?.status() ?? null, landed }, landed === expected)
    await context.storageState({ path: need('employee-state') })
  } finally {
    await browser.close()
  }
}

if (phase === 'concurrent') {
  const { chromium } = await import('@playwright/test')
  const origin = `https://${need('app')}.conexus.localhost:3445`
  const browser = await chromium.launch()
  let cookie
  try {
    const context = await browser.newContext({ storageState: need('member-state') })
    const page = await context.newPage()
    await page.goto(`${origin}/`)
    await page.waitForURL(`${origin}/`)
    cookie = (await context.cookies(`${origin}/`)).find((entry) => entry.name === '__Host-conexus_app')
  } finally {
    await browser.close()
  }
  if (!cookie) throw new Error('APPLICATION_SESSION_NOT_OPENED')
  const token = digestHex(cookie.value)
  const account = sql(`SELECT a.external_subject FROM iam.host_session s JOIN iam.account a USING (account_id) WHERE s.token_digest = decode('${token}', 'hex')`)
  // Six minutes since the last Keycloak check: the next request of this session makes it.
  const aged = sql(`UPDATE iam.host_session SET started_at = started_at - interval '6 minutes', absolute_expires_at = absolute_expires_at - interval '6 minutes', provider_checked_at = provider_checked_at - interval '6 minutes' WHERE token_digest = decode('${token}', 'hex') AND ended_at IS NULL RETURNING provider_checked_at`)
  const from = Date.now()
  const answers = await Promise.all([1, 2, 3, 4].map(() => call('GET', `${origin}/`, { cookie: `__Host-conexus_app=${cookie.value}` })))
  const until = Date.now()
  const after = sql(`SELECT coalesce(ended_reason, 'open') || '|' || provider_checked_at FROM iam.host_session WHERE token_digest = decode('${token}', 'hex')`).split('|')
  await sleep(2_000)
  const events = JSON.parse(execFileSync('docker', ['exec', 'conexus-keycloak', 'bash', '-c',
    '/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null 2>&1 && ' +
    `/opt/keycloak/bin/kcadm.sh get realms/conexus/events -q user=${account} -q max=100 --fields time,type,error`], { encoding: 'utf8' }))
  const refreshes = events.filter((event) => event.time >= from - 1_000 && event.time <= until + 1_000)
  record('concurrent-due-check-all-served', { requests: `4 × GET ${origin}/ at once, the Keycloak check due`, as: 'the member' },
    { agedCheckTo: aged, answers: answers.map((answer) => ({ status: answer.status, code: answer.body?.error?.code ?? null })), session: after[0], checkedAfter: after[1],
      keycloakEvents: refreshes.map((event) => ({ type: event.type, error: event.error ?? null })) },
    answers.every((answer) => answer.status === 200) && after[0] === 'open' && refreshes.length >= 1 && refreshes.length <= 4 &&
      refreshes.every((event) => event.type === 'REFRESH_TOKEN'))
}
