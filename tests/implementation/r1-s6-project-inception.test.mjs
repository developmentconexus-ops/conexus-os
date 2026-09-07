import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { runInNewContext } from 'node:vm'
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

test('P4 recovery preflights pending and raced Project source before any cognition call', async (t) => {
  const built = compileHub(t)
  const { createProjectInceptionService } = await import(built('project/inception.js'))
  for (const branch of ['pending', 'pending-after-reservation', 'source-race', 'aligned']) {
    await t.test(branch, async () => {
      const events = []
      const service = createProjectInceptionService({
        admissionId: 'no-provider-call',
        pool: { end: async () => {}, connect: async () => ({
          release() {},
          query: async (sql, values) => {
            events.push(sql)
            if (sql.includes('reserve_or_replay_inception')) return { rows: [{
              state: 'RESERVED', source_revision: 'a'.repeat(40), response_body: null,
            }] }
            if (sql.includes('complete_inception')) return { rows: [{ complete_inception: JSON.parse(values[10]) }] }
            return { rows: [] }
          },
        }) },
        reconcileBindingSource: async () => {
          events.push('reconcile')
          if (branch === 'pending' || (branch === 'pending-after-reservation' &&
            events.some((event) => event.includes('reserve_or_replay_inception')))) {
            throw Object.assign(new Error('pending'), { code: 'P0001' })
          }
        },
        sourceSnapshot: () => ({
          sourceRevision: 'a'.repeat(40), readBatch: async () => [],
          listPaths: async () => {
            events.push('source-preflight')
            if (branch === 'source-race') throw new Error('PRJ07_SOURCE_STALE')
            return []
          },
        }),
        cognition: { runInception: async () => {
          events.push('cognition')
          return { sourceText: 'bounded contract fixture', applicationRuntimeProfile: 'MANAGED' }
        } },
      })
      const run = service.run({ accountId: '10000000-0000-4000-8000-000000000001',
        projectId: '30000000-0000-4000-8000-000000000001', idempotencyKey: branch, body: { intent: 'inspect' } })
      if (branch === 'aligned') {
        await run
        assert.ok(events.indexOf('source-preflight') < events.indexOf('cognition'))
      } else {
        await assert.rejects(run, /PRJ07_BINDING_SOURCE_CONFLICT|PRJ07_SOURCE_STALE/)
        assert.equal(events.includes('cognition'), false)
        if (branch !== 'pending') assert.ok(events.some((event) => event.includes('abandon_inception')))
        else assert.deepEqual(events, ['reconcile'])
      }
    })
  }
})

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
  const sourceSnapshotModule = readFileSync(resolve(repositoryRoot, 'apps/hub/src/project/source-snapshot.ts'), 'utf8')
  const dockerInvocation = sourceSnapshotModule.match(/const child = spawn\('docker', \[([\s\S]*?)\n {2}\],/)
  assert.ok(dockerInvocation, 'source snapshot must retain one bounded Docker runner')
  assert.match(dockerInvocation[1], /'--user',\s*`\$\{process\.getuid\(\)\}:\$\{process\.getgid\(\)\}`/)
  assert.match(sourceSnapshotModule, /if \(!process\.getuid \|\| !process\.getgid\) return reject\(new Error\('PROJECT_SOURCE_UNSUPPORTED'\)\)/)

  // Controlled fixture only: fake request/file/Git boundaries; no OCI or production source read.
  const sourceRevision = 'a'.repeat(40)
  const sourceFiles = new Map([
    ['zeta.txt', Buffer.from('zeta source\n', 'utf8')],
    ['alpha.txt', Buffer.from([0, 1, 2, 255])],
  ])
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
  const executeProgram = (request) => {
    const writes = []
    const reads = []
    const exits = []
    const spawnCalls = []
    const exit = new Error('PROGRAM_EXIT')
    const fakeReadFileSync = (path, encoding) => {
      reads.push({ path, encoding })
      assert.equal(path, '/run/conexus/request.json')
      assert.equal(encoding, 'utf8')
      return JSON.stringify(request)
    }
    const fakeSpawnSync = (command, args, options) => {
      spawnCalls.push({ command, args, options })
      assert.equal(command, '/usr/local/bin/git')
      assert.equal(args[0], '--git-dir=/repository.git')
      if (args[1] === 'rev-parse') return { status: 0, signal: null, stdout: `${sourceRevision}\n` }
      if (args[1] === 'cat-file' && args[2] === '-e') return { status: 0, signal: null, stdout: '' }
      if (args[1] === 'ls-tree') {
        const lines = [...sourceFiles].map(([path, bytes], index) =>
          `100644 blob ${String(index + 1).repeat(40)} ${bytes.length}\t${path}`,
        )
        return { status: 0, signal: null, stdout: `${lines.join('\0')}\0` }
      }
      if (args[1] === 'cat-file' && args[2] === 'blob') {
        const path = args[3].slice(sourceRevision.length + 1)
        const bytes = sourceFiles.get(path)
        assert.ok(bytes, `missing fake source path ${path}`)
        return { status: 0, signal: null, stdout: bytes }
      }
      throw new Error(`UNEXPECTED_FAKE_GIT_COMMAND ${args.join(' ')}`)
    }
    const fakeRequire = (moduleName) => {
      if (moduleName === 'node:fs') return { readFileSync: fakeReadFileSync }
      if (moduleName === 'node:crypto') return { createHash }
      if (moduleName === 'node:child_process') return { spawnSync: fakeSpawnSync }
      throw new Error(`UNEXPECTED_FAKE_REQUIRE ${moduleName}`)
    }
    const processShim = {
      stdout: { write: (value) => writes.push(value) },
      exit: (code) => {
        exits.push(code)
        throw exit
      },
    }
    try {
      runInNewContext(PROJECT_SOURCE_PROGRAM, {
        Buffer,
        process: processShim,
        require: fakeRequire,
      })
      assert.fail('PROJECT_SOURCE_PROGRAM must terminate through process.exit')
    } catch (error) {
      assert.equal(error, exit)
    }
    assert.deepEqual(exits, [0])
    assert.equal(reads.length, 1)
    assert.equal(writes.length, 1)
    return { value: JSON.parse(writes[0]), spawnCalls }
  }

  const listed = executeProgram({ operation: 'list', sourceRevision })
  assert.deepEqual(listed.value, {
    status: 'PASS',
    entries: [
      { path: 'alpha.txt', byteLength: 4, digest: digest(sourceFiles.get('alpha.txt')), mediaType: 'application/octet-stream' },
      { path: 'zeta.txt', byteLength: 12, digest: digest(sourceFiles.get('zeta.txt')), mediaType: 'text/plain; charset=utf-8' },
    ],
  })
  assert.ok(listed.spawnCalls.some(({ args }) => args[1] === 'ls-tree' && args.includes('-z')))

  const read = executeProgram({ operation: 'read', sourceRevision, paths: ['zeta.txt'] })
  assert.deepEqual(read.value, {
    status: 'PASS',
    files: [
      { path: 'zeta.txt', digest: digest(sourceFiles.get('zeta.txt')), utf8Bytes: 'zeta source\n' },
    ],
  })
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
