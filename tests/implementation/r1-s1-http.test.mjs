import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import * as openidClient from 'openid-client'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const hubBuild = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r1-s1-http-build-'))
process.once('exit', () => rmSync(hubBuild, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', hubBuild,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`S1_HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
const built = (path) => pathToFileURL(resolve(hubBuild, path)).href
const { createHttpApp } = await import(built('http/app.js'))
const { registerIdentityAccessRoutes } = await import(built('identity-access/routes.js'))
const { createOidcAdapter } = await import(built('identity-access/oidc.js'))

const origin = 'https://conexus.test'
const config = { origin, bootstrapIssuer: 'https://issuer.test/realms/r1', bootstrapSubject: 'bootstrap-subject' }

test('S1 applies only the admitted openid-client execution hooks', async () => {
  const captured = []
  const discovery = async (...args) => {
    captured.push(args[4])
    throw new Error('DISCOVERY_CAPTURED')
  }
  const base = { issuer: 'https://issuer.test/realms/r1', clientId: 'client', clientSecret: 'secret', redirectUri: `${origin}/protocol/oidc/callback` }
  await assert.rejects(createOidcAdapter(base, { discovery }), /DISCOVERY_CAPTURED/)
  await assert.rejects(createOidcAdapter({ ...base, allowInsecureForTest: true }, { discovery }), /DISCOVERY_CAPTURED/)
  assert.deepEqual(captured.map(({ execute }) => execute), [
    [openidClient.enableNonRepudiationChecks],
    [openidClient.enableNonRepudiationChecks, openidClient.allowInsecureRequests],
  ])
})

const makeStore = () => {
  const state = { sessions: new Map(), oidc: new Map(), bootstrap: new Map(), accounts: new Map(), ended: [] }
  return {
    state,
    async createOidcTransaction(value) { state.oidc.set(value.state, value) },
    async consumeOidcTransaction({ state: key }) { const value = state.oidc.get(key); state.oidc.delete(key); return value ?? null },
    async resolveIdentity(identity) { return state.accounts.get(`${identity.issuer}|${identity.subject}`) ?? null },
    async createBootstrapContext(identity) { const value = 'bootstrap-token'; state.bootstrap.set(value, identity); return value },
    async provisionBootstrap({ bootstrapToken, displayName, email }) {
      if (!state.bootstrap.has(bootstrapToken)) throw Object.assign(new Error('sealed'), { code: 'BOOTSTRAP_SEALED' })
      state.bootstrap.delete(bootstrapToken)
      return { accountId: 'account-1', displayName, ...(email ? { email } : {}), replayed: false }
    },
    async createSession({ accountId }) { const value = { sessionToken: `session-${accountId}`, csrfToken: 'csrf-token' }; state.sessions.set(value.sessionToken, { account: { accountId, displayName: 'Leandro' }, issuer: config.bootstrapIssuer, subject: config.bootstrapSubject, csrfToken: value.csrfToken }); return value },
    async validateSession({ sessionToken, csrfToken, requireCsrf }) { const value = state.sessions.get(sessionToken); return value && (!requireCsrf || csrfToken === value.csrfToken) ? value : null },
    async endSession(value) { state.sessions.delete(value); state.ended.push(value); return true },
    async provisionByOperator({ externalSubject, displayName, email }) { return { accountId: `account-${externalSubject}`, displayName, ...(email ? { email } : {}), replayed: false } },
  }
}

const makeOidc = () => ({
  async begin() { return { state: 'state-1', nonce: 'nonce-1', pkceVerifier: 'pkce-1', location: 'https://issuer.test/authorize?state=state-1' } },
  async complete() { return { issuer: config.bootstrapIssuer, subject: config.bootstrapSubject } },
})

const createHubApp = ({ store, oidc, config, staticRoot = null }) => createHttpApp({
  registerRoutes: (app) => registerIdentityAccessRoutes(app, {
    store,
    oidc,
    config,
    resolveCurrentSession: async (request, requireCsrf = false) => {
      const sessionToken = request.cookies['__Host-conexus_session']
      if (!sessionToken) return null
      const value = request.headers['x-conexus-csrf']
      const csrfToken = Array.isArray(value) ? value[0] : value
      return store.validateSession({ sessionToken, csrfToken, requireCsrf })
    },
  }),
  staticRoot,
})

test('production OIDC configuration refuses an insecure issuer', async () => {
  await assert.rejects(
    createOidcAdapter({ issuer: 'http://identity.invalid/realms/r1', clientId: 'client', clientSecret: 'secret', redirectUri: `${origin}/protocol/oidc/callback` }),
    (error) => error.code === 'OAUTH_HTTP_REQUEST_FORBIDDEN',
  )
})

test('S1 exposes only generated IAM-01..03 through one sealed validator', async (t) => {
  const app = await createHubApp({ store: makeStore(), oidc: makeOidc(), config })
  t.after(() => app.close())
  assert.deepEqual(app.routeCensus(), ['IAM-01', 'IAM-02', 'IAM-03'])
  assert.equal(app.validatorInstallCount(), 1)
})

test('technical OIDC ingress binds server state and produces one-shot bootstrap context', async (t) => {
  const store = makeStore()
  const app = await createHubApp({ store, oidc: makeOidc(), config })
  t.after(() => app.close())
  const login = await app.inject({ method: 'GET', url: '/protocol/oidc/login' })
  assert.equal(login.statusCode, 302)
  assert.match(login.headers.location, /^https:\/\/issuer\.test\/authorize/)
  const stateCookie = login.cookies.find((item) => item.name === '__Host-conexus_oidc_state')
  assert.equal(stateCookie.httpOnly, true)
  assert.equal(stateCookie.secure, true)
  const callback = await app.inject({ method: 'GET', url: '/protocol/oidc/callback?code=code-1&state=state-1', cookies: { '__Host-conexus_oidc_state': 'state-1' } })
  assert.equal(callback.statusCode, 303)
  assert.equal(callback.headers.location, '/setup')
  assert.ok(callback.cookies.some((item) => item.name === '__Host-conexus_bootstrap' && item.httpOnly && item.secure))
  const replay = await app.inject({ method: 'GET', url: '/protocol/oidc/callback?code=code-1&state=state-1', cookies: { '__Host-conexus_oidc_state': 'state-1' } })
  assert.equal(replay.statusCode, 400)
})

test('bootstrap IAM-03 derives subject server-side and authenticity failures fire', async (t) => {
  const store = makeStore()
  store.state.bootstrap.set('bootstrap-token', { issuer: config.bootstrapIssuer, subject: config.bootstrapSubject })
  const app = await createHubApp({ store, oidc: makeOidc(), config })
  t.after(() => app.close())
  const denied = await app.inject({ method: 'POST', url: '/api/control/accounts', headers: { origin, 'idempotency-key': 'key-1', 'content-type': 'application/json' }, cookies: { '__Host-conexus_bootstrap': 'bootstrap-token', '__Host-conexus_csrf': 'csrf-1' }, payload: { displayName: 'Leandro' } })
  assert.equal(denied.statusCode, 403)
  const absent = await app.inject({ method: 'POST', url: '/api/control/accounts', headers: { origin, 'idempotency-key': 'key-absent', 'content-type': 'application/json' }, cookies: { '__Host-conexus_bootstrap': 'bootstrap-token' }, payload: { displayName: 'Leandro' } })
  assert.equal(absent.statusCode, 403)
  const created = await app.inject({ method: 'POST', url: '/api/control/accounts', headers: { origin, 'idempotency-key': 'key-1', 'x-conexus-csrf': 'csrf-1', 'content-type': 'application/json' }, cookies: { '__Host-conexus_bootstrap': 'bootstrap-token', '__Host-conexus_csrf': 'csrf-1' }, payload: { displayName: 'Leandro', email: 'leandro@example.test' } })
  assert.equal(created.statusCode, 201)
  assert.deepEqual(created.json(), { accountId: 'account-1', displayName: 'Leandro', email: 'leandro@example.test' })
  const injectedSubject = await app.inject({ method: 'POST', url: '/api/control/accounts', headers: { origin, 'idempotency-key': 'key-2', 'x-conexus-csrf': 'csrf-1', 'content-type': 'application/json' }, cookies: { '__Host-conexus_bootstrap': 'bootstrap-token', '__Host-conexus_csrf': 'csrf-1' }, payload: { externalSubject: 'attacker', displayName: 'Attacker' } })
  assert.notEqual(injectedSubject.statusCode, 201)
})

test('IAM-01 and IAM-02 use current opaque session and never claim provider logout', async (t) => {
  const store = makeStore()
  store.state.sessions.set('session-1', { account: { accountId: 'account-1', displayName: 'Leandro' }, issuer: config.bootstrapIssuer, subject: config.bootstrapSubject, csrfToken: 'csrf-1' })
  const app = await createHubApp({ store, oidc: makeOidc(), config })
  t.after(() => app.close())
  const context = await app.inject({ method: 'GET', url: '/api/control/access-context', cookies: { '__Host-conexus_session': 'session-1' } })
  assert.equal(context.statusCode, 200)
  assert.deepEqual(context.json(), { account: { accountId: 'account-1', displayName: 'Leandro' }, workspaces: [], projects: [] })
  const wrongOrigin = await app.inject({ method: 'DELETE', url: '/api/session', headers: { origin: 'https://attacker.test', 'x-conexus-csrf': 'csrf-1' }, cookies: { '__Host-conexus_session': 'session-1' } })
  assert.equal(wrongOrigin.statusCode, 403)
  const wrongCsrf = await app.inject({ method: 'DELETE', url: '/api/session', headers: { origin, 'x-conexus-csrf': 'wrong' }, cookies: { '__Host-conexus_session': 'session-1', '__Host-conexus_csrf': 'csrf-1' } })
  assert.equal(wrongCsrf.statusCode, 403)
  const ended = await app.inject({ method: 'DELETE', url: '/api/session', headers: { origin, 'x-conexus-csrf': 'csrf-1' }, cookies: { '__Host-conexus_session': 'session-1', '__Host-conexus_csrf': 'csrf-1' } })
  assert.equal(ended.statusCode, 204)
  assert.deepEqual(store.state.ended, ['session-1'])
  const after = await app.inject({ method: 'GET', url: '/api/control/access-context', cookies: { '__Host-conexus_session': 'session-1' } })
  assert.equal(after.statusCode, 401)
})

test('malformed IAM-03 body fires the generated schema before owner code', async (t) => {
  const app = await createHubApp({ store: makeStore(), oidc: makeOidc(), config })
  t.after(() => app.close())
  const response = await app.inject({ method: 'POST', url: '/api/control/accounts', headers: { origin, 'idempotency-key': 'key-1', 'x-conexus-csrf': 'csrf-1', 'content-type': 'application/json' }, cookies: { '__Host-conexus_bootstrap': 'bootstrap-token', '__Host-conexus_csrf': 'csrf-1' }, payload: { displayName: '   ', externalSubject: 'x', extra: true } })
  assert.equal(response.statusCode, 400)
})
