import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { request } from 'node:http'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { hubModuleUrl } from './hub-build.mjs'
import { invalidConfig } from './failure-matchers.mjs'
import { testListener } from './access/test-listener.mjs'

const { createMarModule } = await import(hubModuleUrl('mar/module.js'))
const { registerApplicationHostRoutes } = await import(hubModuleUrl('mar/application-host-routes.js'))
const { applicationOrigin, applicationSlugOfHost, readHubConfig } = await import(hubModuleUrl('platform/config.js'))

const missing = (name) => (error) => error.id === 'CONFIG_MISSING' && error.details?.name === name

const HUB = 'https://hub.conexus.localhost:3443'
const PORT = 3445
const APPLICATION = Object.freeze({ port: PORT, domain: 'conexus.localhost' })
const HOST_A = `caderno-de-compras.conexus.localhost:${PORT}`
const HOST_B = `outro-app.conexus.localhost:${PORT}`
const ORIGIN_A = `https://${HOST_A}`
const PROJECT_A = '11111111-1111-4111-8111-111111111111'
const PROJECT_B = '22222222-2222-4222-8222-222222222222'
const ARTIFACT = '33333333-3333-4333-8333-333333333333'
const EMPLOYEE = Object.freeze({ accountId: '44444444-4444-4444-8444-444444444444', email: 'funcionaria@example.test', displayName: 'Funcionária' })
const TOKEN_A = 't'.repeat(43)
const HANDOFF = 'h'.repeat(43)
const SECOND_HANDOFF = 'k'.repeat(43)
const sha = (value) => createHash('sha256').update(value).digest()

const files = {
  'index.html': { mediaType: 'text/html; charset=utf-8', text: '<!doctype html><title>Caderno</title>' },
  'assets/app.js': { mediaType: 'text/javascript; charset=utf-8', text: 'console.log(1)' },
  'conexus-server/manifest.json': { mediaType: 'application/json; charset=utf-8', text: '{}' },
}

const harness = async (t, { authorityFor, application = APPLICATION, invokeApplication } = {}) => {
  const calls = []
  const reads = []
  const sessions = new Map([[TOKEN_A, PROJECT_A]])
  const handoffs = new Map([[HANDOFF, { projectId: PROJECT_A, binding: 'binding-1' }], [SECOND_HANDOFF, { projectId: PROJECT_A, binding: 'binding-1' }]])
  const hostSessions = {
    async applicationBySlug(slug) { return { 'caderno-de-compras': PROJECT_A, 'outro-app': PROJECT_B }[slug] ?? null },
    async applicationAuthority({ sessionToken, projectId }) {
      if (authorityFor) return authorityFor({ sessionToken, projectId })
      return sessionToken && sessions.get(sessionToken) === projectId ? { kind: 'SIGNED_IN', caller: EMPLOYEE } : { kind: 'SIGN_IN_REQUIRED' }
    },
    async redeem({ handoff, target: { projectId, binding } }) {
      const found = handoffs.get(handoff)
      if (!found || found.projectId !== projectId || found.binding !== binding) return null
      handoffs.delete(handoff)
      sessions.set('n'.repeat(43), projectId)
      return { sessionToken: 'n'.repeat(43), maxAgeSeconds: 28_800 }
    },
    async signOut(sessionToken) { calls.push({ name: 'signOut', sessionToken }); sessions.delete(sessionToken) },
  }
  const registry = {
    async readServedManifest(_accountId, projectId) {
      reads.push('served')
      return projectId === PROJECT_A ? { artifactRevisionId: ARTIFACT, files: Object.entries(files).map(([path, file]) => ({ path, mediaType: file.mediaType })) } : null
    },
    async readServedFile(_accountId, projectId, path) {
      reads.push(`readServedFile ${path}`)
      if (projectId !== PROJECT_A) return { ok: false, reason: 'NOT_SERVED' }
      const file = files[path]
      return file
        ? { ok: true, artifactRevisionId: ARTIFACT, file: { path, mediaType: file.mediaType, bytes: Buffer.from(file.text), sha256: sha(file.text).toString('hex') } }
        : { ok: false, reason: 'NOT_FOUND' }
    },
    readPreviewFile: async () => null,
    readPinnedServedFile: async () => ({ ok: false, reason: 'NOT_SERVED' }),
  }
  const recordInvocation = async ({ callerLeft: _callerLeft, ...input }) => { calls.push({ name: 'invoke', input }); return { status: 200, body: { ok: true } } }
  const mar = createMarModule({
    sessions: { redeem: async () => null, previewAuthority: async () => ({ kind: 'SIGN_IN_REQUIRED' }) },
    registry,
    exactHubOrigin: HUB,
    previewPort: 3444,
    applicationHost: { sessions: hostSessions, application },
  })
  const { app } = await testListener({
    policy: mar.applicationHost.policy,
    registerRoutes: (server) => registerApplicationHostRoutes(server, {
      exactHubOrigin: HUB, application, sessions: hostSessions, reader: registry, invokeApplication: invokeApplication ?? recordInvocation,
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
  CONEXUS_FACTORY_SECRET_KEY_FILE: '/secrets/factory-key',
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
  CONEXUS_FACTORY_SECRET_KEY_FILE: '/secrets/factory-key',
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
  const { previewContentSecurityPolicy } = await import(hubModuleUrl('platform/application-csp.js'))
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
  assert.equal((await app.inject({ method: 'GET', url: '/', headers: { host }, ...signedIn })).statusCode, 200)
  assert.equal((await app.inject({ method: 'GET', url: '/', headers: { host: HOST_A }, ...signedIn })).statusCode, 404)
  assert.equal((await app.inject(api('listNotes', { host, origin: `https://${host}` }))).statusCode, 200)
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
  const jar = new Map([['__Host-conexus_app_signin', 'binding-1']])
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
  assert.equal((await complete(HOST_A, { '__Host-conexus_app_signin': 'another-browser' })).statusCode, 403, 'another browser')
  assert.equal((await complete(HOST_B, { '__Host-conexus_app_signin': 'binding-1' })).statusCode, 403, 'another application')
  assert.equal((await complete(HOST_A, { '__Host-conexus_app_signin': 'binding-1' })).statusCode, 303, 'the refusals did not consume it')
  assert.equal((await complete(HOST_A, { '__Host-conexus_app_signin': 'binding-1' })).statusCode, 403, 'redeemed once')
})

test('a redeemed handoff sets a host-only session cookie that replaces any value chosen before sign-in', async (t) => {
  const { app } = await harness(t)
  const response = await app.inject({
    method: 'GET', url: `/__conexus/sign-in/complete?handoff=${HANDOFF}`, headers: { host: HOST_A },
    cookies: { '__Host-conexus_app_signin': 'binding-1', '__Host-conexus_app': 'x'.repeat(43) },
  })
  assert.equal(response.statusCode, 303)
  assert.equal(response.headers.location, '/')
  const session = response.cookies.find((cookie) => cookie.name === '__Host-conexus_app')
  assert.equal(session.value, 'n'.repeat(43))
  assert.notEqual(session.value, 'x'.repeat(43))
  assert.equal(session.httpOnly && session.secure && session.path === '/' && session.domain === undefined, true)
  assert.equal(session.maxAge, 28_800)
  assert.equal(response.cookies.find((cookie) => cookie.name === '__Host-conexus_app_signin'), undefined, 'the binding stays for the other handoffs in flight')
  const replay = await app.inject({ method: 'GET', url: `/__conexus/sign-in/complete?handoff=${HANDOFF}`, headers: { host: HOST_A }, cookies: { '__Host-conexus_app_signin': 'binding-1' } })
  assert.equal(replay.statusCode, 403)
})

test('a page or asset costs one read of the served artifact, and the server tree is never read for the browser', async (t) => {
  const { app, reads } = await harness(t)
  assert.equal((await app.inject({ method: 'GET', url: '/assets/app.js', headers: { host: HOST_A }, ...signedIn })).body, files['assets/app.js'].text)
  assert.equal((await app.inject({ method: 'GET', url: '/conexus-server/manifest.json', headers: { host: HOST_A }, ...signedIn })).statusCode, 404)
  assert.deepEqual(reads, ['readServedFile assets/app.js'])
})

test('a signed-in person gets the served files, never the server tree, and the page is neither framed nor shared cross-origin', async (t) => {
  const { app } = await harness(t)
  const index = await app.inject({ method: 'GET', url: '/', headers: { host: HOST_A, origin: HUB }, ...signedIn })
  assert.equal(index.statusCode, 200)
  assert.equal(index.body, files['index.html'].text)
  assert.match(index.headers['content-security-policy'], /frame-ancestors 'none'$/)
  assert.equal(index.headers['access-control-allow-origin'], undefined)
  assert.equal(index.headers['referrer-policy'], 'no-referrer')
  assert.equal(index.headers['cache-control'], 'no-store')
  assert.equal((await app.inject({ method: 'GET', url: '/assets/app.js', headers: { host: HOST_A }, ...signedIn })).statusCode, 200)
  assert.equal((await app.inject({ method: 'GET', url: '/conexus-server/manifest.json', headers: { host: HOST_A }, ...signedIn })).statusCode, 404)
  assert.equal((await app.inject({ method: 'GET', url: '/missing.js', headers: { host: HOST_A }, ...signedIn })).statusCode, 404)
  assert.equal((await app.inject({ method: 'GET', url: '/', headers: { host: 'nobody.conexus.localhost:3445' }, ...signedIn })).statusCode, 404)
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

test('the handler caller comes from the session; identifiers in the body, query or headers change nothing', async (t) => {
  const { app, calls } = await harness(t)
  const forged = { projectId: PROJECT_B, accountId: '99999999-9999-4999-8999-999999999999', caller: { accountId: '99999999-9999-4999-8999-999999999999', displayName: 'Chefe' }, text: 'nota' }
  const response = await app.inject(api('addNote', {
    payload: forged,
    headers: { 'x-conexus-account': forged.accountId, 'x-conexus-project': PROJECT_B, 'x-conexus-caller': JSON.stringify(forged.caller) },
  }))
  assert.equal(response.statusCode, 200)
  assert.deepEqual(calls, [{
    name: 'invoke',
    input: {
      source: { via: 'APPLICATION', accountId: EMPLOYEE.accountId, projectId: PROJECT_A, artifactRevisionId: ARTIFACT },
      serverFiles: ['conexus-server/manifest.json'],
      operation: 'addNote',
      input: forged,
      caller: { accountId: '44444444-4444-4444-8444-444444444444', email: 'funcionaria@example.test', displayName: 'Funcionária' },
    },
  }])
})

const callOverSocket = async (app) => {
  await app.listen({ host: '127.0.0.1', port: 0 })
  const client = request({
    host: '127.0.0.1', port: app.server.address().port, method: 'POST', path: '/__conexus/api/listNotes',
    headers: { host: HOST_A, origin: ORIGIN_A, 'content-type': 'application/json', cookie: `__Host-conexus_app=${TOKEN_A}` },
  })
  client.on('error', () => {})
  client.end('{}')
  return client
}

test('a caller that disconnects while its call waits aborts that call\'s signal', async (t) => {
  let invoked
  const waiting = new Promise((resolve) => { invoked = resolve })
  const { app } = await harness(t, {
    invokeApplication: ({ callerLeft }) => {
      invoked(callerLeft)
      return once(callerLeft, 'abort').then(() => ({ status: 200, body: {} }))
    },
  })
  const client = await callOverSocket(app)
  const signal = await waiting
  assert.equal(signal.aborted, false, 'the call waits with a live signal')
  client.destroy()
  const outcome = await Promise.race([once(signal, 'abort').then(() => 'aborted'), delay(2000, 'still waiting', { ref: false })])
  assert.equal(outcome, 'aborted')
})

test('a caller that disconnects before its call reaches the invoker hands the invoker an aborted signal', async (t) => {
  const authorizing = Promise.withResolvers()
  const authorized = Promise.withResolvers()
  const invoked = Promise.withResolvers()
  const { app } = await harness(t, {
    authorityFor: async () => {
      authorizing.resolve()
      await authorized.promise
      return { kind: 'SIGNED_IN', caller: EMPLOYEE }
    },
    invokeApplication: async ({ callerLeft }) => {
      invoked.resolve(callerLeft.aborted)
      return { status: 200, body: {} }
    },
  })
  const connection = once(app.server, 'connection')
  const client = await callOverSocket(app)
  const [socket] = await connection
  await authorizing.promise
  client.destroy()
  await once(socket, 'close')
  authorized.resolve()
  assert.equal(await invoked.promise, true)
})

test('Keycloak unreachable when a check is due refuses with 503 and keeps nothing open', async (t) => {
  const { app } = await harness(t, { authorityFor: () => ({ kind: 'PROVIDER_UNAVAILABLE' }) })
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
  const jar = new Map([['__Host-conexus_app', TOKEN_A], ['__Host-conexus_app_signin', 'binding-1']])
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

test('an unrecognized reason value falls back to the plain no-access page', async (t) => {
  const { app } = await harness(t)
  const response = await app.inject({ method: 'GET', url: '/__conexus/no-access?reason=<script>', headers: { host: HOST_A } })
  assert.equal(response.statusCode, 403)
  assert.match(response.body, /Você não tem acesso a este aplicativo/)
})

test('the application host answers a deep link with the app index and the same CSP, and a missing file with 404', async (t) => {
  const { app, reads } = await harness(t)
  const index = await app.inject({ method: 'GET', url: '/', headers: { host: HOST_A }, ...signedIn })
  for (const [method, url] of [['GET', '/notas'], ['GET', '/notas/'], ['GET', '/notas/42'], ['HEAD', '/notas']]) {
    const answer = await app.inject({ method, url, headers: { host: HOST_A }, ...signedIn })
    assert.equal(answer.statusCode, 200, `${method} ${url}`)
    assert.equal(answer.headers['content-type'], 'text/html; charset=utf-8', `${method} ${url}`)
    assert.equal(answer.headers['content-security-policy'], index.headers['content-security-policy'], `${method} ${url}`)
    assert.match(answer.headers['content-security-policy'], /frame-ancestors 'none'$/, `${method} ${url}`)
    if (method === 'GET') assert.equal(answer.body, files['index.html'].text, url)
  }
  reads.length = 0
  for (const url of ['/x.js', '/x.js/', '/conexus-server/nope', '/conexus-server', '/__conexus/other']) {
    assert.equal((await app.inject({ method: 'GET', url, headers: { host: HOST_A }, ...signedIn })).statusCode, 404, url)
  }
  assert.deepEqual(reads, ['readServedFile x.js', 'readServedFile x.js'])
})
