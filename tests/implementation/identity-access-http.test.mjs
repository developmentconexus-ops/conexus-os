import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { createServer } from 'node:http'
import { test } from 'node:test'
import * as openidClient from 'openid-client'
import { hubModuleUrl } from './hub-build.mjs'

const built = hubModuleUrl
const { createHttpApp } = await import(built('http/app.js'))
const { registerIdentityAccessRoutes } = await import(built('identity-access/routes.js'))
const { createOidcAdapter } = await import(built('identity-access/oidc.js'))
const { Failure } = await import(built('platform/failure.js'))

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
    issuer: 'https://hub.conexus.localhost:8443/realms/conexus',
    clientId: 'client', clientSecret: 'secret', redirectUri: `${origin}/protocol/oidc/callback`,
  }, { discovery })
  assert.equal(Object.hasOwn(captured, openidClient.customFetch), true)
  await adapter.close()
  await adapter.close()
})

test('a refused refresh names why Keycloak refused it: a disabled user, an ended SSO session, or anything else', async (t) => {
  const descriptions = { 'disabled-token': 'User disabled', 'idle-token': 'Session not active', 'reused-token': 'Maximum allowed refresh token reuse exceeded' }
  const tokenEndpoint = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      response.writeHead(400, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'invalid_grant', error_description: descriptions[new URLSearchParams(body).get('refresh_token')] }))
    })
  })
  await new Promise((resolve) => tokenEndpoint.listen(0, '127.0.0.1', resolve))
  t.after(() => tokenEndpoint.close())
  const discovery = async (issuer, clientId, clientSecret, _authentication, options) => {
    const configuration = new openidClient.Configuration({ issuer: issuer.href, token_endpoint: `http://127.0.0.1:${tokenEndpoint.address().port}/token` }, clientId, clientSecret)
    for (const hook of options.execute) hook(configuration)
    return configuration
  }
  const adapter = await createOidcAdapter({ issuer: 'http://identity.test/realms/r1', clientId: 'client', clientSecret: 'secret', redirectUri: `${origin}/protocol/oidc/callback`, allowInsecureForTest: true }, { discovery })
  t.after(() => adapter.close())
  const reasons = []
  for (const refreshToken of ['disabled-token', 'idle-token', 'reused-token']) reasons.push(await adapter.refresh({ refreshToken, expectedSubject: 'subject' }))
  assert.deepEqual(reasons, [
    { kind: 'REFUSED', reason: 'USER_DISABLED' },
    { kind: 'REFUSED', reason: 'SESSION_ENDED' },
    { kind: 'REFUSED', reason: 'REFUSED' },
  ])
})

test('ending the Keycloak session posts the refresh token to the logout endpoint and says ENDED only when Keycloak does', async (t) => {
  const posted = []
  const answers = {
    'live-token': [204, ''],
    'gone-token': [400, JSON.stringify({ error: 'invalid_grant', error_description: 'Session not active' })],
    'client-token': [400, JSON.stringify({ error: 'invalid_request' })],
    'broken-token': [500, 'oops'],
    'unauthorized-token': [401, JSON.stringify({ error: 'unauthorized_client' })],
  }
  const logoutEndpoint = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      const form = Object.fromEntries(new URLSearchParams(body))
      posted.push({ method: request.method, url: request.url, contentType: request.headers['content-type'], form })
      if (form.refresh_token === 'silent-token') return
      const [status, payload] = answers[form.refresh_token]
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(payload)
    })
  })
  await new Promise((resolve) => logoutEndpoint.listen(0, '127.0.0.1', resolve))
  t.after(() => { logoutEndpoint.closeAllConnections(); logoutEndpoint.close() })
  const base = `http://127.0.0.1:${logoutEndpoint.address().port}`
  const adapterFor = async (metadata) => {
    const discovery = async (issuer, clientId, clientSecret, _authentication, options) => {
      const configuration = new openidClient.Configuration({ issuer: issuer.href, ...metadata }, clientId, clientSecret)
      for (const hook of options.execute) hook(configuration)
      return configuration
    }
    const adapter = await createOidcAdapter({ issuer: 'http://identity.test/realms/r1', clientId: 'client', clientSecret: 'secret', redirectUri: `${origin}/protocol/oidc/callback`, allowInsecureForTest: true }, { discovery })
    t.after(() => adapter.close())
    return adapter
  }
  const adapter = await adapterFor({ end_session_endpoint: `${base}/logout` })
  const end = (refreshToken, signal = AbortSignal.timeout(2_000)) => adapter.endProviderSession({ refreshToken, signal })

  assert.equal(await end('live-token'), 'ENDED')
  assert.deepEqual(posted, [{ method: 'POST', url: '/logout', contentType: 'application/x-www-form-urlencoded', form: { client_id: 'client', client_secret: 'secret', refresh_token: 'live-token' } }])
  assert.equal(await end('gone-token'), 'ENDED', 'Keycloak has no session left for the token')
  assert.equal(await end('client-token'), 'UNCONFIRMED', 'another 400 is no answer about the session')
  assert.equal(await end('broken-token'), 'UNCONFIRMED')
  assert.equal(await end('unauthorized-token'), 'UNCONFIRMED')
  const started = Date.now()
  assert.equal(await end('silent-token', AbortSignal.timeout(200)), 'UNCONFIRMED', 'a deadline that passes')
  assert.ok(Date.now() - started < 1_500)
  assert.equal(await (await adapterFor({ end_session_endpoint: 'http://127.0.0.1:1/logout' })).endProviderSession({ refreshToken: 'live-token', signal: AbortSignal.timeout(2_000) }), 'UNCONFIRMED', 'an unreachable Keycloak')
  const before = posted.length
  assert.equal(await (await adapterFor({})).endProviderSession({ refreshToken: 'live-token', signal: AbortSignal.timeout(2_000) }), 'UNCONFIRMED', 'a provider that names no logout endpoint')
  assert.equal(posted.length, before)
})

const capturePinoLogs = async (fn) => {
  const { logger } = await import(built('platform/logger.js'))
  const pinoStreamSym = Object.getOwnPropertySymbols(logger).find((s) => s.description === 'pino.stream')
  const stream = logger[pinoStreamSym]
  const originalWrite = stream.write.bind(stream)
  const logs = []
  stream.write = (chunk) => {
    try {
      logs.push(JSON.parse(chunk))
    } catch {
      // ignore
    }
  }
  try {
    return await fn(logs)
  } finally {
    stream.write = originalWrite
  }
}

const makeStore = ({ eligible = true } = {}) => {
  const state = { sessions: new Map(), oidc: new Map(), bootstrap: new Map(), accounts: new Map(), ended: [], claimed: [], opened: [] }
  return {
    state,
    async createOidcTransaction(value) { state.oidc.set(value.state, value) },
    async consumeOidcTransaction({ state: key }) { const value = state.oidc.get(key); state.oidc.delete(key); return value ?? null },
    async resolveIdentity(identity) { return state.accounts.get(`${identity.issuer}|${identity.subject}`) ?? null },
    async createProvisioningContext(identity) {
      if (!eligible) throw new Failure('IDENTITY_NOT_ELIGIBLE')
      const value = 'bootstrap-token'
      state.bootstrap.set(value, identity)
      return value
    },
    async claimInvitations(input) { state.claimed.push(input); return 1 },
    async provisionBootstrap({ bootstrapToken, displayName, email }) {
      if (!state.bootstrap.has(bootstrapToken)) throw new Failure('BOOTSTRAP_SEALED')
      state.bootstrap.delete(bootstrapToken)
      return { accountId: 'account-1', displayName, ...(email ? { email } : {}), replayed: false }
    },
    async openHub({ accountId, refreshToken }) { state.opened.push({ accountId, refreshToken }); const value = { sessionToken: `session-${accountId}`, csrfToken: 'csrf-token' }; state.sessions.set(value.sessionToken, { account: { accountId, displayName: 'Leandro' }, issuer: config.bootstrapIssuer, subject: config.bootstrapSubject, csrfToken: value.csrfToken }); return value },
    async resolveHub({ sessionToken, csrfToken, requireCsrf }) { const value = state.sessions.get(sessionToken); return value && (!requireCsrf || csrfToken === value.csrfToken) ? value : null },
    async endHub({ sessionToken, csrfToken }) {
      const value = state.sessions.get(sessionToken)
      if (!value || value.csrfToken !== csrfToken) return false
      state.sessions.delete(sessionToken); state.ended.push(sessionToken); return { refreshToken: value.refreshToken ?? null }
    },
  }
}

const makeOidc = (identity = {}, { providerLogout = async () => 'ENDED', calls = [] } = {}) => ({
  calls,
  async endProviderSession(input) { calls.push(input); return providerLogout(input) },
  async begin() { return { state: 'state-1', nonce: 'nonce-1', pkceVerifier: 'pkce-1', location: 'https://issuer.test/authorize?state=state-1' } },
  async complete() { return { issuer: config.bootstrapIssuer, subject: config.bootstrapSubject, verifiedEmail: null, refreshToken: 'keycloak-refresh', ...identity } },
})

const createHubApp = ({ store, oidc, config, staticRoot = null, applications }) => createHttpApp({
  registerRoutes: (app) => registerIdentityAccessRoutes(app, {
    store,
    oidc,
    config,
    hubSessions: store,
    ...(applications ? { applications } : {}),
    resolveCurrentSession: async (request, requireCsrf = false) => {
      const sessionToken = request.cookies['__Host-conexus_session']
      if (!sessionToken) return null
      const value = request.headers['x-conexus-csrf']
      const csrfToken = Array.isArray(value) ? value[0] : value
      return store.resolveHub({ sessionToken, csrfToken, requireCsrf })
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

test('S1 exposes only generated IAM-01..03', async (t) => {
  const app = await createHubApp({ store: makeStore(), oidc: makeOidc(), config })
  t.after(() => app.close())
  assert.deepEqual(app.routeCensus(), ['IAM-01', 'IAM-02', 'IAM-03'])
})

test('an existing account claims its invitations before its session starts', async (t) => {
  const store = makeStore()
  store.state.accounts.set(`${config.bootstrapIssuer}|${config.bootstrapSubject}`, { accountId: 'account-1', displayName: 'Leandro' })
  const app = await createHubApp({ store, oidc: makeOidc({ verifiedEmail: 'leandro@example.test', refreshToken: 'keycloak-refresh-1' }), config })
  t.after(() => app.close())
  await app.inject({ method: 'GET', url: '/protocol/oidc/login' })
  const callback = await app.inject({ method: 'GET', url: '/protocol/oidc/callback?code=code-1&state=state-1', cookies: { '__Host-conexus_oidc_state': 'state-1' } })
  assert.equal(callback.statusCode, 303)
  assert.equal(callback.headers.location, '/')
  assert.deepEqual(store.state.claimed, [{ accountId: 'account-1', verifiedEmail: 'leandro@example.test' }])
  assert.deepEqual(store.state.opened, [{ accountId: 'account-1', refreshToken: 'keycloak-refresh-1' }], 'the Hub session keeps the sign-in refresh token')
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

const signedInStore = () => {
  const store = makeStore()
  store.state.sessions.set('session-1', { account: { accountId: 'account-1', displayName: 'Leandro' }, issuer: config.bootstrapIssuer, subject: config.bootstrapSubject, csrfToken: 'csrf-1', refreshToken: 'keycloak-refresh-1' })
  return store
}
const signOut = (app, csrf = 'csrf-1', requestOrigin = origin) => app.inject({ method: 'DELETE', url: '/api/session', headers: { origin: requestOrigin, 'x-conexus-csrf': csrf }, cookies: { '__Host-conexus_session': 'session-1', '__Host-conexus_csrf': 'csrf-1' } })
const clearedCookies = (response) => [response.headers['set-cookie']].flat().filter((cookie) => /Max-Age=0|Expires=Thu, 01 Jan 1970/.test(cookie)).map((cookie) => cookie.split('=')[0]).sort()

test('IAM-01 uses the current opaque session; IAM-02 ends it first, then asks Keycloak to end the SSO session behind it', async (t) => {
  const store = signedInStore()
  const order = []
  const oidc = makeOidc({}, { providerLogout: async () => { order.push(`keycloak after ${JSON.stringify(store.state.ended)}`); return 'ENDED' } })
  const app = await createHubApp({ store, oidc, config })
  t.after(() => app.close())
  const context = await app.inject({ method: 'GET', url: '/api/control/access-context', cookies: { '__Host-conexus_session': 'session-1' } })
  assert.equal(context.statusCode, 200)
  assert.deepEqual(context.json(), { account: { accountId: 'account-1', displayName: 'Leandro' }, workspaces: [], projects: [] })
  assert.equal((await signOut(app, 'csrf-1', 'https://attacker.test')).statusCode, 403)
  assert.equal((await signOut(app, 'wrong')).statusCode, 403)
  assert.deepEqual(oidc.calls, [], 'a refused sign-out never reaches Keycloak')
  const ended = await signOut(app)
  assert.equal(ended.statusCode, 204)
  assert.equal(ended.body, '', 'the answer says the Conexus session ended, nothing about Keycloak')
  assert.deepEqual(store.state.ended, ['session-1'])
  assert.deepEqual(oidc.calls.map(({ refreshToken, signal }) => ({ refreshToken, bounded: signal instanceof AbortSignal })), [{ refreshToken: 'keycloak-refresh-1', bounded: true }],
    'Keycloak is asked once, with that sign-in\'s refresh token and a deadline')
  assert.deepEqual(order, ['keycloak after ["session-1"]'], 'only after the Conexus session ended')
  const after = await app.inject({ method: 'GET', url: '/api/control/access-context', cookies: { '__Host-conexus_session': 'session-1' } })
  assert.equal(after.statusCode, 401)
  assert.equal((await signOut(app)).statusCode, 401, 'signing out again ends nothing')
  assert.equal(oidc.calls.length, 1, 'and asks Keycloak nothing')
})

test('IAM-02 still ends the Conexus session when Keycloak does not confirm, and says so only in the log', async (t) => {
  const store = signedInStore()
  const app = await createHubApp({ store, oidc: makeOidc({}, { providerLogout: async () => 'UNCONFIRMED' }), config })
  t.after(() => app.close())
  await capturePinoLogs(async (logs) => {
    const ended = await signOut(app)
    assert.equal(ended.statusCode, 204)
    assert.deepEqual(clearedCookies(ended), ['__Host-conexus_csrf', '__Host-conexus_session'])
    assert.deepEqual(store.state.ended, ['session-1'])
    const warnings = logs.filter((record) => record.level === 40)
    assert.deepEqual(warnings.map((record) => record.msg), ['HUB_SIGN_OUT_PROVIDER_LOGOUT_UNCONFIRMED'])
    assert.doesNotMatch(JSON.stringify(logs), /keycloak-refresh-1|account-1/, 'the log carries neither the token nor the account')
  })
  assert.equal((await app.inject({ method: 'GET', url: '/api/control/access-context', cookies: { '__Host-conexus_session': 'session-1' } })).statusCode, 401)
})

test('IAM-02 waits on a silent Keycloak only until its deadline', async (t) => {
  const store = signedInStore()
  const oidc = makeOidc({}, { providerLogout: ({ signal }) => new Promise((resolve) => signal.addEventListener('abort', () => resolve('UNCONFIRMED'))) })
  const app = await createHubApp({ store, oidc, config })
  t.after(() => app.close())
  const started = Date.now()
  const ended = await signOut(app)
  const waited = Date.now() - started
  assert.equal(ended.statusCode, 204)
  assert.ok(waited >= 2_900 && waited < 4_500, `waited ${waited} ms`)
  assert.deepEqual(store.state.ended, ['session-1'])
})

test('malformed IAM-03 body fires the generated schema before owner code', async (t) => {
  const app = await createHubApp({ store: makeStore(), oidc: makeOidc(), config })
  t.after(() => app.close())
  const response = await app.inject({ method: 'POST', url: '/api/control/accounts', headers: { origin, 'idempotency-key': 'key-1', 'x-conexus-csrf': 'csrf-1', 'content-type': 'application/json' }, cookies: { '__Host-conexus_bootstrap': 'bootstrap-token', '__Host-conexus_csrf': 'csrf-1' }, payload: { displayName: '   ', externalSubject: 'x', extra: true } })
  assert.equal(response.statusCode, 400)
})

// A real sign-in completion: the adapter exchanges the code at a local token endpoint and checks the
// signed id_token against a local key set, so the claims reach `complete` the way Keycloak's do.
const completeSignInWith = async (t, claims) => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  let base = ''
  const server = createServer((request, response) => {
    request.resume()
    request.on('end', () => {
      response.writeHead(200, { 'content-type': 'application/json' })
      if (request.url === '/jwks') return response.end(JSON.stringify({ keys: [jwk] }))
      const now = Math.floor(Date.now() / 1000)
      const head = encode({ alg: 'RS256', kid: 'k1', typ: 'JWT' })
      const body = encode({ iss: 'http://identity.test/realms/r1', aud: 'client', sub: 'subject-1', iat: now, exp: now + 300, nonce: 'nonce-1', ...claims })
      const signature = sign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey).toString('base64url')
      response.end(JSON.stringify({ access_token: 'access', token_type: 'Bearer', id_token: `${head}.${body}.${signature}` }))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.closeAllConnections(); server.close() })
  base = `http://127.0.0.1:${server.address().port}`
  const discovery = async (issuer, clientId, clientSecret, _authentication, options) => {
    const configuration = new openidClient.Configuration({ issuer: issuer.href, token_endpoint: `${base}/token`, jwks_uri: `${base}/jwks`, id_token_signing_alg_values_supported: ['RS256'] }, clientId, clientSecret)
    for (const hook of options.execute) hook(configuration)
    return configuration
  }
  const adapter = await createOidcAdapter({ issuer: 'http://identity.test/realms/r1', clientId: 'client', clientSecret: 'secret', redirectUri: `${origin}/protocol/oidc/callback`, allowInsecureForTest: true }, { discovery })
  t.after(() => adapter.close())
  return capturePinoLogs(async (logs) => ({
    signIn: await adapter.complete({ currentUrl: `${origin}/protocol/oidc/callback?code=code-1&state=state-1`, pkceVerifier: 'v'.repeat(43), expectedState: 'state-1', expectedNonce: 'nonce-1' }),
    logs,
  }))
}

test('completing a sign-in trusts an email only when email_verified is the strict boolean true, and logs only the claim type of anything else', async (t) => {
  const verified = await completeSignInWith(t, { email_verified: true, email: 'ana@example.test' })
  assert.equal(verified.signIn.emailVerified, true)
  assert.equal(verified.signIn.verifiedEmail, 'ana@example.test')
  assert.deepEqual(verified.logs.filter((line) => line.msg === 'OIDC_EMAIL_VERIFIED_UNEXPECTED_TYPE'), [])

  const unverified = await completeSignInWith(t, { email_verified: false, email: 'ana@example.test' })
  assert.equal(unverified.signIn.emailVerified, false)
  assert.equal(unverified.signIn.verifiedEmail, null)
  assert.deepEqual(unverified.logs.filter((line) => line.msg === 'OIDC_EMAIL_VERIFIED_UNEXPECTED_TYPE'), [])

  for (const claim of ['true', 'false']) {
    const stringly = await completeSignInWith(t, { email_verified: claim, email: 'ana@example.test' })
    assert.equal(stringly.signIn.emailVerified, false)
    assert.equal(stringly.signIn.verifiedEmail, null)
    const warned = stringly.logs.filter((line) => line.msg === 'OIDC_EMAIL_VERIFIED_UNEXPECTED_TYPE')
    assert.equal(warned.length, 1)
    assert.equal(warned[0].claimType, 'string')
    assert.equal(JSON.stringify(stringly.logs).includes('ana@example.test'), false)
  }

  // A realm that sends neither email_verified nor email: no warning, and the identity claims no invitation.
  const silent = await completeSignInWith(t, {})
  assert.equal(silent.signIn.emailVerified, false)
  assert.equal(silent.signIn.verifiedEmail, null)
  assert.deepEqual(silent.logs.filter((line) => line.msg === 'OIDC_EMAIL_VERIFIED_UNEXPECTED_TYPE'), [])
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
  const { applications } = makeApplications({ kind: 'NO_ACCESS', slug: 'caderno-de-compras', reason: 'NOT_GRANTED' })
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

test('TI-02 sends a person without access to the application host no-access page, carrying the denial reason', async (t) => {
  const store = makeStore()
  const { applications } = makeApplications({ kind: 'NO_ACCESS', slug: 'caderno-de-compras', reason: 'NOT_GRANTED' })
  const app = await createHubApp({ store, oidc: makeOidc({ subject: 'control', verifiedEmail: 'control@example.test', refreshToken: 'r' }), config, applications })
  t.after(() => app.close())
  await app.inject({ method: 'GET', url: loginUrl({ application: 'caderno-de-compras', binding: BINDING_DIGEST }) })
  const callback = await app.inject({ method: 'GET', url: '/protocol/oidc/callback?code=code-1&state=state-1', cookies: { '__Host-conexus_oidc_state': 'state-1' } })
  assert.equal(callback.statusCode, 303)
  assert.equal(callback.headers.location, 'https://caderno-de-compras.conexus.localhost:3445/__conexus/no-access?reason=NOT_GRANTED')
  assert.equal(store.state.sessions.size, 0)
})

test('TI-02 sends a person with an unverified email to the no-access page with that reason', async (t) => {
  const store = makeStore()
  const { applications } = makeApplications({ kind: 'NO_ACCESS', slug: 'caderno-de-compras', reason: 'EMAIL_NOT_VERIFIED' })
  const app = await createHubApp({ store, oidc: makeOidc({ subject: 'control', verifiedEmail: null, refreshToken: 'r' }), config, applications })
  t.after(() => app.close())
  await app.inject({ method: 'GET', url: loginUrl({ application: 'caderno-de-compras', binding: BINDING_DIGEST }) })
  const callback = await app.inject({ method: 'GET', url: '/protocol/oidc/callback?code=code-1&state=state-1', cookies: { '__Host-conexus_oidc_state': 'state-1' } })
  assert.equal(callback.statusCode, 303)
  assert.equal(callback.headers.location, 'https://caderno-de-compras.conexus.localhost:3445/__conexus/no-access?reason=EMAIL_NOT_VERIFIED')
  assert.equal(store.state.sessions.size, 0)
})

test('an app-only Account signing in at the Hub is refused with no session cookie', async (t) => {
  const store = makeStore()
  store.state.accounts.set(`${config.bootstrapIssuer}|app-only`, { accountId: 'account-app', displayName: 'Funcionária' })
  store.openHub = async () => { throw new Failure('IDENTITY_NOT_ELIGIBLE') }
  const app = await createHubApp({ store, oidc: makeOidc({ subject: 'app-only', verifiedEmail: 'funcionaria@example.test' }), config })
  t.after(() => app.close())
  await app.inject({ method: 'GET', url: '/protocol/oidc/login' })
  const callback = await app.inject({ method: 'GET', url: '/protocol/oidc/callback?code=code-1&state=state-1', cookies: { '__Host-conexus_oidc_state': 'state-1' } })
  assert.equal(callback.statusCode, 403)
  assert.equal(callback.cookies.some((item) => item.name === '__Host-conexus_session' || item.name === '__Host-conexus_csrf'), false)
})

test('a Hub request whose Keycloak check Keycloak cannot answer is refused with 503, not signed out', async (t) => {
  const { createHostSessions } = await import(hubModuleUrl('identity-access/host-sessions.js'))
  const keycloakDown = createHostSessions({
    pool: { query: async () => ({ rows: [{ account_id: '22222222-2222-4222-8222-222222222222', issuer: 'https://issuer.test', subject: 'subject-1', display_name: 'Operator', email: null, provider_checked_at: new Date(0), due_provider_refresh_token: 'sealed-refresh-token' }] }) },
    refresh: async () => ({ kind: 'UNAVAILABLE' }),
    envelope: { open: async () => 'refresh-token', seal: async (value) => value },
  })
  const app = await createHttpApp({
    registerRoutes: (server) => registerIdentityAccessRoutes(server, {
      store: makeStore(), workspaceReader: makeStore(), oidc: makeOidc(), config, hubSessions: makeStore(),
      resolveCurrentSession: (request) => keycloakDown.resolveHub({ sessionToken: request.cookies['__Host-conexus_session'] }),
    }),
    staticRoot: null,
  })
  t.after(() => app.close())
  const answer = await app.inject({ method: 'GET', url: '/api/control/access-context', cookies: { '__Host-conexus_session': 's'.repeat(43) } })
  assert.equal(answer.statusCode, 503)
  assert.equal(answer.json().type.endsWith('IDENTITY_PROVIDER_UNAVAILABLE'), true)
  assert.equal(answer.headers['set-cookie'], undefined, 'no cookie is cleared')
})


test('OIDC begin, callback failures, and missing tokens log registered error codes and keep 503 status', async (t) => {
  const store = makeStore()
  const failingOidc = {
    async begin() { throw new Error('discovery network error') },
    async complete() { throw new Error('token endpoint timeout') },
  }
  const app = await createHubApp({ store, oidc: failingOidc, config })
  t.after(() => app.close())

  // 1. OIDC begin fails -> logs OIDC_BEGIN_FAILED, returns 503
  await capturePinoLogs(async (logs) => {
    const beginRes = await app.inject({ method: 'GET', url: '/protocol/oidc/login' })
    assert.equal(beginRes.statusCode, 503)
    assert.equal(beginRes.body, '')
    const failure = logs.find((record) => record.msg === 'OIDC_BEGIN_FAILED')
    assert.ok(failure, 'OIDC_BEGIN_FAILED was logged')
    assert.equal(failure.level, 40, 'the identity provider is a third party: a warning')
    assert.equal(failure['exception.type'], 'Error')
  })

  // 2. OIDC complete fails -> logs OIDC_CALLBACK_FAILED, returns 503
  store.state.oidc.set('state-cb-fail', { state: 'state-cb-fail', nonce: 'nonce-1', pkceVerifier: 'pkce-1', signInReturn: { kind: 'HUB' } })
  await capturePinoLogs(async (logs) => {
    const cbFailRes = await app.inject({
      method: 'GET',
      url: '/protocol/oidc/callback?code=code-1&state=state-cb-fail',
      cookies: { '__Host-conexus_oidc_state': 'state-cb-fail' },
    })
    assert.equal(cbFailRes.statusCode, 503)
    assert.equal(cbFailRes.body, '')
    const failure = logs.find((record) => record.msg === 'OIDC_CALLBACK_FAILED')
    assert.ok(failure, 'OIDC_CALLBACK_FAILED was logged')
    assert.equal(failure.level, 40)
    assert.equal(failure['exception.type'], 'Error')
  })

  // 3. OIDC complete without refresh token -> logs OIDC_REFRESH_TOKEN_MISSING, returns 503
  store.state.accounts.set(`${config.bootstrapIssuer}|${config.bootstrapSubject}`, { accountId: 'acc-1', displayName: 'User' })
  store.state.oidc.set('state-no-rt', { state: 'state-no-rt', nonce: 'nonce-1', pkceVerifier: 'pkce-1', signInReturn: { kind: 'HUB' } })
  const noRtOidc = {
    async begin() { return { state: 'state-1', nonce: 'nonce-1', pkceVerifier: 'pkce-1', location: 'https://issuer.test' } },
    async complete() { return { issuer: config.bootstrapIssuer, subject: config.bootstrapSubject, verifiedEmail: null, refreshToken: null } },
  }
  const appNoRt = await createHubApp({ store, oidc: noRtOidc, config })
  t.after(() => appNoRt.close())
  await capturePinoLogs(async (logs) => {
    const noRtRes = await appNoRt.inject({
      method: 'GET',
      url: '/protocol/oidc/callback?code=code-1&state=state-no-rt',
      cookies: { '__Host-conexus_oidc_state': 'state-no-rt' },
    })
    assert.equal(noRtRes.statusCode, 503)
    assert.equal(noRtRes.body, '')
    const failure = logs.find((record) => record.msg === 'OIDC_REFRESH_TOKEN_MISSING')
    assert.ok(failure, 'OIDC_REFRESH_TOKEN_MISSING was logged')
    assert.equal(failure.level, 40)
  })

  // 4. Application sign-in without applications configured -> logs OIDC_APPLICATION_SIGN_IN_UNAVAILABLE, returns 503
  store.state.oidc.set('state-no-app', {
    state: 'state-no-app',
    nonce: 'nonce-1',
    pkceVerifier: 'pkce-1',
    signInReturn: { kind: 'APPLICATION', projectId: PROJECT_ID, bindingDigest: Buffer.from('digest') },
  })
  const noAppOidc = {
    async begin() { return { state: 'state-1', nonce: 'nonce-1', pkceVerifier: 'pkce-1', location: 'https://issuer.test' } },
    async complete() { return { issuer: config.bootstrapIssuer, subject: config.bootstrapSubject, verifiedEmail: null, refreshToken: 'rt' } },
  }
  const appWithoutApps = await createHubApp({ store, oidc: noAppOidc, config, applications: undefined })
  t.after(() => appWithoutApps.close())
  await capturePinoLogs(async (logs) => {
    const noAppRes = await appWithoutApps.inject({
      method: 'GET',
      url: '/protocol/oidc/callback?code=code-1&state=state-no-app',
      cookies: { '__Host-conexus_oidc_state': 'state-no-app' },
    })
    assert.equal(noAppRes.statusCode, 503)
    assert.equal(noAppRes.body, '')
    const failure = logs.find((record) => record.msg === 'OIDC_APPLICATION_SIGN_IN_UNAVAILABLE')
    assert.ok(failure, 'OIDC_APPLICATION_SIGN_IN_UNAVAILABLE was logged')
    assert.equal(failure.level, 50)
    assert.equal(failure['failure.details.projectId'], PROJECT_ID)
  })
})

