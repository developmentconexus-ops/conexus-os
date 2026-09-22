import assert from 'node:assert/strict'
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import pg from 'pg'
import { buildHubDatabase, query } from './hub-database.mjs'
import { startFakeGithub } from './builder-factory-fake-github.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const hubBuild = mkdtempSync(resolve(repositoryRoot, 'apps/hub/builder-factory-recovery-build-'))
process.once('exit', () => rmSync(hubBuild, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', hubBuild,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
const built = (path) => pathToFileURL(resolve(hubBuild, path)).href
const { createBuilderStore } = await import(built('builder/store.js'))
const { createBuilderService } = await import(built('builder/service.js'))
const { recoverFactoryAdmissions } = await import(built('builder/factory-runtime.js'))
const { createGithubApp } = await import(built('builder/factory-github.js'))

const STARTER = 'a'.repeat(40)
const BASE = 'b'.repeat(40)
const RESULT = 'c'.repeat(40)
const ON_TOP = 'd'.repeat(40)
const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem' })

const interrupted = { state: 'INTERRUPTED', result_kind: null, result_source_revision: null, failure_code: 'HUB_RESTART', working_source_revision: BASE, working_version: '0' }
const admitted = { state: 'FAILED', result_kind: 'SOURCE_CHANGED_BUILD_FAILED', result_source_revision: RESULT, failure_code: 'BUILDER_PREVIEW_NOT_BUILT', working_source_revision: RESULT, working_version: '1' }

// Each row is the database and GitHub as a Hub stopped after one more durable write left them.
const crashes = [
  { name: 'compiled', phase: 'COMPILING', candidate: null, main: BASE, expected: interrupted },
  { name: 'offered-not-landed', phase: 'SOURCE_ADMISSION', candidate: RESULT, main: BASE, expected: interrupted },
  { name: 'landed', phase: 'SOURCE_ADMISSION', candidate: RESULT, main: RESULT, expected: admitted },
  { name: 'landed-then-built-on', phase: 'SOURCE_ADMISSION', candidate: RESULT, main: ON_TOP, expected: admitted },
  { name: 'stopped-after-landing', phase: 'SOURCE_ADMISSION', candidate: RESULT, main: RESULT, stopped: true, expected: admitted },
  { name: 'advanced', phase: 'SOURCE_ADMISSION', candidate: RESULT, main: RESULT, advanced: true, expected: admitted },
  { name: 'finalizing', phase: 'FINALIZING', candidate: RESULT, main: RESULT, advanced: true, expected: admitted },
]

test('recovery settles every unsettled run whose candidate reached main, after a stop at each durable write', async (t) => {
  const { connectionString, connection, onCleanup } = await buildHubDatabase(t, 'conexus_factory_recovery')
  const github = await startFakeGithub()
  onCleanup(() => github.close())
  github.state.parents.set(ON_TOP, RESULT).set(RESULT, BASE)
  const owner = randomUUID()
  const workspaceId = randomUUID()
  await query(connectionString, "INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, 'https://factory.test', $2, 'Owner')", [owner, owner])
  await query(connectionString, "INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, 'Factory')", [workspaceId])
  const executorPool = new pg.Pool({ ...connection, max: 2, options: '-c role=hub_builder_executor' })
  const ingressPool = new pg.Pool({ ...connection, max: 2, options: '-c role=hub_builder_ingress' })
  const store = createBuilderStore({ ingressPool, executorPool })
  onCleanup(() => store.close())

  const repositories = new Map()
  const runs = []
  for (const crash of crashes) {
    const projectId = randomUUID()
    const repository = github.addRepository({ owner: 'acme-org', name: crash.name, head: crash.main })
    await query(connectionString, "INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, $3, 'NEW', $4, $3)", [projectId, workspaceId, crash.name, STARTER])
    await query(connectionString, 'INSERT INTO builder.project_working_state(project_id, working_source_revision, working_version) VALUES ($1, $2, 0)', [projectId, STARTER])
    repositories.set(`r-${crash.name}`, { installation: 163574754, externalId: repository.id, slug: `acme-org/${crash.name}`, defaultBranch: 'main' })
    await executorPool.query('SELECT builder.bind_factory_project($1,$2,$3,$4,$5)', [projectId, `fp-${crash.name}`, `pr-${crash.name}`, `r-${crash.name}`, BASE])
    const builderRunId = randomUUID()
    await query(connectionString, `
      INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, conversation_id, idempotency_digest, request_digest, mode, base_source_revision, expected_working_version, base_working_version, state, phase)
      VALUES ($1, $2, $3, $4, $5, $6, 'BUILD', $7, 0, 0, 'RUNNING', $8)`,
    [builderRunId, projectId, owner, randomUUID(), builderRunId.replaceAll('-', '').padEnd(64, '0'), 'f'.repeat(64), BASE, crash.phase === 'SOURCE_ADMISSION' ? 'COMPILING' : crash.phase])
    if (crash.candidate) assert.equal((await executorPool.query('SELECT builder.record_builder_run_candidate($1,$2) AS value', [builderRunId, crash.candidate])).rows[0].value, true)
    if (crash.advanced) {
      await store.advanceBuilderRunSource(builderRunId, crash.candidate)
      if (crash.phase === 'FINALIZING') await store.setBuilderRunPhase(builderRunId, 'FINALIZING')
    }
    if (crash.stopped) await query(connectionString, "UPDATE builder.builder_run SET cancellation_requested_at = clock_timestamp(), cancellation_reason = 'USER_CANCELLED' WHERE builder_run_id = $1", [builderRunId])
    runs.push({ ...crash, projectId, builderRunId })
  }

  const app = createGithubApp({ appId: '5015512', privateKey, baseUrl: github.baseUrl })
  const service = createBuilderService({
    store,
    source: {},
    runtime: { kind: 'REMOTE_E2B', execute: async () => { throw new Error('not reached') } },
    applicationArtifacts: {},
    factory: {
      runtime: { execute: async () => { throw new Error('not reached') } },
      readBindingForRun: store.readFactoryBindingForRun,
      recoverAdmissions: () => recoverFactoryAdmissions({ store, github: app, resolveRepository: async (binding) => repositories.get(binding.repositoryId) }),
    },
  })
  await service.recover()
  // A second recovery over the settled rows changes nothing.
  await service.recover()

  const row = async ({ builderRunId, projectId }) => (await query(connectionString, `
    SELECT run.state, run.result_kind, run.result_source_revision, run.failure_code, working.working_source_revision, working.working_version
    FROM builder.builder_run run JOIN builder.project_working_state working USING (project_id)
    WHERE run.builder_run_id = $1 AND run.project_id = $2`, [builderRunId, projectId])).rows[0]
  const actual = Object.fromEntries(await Promise.all(runs.map(async (run) => [run.name, await row(run)])))
  assert.deepEqual(actual, Object.fromEntries(runs.map(({ name, expected }) => [name, expected])))
  assert.deepEqual(github.state.requests.filter(({ method, path }) => method !== 'GET' && !path.endsWith('/access_tokens')), [], 'recovery only reads GitHub')
})
