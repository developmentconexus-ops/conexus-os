import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { canonicalBytes, sha256 } from '../../packages/canonical-json/src/index.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r2-p4-brain-binding-build-'))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', buildRoot,
], { cwd: repositoryRoot, encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(compiled.stdout || compiled.stderr)
const built = (path) => pathToFileURL(resolve(buildRoot, path)).href
const { createHttpApp } = await import(built('http/app.js'))
const { registerProjectBrainBindingRoutes } = await import(built('project/routes.js'))

test.after(() => rmSync(buildRoot, { recursive: true, force: true }))

test('PRJ-10/11/12 Brain binding HTTP adapter enforces auth, strong ETag and exact preconditions', async () => {
  const origin = 'https://control.example.test'
  const csrf = 'csrf-token'
  const accountId = '11111111-1111-4111-8111-111111111111'
  const projectId = '22222222-2222-4222-8222-222222222222'
  const revisionId = '33333333-3333-4333-8333-333333333333'
  const digest = 'a'.repeat(64)
  const bindingDigest = 'b'.repeat(64)
  const binding = {
    brainRevisionId: revisionId,
    brainDigest: digest,
    projectBindingDigest: bindingDigest,
    validationState: 'VALID',
    updateAvailable: false,
  }
  const representationDigest = sha256(canonicalBytes(binding))
  const state = {
    session: { account: { accountId } },
    current: { status: 'FOUND', value: binding },
    setResult: { status: 'FOUND', value: binding, created: true },
    getCalls: [],
    setCalls: [],
    removeCalls: [],
    sessionCalls: [],
  }
  const store = {
    get: async (input) => {
      state.getCalls.push(input)
      return state.current
    },
    set: async (input) => {
      state.setCalls.push(input)
      return state.setResult
    },
    remove: async (input) => {
      state.removeCalls.push(input)
      return { status: 'FOUND', value: undefined }
    },
  }
  const resolveCurrentSession = async (_request, requireCsrf) => {
    state.sessionCalls.push(requireCsrf)
    return state.session
  }
  const commandHeaders = (extra = {}) => ({
    origin,
    cookie: `__Host-conexus_csrf=${csrf}`,
    'x-conexus-csrf': csrf,
    ...extra,
  })
  const statusOf = (response) => JSON.parse(response.body).status
  const app = await createHttpApp({
    registerRoutes: (server) => registerProjectBrainBindingRoutes(server, {
      store, resolveCurrentSession, origin,
    }),
  })
  try {
    assert.deepEqual(app.routeCensus(), ['PRJ-10', 'PRJ-11', 'PRJ-12'])

    const listed = await app.inject({
      method: 'GET', url: `/api/control/projects/${projectId}/brain-binding`,
    })
    assert.equal(listed.statusCode, 200)
    assert.equal(listed.headers.etag, `"${representationDigest}"`)
    assert.deepEqual(JSON.parse(listed.body), binding)
    assert.deepEqual(state.getCalls.at(-1), { accountId, projectId })
    assert.equal(state.sessionCalls.at(-1), undefined)

    state.current = { status: 'ABSENT' }
    const absent = await app.inject({
      method: 'GET', url: `/api/control/projects/${projectId}/brain-binding`,
    })
    assert.equal(absent.statusCode, 404)
    assert.equal(statusOf(absent), 404)

    state.current = { status: 'DENIED' }
    const denied = await app.inject({
      method: 'GET', url: `/api/control/projects/${projectId}/brain-binding`,
    })
    assert.equal(denied.statusCode, 403)
    assert.deepEqual(JSON.parse(denied.body), {
      type: 'urn:conexus:problem:project-brain-binding-denied',
      title: 'Project Brain binding access denied',
      status: 403,
    })

    state.current = { status: 'UNAVAILABLE' }
    const unavailable = await app.inject({
      method: 'GET', url: `/api/control/projects/${projectId}/brain-binding`,
    })
    assert.equal(unavailable.statusCode, 503)
    assert.deepEqual(JSON.parse(unavailable.body), {
      type: 'urn:conexus:problem:project-brain-binding-unavailable',
      title: 'Project Brain binding unavailable',
      status: 503,
    })
    state.current = { status: 'FOUND', value: binding }

    const created = await app.inject({
      method: 'PUT', url: `/api/control/projects/${projectId}/brain-binding`,
      headers: commandHeaders({ 'if-none-match': '*' }),
      payload: { brainRevisionId: revisionId },
    })
    assert.equal(created.statusCode, 201)
    assert.equal(created.headers.etag, `"${representationDigest}"`)
    assert.deepEqual(state.setCalls.at(-1), {
      accountId, projectId, brainRevisionId: revisionId, expectedCurrent: { state: 'ABSENT' },
    })
    assert.equal(state.sessionCalls.at(-1), true)

    state.setResult = { status: 'FOUND', value: binding, created: false }
    const updated = await app.inject({
      method: 'PUT', url: `/api/control/projects/${projectId}/brain-binding`,
      headers: commandHeaders({ 'if-match': `"${representationDigest}"` }),
      payload: { brainRevisionId: revisionId },
    })
    assert.equal(updated.statusCode, 200)
    assert.deepEqual(state.setCalls.at(-1), {
      accountId, projectId, brainRevisionId: revisionId,
      expectedCurrent: { state: 'PRESENT', representationDigest },
    })

    const removed = await app.inject({
      method: 'DELETE', url: `/api/control/projects/${projectId}/brain-binding`,
      headers: commandHeaders({ 'if-match': `"${representationDigest}"` }),
    })
    assert.equal(removed.statusCode, 204)
    assert.equal(removed.body, '')
    assert.deepEqual(state.removeCalls.at(-1), {
      accountId, projectId,
      expectedCurrent: { state: 'PRESENT', representationDigest },
    })

    const invalidRemoval = await app.inject({
      method: 'DELETE', url: `/api/control/projects/${projectId}/brain-binding`,
      headers: commandHeaders({ 'if-match': representationDigest }),
    })
    assert.equal(invalidRemoval.statusCode, 412)
    assert.equal(statusOf(invalidRemoval), 412)
    assert.equal(state.removeCalls.length, 1)

    for (const [headers, expectedStatus] of [
      [commandHeaders(), 422],
      [commandHeaders({ 'if-match': `"${representationDigest}"`, 'if-none-match': '*' }), 422],
      [commandHeaders({ 'if-match': bindingDigest }), 422],
      [commandHeaders({ 'if-none-match': '"other"' }), 422],
    ]) {
      const invalid = await app.inject({
        method: 'PUT', url: `/api/control/projects/${projectId}/brain-binding`, headers,
        payload: { brainRevisionId: revisionId },
      })
      assert.equal(invalid.statusCode, expectedStatus)
      assert.equal(statusOf(invalid), expectedStatus)
    }

    const csrfDenied = await app.inject({
      method: 'PUT', url: `/api/control/projects/${projectId}/brain-binding`,
      headers: { origin, 'if-none-match': '*' }, payload: { brainRevisionId: revisionId },
    })
    assert.equal(csrfDenied.statusCode, 403)
    assert.equal(statusOf(csrfDenied), 403)
  } finally {
    await app.close()
  }
})
