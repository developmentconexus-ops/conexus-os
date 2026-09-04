import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

process.env.MASTRA_TELEMETRY_DISABLED = '1'
const repositoryRoot = resolve(import.meta.dirname, '../..')

const compileHub = (t) => {
  const build = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r1-s6-inception-build-'))
  t.after(() => rmSync(build, { recursive: true, force: true }))
  const compiled = spawnSync(process.execPath, [
    resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project',
    resolve(repositoryRoot, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', build,
  ], { encoding: 'utf8' })
  assert.equal(compiled.status, 0, `${compiled.stdout}\n${compiled.stderr}`)
  return (path) => pathToFileURL(resolve(build, path)).href
}

const hasToolResult = (prompt, toolName) => prompt.some((message) =>
  message.role === 'tool' && JSON.stringify(message.content).includes(toolName))

const fakeInceptionModel = (calls) => ({
  specificationVersion: 'v3', provider: 'conexus-s6-fake', modelId: 'inception-fake-1', supportedUrls: {},
  async doGenerate(options) {
    calls.push({
      maxOutputTokens: options.maxOutputTokens,
      toolChoice: options.toolChoice,
      tools: options.tools?.map((tool) => tool.name).sort() ?? [],
      responseFormat: options.responseFormat?.type,
    })
    if (!hasToolResult(options.prompt, 'listProjectSourceSnapshotPaths')) return {
      content: [{ type: 'tool-call', toolCallId: 'list-1', toolName: 'listProjectSourceSnapshotPaths', input: '{}' }],
      finishReason: 'tool-calls', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, warnings: [],
    }
    if (!hasToolResult(options.prompt, 'readProjectSourceSnapshotBatch')) return {
      content: [{ type: 'tool-call', toolCallId: 'read-1', toolName: 'readProjectSourceSnapshotBatch', input: JSON.stringify({ paths: ['README.md'] }) }],
      finishReason: 'tool-calls', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, warnings: [],
    }
    return {
      content: [{ type: 'text', text: JSON.stringify({
        sourceText: 'Immutable bounded Baseline proposal', applicationRuntimeProfile: 'MANAGED',
        provenance: [{ path: 'README.md', digest: 'a'.repeat(64) }],
      }) }],
      finishReason: 'stop', usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 }, warnings: [],
    }
  },
  async doStream() { throw new Error('STREAM_NOT_ADMITTED') },
})

test('S6-P0 realizes PRJ-07 HTTP through bounded Mastra and Project settlement', async (t) => {
  const built = compileHub(t)
  const [{ createHttpApp }, { registerProjectRoutes }, { createProjectMastra }, { createProjectInceptionService }] = await Promise.all([
    import(built('http/app.js')),
    import(built('project/routes.js')),
    import(built('project/project-mastra.js')),
    import(built('project/inception.js')),
  ])
  const modelCalls = []
  const cognition = createProjectMastra([{
    admissionId: 'fake-inception', providerId: 'qualification', modelId: 'inception-fake-1', enabled: true,
    model: fakeInceptionModel(modelCalls),
  }])
  t.after(() => cognition.close())
  const source = Object.freeze({
    sourceRevision: 'b'.repeat(40),
    listPaths: async () => [{
      path: 'README.md', ownershipClass: 'APP-OWNED', mediaType: 'text/plain; charset=utf-8',
      byteLength: 14, digest: 'a'.repeat(64),
    }],
    readBatch: async (paths) => paths.map((path) => ({ path, digest: 'a'.repeat(64), utf8Bytes: 'bounded source' })),
  })
  const statements = []
  let settled
  const client = {
    async query(statement, values = []) {
      statements.push({ statement, values })
      if (statement.includes('reserve_or_replay_inception')) return { rows: [{
        state: 'RESERVED', source_revision: source.sourceRevision, response_body: null,
      }] }
      if (statement.includes('complete_inception')) {
        settled = JSON.parse(values[10])
        return { rows: [{ complete_inception: settled }] }
      }
      return { rows: [] }
    },
    release() {},
  }
  const inception = createProjectInceptionService({
    pool: { connect: async () => client, end: async () => {} },
    cognition,
    sourceSnapshot: ({ sourceRevision }) => {
      assert.equal(sourceRevision, source.sourceRevision)
      return source
    },
    admissionId: 'fake-inception',
    mintIdentity: () => '40000000-0000-4000-8000-000000000001',
  })
  const app = await createHttpApp({ staticRoot: null, registerRoutes: (server) => registerProjectRoutes(server, {
    origin: 'https://conexus.test',
    resolveCurrentSession: async () => ({ account: { accountId: '10000000-0000-4000-8000-000000000001' } }),
    inception,
    store: {
      listProjects: async () => [], getProject: async () => null, createProject: async () => { throw new Error('NOT_USED') },
      getBaselineCandidate: async () => null, getApprovedBaseline: async () => null,
      approveBaseline: async () => { throw new Error('NOT_USED') },
    },
  }) })
  t.after(() => app.close())
  const response = await app.inject({
    method: 'POST', url: '/api/control/projects/30000000-0000-4000-8000-000000000001/inception-investigations',
    headers: {
      origin: 'https://conexus.test', cookie: '__Host-conexus_csrf=csrf-1',
      'x-conexus-csrf': 'csrf-1', 'idempotency-key': 'intake-1', 'content-type': 'application/json',
    },
    payload: { intent: 'Create the first bounded Project Baseline.' },
  })
  assert.equal(response.statusCode, 200, response.body)
  const body = response.json()
  assert.deepEqual(body, settled)
  assert.match(body.candidateBaselineDigest, /^[0-9a-f]{64}$/)
  assert.equal(body.sourceRevision, source.sourceRevision)
  assert.equal(body.sourceText, 'Immutable bounded Baseline proposal')
  assert.equal(statements.filter(({ statement }) => statement.includes('reserve_or_replay_inception')).length, 1)
  assert.equal(statements.filter(({ statement }) => statement.includes('complete_inception')).length, 1)
  assert.equal(modelCalls.length, 3)
  assert.deepEqual(modelCalls[0].tools, ['listProjectSourceSnapshotPaths', 'readProjectSourceSnapshotBatch'])
  assert.equal(modelCalls.at(-1).maxOutputTokens, 8192)
  assert.equal(modelCalls.at(-1).responseFormat, 'json')
})

test('S6-P0 catalog, migration and external OAuth custody fail closed', async (t) => {
  const built = compileHub(t)
  const [{ createProjectMastra }, { createOAuthTokenStore }, { PROJECT_SOURCE_PROGRAM }, generated] = await Promise.all([
    import(built('project/project-mastra.js')),
    import(built('project/oauth-token-store.js')),
    import(built('project/source-snapshot.js')),
    import(built('generated/s3-routes.js')),
  ])
  assert.doesNotThrow(() => new Function(PROJECT_SOURCE_PROGRAM))
  assert.equal(generated.S3_GENERATED_ROUTES['PRJ-07'].operationId, 'RunInceptionInvestigation')
  assert.equal(generated.S3_GENERATED_ROUTES['PRJ-07'].url, '/api/control/projects/:projectId/inception-investigations')
  assert.throws(() => createProjectMastra([{
    admissionId: 'mutable', providerId: 'anthropic', modelId: 'latest', enabled: true,
    model: fakeInceptionModel([]),
  }]), /PROJECT_MODEL_CATALOG_REFUSED/)
  const cognition = createProjectMastra([{
    admissionId: 'exact', providerId: 'qualification', modelId: 'exact-1', enabled: true,
    model: fakeInceptionModel([]),
  }])
  t.after(() => cognition.close())
  await assert.rejects(cognition.runInception({
    admissionId: 'unknown', intent: 'must fail', source: {
      sourceRevision: 'b'.repeat(40),
      listPaths: async () => [],
      readBatch: async () => [],
    },
  }), /PROJECT_MODEL_PROVIDER_FAILURE|PROJECT_MODEL_ADMISSION_UNAVAILABLE/)

  const credentialRoot = mkdtempSync('/tmp/conexus-s6-oauth-')
  const credentialDirectory = resolve(credentialRoot, 'credentials')
  const credentialPath = resolve(credentialDirectory, 'anthropic-oauth.json')
  mkdirSync(credentialDirectory, { mode: 0o700 })
  writeFileSync(credentialPath, JSON.stringify({ access: 'expired', refresh: 'refresh-only', expiresAt: 1 }), { mode: 0o600 })
  t.after(() => rmSync(credentialRoot, { recursive: true, force: true }))
  let refreshCalls = 0
  const tokenStore = createOAuthTokenStore(credentialPath, async (refresh) => {
    refreshCalls += 1
    assert.equal(refresh, 'refresh-only')
    return { access: 'renewed', refresh: 'rotated', expiresAt: 99_999 }
  }, () => 2)
  assert.equal(await tokenStore.getAccessToken(), 'renewed')
  assert.equal(refreshCalls, 1)
  assert.doesNotMatch(readFileSync(credentialPath, 'utf8'), /expired|refresh-only/)
  assert.deepEqual((await import('../../scripts/run-hub-migrations.mjs')).loadMigrationFiles().slice(-2).map(({ version }) => version), ['009', '010'])
  const migration = readFileSync(resolve(repositoryRoot, 'apps/hub/migrations/009_project_inception.sql'), 'utf8')
  assert.match(migration, /CREATE TABLE project\.inception_idempotency/)
  assert.match(migration, /project\.complete_inception/)
  assert.match(migration, /stored_project\.source_revision = p_source_revision/)
  chmodSync(credentialPath, 0o644)
  await assert.rejects(createOAuthTokenStore(credentialPath).getAccessToken(), /ANTHROPIC_OAUTH_CUSTODY_INVALID/)
})
