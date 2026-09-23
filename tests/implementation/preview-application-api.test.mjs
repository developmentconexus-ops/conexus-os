import assert from 'node:assert/strict'
import test from 'node:test'
import cookie from '@fastify/cookie'
import Fastify from 'fastify'
import { hubModuleUrl } from './hub-build.mjs'

const { registerPreviewRoutes } = await import(hubModuleUrl('mar/preview-routes.js'))

const PORT = 3444
const HOST = 'preview-11111111-1111-4111-8111-111111111111.conexus.localhost'
const ORIGIN = `https://${HOST}:${PORT}`
const binding = Object.freeze({
  routeId: 'route-1', generation: 'g', attemptId: 'a', accountId: '22222222-2222-4222-8222-222222222222',
  projectId: '33333333-3333-4333-8333-333333333333', changeId: 'c', subjectDigest: 'd', sourceRevision: 'e'.repeat(40),
  artifactRevisionId: '11111111-1111-4111-8111-111111111111', artifactDigest: 'f'.repeat(64), exactHost: HOST,
  expiresAt: Date.now() + 600_000, issuer: 'i', subject: 's',
})
const route = Object.freeze({
  ...binding, lifecycle: 'ACTIVE',
  manifest: { entryPath: 'index.html', files: [
    { path: 'index.html', mediaType: 'text/html; charset=utf-8' },
    { path: 'conexus-server/manifest.json', mediaType: 'application/json; charset=utf-8' },
    { path: 'conexus-server/handlers/notes.mjs', mediaType: 'text/javascript; charset=utf-8' },
  ] },
})

const preview = async (t, invokeApplication) => {
  const calls = []
  const app = Fastify()
  await app.register(cookie)
  await registerPreviewRoutes(app, {
    routes: new Map([[route.routeId, route]]),
    access: {
      consumeEntryGrant: async () => null,
      resolvePreviewCookie: async ({ cookie: value }) => (value === 'valid' ? binding : null),
      discardCookie: () => undefined,
    },
    registryReader: async ({ path }) => ({ path, mediaType: route.manifest.files.find((file) => file.path === path)?.mediaType, bytes: new Uint8Array(), sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' }),
    ...(invokeApplication === undefined ? {} : { invokeApplication: async (input) => { calls.push(input); return invokeApplication(input) } }),
    exactHubOrigin: 'https://hub.conexus.localhost:3443',
    previewPort: PORT,
    now: () => Date.now(),
    pendingRequests: new Set(),
    isClosed: () => false,
  })
  t.after(() => app.close())
  const call = (operation, overrides = {}) => app.inject({
    method: 'POST', url: `/__conexus/api/${operation}`,
    headers: { host: `${HOST}:${PORT}`, origin: ORIGIN, 'content-type': 'application/json', cookie: '__Host-conexus_preview=valid', ...overrides.headers },
    payload: overrides.payload ?? JSON.stringify({ purchaseOrderId: 'PO-1' }),
  })
  return { app, call, calls }
}

test('the Preview API passes the binding identity and the operation to the runner, and nothing the page chose', async (t) => {
  const { call, calls } = await preview(t, async () => ({ status: 200, body: [{ id: 1 }] }))
  const answered = await call('listNotes', { payload: JSON.stringify({ purchaseOrderId: 'PO-1', projectId: 'someone-else' }) })
  assert.equal(answered.statusCode, 200)
  assert.deepEqual(answered.json(), [{ id: 1 }])
  assert.match(answered.headers['content-security-policy'], /connect-src 'self';/)
  assert.deepEqual(calls, [{
    accountId: binding.accountId, projectId: binding.projectId, sourceRevision: binding.sourceRevision, artifactRevisionId: binding.artifactRevisionId,
    serverFiles: ['conexus-server/manifest.json', 'conexus-server/handlers/notes.mjs'], operation: 'listNotes',
    input: { purchaseOrderId: 'PO-1', projectId: 'someone-else' },
  }])
})

test('the Preview API refuses another origin, a missing cookie, a non-JSON body and a malformed operation before the runner', async (t) => {
  const { call, calls } = await preview(t, async () => ({ status: 200, body: {} }))
  const refused = async (operation, headers, status, code) => {
    const answer = await call(operation, { headers })
    assert.deepEqual([answer.statusCode, answer.json()], [status, { error: { code } }])
  }
  await refused('listNotes', { origin: 'https://preview-other.conexus.localhost:3444' }, 403, 'ORIGIN_REFUSED')
  await refused('listNotes', { origin: 'https://hub.conexus.localhost:3443' }, 403, 'ORIGIN_REFUSED')
  await refused('listNotes', { cookie: '' }, 403, 'PREVIEW_REFUSED')
  await refused('listNotes', { cookie: '__Host-conexus_preview=forged' }, 403, 'PREVIEW_REFUSED')
  await refused('listNotes', { 'content-type': 'text/plain' }, 415, 'CONTENT_TYPE_REFUSED')
  await refused('..%2Fhandlers%2Fnotes', {}, 404, 'OPERATION_NOT_FOUND')
  await refused('ListNotes', {}, 404, 'OPERATION_NOT_FOUND')
  assert.deepEqual(calls, [])
})

test('the Preview API says the runner is unavailable when it cannot be reached or is not configured', async (t) => {
  const failing = await preview(t, async () => { throw new Error('APPLICATION_RUNNER_UNAVAILABLE') })
  assert.deepEqual((await failing.call('listNotes')).json(), { error: { code: 'APPLICATION_RUNNER_UNAVAILABLE' } })
  const absent = await preview(t, undefined)
  const answer = await absent.call('listNotes')
  assert.deepEqual([answer.statusCode, answer.json()], [503, { error: { code: 'APPLICATION_RUNNER_UNAVAILABLE' } }])
})

test('the retained server tree is never served to the browser', async (t) => {
  const { app } = await preview(t, async () => ({ status: 200, body: {} }))
  for (const path of ['/conexus-server/manifest.json', '/conexus-server/handlers/notes.mjs']) {
    const answer = await app.inject({ method: 'GET', url: path, headers: { host: `${HOST}:${PORT}`, cookie: '__Host-conexus_preview=valid' } })
    assert.equal(answer.statusCode, 404, path)
  }
  const page = await app.inject({ method: 'GET', url: '/index.html', headers: { host: `${HOST}:${PORT}`, cookie: '__Host-conexus_preview=valid' } })
  assert.equal(page.statusCode, 200)
})
