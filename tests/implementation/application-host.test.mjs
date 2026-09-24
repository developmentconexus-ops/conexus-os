import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { createHttpApp } = await import(hubModuleUrl('http/app.js'))
const { registerApplicationHostRoutes } = await import(hubModuleUrl('mar/application-host-routes.js'))
const { applicationOrigin, applicationSlugOfHost, readHubConfig } = await import(hubModuleUrl('platform/config.js'))

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
const sha = (value) => createHash('sha256').update(value).digest()

const files = {
  'index.html': { mediaType: 'text/html; charset=utf-8', text: '<!doctype html><title>Caderno</title>' },
  'assets/app.js': { mediaType: 'text/javascript; charset=utf-8', text: 'console.log(1)' },
  'conexus-server/manifest.json': { mediaType: 'application/json; charset=utf-8', text: '{}' },
}

const harness = async (t, { authorityFor, application = APPLICATION } = {}) => {
  const calls = []
  const sessions = new Map([[TOKEN_A, PROJECT_A]])
  const handoffs = new Map([[HANDOFF, { projectId: PROJECT_A, binding: 'binding-1' }]])
  const app = await createHttpApp({
    staticRoot: null,
    registerRoutes: (server) => registerApplicationHostRoutes(server, {
      exactHubOrigin: HUB,
      application,
      sessions: {
        async applicationBySlug(slug) { return { 'caderno-de-compras': PROJECT_A, 'outro-app': PROJECT_B }[slug] ?? null },
        async authority({ sessionToken, projectId }) {
          if (authorityFor) return authorityFor({ sessionToken, projectId })
          return sessionToken && sessions.get(sessionToken) === projectId ? { kind: 'SIGNED_IN', caller: EMPLOYEE } : { kind: 'SIGN_IN_REQUIRED' }
        },
        async redeem({ handoff, projectId, binding }) {
          const found = handoffs.get(handoff)
          handoffs.delete(handoff)
          if (!found || found.projectId !== projectId || found.binding !== binding) return null
          sessions.set('n'.repeat(43), projectId)
          return { sessionToken: 'n'.repeat(43), maxAgeSeconds: 28_800 }
        },
        async signOut(sessionToken) { calls.push({ name: 'signOut', sessionToken }); sessions.delete(sessionToken) },
      },
      reader: {
        async served({ projectId }) {
          return projectId === PROJECT_A ? { artifactRevisionId: ARTIFACT, files: Object.entries(files).map(([path, file]) => ({ path, mediaType: file.mediaType })) } : null
        },
        async readFile({ path }) {
          const file = files[path]
          return file ? { path, mediaType: file.mediaType, bytes: Buffer.from(file.text), sha256: sha(file.text).toString('hex') } : null
        },
      },
      invokeApplication: async (input) => { calls.push({ name: 'invoke', input }); return { status: 200, body: { ok: true } } },
    }),
  })
  t.after(() => app.close())
  return { app, calls, sessions }
}

const signedIn = { cookies: { '__Host-conexus_app': TOKEN_A } }
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
  CONEXUS_DB_USER: 'hub_bootstrap',
  CONEXUS_DB_PASSWORD_FILE: '/secrets/db',
  CONEXUS_DB_WORKSPACE_COMMAND_PASSWORD_FILE: '/secrets/ws-command',
  CONEXUS_DB_WORKSPACE_READ_PASSWORD_FILE: '/secrets/ws-read',
  CONEXUS_DB_PROJECT_COMMAND_PASSWORD_FILE: '/secrets/project-command',
  CONEXUS_DB_PROJECT_READ_PASSWORD_FILE: '/secrets/project-read',
  CONEXUS_OIDC_ISSUER: 'https://issuer.conexus.localhost',
  CONEXUS_OIDC_CLIENT_ID: 'conexus-hub',
  CONEXUS_OIDC_CLIENT_SECRET_FILE: '/secrets/oidc',
  CONEXUS_PREVIEW_PORT: '3444',
  CONEXUS_PREVIEW_CERT_FILE: '/tls/cert.pem',
  CONEXUS_PREVIEW_KEY_FILE: '/tls/key.pem',
}
const builderEnvironment = {
  CONEXUS_DB_BUILDER_INGRESS_PASSWORD_FILE: '/secrets/builder-ingress',
  CONEXUS_DB_BUILDER_EXECUTOR_PASSWORD_FILE: '/secrets/builder-executor',
  CONEXUS_BUILDER_E2B_API_KEY_FILE: '/secrets/e2b',
  CONEXUS_BUILDER_E2B_TEMPLATE_ID: 'conexusbuilder:0f9a1c2d-3e4b-4a5c-8d9e-0f1a2b3c4d5e',
  CONEXUS_FACTORY_ORG_ID: 'conexus-installation',
  CONEXUS_FACTORY_GITHUB_APP_ID: '5015512',
  CONEXUS_FACTORY_GITHUB_CLIENT_ID: 'Iv23-client',
  CONEXUS_FACTORY_GITHUB_APP_SLUG: 'conexus-app',
  CONEXUS_FACTORY_GITHUB_PRIVATE_KEY_FILE: '/secrets/factory.pem',
  CONEXUS_FACTORY_GITHUB_CLIENT_SECRET_FILE: '/secrets/factory-client',
  CONEXUS_FACTORY_STATE_SECRET_FILE: '/secrets/factory-state',
  CONEXUS_FACTORY_SECRET_KEY_FILE: '/secrets/factory-key',
  CONEXUS_DB_FACTORY_PASSWORD_FILE: '/secrets/factory-db',
}

test('the application host is configured by port and domain together, and only with the runtime its listener serves from', () => {
  const application = { CONEXUS_APPLICATION_PORT: '3445', CONEXUS_APPLICATION_DOMAIN: 'conexus.localhost' }
  assert.deepEqual(readHubConfig({ ...configEnvironment, ...builderEnvironment, ...application }).application, { port: 3445, domain: 'conexus.localhost' })
  assert.equal(readHubConfig({ ...configEnvironment, ...builderEnvironment }).application, undefined)
  assert.throws(() => readHubConfig({ ...configEnvironment, ...builderEnvironment, CONEXUS_APPLICATION_PORT: '3445' }), { message: 'MISSING_CONFIG_CONEXUS_APPLICATION_DOMAIN' })
  assert.throws(() => readHubConfig({ ...configEnvironment, ...builderEnvironment, CONEXUS_APPLICATION_DOMAIN: 'conexus.localhost' }), { message: 'MISSING_CONFIG_CONEXUS_APPLICATION_PORT' })
  for (const domain of ['Conexus.Localhost', '.conexus.localhost', 'conexus..localhost', 'conexus.localhost:3445', 'https://conexus.localhost']) {
    assert.throws(() => readHubConfig({ ...configEnvironment, ...builderEnvironment, ...application, CONEXUS_APPLICATION_DOMAIN: domain }), { message: 'INVALID_CONFIG_CONEXUS_APPLICATION_DOMAIN' }, domain)
  }
  assert.throws(() => readHubConfig({ ...configEnvironment, ...application }), { message: 'APPLICATION_BUILDER_RUNTIME_REQUIRED' },
    'the application host reads the served artifact as the Builder executor, so it refuses to start without it')
})

test('the application host is a standalone top-level site: no Preview sandbox, never framed, no CORS, and Preview keeps its own policy', async (t) => {
  const { previewContentSecurityPolicy } = await import(hubModuleUrl('mar/preview-routes.js'))
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
  assert.deepEqual([foreign.statusCode, foreign.json().error.code], [403, 'ORIGIN_REFUSED'])
})

test('a browser without a session is sent to the Hub sign-in with the application and a binding only it holds', async (t) => {
  const { app } = await harness(t)
  const response = await app.inject({ method: 'GET', url: '/', headers: { host: HOST_A } })
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

test('a handoff is redeemed once, only with its binding and on its own host, and the session value is minted then', async (t) => {
  const { app } = await harness(t)
  const complete = (host, cookies) => app.inject({ method: 'GET', url: `/__conexus/sign-in/complete?handoff=${HANDOFF}`, headers: { host }, cookies })
  assert.equal((await complete(HOST_A, {})).statusCode, 403, 'no binding cookie')
  const wrongHost = await complete(HOST_B, { '__Host-conexus_app_signin': 'binding-1' })
  assert.equal(wrongHost.statusCode, 403, 'the handoff is for another application, and the attempt burns it')
  assert.equal((await complete(HOST_A, { '__Host-conexus_app_signin': 'binding-1' })).statusCode, 403, 'a burnt handoff is gone')
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
  assert.equal(response.cookies.find((cookie) => cookie.name === '__Host-conexus_app_signin').value, '')
  const replay = await app.inject({ method: 'GET', url: `/__conexus/sign-in/complete?handoff=${HANDOFF}`, headers: { host: HOST_A }, cookies: { '__Host-conexus_app_signin': 'binding-1' } })
  assert.equal(replay.statusCode, 403)
})

test('a signed-in person gets the served files, never the server tree, and the page is neither framed nor shared cross-origin', async (t) => {
  const { app } = await harness(t)
  const index = await app.inject({ method: 'GET', url: '/', headers: { host: HOST_A, origin: HUB }, ...signedIn })
  assert.equal(index.statusCode, 200)
  assert.equal(index.body, files['index.html'].text)
  assert.match(index.headers['content-security-policy'], /frame-ancestors 'none';/)
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
  const other = await app.inject({ method: 'GET', url: '/', headers: { host: HOST_B }, ...signedIn })
  assert.equal(other.statusCode, 303)
  assert.equal(new URL(other.headers.location).searchParams.get('application'), 'outro-app')
  const otherApi = await app.inject(api('addNote', { host: HOST_B, origin: `https://${HOST_B}` }))
  assert.equal(otherApi.statusCode, 401)
})

test('the Hub session cookie alone is no application session', async (t) => {
  const { app } = await harness(t)
  const response = await app.inject(api('addNote', { cookies: { '__Host-conexus_session': TOKEN_A, '__Host-conexus_csrf': 'c' } }))
  assert.equal(response.statusCode, 401)
  assert.deepEqual(response.json(), { error: { code: 'APPLICATION_SIGN_IN_REQUIRED' } })
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

test('a person without access lands on a plain no-access page on the application host', async (t) => {
  const { app } = await harness(t)
  const response = await app.inject({ method: 'GET', url: '/__conexus/no-access', headers: { host: HOST_A } })
  assert.equal(response.statusCode, 403)
  assert.match(response.body, /Você não tem acesso a este aplicativo/)
})
