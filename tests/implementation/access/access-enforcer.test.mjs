import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { connect } from 'node:net'
import test from 'node:test'
import { hubModuleUrl } from '../hub-build.mjs'
import { HUB_ORIGIN, bootstrapCookie, hubJsonWrite, hubSessionCookie, hubWrite, opaque, testListener } from './test-listener.mjs'

const { foreignRoutes, grantOf, routes } = await import(hubModuleUrl('http/access.js'))

const ALICE = Object.freeze({ account: { accountId: '11111111-1111-4111-8111-111111111111', displayName: 'Alice' }, issuer: 'https://issuer.test', subject: 'alice' })
const ALICE_TOKEN = opaque('alice')
const BOOTSTRAP_TOKEN = opaque('bootstrap')

const bootRefusal = async (registerRoutes) => {
  try {
    const { app } = await testListener({ registerRoutes })
    await app.close()
    return 'BOOTED'
  } catch (error) {
    return `${error.id} ${error.details?.invariant} ${error.details?.route}`
  }
}

test('a listener does not start with a route outside the table, and names the route', async () => {
  assert.equal(await bootRefusal(async (app) => { app.get('/x', async () => 'x'); return [] }),
    'INTERNAL_UNEXPECTED ROUTE_ACCESS_UNDECLARED GET /x')
  assert.equal(await bootRefusal(async (app) => { routes(app).session({ method: 'POST', url: '/api/control/things', handler: async () => 'x' }); return [] }),
    'INTERNAL_UNEXPECTED ROUTE_OPERATION_UNDECLARED POST /api/control/things')
  assert.equal(await bootRefusal(async (app) => { app.route({ method: 'POST', url: '/page', config: { access: 'navigation' }, handler: async () => 'x' }); return [] }),
    'INTERNAL_UNEXPECTED ROUTE_ACCESS_METHOD POST /page')
  assert.equal(await bootRefusal(async (app) => { routes(app).bootstrap({ method: 'GET', url: '/setup-read', handler: async () => 'x' }); return [] }),
    'INTERNAL_UNEXPECTED ROUTE_ACCESS_METHOD GET /setup-read')
  assert.equal(await bootRefusal(async (app) => { routes(app).session({ method: 'HEAD', url: '/api/x', handler: async () => 'x' }); return [] }),
    'INTERNAL_UNEXPECTED ROUTE_ACCESS_METHOD HEAD /api/x')
  assert.equal(await bootRefusal(async (app) => { routes(app)['host-write']({ method: 'POST', url: '/__conexus/x', handler: async () => 'x' }); return [] }),
    'INTERNAL_UNEXPECTED ROUTE_ACCESS_FOREIGN POST /__conexus/x')
  assert.equal(await bootRefusal(async (app) => {
    await foreignRoutes(app, 'session', async (scope) => { routes(scope).navigation({ url: '/inside', handler: async () => 'x' }) })
    return []
  }), 'INTERNAL_UNEXPECTED ROUTE_ACCESS_CONFLICT GET /inside')
  assert.equal(await bootRefusal(async (app) => {
    routes(app).navigation({ url: '/page', handler: async () => 'x' })
    await foreignRoutes(app, 'session', async (scope) => { scope.post('/mounted', async () => 'x') })
    return []
  }), 'BOOTED')
})

test('grantOf names an empty slot and a slot of another kind', async (t) => {
  assert.throws(() => grantOf({}, 'session'), (error) => error.details?.invariant === 'ACCESS_GRANT_MISSING')
  const { app } = await testListener({
    registerRoutes: async (server) => {
      routes(server).navigation({ url: '/probe', handler: async (request) => {
        try { grantOf(request, 'session'); return 'granted' } catch (error) { return error.details.invariant }
      } })
      return []
    },
  })
  t.after(() => app.close())
  assert.equal((await app.inject({ method: 'GET', url: '/probe' })).body, 'ACCESS_GRANT_MISMATCH')
})

const toyHub = async ({ sessions = { [ALICE_TOKEN]: ALICE }, onRequest } = {}) => {
  const ran = []
  const listener = await testListener({
    sessions,
    registerRoutes: async (server) => {
      if (onRequest) server.addHook('onRequest', onRequest)
      const route = routes(server)
      route.session({
        method: 'POST', url: '/api/test/things',
        schema: { body: { type: 'object', additionalProperties: false, required: ['name'], properties: { name: { type: 'string' } } } },
        handler: async (request, _reply, session) => {
          ran.push(request.body.name)
          return { accountId: session.account.accountId, digest: session.digest.toString('hex') }
        },
      })
      route.session({ method: 'GET', url: '/api/test/things', handler: async () => ({ things: [] }) })
      route.session({ method: 'DELETE', url: '/api/test/things/:id', handler: async (request, reply) => { ran.push(request.body); return reply.code(204).send() } })
      route.bootstrap({ method: 'POST', url: '/api/control/accounts', handler: async (_request, _reply, { token }) => ({ token }) })
      route['sign-out']({ method: 'DELETE', url: '/api/session', handler: async (_request, reply, { digest }) => reply.code(200).send({ digest: digest.toString('hex') }) })
      route['sign-in']({ url: '/protocol/oidc/login', handler: async () => 'signing in' })
      route.navigation({ url: '/', handler: async (_request, reply) => reply.type('text/html').send('<html>shell</html>') })
      return []
    },
  })
  return { ...listener, ran }
}

const problem = (response) => `${response.statusCode} ${response.json().code}`

test('the order: authenticity before the body, the body before the credential', async (t) => {
  const { app, resolved, ran } = await toyHub()
  t.after(() => app.close())
  const cookie = hubSessionCookie(ALICE_TOKEN)
  const post = (headers, payload) => app.inject({ method: 'POST', url: '/api/test/things', headers, payload })

  assert.equal(problem(await post({ ...hubJsonWrite, origin: 'https://evil.test', cookie }, '{not json')), '403 REQUEST_AUTHENTICITY_DENIED')
  assert.equal(problem(await post({ ...hubJsonWrite, origin: 'https://evil.test', 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'content-type': 'text/plain', cookie }, 'x')), '403 REQUEST_AUTHENTICITY_DENIED')
  assert.deepEqual(resolved, [], 'no session lookup on an authenticity refusal')
  assert.equal(problem(await post({ ...hubJsonWrite }, '{not json')), '400 REQUEST_JSON_INVALID')
  assert.equal(problem(await post({ ...hubJsonWrite }, { extra: true })), '400 REQUEST_VALIDATION_FAILED')
  assert.equal(problem(await post({ ...hubJsonWrite }, { name: 'a' })), '401 AUTHENTICATION_REQUIRED')
  assert.equal(problem(await post({ ...hubJsonWrite, cookie: hubSessionCookie(opaque('nobody')) }, { name: 'a' })), '401 AUTHENTICATION_REQUIRED')
  assert.deepEqual(ran, [])

  const granted = await post({ ...hubJsonWrite, cookie }, { name: 'a' })
  assert.equal(granted.statusCode, 200)
  const digest = createHash('sha256').update(ALICE_TOKEN).digest('hex')
  assert.deepEqual(granted.json(), { accountId: ALICE.account.accountId, digest })
  assert.deepEqual(resolved, [createHash('sha256').update(opaque('nobody')).digest('hex'), digest])
})

test('a GET with a foreign Origin or a sibling Fetch Metadata is refused before any session work', async (t) => {
  const { app, resolved } = await toyHub()
  t.after(() => app.close())
  const cookie = hubSessionCookie(ALICE_TOKEN)
  for (const headers of [{ origin: 'https://sales.apps.conexus.test' }, { 'sec-fetch-site': 'same-site' }, { 'sec-fetch-site': 'cross-site' }]) {
    assert.equal(problem(await app.inject({ method: 'GET', url: '/api/test/things', headers: { ...headers, cookie } })), '403 REQUEST_AUTHENTICITY_DENIED', JSON.stringify(headers))
  }
  assert.deepEqual(resolved, [])
  assert.equal((await app.inject({ method: 'GET', url: '/api/test/things', headers: { 'sec-fetch-site': 'same-origin', cookie } })).statusCode, 200)
})

test('an empty JSON body is no body on every method; a route that needs one answers 400', async (t) => {
  const { app, ran } = await toyHub()
  t.after(() => app.close())
  const cookie = hubSessionCookie(ALICE_TOKEN)
  const removed = await app.inject({ method: 'DELETE', url: '/api/test/things/1', headers: { ...hubJsonWrite, cookie }, payload: '' })
  assert.equal(removed.statusCode, 204)
  assert.deepEqual(ran, [undefined])
  assert.equal(problem(await app.inject({ method: 'POST', url: '/api/test/things', headers: { ...hubJsonWrite, cookie }, payload: '  \n' })), '400 REQUEST_VALIDATION_FAILED')
})

test('sign-out takes the cookie unresolved; bootstrap takes its own cookie', async (t) => {
  const { app, resolved } = await toyHub()
  t.after(() => app.close())
  assert.equal(problem(await app.inject({ method: 'DELETE', url: '/api/session', headers: hubWrite })), '401 AUTHENTICATION_REQUIRED')
  const signedOut = await app.inject({ method: 'DELETE', url: '/api/session', headers: { ...hubWrite, cookie: hubSessionCookie(ALICE_TOKEN) } })
  assert.deepEqual(signedOut.json(), { digest: createHash('sha256').update(ALICE_TOKEN).digest('hex') })
  assert.equal(problem(await app.inject({ method: 'DELETE', url: '/api/session', headers: { cookie: hubSessionCookie(ALICE_TOKEN) } })), '403 REQUEST_AUTHENTICITY_DENIED')
  assert.deepEqual(resolved, [], 'sign-out never resolves the session')

  assert.equal(problem(await app.inject({ method: 'POST', url: '/api/control/accounts', headers: hubJsonWrite, payload: {} })), '401 BOOTSTRAP_REQUIRED')
  assert.equal(problem(await app.inject({ method: 'POST', url: '/api/control/accounts', headers: { ...hubJsonWrite, origin: 'https://evil.test', cookie: bootstrapCookie(BOOTSTRAP_TOKEN) }, payload: {} })), '403 REQUEST_AUTHENTICITY_DENIED')
  const bootstrapped = await app.inject({ method: 'POST', url: '/api/control/accounts', headers: { ...hubJsonWrite, cookie: bootstrapCookie(BOOTSTRAP_TOKEN) }, payload: {} })
  assert.deepEqual(bootstrapped.json(), { token: BOOTSTRAP_TOKEN })
})

test('only a page answers HEAD; anything unmatched is 404 with the Hub headers', async (t) => {
  const { app } = await toyHub()
  t.after(() => app.close())
  const page = await app.inject({ method: 'HEAD', url: '/' })
  assert.equal(page.statusCode, 200)
  assert.equal(page.body, '')
  assert.equal(page.headers['content-length'], String(Buffer.byteLength('<html>shell</html>')))
  for (const [method, url] of [['HEAD', '/api/test/things'], ['HEAD', '/protocol/oidc/login'], ['GET', '/nothing'], ['POST', '/nothing']]) {
    const missing = await app.inject({ method, url, headers: { origin: 'https://evil.test' } })
    assert.equal(missing.statusCode, 404, `${method} ${url}`)
    if (method !== 'HEAD') assert.equal(missing.json().code, 'NOT_FOUND')
    assert.equal(missing.headers['x-frame-options'], 'SAMEORIGIN')
    assert.equal(missing.headers['referrer-policy'], 'strict-origin')
  }
})

test('a session ended while its write is still arriving is refused, and the handler never runs', async (t) => {
  const sessions = { [ALICE_TOKEN]: ALICE }
  let passedOnRequest
  const onRequestPassed = new Promise((resolve) => { passedOnRequest = resolve })
  const { app, ran } = await toyHub({ sessions: { [ALICE_TOKEN]: () => sessions[ALICE_TOKEN] ?? null }, onRequest: async () => { passedOnRequest() } })
  t.after(() => app.close())
  await app.listen({ host: '127.0.0.1', port: 0 })
  const body = JSON.stringify({ name: 'late' })
  const socket = connect(app.server.address().port, '127.0.0.1')
  const answer = new Promise((resolve) => { let text = ''; socket.on('data', (chunk) => { text += chunk }); socket.on('end', () => resolve(text)) })
  socket.write([
    'POST /api/test/things HTTP/1.1', 'host: 127.0.0.1', `origin: ${HUB_ORIGIN}`, 'sec-fetch-site: same-origin', 'content-type: application/json',
    `content-length: ${body.length}`, `cookie: ${hubSessionCookie(ALICE_TOKEN)}`, 'connection: close', '', body.slice(0, -1),
  ].join('\r\n'))
  await onRequestPassed
  delete sessions[ALICE_TOKEN]
  socket.write(body.slice(-1))
  const raw = await answer
  assert.match(raw, /^HTTP\/1\.1 401 /)
  assert.match(raw, /"code":"AUTHENTICATION_REQUIRED"/)
  assert.deepEqual(ran, [])
})
