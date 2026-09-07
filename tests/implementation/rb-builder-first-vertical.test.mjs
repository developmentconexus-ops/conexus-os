import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import pg from 'pg'
import { runCurrentHubMigrations } from '../../scripts/run-hub-migrations.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/rb-first-build-'))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', buildRoot,
], { cwd: repositoryRoot, encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(compiled.stdout || compiled.stderr)
const built = (path) => pathToFileURL(resolve(buildRoot, path)).href
const { createHttpApp } = await import(built('http/app.js'))
const { registerBuilderRoutes } = await import(built('builder/routes.js'))
const { createBuilderService } = await import(built('builder/service.js'))

test.after(() => rmSync(buildRoot, { recursive: true, force: true }))

const projectId = '11111111-1111-4111-8111-111111111111'
const changeId = '22222222-2222-4222-8222-222222222222'
const workUnitId = '33333333-3333-4333-8333-333333333333'
const actorRunId = '44444444-4444-4444-8444-444444444444'
const admissionToken = '55555555-5555-4555-8555-555555555555'
const sandboxId = 'sbx_exact'
const baseSourceRevision = 'a'.repeat(40)
const candidateSourceRevision = 'b'.repeat(40)
const projection = { changeId, projectId, intent: 'Add a health page', baselineDigest: 'c'.repeat(64), planningDepth: 'DIRECT', rigorProfile: 'CONTROLLED', state: 'QUEUED' }
const claim = { projectId, changeId, workUnitId, actorRunId, admissionToken, intent: projection.intent, baseSourceRevision }

test('Builder admits only an explicitly remote runtime and settles a fully scoped candidate', async () => {
  assert.throws(() => createBuilderService({ store: {}, source: {}, runtime: { kind: 'LOCAL' } }), /BUILDER_LOCAL_RUNTIME_REFUSED/)
  const calls = []
  const store = {
    createChange: async () => projection,
    claimChange: async () => { calls.push('claim'); return claim },
    bindSandbox: async (...args) => { calls.push(['bind', ...args]) },
    settleResult: async (input) => { calls.push(['settle', input]) },
    failRun: async (...args) => { calls.push(['fail', ...args]) },
    recoverAndListQueued: async () => [],
    close: async () => { calls.push('close') },
  }
  const source = {
    prepareSource: async (input) => { calls.push(['source', input]); return Uint8Array.from([1, 2, 3]) },
    admitCandidate: async (input) => {
      calls.push(['admit', input])
      return { baseSourceRevision, candidateSourceRevision, patch: 'diff --git a/x b/x' }
    },
  }
  const runtime = {
    kind: 'REMOTE_E2B',
    execute: async (input) => {
      calls.push(['execute', input])
      await input.bindPhysicalSandbox(sandboxId)
      return { runtimeId: 'mastra-native-e2b-v1', ...claim, sandboxId, candidateSourceRevision, resultBundle: Uint8Array.from([4]), summary: 'Implemented.' }
    },
  }
  const service = createBuilderService({ store, source, runtime })
  assert.equal((await service.createChange({ accountId: projectId, projectId, idempotencyKey: 'attempt', intent: projection.intent })).changeId, changeId)
  await service.close()
  assert.deepEqual(calls.map((entry) => Array.isArray(entry) ? entry[0] : entry), ['claim', 'source', 'execute', 'bind', 'admit', 'settle', 'close'])
  const settlement = calls.find((entry) => Array.isArray(entry) && entry[0] === 'settle')[1]
  assert.equal(settlement.baseSourceRevision, baseSourceRevision)
  assert.equal(settlement.candidateSourceRevision, candidateSourceRevision)
  assert.equal(settlement.sandboxId, sandboxId)
})

test('Builder refuses mismatched worker lineage and never settles its narration', async () => {
  const state = { settled: false, failed: false }
  const store = {
    createChange: async () => projection, claimChange: async () => claim, bindSandbox: async () => {},
    settleResult: async () => { state.settled = true }, failRun: async () => { state.failed = true },
    recoverAndListQueued: async () => [], close: async () => {},
  }
  const source = {
    prepareSource: async () => Uint8Array.from([1]),
    admitCandidate: async () => { throw new Error('must not admit mismatched output') },
  }
  const runtime = {
    kind: 'REMOTE_E2B',
    execute: async () => ({ runtimeId: 'mastra-native-e2b-v1', ...claim, changeId: projectId, sandboxId, candidateSourceRevision, resultBundle: Uint8Array.from([2]), summary: 'I declare success.' }),
  }
  const service = createBuilderService({ store, source, runtime })
  await service.createChange({ accountId: projectId, projectId, idempotencyKey: 'scope', intent: projection.intent })
  await service.close()
  assert.equal(state.settled, false)
  assert.equal(state.failed, true)
})

test('BLD-01/02/03/04/06/07/17 expose owner projections with command authenticity', async () => {
  const origin = 'https://control.example.test'
  const csrf = 'csrf'
  const snapshot = {
    change: projection,
    plan: { planRevision: admissionToken, planningDepth: 'DIRECT', rigorProfile: 'CONTROLLED', items: [], dependencyEdges: [], acceptanceLinks: [], blockers: [], unknowns: [], progress: 'QUEUED' },
    progress: { planRevision: admissionToken, items: [], overallState: 'QUEUED' },
    diff: { baseSourceRevision, candidateSourceRevision, patch: 'diff' },
    execution: { changeId, workUnits: [], actorRuns: [] },
  }
  const calls = []
  const store = {
    listChanges: async (input) => { calls.push(['list', input]); return [projection] },
    readSnapshot: async (input) => { calls.push(['read', input]); return snapshot },
  }
  const service = { createChange: async (input) => { calls.push(['create', input]); return projection } }
  const resolveCurrentSession = async (_request, requireCsrf) => { calls.push(['session', requireCsrf]); return { account: { accountId: projectId } } }
  const app = await createHttpApp({ registerRoutes: (server) => registerBuilderRoutes(server, { store, service, resolveCurrentSession, origin }) })
  try {
    assert.deepEqual(app.routeCensus(), ['BLD-01', 'BLD-02', 'BLD-03', 'BLD-04', 'BLD-06', 'BLD-07', 'BLD-17'])
    const denied = await app.inject({ method: 'POST', url: `/api/control/projects/${projectId}/changes`, payload: { intent: projection.intent } })
    assert.equal(denied.statusCode, 403)
    const created = await app.inject({
      method: 'POST', url: `/api/control/projects/${projectId}/changes`,
      headers: { origin, cookie: `__Host-conexus_csrf=${csrf}`, 'x-conexus-csrf': csrf, 'idempotency-key': 'one' }, payload: { intent: projection.intent },
    })
    assert.equal(created.statusCode, 201)
    assert.equal(calls.find((entry) => entry[0] === 'create')[1].idempotencyKey, 'one')
    for (const [suffix, expected] of [['', snapshot.change], ['/plan', snapshot.plan], ['/progress', snapshot.progress], ['/diff', snapshot.diff], ['/execution-detail', snapshot.execution]]) {
      const response = await app.inject({ method: 'GET', url: `/api/control/projects/${projectId}/changes/${changeId}${suffix}` })
      assert.equal(response.statusCode, 200)
      assert.deepEqual(JSON.parse(response.body), expected)
    }
    assert.equal(calls.findLast((entry) => entry[0] === 'read')[1].requireSource, false)
    const diffRead = calls.filter((entry) => entry[0] === 'read').find((entry) => entry[1].requireSource)
    assert.equal(diffRead[1].changeId, changeId)
  } finally { await app.close() }
})

test('runtime, migration and custody source preserve the Builder trust boundary', () => {
  const runtime = readFileSync(resolve(repositoryRoot, 'apps/hub/src/builder/runtime.ts'), 'utf8')
  const source = readFileSync(resolve(repositoryRoot, 'apps/hub/src/builder/source.ts'), 'utf8')
  const migration = readFileSync(resolve(repositoryRoot, 'apps/hub/migrations/019_rb_builder_first_vertical.sql'), 'utf8')
  assert.match(runtime, /Sandbox\.create\(config\.templateId/)
  assert.match(runtime, /allowInternetAccess: false/)
  assert.match(runtime, /envs: \{\}/)
  assert.doesNotMatch(runtime, /LocalSandbox/)
  assert.match(runtime, /override retryOnDead/)
  assert.match(source, /'--network', 'none'/)
  assert.match(source, /refs\/conexus\/changes\//)
  assert.match(source, /ownership\[path\] && ownership\[path\] !== 'APP-OWNED'/)
  assert.match(migration, /one_active_writer_per_change/)
  assert.match(migration, /state = 'QUARANTINED'/)
  assert.match(migration, /RETURN false;/)
  assert.doesNotMatch(migration, /can_manage.*can_build/s)
  assert.match(migration, /receipt\.operation_id = 'PRJ-03'/)
})

const postgresConfigured = ['CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME', 'CONEXUS_TEST_DB_USER', 'CONEXUS_TEST_DB_PASSWORD'].every((name) => process.env[name])
const quoteIdentifier = (value) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('Unsafe database identity')
  return `"${value}"`
}
const query = async (connection, statement, values = []) => {
  const client = new pg.Client(connection)
  await client.connect()
  try { return await client.query(statement, values) } finally { await client.end() }
}

test('RB migration applies atomically and exposes functions, never tables, to runtime roles', {
  skip: postgresConfigured ? false : 'real PostgreSQL configuration not supplied',
}, async (t) => {
  const admin = {
    host: process.env.CONEXUS_TEST_DB_HOST, port: Number(process.env.CONEXUS_TEST_DB_PORT),
    database: process.env.CONEXUS_TEST_DB_NAME, user: process.env.CONEXUS_TEST_DB_USER, password: process.env.CONEXUS_TEST_DB_PASSWORD,
  }
  const database = `conexus_rb_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  await query(admin, `CREATE DATABASE ${quoteIdentifier(database)}`)
  t.after(async () => query(admin, `DROP DATABASE ${quoteIdentifier(database)} WITH (FORCE)`))
  const current = { ...admin, database }
  const url = new URL('postgresql://localhost')
  url.hostname = current.host
  url.port = String(current.port)
  url.pathname = `/${database}`
  url.username = current.user
  url.password = current.password
  assert.deepEqual((await runCurrentHubMigrations({ connectionString: url.toString() })).versions, Array.from({ length: 19 }, (_, index) => String(index + 1).padStart(3, '0')))
  assert.deepEqual((await runCurrentHubMigrations({ connectionString: url.toString() })).appliedNow, [])
  const tables = await query(current, `SELECT tablename FROM pg_tables WHERE schemaname = 'builder' ORDER BY tablename`)
  assert.deepEqual(tables.rows.map((row) => row.tablename), ['actor_run', 'change', 'coding_session', 'operation_receipt', 'plan', 'work_unit'])
  const leaked = await query(current, `
    SELECT grantee, table_name FROM information_schema.table_privileges
    WHERE table_schema = 'builder' AND grantee IN ('hub_rb_ingress', 'hub_rb_executor')`)
  assert.deepEqual(leaked.rows, [])
  const callable = await query(current, `
    SELECT rolname FROM pg_roles
    WHERE rolname IN ('hub_rb_ingress','hub_rb_executor')
      AND rolsuper = false AND rolbypassrls = false ORDER BY rolname`)
  assert.deepEqual(callable.rows.map((row) => row.rolname), ['hub_rb_executor', 'hub_rb_ingress'])

  const accountId = '60000000-0000-4000-8000-000000000001'
  const workspaceId = '60000000-0000-4000-8000-000000000002'
  const subjectProjectId = '60000000-0000-4000-8000-000000000003'
  const subjectChangeId = '60000000-0000-4000-8000-000000000004'
  const planRevision = '60000000-0000-4000-8000-000000000005'
  const itemId = '60000000-0000-4000-8000-000000000006'
  const codingSessionId = '60000000-0000-4000-8000-000000000007'
  const subjectWorkUnitId = '60000000-0000-4000-8000-000000000008'
  const subjectActorRunId = '60000000-0000-4000-8000-000000000009'
  const subjectToken = '60000000-0000-4000-8000-000000000010'
  const digest = 'd'.repeat(64)
  await query(current, "INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, 'https://issuer.test', 'rb-owner', 'RB Owner')", [accountId])
  await query(current, "INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, 'RB Workspace')", [workspaceId])
  await query(current, 'INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project) VALUES ($1, $2, true)', [accountId, workspaceId])
  await query(current, `INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
    VALUES ($1, $2, 'RB Project', 'NEW', $3, 'rb-revision')`, [subjectProjectId, workspaceId, baseSourceRevision])
  await query(current, 'INSERT INTO iam.account_project_grant(account_id, project_id, can_read, can_manage) VALUES ($1, $2, true, true)', [accountId, subjectProjectId])
  await query(current, `INSERT INTO project.operation_idempotency(operation_id, account_id, workspace_id, key_digest, request_digest,
    reserved_project_id, outcome, response_status, response_digest, response_body, completed_at)
    VALUES ('PRJ-03', $1, $2, $3, $3, $4, 'SUCCEEDED', 201, $3, '{}'::jsonb, clock_timestamp())`, [accountId, workspaceId, digest, subjectProjectId])
  await query(current, `INSERT INTO project.baseline_candidate(project_id, candidate_digest, source_revision, source_text, application_runtime_profile)
    VALUES ($1, $2, $3, 'Accepted baseline', 'MANAGED')`, [subjectProjectId, digest, baseSourceRevision])
  await query(current, `INSERT INTO project.baseline_state(project_id, current_candidate_digest, approved_candidate_digest, approval_revision)
    VALUES ($1, $2, $2, $3)`, [subjectProjectId, digest, planRevision])
  await query(current, "ALTER ROLE hub_rb_ingress PASSWORD 'rb-ingress-test'; ALTER ROLE hub_rb_executor PASSWORD 'rb-executor-test'")
  const ingress = { ...current, user: 'hub_rb_ingress', password: 'rb-ingress-test' }
  const executor = { ...current, user: 'hub_rb_executor', password: 'rb-executor-test' }
  const created = await query(ingress, 'SELECT builder.create_change($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS value', [
    accountId, subjectProjectId, 'e'.repeat(64), 'f'.repeat(64), subjectChangeId, planRevision, itemId,
    codingSessionId, subjectWorkUnitId, 'Add a governed page',
  ])
  assert.equal(created.rows[0].value.state, 'QUEUED')
  const claimed = await query(executor, 'SELECT builder.claim_change($1,$2,$3) AS value', [subjectChangeId, subjectActorRunId, subjectToken])
  assert.equal(claimed.rows[0].value.baseSourceRevision, baseSourceRevision)
  await query(executor, 'SELECT builder.bind_sandbox($1,$2,$3)', [subjectActorRunId, subjectToken, sandboxId])
  const late = await query(executor, 'SELECT builder.settle_result($1,$2,$3,$4,$5,$6,$7) AS settled', [
    subjectActorRunId, subjectToken, 'replacement_sandbox', baseSourceRevision, candidateSourceRevision, 'diff', 'narration',
  ])
  assert.equal(late.rows[0].settled, false)
  assert.equal((await query(current, 'SELECT state FROM builder.actor_run WHERE actor_run_id = $1', [subjectActorRunId])).rows[0].state, 'QUARANTINED')
  assert.equal((await query(current, 'SELECT state FROM builder.change WHERE change_id = $1', [subjectChangeId])).rows[0].state, 'FAILED')
})
