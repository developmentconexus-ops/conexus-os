import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const cacheRoot = resolve(repositoryRoot, 'node_modules/.cache')
mkdirSync(cacheRoot, { recursive: true })
const buildRoot = mkdtempSync(resolve(cacheRoot, 'builder-preview-http-'))
test.after(() => rmSync(buildRoot, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', buildRoot,
], { cwd: repositoryRoot, encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(compiled.stdout || compiled.stderr)
const built = (path) => pathToFileURL(resolve(buildRoot, path)).href
const { createHttpApp } = await import(built('http/app.js'))
const { registerBuilderRoutes } = await import(built('builder/routes.js'))
const { createBuilderService } = await import(built('builder/service.js'))

const ORIGIN = 'https://control.example.test'
const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const CHANGE_ID = '22222222-2222-4222-8222-222222222222'
const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333'
const SUBJECT_DIGEST = 'a'.repeat(40)
const CSRF = 'csrf-token'

const headers = (overrides = {}) => ({
  origin: ORIGIN,
  cookie: `__Host-conexus_csrf=${CSRF}`,
  'x-conexus-csrf': CSRF,
  ...overrides,
})

const preparation = (state, extra = {}) => ({
  attemptId: '44444444-4444-4444-8444-444444444444',
  subject: { accountId: ACCOUNT_ID, projectId: PROJECT_ID, changeId: CHANGE_ID, subjectDigest: SUBJECT_DIGEST, sourceRevision: 'b'.repeat(40) },
  expiresAt: Date.parse('2026-09-12T15:00:00.000Z'),
  state,
  ...extra,
})

const setup = async ({ session = true, serviceOverrides = {}, storeOverrides = {} } = {}) => {
  const calls = []
  const service = {
    createChange: async () => { throw new Error('unused') },
    listSourceTree: async () => { throw new Error('unused') },
    getSourceFile: async () => { throw new Error('unused') },
    startPreviewPreparation: async (input) => {
      calls.push(['start', input])
      return preparation('PREPARING')
    },
    readPreviewPreparation: async (input) => {
      calls.push(['read-preparation', input])
      return null
    },
    ...serviceOverrides,
  }
  const store = {
    readPreviewSubject: async (input) => {
      calls.push(['preview-subject', input])
      return input.changeId ? {
        subjectKind: 'CHANGE_CANDIDATE', subjectDigest: SUBJECT_DIGEST, sourceRevision: 'b'.repeat(40), verified: true,
      } : {
        subjectKind: 'CURRENT_PROJECT', subjectDigest: 'c'.repeat(64), sourceRevision: 'd'.repeat(40), verified: false,
      }
    },
    ...storeOverrides,
  }
  const app = await createHttpApp({
    registerRoutes: (server) => registerBuilderRoutes(server, {
      store,
      service,
      origin: ORIGIN,
      resolveCurrentSession: async (_request, requireCsrf) => {
        calls.push(['session', requireCsrf])
        return session ? { account: { accountId: ACCOUNT_ID } } : null
      },
    }),
  })
  return { app, calls }
}

test('BLD-21 starts a preparation with only server-derived account and returns a narrow 202 projection', async () => {
  const { app, calls } = await setup()
  try {
    const response = await app.inject({
      method: 'POST',
      url: `/api/control/projects/${PROJECT_ID}/preview-preparations`,
      headers: headers(),
      payload: { changeId: CHANGE_ID, subjectDigest: SUBJECT_DIGEST },
    })
    assert.equal(response.statusCode, 202)
    assert.equal(response.headers['cache-control'], 'no-store')
    assert.deepEqual(JSON.parse(response.body), {
      changeId: CHANGE_ID,
      subjectDigest: SUBJECT_DIGEST,
      attemptId: '44444444-4444-4444-8444-444444444444',
      state: 'PREPARING',
      expiresAt: '2026-09-12T15:00:00.000Z',
    })
    assert.deepEqual(calls.find(([name]) => name === 'start')[1], {
      accountId: ACCOUNT_ID, projectId: PROJECT_ID, changeId: CHANGE_ID, subjectDigest: SUBJECT_DIGEST,
    })
    assert.equal(calls.find(([name]) => name === 'session')[1], true)
    assert.equal(JSON.stringify(JSON.parse(response.body)).includes(ACCOUNT_ID), false)
  } finally { await app.close() }
})

test('registered BLD-21 POST and BLD-10 GET reach one retained preparation through the real Builder service coordinator', async () => {
  const calls = []
  const sourceRevision = 'b'.repeat(40)
  const html = '<!doctype html><h1>App</h1>'
  const metadata = {
    artifactRevisionId: '55555555-5555-4555-8555-555555555555', artifactDigest: 'f'.repeat(64),
    projectId: PROJECT_ID, sourceRevision, profile: 'REACT_VITE_V1', templateRef: 'template', recipeSha256: 'e'.repeat(64),
    entryPath: 'index.html', files: [{ path: 'index.html', mediaType: 'text/html; charset=utf-8', byteLength: html.length, sha256: 'd'.repeat(64) }],
  }
  const subject = { subjectKind: 'CHANGE_CANDIDATE', subjectDigest: SUBJECT_DIGEST, sourceRevision, verified: true }
  const service = createBuilderService({
    store: {
      readPreviewSubject: async (input) => { calls.push(['subject', input]); return subject },
      recoverAndListQueued: async () => [],
      close: async () => { calls.push(['store-close']) },
    },
    source: {
      listSourceTree: async () => ({ sourceRevision, entries: [{ path: 'app', kind: 'DIRECTORY' }, { path: 'app/index.html', kind: 'FILE' }] }),
      readSourceFile: async () => ({ sourceRevision, path: 'app/index.html', content: html }),
    },
    runtime: { kind: 'REMOTE_E2B' },
    verifier: { kind: 'REMOTE_E2B' },
    compiler: {
      kind: 'REMOTE_E2B',
      compile: async (input) => {
        calls.push(['compile', input])
        return { projectId: input.projectId, changeId: input.changeId, sourceRevision, templateRef: 'template', recipeSha256: 'e'.repeat(64), files: [{ path: 'index.html', mediaType: 'text/html', bytes: Buffer.from(html), sha256: 'd'.repeat(64) }] }
      },
    },
    applicationArtifacts: {
      getApplication: async () => null,
      retainApplication: async () => metadata,
    },
  })
  const app = await createHttpApp({ registerRoutes: (server) => registerBuilderRoutes(server, {
    store: {
      readPreviewSubject: async (input) => { calls.push(['route-subject', input]); return subject },
    },
    service,
    origin: ORIGIN,
    resolveCurrentSession: async () => ({ account: { accountId: ACCOUNT_ID } }),
  }) })
  try {
    const started = await app.inject({
      method: 'POST', url: `/api/control/projects/${PROJECT_ID}/preview-preparations`, headers: headers(),
      payload: { changeId: CHANGE_ID, subjectDigest: SUBJECT_DIGEST },
    })
    assert.equal(started.statusCode, 202)
    let preview
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await app.inject({ method: 'GET', url: `/api/control/projects/${PROJECT_ID}/preview?changeId=${CHANGE_ID}` })
      assert.equal(response.statusCode, 200)
      preview = JSON.parse(response.body)
      if (preview.preparation?.state === 'PREPARED') break
      await new Promise((resolve) => setImmediate(resolve))
    }
    assert.equal(preview.preparation.state, 'PREPARED')
    assert.equal(preview.ready, false)
    assert.deepEqual(preview.preparation, {
      changeId: CHANGE_ID, subjectDigest: SUBJECT_DIGEST,
      attemptId: JSON.parse(started.body).attemptId,
      state: 'PREPARED', expiresAt: JSON.parse(started.body).expiresAt,
      artifactRevisionId: metadata.artifactRevisionId, artifactDigest: metadata.artifactDigest,
    })
    assert.equal(calls.filter(([name]) => name === 'compile').length, 1)
  } finally {
    await app.close()
    await service.close()
  }
})

test('BLD-10 passively projects PREPARED metadata only for the exact verified candidate', async () => {
  const artifact = { artifactRevisionId: '55555555-5555-4555-8555-555555555555', artifactDigest: 'f'.repeat(64) }
  const { app, calls } = await setup({ serviceOverrides: {
    readPreviewPreparation: async (input) => {
      calls.push(['read-preparation', input])
      return preparation('PREPARED', { artifact: {
        ...artifact, projectId: PROJECT_ID, sourceRevision: 'b'.repeat(40), profile: 'REACT_VITE_V1', templateRef: 'template',
        recipeSha256: 'e'.repeat(64), entryPath: 'index.html', files: [],
      } })
    },
  } })
  try {
    const response = await app.inject({ method: 'GET', url: `/api/control/projects/${PROJECT_ID}/preview?changeId=${CHANGE_ID}` })
    assert.equal(response.statusCode, 200)
    assert.equal(response.headers['cache-control'], 'no-store')
    assert.deepEqual(JSON.parse(response.body), {
      previewId: JSON.parse(response.body).previewId,
      subjectKind: 'CHANGE_CANDIDATE', subjectDigest: SUBJECT_DIGEST, ready: false, verified: true, live: false,
      preparation: {
        changeId: CHANGE_ID, subjectDigest: SUBJECT_DIGEST, attemptId: '44444444-4444-4444-8444-444444444444',
        state: 'PREPARED', expiresAt: '2026-09-12T15:00:00.000Z', ...artifact,
      },
    })
    assert.deepEqual(calls.filter(([name]) => name === 'read-preparation').map(([, input]) => input), [{
      accountId: ACCOUNT_ID, projectId: PROJECT_ID, changeId: CHANGE_ID, subjectDigest: SUBJECT_DIGEST,
    }])
    assert.equal(calls.some(([name]) => name === 'start'), false)
  } finally { await app.close() }
})

test('BLD-10 omits preparation for the current Project subject and for no attempt', async () => {
  const { app, calls } = await setup()
  try {
    const current = await app.inject({ method: 'GET', url: `/api/control/projects/${PROJECT_ID}/preview` })
    assert.equal(current.statusCode, 200)
    assert.equal(Object.hasOwn(JSON.parse(current.body), 'preparation'), false)
    const candidate = await app.inject({ method: 'GET', url: `/api/control/projects/${PROJECT_ID}/preview?changeId=${CHANGE_ID}` })
    assert.equal(candidate.statusCode, 200)
    assert.equal(Object.hasOwn(JSON.parse(candidate.body), 'preparation'), false)
    assert.deepEqual(calls.filter(([name]) => name === 'read-preparation').map(([, input]) => input), [{
      accountId: ACCOUNT_ID, projectId: PROJECT_ID, changeId: CHANGE_ID, subjectDigest: SUBJECT_DIGEST,
    }])
  } finally { await app.close() }
})

test('BLD-21 enforces exact Origin, CSRF and anonymous refusal before paid work', async () => {
  const scenarios = [
    ['wrong Origin', headers({ origin: 'https://attacker.example.test' }), 403],
    ['null Origin', headers({ origin: 'null' }), 403],
    ['missing CSRF header', { origin: ORIGIN, cookie: `__Host-conexus_csrf=${CSRF}` }, 403],
    ['missing CSRF cookie', { origin: ORIGIN, 'x-conexus-csrf': CSRF }, 403],
  ]
  for (const [name, requestHeaders, statusCode] of scenarios) {
    const { app, calls } = await setup()
    try {
      const response = await app.inject({ method: 'POST', url: `/api/control/projects/${PROJECT_ID}/preview-preparations`, headers: requestHeaders, payload: { changeId: CHANGE_ID, subjectDigest: SUBJECT_DIGEST } })
      assert.equal(response.statusCode, statusCode, name)
      assert.equal(calls.some(([entry]) => entry === 'start'), false, name)
      assert.equal(calls.some(([entry]) => entry === 'session'), false, name)
    } finally { await app.close() }
  }
  const anonymous = await setup({ session: false })
  try {
    const response = await anonymous.app.inject({ method: 'POST', url: `/api/control/projects/${PROJECT_ID}/preview-preparations`, headers: headers(), payload: { changeId: CHANGE_ID, subjectDigest: SUBJECT_DIGEST } })
    assert.equal(response.statusCode, 401)
    assert.equal(anonymous.calls.some(([entry]) => entry === 'start'), false)
    assert.equal(anonymous.calls.filter(([entry]) => entry === 'session').length, 1)
  } finally { await anonymous.app.close() }
})

test('BLD-21 rejects malformed or extra account input at the schema boundary', async () => {
  const { app, calls } = await setup()
  try {
    const extra = await app.inject({ method: 'POST', url: `/api/control/projects/${PROJECT_ID}/preview-preparations`, headers: headers(), payload: { changeId: CHANGE_ID, subjectDigest: SUBJECT_DIGEST, accountId: '99999999-9999-4999-8999-999999999999' } })
    assert.equal(extra.statusCode, 400)
    const malformed = await app.inject({ method: 'POST', url: `/api/control/projects/${PROJECT_ID}/preview-preparations`, headers: headers(), payload: { changeId: 'not-a-uuid', subjectDigest: 'not-hex' } })
    assert.equal(malformed.statusCode, 400)
    assert.equal(calls.some(([entry]) => entry === 'start'), false)
  } finally { await app.close() }
})

test('BLD-21 maps subject refusal to nondisclosing 404 and service availability to 503', async () => {
  const refused = await setup({ serviceOverrides: { startPreviewPreparation: async () => { throw new Error('PREVIEW_PREPARATION_SUBJECT_REFUSED') } } })
  try {
    const response = await refused.app.inject({ method: 'POST', url: `/api/control/projects/${PROJECT_ID}/preview-preparations`, headers: headers(), payload: { changeId: CHANGE_ID, subjectDigest: SUBJECT_DIGEST } })
    assert.equal(response.statusCode, 404)
    assert.equal(JSON.parse(response.body).type, 'urn:conexus:problem:preview-subject-not-found')
  } finally { await refused.app.close() }
  for (const code of ['PREVIEW_PREPARATION_BUSY', 'PREVIEW_PREPARATION_CLOSED']) {
    const unavailable = await setup({ serviceOverrides: { startPreviewPreparation: async () => { throw new Error(code) } } })
    try {
      const response = await unavailable.app.inject({ method: 'POST', url: `/api/control/projects/${PROJECT_ID}/preview-preparations`, headers: headers(), payload: { changeId: CHANGE_ID, subjectDigest: SUBJECT_DIGEST } })
      assert.equal(response.statusCode, 503, code)
      assert.equal(JSON.parse(response.body).type, 'urn:conexus:problem:builder-preview-unavailable')
    } finally { await unavailable.app.close() }
  }
})
