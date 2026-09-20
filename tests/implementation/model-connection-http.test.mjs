import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const hubBuild = mkdtempSync(resolve(repositoryRoot, 'apps/hub/model-connection-http-build-'))
process.once('exit', () => rmSync(hubBuild, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', hubBuild,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
const built = (path) => pathToFileURL(resolve(hubBuild, path)).href
const { createHttpApp } = await import(built('http/app.js'))
const { registerModelConnectionRoutes } = await import(built('model-connection-account/routes.js'))

const origin = 'https://conexus.test'
const accountId = '22222222-2222-4222-8222-222222222222'
const otherAccountId = '55555555-5555-4555-8555-555555555555'
const connectionId = '11111111-1111-4111-8111-111111111111'
const workspaceId = '33333333-3333-4333-8333-333333333333'
const SENTINEL = 'sk-sentinel-never-echoed-7c41b9e2a0d8'

const projection = {
  connectionId,
  label: 'OpenAI key',
  state: 'ACTIVE',
  generation: '1',
  ownerAccountId: accountId,
  workspaceId: '',
  role: 'OWNER',
  revokedAt: null,
  providerId: 'openai',
  credentialKind: 'API_KEY',
  selected: true,
}

const makeStore = (overrides = {}) => {
  const calls = []
  const record = (name) => async (input) => { calls.push({ name, input }); return undefined }
  return {
    calls,
    async addApiKey(input) { calls.push({ name: 'addApiKey', input }); return projection },
    async list(input) { calls.push({ name: 'list', input }); return [projection] },
    select: record('select'),
    share: record('share'),
    unshare: record('unshare'),
    revoke: record('revoke'),
    admitForProject: record('admitForProject'),
    ...overrides,
  }
}

// One flow per provider the sign-in offers, the same shape the account module builds from the
// descriptor registry. Every call records itself, so a test can tell which row the route picked.
const flowCalls = []
const fakeFlow = (providerId) => ({
  createAuthorizationRequest: async () => { flowCalls.push({ providerId, name: 'start' }); return { verifier: 'v'.repeat(43), state: `state-${providerId}`, url: `https://${providerId}.test/authorize` } },
  extractState: (value) => { flowCalls.push({ providerId, name: 'extractState' }); return value },
  parse: () => { flowCalls.push({ providerId, name: 'parse' }); return 'code-fixture' },
  exchange: async () => { flowCalls.push({ providerId, name: 'exchange' }); return { access: 'a', refresh: 'r', expiresAt: Date.now() + 60_000 } },
})
const oauthFlows = Object.freeze({ anthropic: fakeFlow('anthropic'), 'openai-codex': fakeFlow('openai-codex') })

const createHubApp = (store, { signedIn = true } = {}) => createHttpApp({
  registerRoutes: (app) => registerModelConnectionRoutes(app, {
    store,
    origin,
    resolveCurrentSession: async (request, requireCsrf = false) => {
      if (!signedIn || !request.cookies['__Host-conexus_session']) return null
      const value = request.headers['x-conexus-csrf']
      const csrfToken = Array.isArray(value) ? value[0] : value
      if (requireCsrf && csrfToken !== 'csrf-1') return null
      return { account: { accountId, displayName: 'Leandro' }, issuer: 'https://issuer.test', subject: 'subject-1' }
    },
    oauthFlows,
  }),
  staticRoot: null,
})

const authentic = {
  headers: { origin, 'x-conexus-csrf': 'csrf-1', 'content-type': 'application/json' },
  cookies: { '__Host-conexus_session': 'session-1', '__Host-conexus_csrf': 'csrf-1' },
}

const addKey = { url: '/api/control/me/model-connections/api-key', method: 'POST' }
const keyPayload = { providerId: 'openai', label: 'OpenAI key', apiKey: SENTINEL }

test('adding a key carries the same census id the ledger names', async (t) => {
  const app = await createHubApp(makeStore())
  t.after(() => app.close())
  assert.deepEqual(app.routeCensus(), ['CLA-01', 'CLA-02', 'CLA-03', 'CLA-04', 'CLA-05', 'CLA-06', 'CLA-07', 'CLA-08'])
})

const startAuthorization = { url: '/api/control/me/model-connections/authorization', method: 'POST' }
const completeAuthorization = { url: '/api/control/me/model-connections/authorization/complete', method: 'POST' }

test('starting a sign-in names its provider, and the route runs that provider flow', async (t) => {
  const app = await createHubApp(makeStore({ startAuthorization: async (input) => ({ authorizationId: 'a-1', url: input.authorization.url, state: input.authorization.state }) }))
  t.after(() => app.close())
  flowCalls.length = 0

  const response = await app.inject({ ...startAuthorization, ...authentic, payload: { providerId: 'openai-codex' } })
  assert.equal(response.statusCode, 201)
  assert.equal(response.json().url, 'https://openai-codex.test/authorize')
  assert.deepEqual(flowCalls, [{ providerId: 'openai-codex', name: 'start' }])
})

// There is no default provider. The browser ships with the Hub and always names one, so a body
// without it is a malformed request rather than a request to be guessed at.
test('a sign-in that names no provider is refused by the body schema, and an unknown one by name', async (t) => {
  const store = makeStore()
  const app = await createHubApp(store)
  t.after(() => app.close())
  flowCalls.length = 0

  const missing = await app.inject({ ...startAuthorization, ...authentic, payload: {} })
  assert.equal(missing.statusCode, 400)

  const unknown = await app.inject({ ...startAuthorization, ...authentic, payload: { providerId: 'openai' } })
  assert.equal(unknown.statusCode, 422)
  assert.equal(unknown.json().type, 'urn:conexus:problem:model-connection-provider-unknown')

  const missingOnComplete = await app.inject({ ...completeAuthorization, ...authentic, payload: { result: 'code#state', label: 'Minha conta' } })
  assert.equal(missingOnComplete.statusCode, 400)

  assert.deepEqual(flowCalls, [])
  assert.deepEqual(store.calls, [])
})

test('completing a sign-in carries the named provider into custody', async (t) => {
  const store = makeStore({ completeAuthorization: async (input) => { store.calls.push({ name: 'completeAuthorization', input }); return projection } })
  const app = await createHubApp(store)
  t.after(() => app.close())
  flowCalls.length = 0

  const response = await app.inject({ ...completeAuthorization, ...authentic, payload: { providerId: 'openai-codex', result: 'http://localhost:1455/auth/callback?code=c&state=s', label: 'Minha conta ChatGPT' } })
  assert.equal(response.statusCode, 201)
  assert.equal(store.calls[0].name, 'completeAuthorization')
  assert.equal(store.calls[0].input.providerId, 'openai-codex')
  assert.equal(store.calls[0].input.label, 'Minha conta ChatGPT')
})

test('a key posted from another origin is refused before the store is reached', async (t) => {
  const store = makeStore()
  const app = await createHubApp(store)
  t.after(() => app.close())
  const response = await app.inject({
    ...addKey,
    headers: { ...authentic.headers, origin: 'https://attacker.test' },
    cookies: authentic.cookies,
    payload: keyPayload,
  })
  assert.equal(response.statusCode, 403)
  assert.equal(response.json().title, 'Request authenticity denied')
  assert.deepEqual(store.calls, [])
  assert.equal(response.body.includes(SENTINEL), false)
})

test('a key posted without the double-submitted CSRF token is refused before the store is reached', async (t) => {
  const store = makeStore()
  const app = await createHubApp(store)
  t.after(() => app.close())
  const missing = await app.inject({
    ...addKey,
    headers: { origin, 'content-type': 'application/json' },
    cookies: authentic.cookies,
    payload: keyPayload,
  })
  const mismatched = await app.inject({
    ...addKey,
    headers: { ...authentic.headers, 'x-conexus-csrf': 'csrf-2' },
    cookies: authentic.cookies,
    payload: keyPayload,
  })
  assert.equal(missing.statusCode, 403)
  assert.equal(mismatched.statusCode, 403)
  assert.deepEqual(store.calls, [])
})

test('a key posted without a session is refused with 401', async (t) => {
  const store = makeStore()
  const app = await createHubApp(store, { signedIn: false })
  t.after(() => app.close())
  const response = await app.inject({ ...addKey, ...authentic, payload: keyPayload })
  assert.equal(response.statusCode, 401)
  assert.equal(response.json().title, 'Authentication required')
  assert.deepEqual(store.calls, [])
})

test('the actor is the session account, and the body cannot name another one', async (t) => {
  const store = makeStore()
  const app = await createHubApp(store)
  t.after(() => app.close())
  const impersonating = await app.inject({ ...addKey, ...authentic, payload: { ...keyPayload, accountId: otherAccountId } })
  assert.equal(impersonating.statusCode, 400)
  assert.deepEqual(store.calls, [])

  const accepted = await app.inject({ ...addKey, ...authentic, payload: keyPayload })
  assert.equal(accepted.statusCode, 201)
  assert.deepEqual(store.calls, [{
    name: 'addApiKey',
    input: { accountId, providerId: 'openai', label: 'OpenAI key', apiKey: SENTINEL },
  }])
})

test('the created connection is the stored projection, and the key is not in it', async (t) => {
  const app = await createHubApp(makeStore())
  t.after(() => app.close())
  const response = await app.inject({ ...addKey, ...authentic, payload: keyPayload })
  assert.equal(response.statusCode, 201)
  assert.deepEqual(response.json(), projection)
  assert.equal(response.body.includes(SENTINEL), false)
})

test('a provider the model router does not know is refused by name, before custody', async (t) => {
  const store = makeStore()
  const app = await createHubApp(store)
  t.after(() => app.close())
  const response = await app.inject({ ...addKey, ...authentic, payload: { ...keyPayload, providerId: 'not-a-provider' } })
  assert.equal(response.statusCode, 422)
  assert.equal(response.json().title, 'That provider is not one the model router knows')
  assert.deepEqual(store.calls, [])
})

test('a key may be filed under any provider the model router knows, not a deployment shortlist', async (t) => {
  const store = makeStore()
  const app = await createHubApp(store)
  t.after(() => app.close())
  const response = await app.inject({ ...addKey, ...authentic, payload: JSON.stringify({ providerId: 'groq', label: 'Groq key', apiKey: SENTINEL }) })
  assert.equal(response.statusCode, 201)
  assert.deepEqual(store.calls, [{ name: 'addApiKey', input: { accountId, providerId: 'groq', label: 'Groq key', apiKey: SENTINEL } }])
})

test('a custody failure answers a fixed problem that never quotes the key', async (t) => {
  const app = await createHubApp(makeStore({
    addApiKey: async () => { throw new Error(`MODEL_CONNECTION_PUBLISH_REFUSED while filing ${SENTINEL}`) },
  }))
  t.after(() => app.close())
  const response = await app.inject({ ...addKey, ...authentic, payload: keyPayload })
  assert.equal(response.statusCode, 503)
  assert.equal(response.json().title, 'Authorization succeeded but the connection could not be published')
  assert.equal(response.body.includes(SENTINEL), false)
})

test('the list is everything that can be connected, and says which connection is in use', async (t) => {
  const store = makeStore()
  const app = await createHubApp(store)
  t.after(() => app.close())
  const response = await app.inject({
    method: 'GET',
    url: '/api/control/me/model-connections',
    cookies: { '__Host-conexus_session': 'session-1' },
  })
  assert.equal(response.statusCode, 200)
  const body = response.json()
  assert.deepEqual(Object.keys(body).sort(), ['accountSignIns', 'apiKeyProviders', 'connections'])
  assert.deepEqual(body.connections, [projection])
  assert.equal(body.connections[0].selected, true)
  assert.deepEqual(body.accountSignIns, [
    { providerId: 'anthropic', name: 'Claude' },
    { providerId: 'openai-codex', name: 'ChatGPT' },
  ])
  assert.deepEqual(body.apiKeyProviders.find((provider) => provider.providerId === 'groq'),
    { providerId: 'groq', name: 'Groq', docUrl: 'https://console.groq.com/docs/models' })
  assert.ok(body.apiKeyProviders.length > 100)
  assert.equal(body.apiKeyProviders.some((provider) => provider.providerId === 'openai-codex'), false)
  assert.deepEqual(store.calls, [{ name: 'list', input: accountId }])
})

test('the list refuses a caller with no session', async (t) => {
  const store = makeStore()
  const app = await createHubApp(store, { signedIn: false })
  t.after(() => app.close())
  const response = await app.inject({ method: 'GET', url: '/api/control/me/model-connections' })
  assert.equal(response.statusCode, 401)
  assert.deepEqual(store.calls, [])
})

test('select, share and unshare bind the actor from the session and carry only the body ids', async (t) => {
  const store = makeStore()
  const app = await createHubApp(store)
  t.after(() => app.close())
  const select = await app.inject({ method: 'POST', url: '/api/control/me/model-connections/select', ...authentic, payload: { connectionId } })
  const share = await app.inject({ method: 'POST', url: '/api/control/me/model-connections/share', ...authentic, payload: { connectionId, workspaceId } })
  const unshare = await app.inject({ method: 'POST', url: '/api/control/me/model-connections/unshare', ...authentic, payload: { connectionId, workspaceId } })
  assert.deepEqual([select.statusCode, share.statusCode, unshare.statusCode], [204, 204, 204])
  assert.deepEqual(store.calls, [
    { name: 'select', input: { accountId, connectionId } },
    { name: 'share', input: { accountId, connectionId, workspaceId } },
    { name: 'unshare', input: { accountId, connectionId, workspaceId } },
  ])
})

test('select, share and unshare carry the same origin, CSRF and session guards as adding a key', async (t) => {
  const store = makeStore()
  const app = await createHubApp(store)
  t.after(() => app.close())
  const paths = ['select', 'share', 'unshare']
  const payloads = { select: { connectionId }, share: { connectionId, workspaceId }, unshare: { connectionId, workspaceId } }
  for (const path of paths) {
    const foreign = await app.inject({
      method: 'POST',
      url: `/api/control/me/model-connections/${path}`,
      headers: { ...authentic.headers, origin: 'https://attacker.test' },
      cookies: authentic.cookies,
      payload: payloads[path],
    })
    assert.equal(foreign.statusCode, 403)
  }
  assert.deepEqual(store.calls, [])
})

test('a share the database refuses is a 403, not a leak of the denial', async (t) => {
  const app = await createHubApp(makeStore({
    share: async () => { throw new Error('MODEL_CONNECTION_SHARE_DENIED') },
  }))
  t.after(() => app.close())
  const response = await app.inject({
    method: 'POST',
    url: '/api/control/me/model-connections/share',
    ...authentic,
    payload: { connectionId, workspaceId },
  })
  assert.equal(response.statusCode, 403)
  assert.equal(response.json().title, 'Model connection operation denied')
  assert.equal(response.body.includes('MODEL_CONNECTION_SHARE_DENIED'), false)
})
