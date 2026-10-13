import { request } from 'node:http'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import { invalidConfig } from './failure-matchers.mjs'
import { testListener } from './access/test-listener.mjs'

const { createHostingModule } = await import(hubModuleUrl('hosting/module.js'))
const { registerApplicationHostRoutes } = await import(hubModuleUrl('hosting/application-host-routes.js'))
const { applicationSlugOfHost } = await import(hubModuleUrl('identity-access/public.js'))
const { applicationOrigin, readHubConfig } = await import(hubModuleUrl('platform/config.js'))

const missing = (name) => (error) => error.id === 'CONFIG_MISSING' && error.details?.name === name

const HUB = 'https://hub.conexus.localhost:3443'
const PORT = 3445
const APPLICATION = Object.freeze({ port: PORT, domain: 'conexus.localhost' })
const HOST_A = `caderno-de-compras.conexus.localhost:${PORT}`
const HOST_B = `outro-app.conexus.localhost:${PORT}`
const ORIGIN_A = `https://${HOST_A}`
const PROJECT_A = '11111111-1111-4111-8111-111111111111'
const PROJECT_B = '22222222-2222-4222-8222-222222222222'
const EMPLOYEE = Object.freeze({ accountId: '44444444-4444-4444-8444-444444444444', email: 'funcionaria@example.test', displayName: 'Funcionária' })
const TOKEN_A = 't'.repeat(43)
const HANDOFF = 'h'.repeat(43)
const SECOND_HANDOFF = 'k'.repeat(43)
const sha = (value) => createHash('sha256').update(value).digest()

const APPLICATIONS = Object.freeze({ 'caderno-de-compras': PROJECT_A, 'outro-app': PROJECT_B })
const BINDING = 'g'.repeat(43)
const MINTED = 'n'.repeat(43)

const harness = async (t, { outcomeFor, application = APPLICATION, runner } = {}) => {
  const calls = []
  const reads = []
  const sessions = new Map([[TOKEN_A, PROJECT_A]])
  const handoffs = new Map([[HANDOFF, { projectId: PROJECT_A, binding: BINDING }], [SECOND_HANDOFF, { projectId: PROJECT_A, binding: BINDING }]])
  const hostSessions = {
    async withApplicationRequest({ slug, token }, serve) {
      const early = outcomeFor ? await outcomeFor({ slug, token }) : undefined
      if (early) return early
      const projectId = APPLICATIONS[slug]
      if (!projectId || sessions.get(token) !== projectId) return { kind: 'SIGN_IN_REQUIRED' }
      return { kind: 'SERVED', value: await serve({ caller: EMPLOYEE, checked: { scope: { accountId: EMPLOYEE.accountId, projectId } } }) }
    },
    async redeem({ handoff, slug, binding }) {
      const found = handoffs.get(handoff)
      if (!found || found.projectId !== APPLICATIONS[slug] || found.binding !== binding) return null
      handoffs.delete(handoff)
      sessions.set(MINTED, found.projectId)
      return { sessionToken: MINTED, maxAgeSeconds: 28_800 }
    },
    async signOut(sessionToken) { calls.push({ name: 'signOut', sessionToken }); sessions.delete(sessionToken) },
  }
  const registry = {}
  const hosting = createHostingModule({
    sessions: { redeem: async () => null, withPreviewRequest: async () => ({ kind: 'SIGN_IN_REQUIRED' }) },
    registry,
    ...(runner ? { applicationRunner: runner } : {}),
    exactHubOrigin: HUB,
    previewPort: 3444,
    applicationHost: { sessions: hostSessions, application },
  })
  const { app } = await testListener({
    policy: hosting.applicationHost.policy,
    registerRoutes: (server) => runner ? hosting.applicationHost.registerRoutes(server) : registerApplicationHostRoutes(server, {
      exactHubOrigin: HUB, application, sessions: hostSessions,
    }),
  })
  t.after(() => app.close())
  return { app, calls, reads, sessions }
}

const signedIn = { cookies: { '__Host-conexus_app': TOKEN_A } }
const NAVIGATION = Object.freeze({ 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' })
const api = (operation, { host = HOST_A, origin = ORIGIN_A, cookies = signedIn.cookies, headers = {}, payload = {} } = {}) => ({
  method: 'POST', url: `/__conexus/api/${operation}`, cookies, payload,
  headers: { host, 'content-type': 'application/json', ...(origin ? { origin } : {}), ...headers },
})

test('only an exact application host label on the configured domain and port selects an application', () => {
  assert.equal(applicationSlugOfHost(APPLICATION, HOST_A), 'caderno-de-compras')
  for (const host of [undefined, 'caderno-de-compras.conexus.localhost', 'caderno-de-compras.conexus.localhost:3444', 'hub.evil.test:3445', 'a.b.conexus.localhost:3445', 'Caps.conexus.localhost:3445', 'a--b.conexus.localhost:3445']) {
    assert.equal(applicationSlugOfHost(APPLICATION, host), null, String(host))
  }
  const company = { port: 443, domain: 'apps.empresa.com.br' }
  assert.equal(applicationOrigin(company, 'caderno'), 'https://caderno.apps.empresa.com.br', 'the default port is not part of an origin')
  assert.equal(applicationSlugOfHost(company, 'caderno.apps.empresa.com.br'), 'caderno')
  assert.equal(applicationSlugOfHost(company, 'caderno.apps.empresa.com.br:443'), null)
  assert.equal(applicationOrigin(APPLICATION, 'caderno'), 'https://caderno.conexus.localhost:3445')
})

const configEnvironment = {
  NODE_ENV: 'test',
  CONEXUS_ORIGIN: 'https://hub.conexus.localhost:3443',
  CONEXUS_PORT: '3443',
  CONEXUS_BOOTSTRAP_SUBJECT: 'bootstrap-subject',
  CONEXUS_DB_HOST: '127.0.0.1',
  CONEXUS_DB_PORT: '5433',
  CONEXUS_DB_NAME: 'conexus_s7',
  CONEXUS_DB_USER: 'hub_runtime',
  CONEXUS_DB_PASSWORD_FILE: '/secrets/db',
  CONEXUS_SECRET_KEY_FILE: '/secrets/factory-key',
  CONEXUS_OIDC_ISSUER: 'https://issuer.conexus.localhost',
  CONEXUS_OIDC_CLIENT_ID: 'conexus-hub',
  CONEXUS_OIDC_CLIENT_SECRET_FILE: '/secrets/oidc',
  CONEXUS_PREVIEW_PORT: '3444',
  CONEXUS_PREVIEW_CERT_FILE: '/tls/cert.pem',
  CONEXUS_PREVIEW_KEY_FILE: '/tls/key.pem',
}
const builderEnvironment = {
  CONEXUS_BUILDER_E2B_API_KEY_FILE: '/secrets/e2b',
  CONEXUS_BUILDER_E2B_TEMPLATE_ID: 'conexusbuilder:0f9a1c2d-3e4b-4a5c-8d9e-0f1a2b3c4d5e',
  CONEXUS_SECRET_KEY_FILE: '/secrets/factory-key',
  CONEXUS_DB_FACTORY_PASSWORD_FILE: '/secrets/factory-db',
}

test('the application host is configured by port and domain together, and only with the runtime its listener serves from', () => {
  const application = { CONEXUS_APPLICATION_PORT: '3445', CONEXUS_APPLICATION_DOMAIN: 'conexus.localhost' }
  assert.deepEqual(readHubConfig({ ...configEnvironment, ...builderEnvironment, ...application }).application, { port: 3445, domain: 'conexus.localhost' })
  assert.equal(readHubConfig({ ...configEnvironment, ...builderEnvironment }).application, undefined)
  assert.throws(() => readHubConfig({ ...configEnvironment, ...builderEnvironment, CONEXUS_APPLICATION_PORT: '3445' }), missing('CONEXUS_APPLICATION_DOMAIN'))
  assert.throws(() => readHubConfig({ ...configEnvironment, ...builderEnvironment, CONEXUS_APPLICATION_DOMAIN: 'conexus.localhost' }), missing('CONEXUS_APPLICATION_PORT'))
  for (const domain of ['Conexus.Localhost', '.conexus.localhost', 'conexus..localhost', 'conexus.localhost:3445', 'https://conexus.localhost']) {
    assert.throws(() => readHubConfig({ ...configEnvironment, ...builderEnvironment, ...application, CONEXUS_APPLICATION_DOMAIN: domain }), invalidConfig('CONEXUS_APPLICATION_DOMAIN'), domain)
  }
  assert.throws(() => readHubConfig({ ...configEnvironment, ...application }), invalidConfig('APPLICATION_BUILDER_RUNTIME_REQUIRED'),
    'the application host needs the Builder module to read its served artifact')
})

test('the application host is a standalone top-level site: no Preview sandbox, never framed, no CORS, and Preview keeps its own policy', async (t) => {
  const { previewContentSecurityPolicy } = await import(hubModuleUrl('hosting/application-csp.js'))
  const { app } = await harness(t)
  const index = await app.inject({ method: 'GET', url: '/', headers: { host: HOST_A, origin: HUB }, ...signedIn })
  assert.equal(index.headers['content-security-policy'],
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; worker-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'")
  assert.equal(index.headers['x-frame-options'], 'DENY')
  assert.equal(index.headers['access-control-allow-origin'], undefined)
  assert.equal(previewContentSecurityPolicy('https://hub.conexus.localhost:3443'),
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; worker-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors https://hub.conexus.localhost:3443; sandbox allow-scripts allow-same-origin allow-forms",
    'the Preview policy is unchanged byte for byte')
})

test('the application host answers on its configured domain, and its API admits exactly that origin', async (t) => {
  const company = { port: PORT, domain: 'apps.empresa.test' }
  const host = `caderno-de-compras.apps.empresa.test:${PORT}`
  const { app } = await harness(t, { application: company })
  assert.equal((await app.inject({ method: 'GET', url: '/', headers: { host }, ...signedIn })).statusCode, 503)
  assert.equal((await app.inject({ method: 'GET', url: '/', headers: { host: HOST_A }, ...signedIn })).statusCode, 404)
  assert.equal((await app.inject(api('listNotes', { host, origin: `https://${host}` }))).statusCode, 503)
  const foreign = await app.inject(api('listNotes', { host, origin: ORIGIN_A }))
  assert.deepEqual([foreign.statusCode, foreign.json().code], [403, 'REQUEST_AUTHENTICITY_DENIED'])
})

test('a browser without a session is sent to the Hub sign-in with the application and a binding only it holds', async (t) => {
  const { app } = await harness(t)
  const response = await app.inject({ method: 'GET', url: '/', headers: { host: HOST_A, ...NAVIGATION } })
  assert.equal(response.statusCode, 303)
  const location = new URL(response.headers.location)
  assert.equal(`${location.origin}${location.pathname}`, `${HUB}/protocol/oidc/login`)
  assert.equal(location.searchParams.get('application'), 'caderno-de-compras')
  const binding = response.cookies.find((cookie) => cookie.name === '__Host-conexus_app_signin')
  assert.equal(binding.httpOnly, true)
  assert.equal(binding.secure, true)
  assert.equal(binding.sameSite, 'Lax')
  assert.equal(binding.domain, undefined)
  assert.equal(location.searchParams.get('binding'), sha(binding.value).toString('base64url'))
})

test('only a document navigation starts a sign-in; any other request without a session answers 401 and sets nothing', async (t) => {
  const { app } = await harness(t)
  for (const headers of [
    { 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'script' },
    { 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' },
    { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'iframe' },
    { 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'image' },
    {},
  ]) {
    const response = await app.inject({ method: 'GET', url: '/assets/app.js', headers: { host: HOST_A, ...headers } })
    assert.deepEqual([response.statusCode, response.json(), response.headers['set-cookie']], [401, { type: 'urn:conexus:problem:APPLICATION_SIGN_IN_REQUIRED', title: 'APPLICATION_SIGN_IN_REQUIRED', status: 401, code: 'APPLICATION_SIGN_IN_REQUIRED' }, undefined], JSON.stringify(headers))
  }
  assert.equal((await app.inject({ method: 'GET', url: '/assets/app.js', headers: { host: HOST_A, ...NAVIGATION } })).statusCode, 303)
  const head = await app.inject({ method: 'HEAD', url: '/', headers: { host: HOST_A, ...NAVIGATION } })
  assert.deepEqual([head.statusCode, head.headers['set-cookie']], [401, undefined], 'a HEAD is never a document navigation')
})

test('parallel navigations share one binding, and every handoff they bring back redeems, even after one fails', async (t) => {
  const { app } = await harness(t)
  // The browser's cookie jar for the application host, updated from each answer.
  const jar = new Map([['__Host-conexus_app_signin', BINDING]])
  const complete = async (handoff) => {
    const response = await app.inject({ method: 'GET', url: `/__conexus/sign-in/complete?handoff=${handoff}`, headers: { host: HOST_A }, cookies: Object.fromEntries(jar) })
    for (const cookie of response.cookies) {
      if (cookie.value === '') jar.delete(cookie.name)
      else jar.set(cookie.name, cookie.value)
    }
    return response.statusCode
  }
  assert.deepEqual([await complete('z'.repeat(43)), await complete(HANDOFF), await complete(SECOND_HANDOFF)], [403, 303, 303])
})

test('a sign-in in progress keeps its binding', async (t) => {
  const { app } = await harness(t)
  const held = 'b'.repeat(43)
  const response = await app.inject({ method: 'GET', url: '/', headers: { host: HOST_A, ...NAVIGATION }, cookies: { '__Host-conexus_app_signin': held } })
  assert.equal(response.statusCode, 303)
  assert.equal(new URL(response.headers.location).searchParams.get('binding'), sha(held).toString('base64url'))
  const binding = response.cookies.find((cookie) => cookie.name === '__Host-conexus_app_signin')
  assert.deepEqual([binding.value, binding.maxAge], [held, 720], 'the same value, with its lifetime renewed')
  const malformed = await app.inject({ method: 'GET', url: '/', headers: { host: HOST_A, ...NAVIGATION }, cookies: { '__Host-conexus_app_signin': 'short' } })
  assert.notEqual(malformed.cookies.find((cookie) => cookie.name === '__Host-conexus_app_signin').value, 'short')
})

test('a handoff is refused without its binding or on another host, then redeems once on its own host', async (t) => {
  const { app } = await harness(t)
  const complete = (host, cookies) => app.inject({ method: 'GET', url: `/__conexus/sign-in/complete?handoff=${HANDOFF}`, headers: { host }, cookies })
  assert.equal((await complete(HOST_A, {})).statusCode, 403, 'no binding cookie')
  assert.equal((await complete(HOST_A, { '__Host-conexus_app_signin': 'a'.repeat(43) })).statusCode, 403, 'another browser')
  assert.equal((await complete(HOST_B, { '__Host-conexus_app_signin': BINDING })).statusCode, 403, 'another application')
  assert.equal((await complete(HOST_A, { '__Host-conexus_app_signin': BINDING })).statusCode, 303, 'the refusals did not consume it')
  assert.equal((await complete(HOST_A, { '__Host-conexus_app_signin': BINDING })).statusCode, 403, 'redeemed once')
})

test('a redeemed handoff sets a host-only session cookie that replaces any value chosen before sign-in', async (t) => {
  const { app } = await harness(t)
  const response = await app.inject({
    method: 'GET', url: `/__conexus/sign-in/complete?handoff=${HANDOFF}`, headers: { host: HOST_A },
    cookies: { '__Host-conexus_app_signin': BINDING, '__Host-conexus_app': 'x'.repeat(43) },
  })
  assert.equal(response.statusCode, 303)
  assert.equal(response.headers.location, '/')
  const session = response.cookies.find((cookie) => cookie.name === '__Host-conexus_app')
  assert.equal(session.value, 'n'.repeat(43))
  assert.notEqual(session.value, 'x'.repeat(43))
  assert.equal(session.httpOnly && session.secure && session.path === '/' && session.domain === undefined, true)
  assert.equal(session.maxAge, 28_800)
  assert.equal(response.cookies.find((cookie) => cookie.name === '__Host-conexus_app_signin'), undefined, 'the binding stays for the other handoffs in flight')
  const replay = await app.inject({ method: 'GET', url: `/__conexus/sign-in/complete?handoff=${HANDOFF}`, headers: { host: HOST_A }, cookies: { '__Host-conexus_app_signin': BINDING } })
  assert.equal(replay.statusCode, 403)
})

test('a session for one application is no session on another application host', async (t) => {
  const { app } = await harness(t)
  const other = await app.inject({ method: 'GET', url: '/', headers: { host: HOST_B, ...NAVIGATION }, ...signedIn })
  assert.equal(other.statusCode, 303)
  assert.equal(new URL(other.headers.location).searchParams.get('application'), 'outro-app')
  const otherApi = await app.inject(api('addNote', { host: HOST_B, origin: `https://${HOST_B}` }))
  assert.equal(otherApi.statusCode, 401)
})

test('the Hub session cookie alone is no application session', async (t) => {
  const { app } = await harness(t)
  const response = await app.inject(api('addNote', { cookies: { '__Host-conexus_session': TOKEN_A } }))
  assert.equal(response.statusCode, 401)
  assert.deepEqual(response.json(), { type: 'urn:conexus:problem:APPLICATION_SIGN_IN_REQUIRED', title: 'APPLICATION_SIGN_IN_REQUIRED', status: 401, code: 'APPLICATION_SIGN_IN_REQUIRED' })
})

test('the application API admits only its own exact Origin', async (t) => {
  const { app, calls } = await harness(t)
  const refused = []
  for (const origin of [null, HUB, `https://${HOST_B}`, `http://${HOST_A}`, 'https://caderno-de-compras.conexus.localhost']) {
    refused.push((await app.inject(api('addNote', { origin }))).statusCode)
  }
  assert.deepEqual(refused, [403, 403, 403, 403, 403])
  assert.equal((await app.inject({ ...api('addNote'), headers: { host: HOST_A, origin: ORIGIN_A, 'content-type': 'text/plain' }, payload: '{}' })).statusCode, 415)
  assert.equal((await app.inject({ method: 'POST', url: '/__conexus/sign-out', headers: { host: HOST_A, origin: HUB }, ...signedIn })).statusCode, 403)
  assert.deepEqual(calls, [])
})

test('Keycloak unreachable when a check is due refuses with 503 and keeps nothing open', async (t) => {
  const { app } = await harness(t, { outcomeFor: () => ({ kind: 'PROVIDER_UNAVAILABLE' }) })
  assert.equal((await app.inject(api('addNote'))).statusCode, 503)
  assert.equal((await app.inject({ method: 'GET', url: '/', headers: { host: HOST_A }, ...signedIn })).statusCode, 503)
})

test('sign-out from the application ends its session and clears its cookie', async (t) => {
  const { app, calls, sessions } = await harness(t)
  const response = await app.inject({ method: 'POST', url: '/__conexus/sign-out', headers: { host: HOST_A, origin: ORIGIN_A }, ...signedIn })
  assert.equal(response.statusCode, 204)
  assert.deepEqual(calls, [{ name: 'signOut', sessionToken: TOKEN_A }])
  assert.equal(sessions.has(TOKEN_A), false)
  assert.equal(response.cookies.find((cookie) => cookie.name === '__Host-conexus_app').value, '')
  assert.equal((await app.inject(api('addNote'))).statusCode, 401)
})

test('sign-out clears the sign-in binding too, so a handoff still in flight cannot sign the person back in', async (t) => {
  const { app, sessions } = await harness(t)
  const jar = new Map([['__Host-conexus_app', TOKEN_A], ['__Host-conexus_app_signin', BINDING]])
  const replay = (response) => {
    for (const cookie of response.cookies) {
      if (cookie.value === '') jar.delete(cookie.name)
      else jar.set(cookie.name, cookie.value)
    }
  }
  const signOut = await app.inject({ method: 'POST', url: '/__conexus/sign-out', headers: { host: HOST_A, origin: ORIGIN_A }, cookies: Object.fromEntries(jar) })
  assert.equal(signOut.statusCode, 204)
  replay(signOut)
  assert.equal(jar.has('__Host-conexus_app_signin'), false, 'the binding cookie is gone from the jar after sign-out')
  const redeemed = await app.inject({ method: 'GET', url: `/__conexus/sign-in/complete?handoff=${HANDOFF}`, headers: { host: HOST_A }, cookies: Object.fromEntries(jar) })
  assert.equal(redeemed.statusCode, 403, 'a handoff redeemed with no binding cookie must not sign the person back in')
  assert.equal(sessions.has(TOKEN_A), false, 'no new session was minted for the old, signed-out token')
})

test('a person without access lands on a plain no-access page on the application host', async (t) => {
  const { app } = await harness(t)
  const response = await app.inject({ method: 'GET', url: '/__conexus/no-access', headers: { host: HOST_A } })
  assert.equal(response.statusCode, 403)
  assert.match(response.body, /Você não tem acesso a este aplicativo/)
})

test('a person denied for an unverified email sees copy naming that, not the generic no-access page', async (t) => {
  const { app } = await harness(t)
  const response = await app.inject({ method: 'GET', url: '/__conexus/no-access?reason=EMAIL_NOT_VERIFIED', headers: { host: HOST_A } })
  assert.equal(response.statusCode, 403)
  assert.match(response.body, /e-mail ainda não foi verificado/)
})

test('a sign-in that failed shows the sign-in failed copy, the same page the handoff refusal shows', async (t) => {
  const { app } = await harness(t)
  const response = await app.inject({ method: 'GET', url: '/__conexus/no-access?reason=SIGN_IN_FAILED', headers: { host: HOST_A } })
  assert.equal(response.statusCode, 403)
  assert.match(response.body, /O serviço de login não concluiu a entrada/)
  const refused = await app.inject({ method: 'GET', url: `/__conexus/sign-in/complete?handoff=${HANDOFF}`, headers: { host: HOST_A } })
  assert.deepEqual([refused.statusCode, refused.body], [403, response.body])
})

test('an unrecognized reason value falls back to the plain no-access page', async (t) => {
  const { app } = await harness(t)
  const response = await app.inject({ method: 'GET', url: '/__conexus/no-access?reason=<script>', headers: { host: HOST_A } })
  assert.equal(response.statusCode, 403)
  assert.match(response.body, /Você não tem acesso a este aplicativo/)
})

function socketReply(app, method, path, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const outgoing = request({ host: '127.0.0.1', port: app.server.address().port, method, path, headers: { host: HOST_A, ...headers } }, (incoming) => {
      const chunks = []
      incoming.on('data', (chunk) => chunks.push(chunk))
      incoming.on('end', () => resolve({ status: incoming.statusCode, headers: incoming.headers, text: Buffer.concat(chunks).toString('utf8') }))
    })
    outgoing.on('error', reject)
    outgoing.end(body)
  })
}

test('real application-host GET starts sign-in while HEAD retains a bodyless 401 Problem and security headers', async (t) => {
  const { app } = await harness(t)
  await app.listen({ host: '127.0.0.1', port: 0 })
  const get = await socketReply(app, 'GET', '/', NAVIGATION)
  assert.equal(get.status, 303)
  assert.ok(get.headers['set-cookie'])
  const head = await socketReply(app, 'HEAD', '/', NAVIGATION)
  assert.deepEqual([head.status, head.text, head.headers['set-cookie']], [401, '', undefined])
  assert.equal(head.headers['content-type'], 'application/problem+json')
  assert.equal(head.headers['x-content-type-options'], 'nosniff')
  assert.equal(head.headers['referrer-policy'], 'no-referrer')
  assert.match(head.headers['content-security-policy'], /frame-ancestors 'none'/)
})
