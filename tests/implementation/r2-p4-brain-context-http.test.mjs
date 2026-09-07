import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r2-p4-brain-context-http-build-'))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', buildRoot,
], { encoding: 'utf8' })
if (compiled.status !== 0) {
  throw new Error(`R2_P4_BRAIN_CONTEXT_HTTP_HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
}
process.once('exit', () => rmSync(buildRoot, { recursive: true, force: true }))

const built = (path) => pathToFileURL(resolve(buildRoot, path)).href
const { createHttpApp } = await import(built('http/app.js'))
const { createBrainModule, createProjectBrainContextModule } = await import(built('brain/module.js'))

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222'
const response = Object.freeze({
  projectId: PROJECT_ID,
  brainRevisionId: '33333333-3333-4333-8333-333333333333',
  brainDigest: 'a'.repeat(64),
  projectBindingDigest: 'b'.repeat(64),
  validationState: 'VALID',
  updateAvailable: false,
  domains: [],
})

const moduleFor = async ({ result = { status: 'FOUND', value: response }, authenticated = true } = {}) => {
  const calls = []
  const module = createProjectBrainContextModule({
    resolver: {
      resolve: async (input) => {
        calls.push(input)
        return result
      },
    },
    resolveCurrentSession: async () => authenticated ? { account: { accountId: ACCOUNT_ID } } : null,
  })
  const app = await createHttpApp({
    staticRoot: null,
    registerRoutes: (server) => module.registerProjectBrainContextRoutes(server),
  })
  return { app, calls }
}

test('BRN-14 HTTP uses the generated route and binds the authenticated request to READ purpose', async (context) => {
  const { app, calls } = await moduleFor()
  context.after(() => app.close())
  assert.deepEqual(app.routeCensus(), ['BRN-14'])

  const reply = await app.inject({ method: 'GET', url: `/api/control/projects/${PROJECT_ID}/brain-context` })
  assert.equal(reply.statusCode, 200)
  assert.deepEqual(reply.json(), response)
  assert.deepEqual(calls, [{ accountId: ACCOUNT_ID, projectId: PROJECT_ID, purpose: 'READ' }])
})

test('BRN-14 HTTP maps authentication and resolver states to its exact Problem branches', async (context) => {
  const fixtures = [
    [false, undefined, 401, 'urn:conexus:problem:authentication-required'],
    [true, { status: 'DENIED' }, 403, 'urn:conexus:problem:project-brain-context-read-denied'],
    [true, { status: 'NOT_FOUND' }, 404, 'urn:conexus:problem:project-brain-context-not-found'],
    [true, { status: 'UNAVAILABLE' }, 503, 'urn:conexus:problem:project-brain-context-unavailable'],
  ]
  for (const [authenticated, result, status, type] of fixtures) {
    const builtModule = await moduleFor({ authenticated, ...(result ? { result } : {}) })
    context.after(() => builtModule.app.close())
    const reply = await builtModule.app.inject({ method: 'GET', url: `/api/control/projects/${PROJECT_ID}/brain-context` })
    assert.equal(reply.statusCode, status)
    assert.equal(reply.headers['content-type'], 'application/problem+json; charset=utf-8')
    assert.deepEqual(reply.json(), {
      type,
      title: status === 401 ? 'Authentication required'
        : status === 403 ? 'Project Brain context read denied'
          : status === 404 ? 'Project Brain context not found' : 'Project Brain context unavailable',
      status,
    })
    assert.equal(builtModule.calls.length, authenticated ? 1 : 0)
  }
})

test('the existing Brain module retains its exact route surface and close behavior', async () => {
  let ended = 0
  const brain = createBrainModule({
    pool: { end: async () => { ended += 1 } },
    registry: {},
    resolveCurrentSession: async () => null,
  })
  assert.equal(typeof brain.registerBrainRoutes, 'function')
  assert.equal('registerProjectBrainContextRoutes' in brain, false)
  await brain.close()
  assert.equal(ended, 1)
})

test('the production Brain module adds BRN-14 only when Project realization is configured', async (context) => {
  let ended = 0
  const brain = createBrainModule({
    pool: { query: async () => ({ rows: [] }), end: async () => { ended += 1 } },
    registry: {},
    resolveCurrentSession: async () => null,
    projectContext: { getCurrentRealization: async () => ({ status: 'UNAVAILABLE' }) },
  })
  const app = await createHttpApp({
    staticRoot: null,
    registerRoutes: (server) => brain.registerBrainRoutes(server),
  })
  context.after(async () => {
    await app.close()
    await brain.close()
  })
  assert.deepEqual(app.routeCensus(), ['BRN-01', 'BRN-02', 'BRN-03', 'BRN-10', 'BRN-14'])
  assert.equal(ended, 0)
})
