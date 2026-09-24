import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import * as openidClient from 'openid-client'
import { hubModuleUrl } from './hub-build.mjs'

const built = hubModuleUrl
const { createHttpApp } = await import(built('http/app.js'))
const { registerIdentityAccessRoutes } = await import(built('identity-access/routes.js'))
const { createOidcAdapter, resolveVerifiedEmail } = await import(built('identity-access/oidc.js'))
const { identityAccessError } = await import(built('identity-access/errors.js'))

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
  assert.equal(Object.hasOwn(captured[0], openidClient.customFetch), false)
  assert.equal(Object.hasOwn(captured[1], openidClient.customFetch), false)
})

test('local OIDC transport is admitted narrowly and closes with its adapter', async () => {
  let captured
  const discovery = async (...args) => {
    captured = args[4]
    return {}
  }
  const adapter = await createOidcAdapter({
    issuer: 'https://hub.conexus.localhost:8443/realms/r1f',
    clientId: 'client', clientSecret: 'secret', redirectUri: `${origin}/protocol/oidc/callback`,
  }, { discovery })
  assert.equal(Object.hasOwn(captured, openidClient.customFetch), true)
  await adapter.close()
  await adapter.close()
})

const makeStore = ({ eligible = true } = {}) => {
  const state = { sessions: new Map(), oidc: new Map(), bootstrap: new Map(), accounts: new Map(), ended: [], claimed: [] }
  return {
    state,
    async createOidcTransaction(value) { state.oidc.set(value.state, value) },
    async consumeOidcTransaction({ state: key }) { const value = state.oidc.get(key); state.oidc.delete(key); return value ?? null },
    async resolveIdentity(identity) { return state.accounts.get(`${identity.issuer}|${identity.subject}`) ?? null },
    async createProvisioningContext(identity) {
      if (!eligible) throw identityAccessError('IDENTITY_NOT_ELIGIBLE')
      const value = 'bootstrap-token'
      state.bootstrap.set(value, identity)
      return value
    },
    async claimInvitations(input) { state.claimed.push(input); return 1 },
    async provisionBootstrap({ bootstrapToken, displayName, email }) {
      if (!state.bootstrap.has(bootstrapToken)) throw identityAccessError('BOOTSTRAP_SEALED')
      state.bootstrap.delete(bootstrapToken)
      return { accountId: 'account-1', displayName, ...(email ? { email } : {}), replayed: false }
    },
    async createSession({ accountId }) { const value = { sessionToken: `session-${accountId}`, csrfToken: 'csrf-token' }; state.sessions.set(value.sessionToken, { account: { accountId, displayName: 'Leandro' }, issuer: config.bootstrapIssuer, subject: config.bootstrapSubject, csrfToken: value.csrfToken }); return value },
    async validateSession({ sessionToken, csrfToken, requireCsrf }) { const value = state.sessions.get(sessionToken); return value && (!requireCsrf || csrfToken === value.csrfToken) ? value : null },
    async endSession(value) { state.sessions.delete(value); state.ended.push(value); return true },
  }
}

const makeOidc = (identity = {}) => ({
  async begin() { return { state: 'state-1', nonce: 'nonce-1', pkceVerifier: 'pkce-1', location: 'https://issuer.test/authorize?state=state-1' } },
  async complete() { return { issuer: config.bootstrapIssuer, subject: config.bootstrapSubject, verifiedEmail: null, ...identity } },
})

const createHubApp = ({ store, oidc, config, staticRoot = null, applications }) => createHttpApp({
  registerRoutes: (app) => registerIdentityAccessRoutes(app, {
    store,
    oidc,
    config,
    ...(applications ? { applications } : {}),
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

test('an existing account claims its invitations before its session starts', async (t) => {
  const store = makeStore()
  store.state.accounts.set(`${config.bootstrapIssuer}|${config.bootstrapSubject}`, { accountId: 'account-1', displayName: 'Leandro' })
  const app = await createHubApp({ store, oidc: makeOidc({ verifiedEmail: 'leandro@example.test' }), config })
  t.after(() => app.close())
  await app.inject({ method: 'GET', url: '/protocol/oidc/login' })
  const callback = await app.inject({ method: 'GET', url: '/protocol/oidc/callback?code=code-1&state=state-1', cookies: { '__Host-conexus_oidc_state': 'state-1' } })
  assert.equal(callback.statusCode, 303)
  assert.equal(callback.headers.location, '/')
  assert.deepEqual(store.state.claimed, [{ accountId: 'account-1', verifiedEmail: 'leandro@example.test' }])
})

test('an unknown identity that is neither first nor invited is refused', async (t) => {
  const store = makeStore({ eligible: false })
  const app = await createHubApp({ store, oidc: makeOidc({ subject: 'stranger', verifiedEmail: 'stranger@example.test' }), config })
  t.after(() => app.close())
  await app.inject({ method: 'GET', url: '/protocol/oidc/login' })
  const callback = await app.inject({ method: 'GET', url: '/protocol/oidc/callback?code=code-1&state=state-1', cookies: { '__Host-conexus_oidc_state': 'state-1' } })
  assert.equal(callback.statusCode, 403)
})

test('an unverified address reaches provisioning carrying no claimable email', async (t) => {
  const store = makeStore()
  const app = await createHubApp({ store, oidc: makeOidc({ subject: 'invited', verifiedEmail: null }), config })
  t.after(() => app.close())
  await app.inject({ method: 'GET', url: '/protocol/oidc/login' })
  const callback = await app.inject({ method: 'GET', url: '/protocol/oidc/callback?code=code-1&state=state-1', cookies: { '__Host-conexus_oidc_state': 'state-1' } })
  assert.equal(callback.statusCode, 303)
  assert.equal(store.state.bootstrap.get('bootstrap-token').verifiedEmail, null)
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
  assert.equal(injectedSubject.statusCode, 400)
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

test('an email_verified claim that is not the strict boolean true is refused, and only its type is logged', () => {
  const logged = []
  const log = (line) => logged.push(line)

  assert.equal(resolveVerifiedEmail({ email_verified: true, email: 'ana@example.test' }, log), 'ana@example.test')
  assert.deepEqual(logged, [])

  assert.equal(resolveVerifiedEmail({ email_verified: false, email: 'ana@example.test' }, log), null)
  assert.deepEqual(logged, [])

  assert.equal(resolveVerifiedEmail({ email_verified: 'true', email: 'ana@example.test' }, log), null)
  assert.equal(resolveVerifiedEmail({ email_verified: 'false', email: 'ana@example.test' }, log), null)
  assert.deepEqual(logged, [
    { event: 'oidc_email_verified_unexpected_type', claimType: 'string' },
    { event: 'oidc_email_verified_unexpected_type', claimType: 'string' },
  ])
  for (const line of logged) {
    assert.equal(JSON.stringify(line).includes('ana@example.test'), false)
    assert.equal(JSON.stringify(line).includes('true'), false)
    assert.equal(JSON.stringify(line).includes('false'), false)
  }

  assert.equal(resolveVerifiedEmail({ email: 'ana@example.test' }, log), null)
  assert.deepEqual(logged.length, 2)
})

const PROJECT_ID = '66666666-6666-4666-8666-666666666666'
const BINDING_DIGEST = createHash('sha256').update('binding-1').digest('base64url')
const makeApplications = (outcome) => {
  const calls = []
  return {
    calls,
    applications: {
      origin: (slug) => `https://${slug}.conexus.localhost:3445`,
      sessions: {
        async applicationBySlug(slug) { calls.push({ name: 'applicationBySlug', slug }); return slug === 'caderno-de-compras' ? PROJECT_ID : null },
        async signIn(input) { calls.push({ name: 'signIn', input }); return outcome },
      },
    },
  }
}
const loginUrl = (query) => `/protocol/oidc/login?${new URLSearchParams(query)}`

test('TI-01 takes an application and its binding together, and refuses one alone, a malformed one or an unknown application', async (t) => {
  const store = makeStore()
  const { applications } = makeApplications({ kind: 'NO_ACCESS', slug: 'caderno-de-compras' })
  const app = await createHubApp({ store, oidc: makeOidc(), config, applications })
  const bare = await createHubApp({ store: makeStore(), oidc: makeOidc(), config })
  t.after(() => Promise.all([app.close(), bare.close()]))

  const started = await app.inject({ method: 'GET', url: loginUrl({ application: 'caderno-de-compras', binding: BINDING_DIGEST }) })
  assert.equal(started.statusCode, 302)
  const stored = store.state.oidc.get('state-1')
  assert.equal(stored.signInReturn.kind, 'APPLICATION')
  assert.equal(stored.signInReturn.projectId, PROJECT_ID)
  assert.equal(Buffer.from(stored.signInReturn.bindingDigest).toString('base64url'), BINDING_DIGEST)

  const statuses = []
  for (const query of [
    { application: 'caderno-de-compras' },
    { binding: BINDING_DIGEST },
    { application: 'Caderno', binding: BINDING_DIGEST },
    { application: 'caderno-de-compras', binding: 'short' },
    { application: 'caderno-de-compras', binding: 'b'.repeat(43) },
    { application: 'outro-app', binding: BINDING_DIGEST },
  ]) statuses.push((await app.inject({ method: 'GET', url: loginUrl(query) })).statusCode)
  assert.deepEqual(statuses, [400, 400, 400, 400, 400, 404])
  assert.equal((await bare.inject({ method: 'GET', url: loginUrl({ application: 'caderno-de-compras', binding: BINDING_DIGEST }) })).statusCode, 400)

  const hub = await app.inject({ method: 'GET', url: '/protocol/oidc/login' })
  assert.equal(hub.statusCode, 302)
  assert.deepEqual(store.state.oidc.get('state-1').signInReturn, { kind: 'HUB' })
})

test('TI-02 for an application sign-in returns to the application host with a handoff and sets no Hub cookie', async (t) => {
  const store = makeStore()
  store.state.accounts.set('https://issuer.test/realms/r1|employee', { accountId: 'account-9', displayName: 'Funcionária' })
  const handoff = 'h'.repeat(43)
  const { applications, calls } = makeApplications({ kind: 'HANDOFF', slug: 'caderno-de-compras', handoff })
  const identity = { subject: 'employee', verifiedEmail: 'funcionaria@example.test', displayName: 'Funcionária', refreshToken: 'refresh-1' }
  const app = await createHubApp({ store, oidc: makeOidc(identity), config, applications })
  t.after(() => app.close())
  await app.inject({ method: 'GET', url: loginUrl({ application: 'caderno-de-compras', binding: BINDING_DIGEST }) })
  const callback = await app.inject({ method: 'GET', url: '/protocol/oidc/callback?code=code-1&state=state-1', cookies: { '__Host-conexus_oidc_state': 'state-1' } })
  assert.equal(callback.statusCode, 303)
  assert.equal(callback.headers.location, `https://caderno-de-compras.conexus.localhost:3445/__conexus/sign-in/complete?handoff=${handoff}`)
  assert.equal(callback.headers['referrer-policy'], 'no-referrer')
  assert.deepEqual(callback.cookies.map((item) => item.name), ['__Host-conexus_oidc_state'])
  assert.equal(callback.cookies[0].value, '')
  const signIn = calls.find((call) => call.name === 'signIn').input
  assert.equal(signIn.existingAccountId, 'account-9')
  assert.equal(signIn.projectId, PROJECT_ID)
  assert.equal(signIn.identity.refreshToken, 'refresh-1')
  assert.deepEqual(store.state.claimed, [], 'an application sign-in claims no Workspace invitation')
  assert.equal(store.state.sessions.size, 0, 'no Hub session exists')
})

test('TI-02 sends a person without access to the application host no-access page', async (t) => {
  const store = makeStore()
  const { applications } = makeApplications({ kind: 'NO_ACCESS', slug: 'caderno-de-compras' })
  const app = await createHubApp({ store, oidc: makeOidc({ subject: 'control', verifiedEmail: 'control@example.test', refreshToken: 'r' }), config, applications })
  t.after(() => app.close())
  await app.inject({ method: 'GET', url: loginUrl({ application: 'caderno-de-compras', binding: BINDING_DIGEST }) })
  const callback = await app.inject({ method: 'GET', url: '/protocol/oidc/callback?code=code-1&state=state-1', cookies: { '__Host-conexus_oidc_state': 'state-1' } })
  assert.equal(callback.statusCode, 303)
  assert.equal(callback.headers.location, 'https://caderno-de-compras.conexus.localhost:3445/__conexus/no-access')
  assert.equal(store.state.sessions.size, 0)
})

test('an app-only Account signing in at the Hub is refused with no session cookie', async (t) => {
  const store = makeStore()
  store.state.accounts.set(`${config.bootstrapIssuer}|app-only`, { accountId: 'account-app', displayName: 'Funcionária' })
  store.createSession = async () => { throw identityAccessError('IDENTITY_NOT_ELIGIBLE') }
  const app = await createHubApp({ store, oidc: makeOidc({ subject: 'app-only', verifiedEmail: 'funcionaria@example.test' }), config })
  t.after(() => app.close())
  await app.inject({ method: 'GET', url: '/protocol/oidc/login' })
  const callback = await app.inject({ method: 'GET', url: '/protocol/oidc/callback?code=code-1&state=state-1', cookies: { '__Host-conexus_oidc_state': 'state-1' } })
  assert.equal(callback.statusCode, 403)
  assert.equal(callback.cookies.some((item) => item.name === '__Host-conexus_session' || item.name === '__Host-conexus_csrf'), false)
})
