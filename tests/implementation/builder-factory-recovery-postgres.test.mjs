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
const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem' })

test('recovery admits a run the Hub lost after its compare-and-swap, and leaves one that never reached it to the interrupt', async (t) => {
  const { connectionString, connection, onCleanup } = await buildHubDatabase(t, 'conexus_factory_recovery')
  const github = await startFakeGithub()
  onCleanup(() => github.close())
  const owner = randomUUID()
  const workspaceId = randomUUID()
  await query(connectionString, "INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, 'https://factory.test', $2, 'Owner')", [owner, owner])
  await query(connectionString, "INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, 'Factory')", [workspaceId])
  const executorPool = new pg.Pool({ ...connection, max: 2, options: '-c role=hub_builder_executor' })
  const ingressPool = new pg.Pool({ ...connection, max: 2, options: '-c role=hub_builder_ingress' })
  const store = createBuilderStore({ ingressPool, executorPool })
  onCleanup(() => store.close())

  const boundRun = async (name) => {
    const projectId = randomUUID()
    const repository = github.addRepository({ owner: 'acme-org', name, head: BASE })
    await query(connectionString, "INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, $3, 'NEW', $4, $3)", [projectId, workspaceId, name, STARTER])
    await query(connectionString, 'INSERT INTO builder.project_working_state(project_id, working_source_revision, working_version) VALUES ($1, $2, 0)', [projectId, STARTER])
    await executorPool.query('SELECT builder.bind_factory_project($1,$2,$3,$4,$5,$6,$7,$8)', [projectId, `fp-${name}`, `pr-${name}`, `r-${name}`, repository.id, `acme-org/${name}`, 'main', BASE])
    const builderRunId = randomUUID()
    const conversationId = randomUUID()
    await query(connectionString, `
      INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, conversation_id, idempotency_digest, request_digest, mode, base_source_revision, expected_working_version, base_working_version, state, phase)
      VALUES ($1, $2, $3, $4, $5, $6, 'BUILD', $7, 0, 0, 'RUNNING', 'SOURCE_ADMISSION')`,
    [builderRunId, projectId, owner, conversationId, builderRunId.replaceAll('-', '').padEnd(64, '0'), 'f'.repeat(64), BASE])
    return { projectId, builderRunId, conversationId, name }
  }
  const lost = await boundRun('lost-after-patch')
  github.state.refs.set('acme-org/lost-after-patch:main', RESULT)
  github.state.refs.set(`acme-org/lost-after-patch:conexus/${lost.conversationId}`, RESULT)
  const early = await boundRun('stopped-before-patch')
  github.state.refs.set(`acme-org/stopped-before-patch:conexus/${early.conversationId}`, RESULT)

  const app = createGithubApp({ appId: '5015512', privateKey, baseUrl: github.baseUrl })
  const service = createBuilderService({
    store,
    source: {},
    runtime: { kind: 'REMOTE_E2B', execute: async () => { throw new Error('not reached') } },
    applicationArtifacts: {},
    factory: {
      runtime: { execute: async () => { throw new Error('not reached') } },
      readBindingForRun: store.readFactoryBindingForRun,
      recoverAdmissions: () => recoverFactoryAdmissions({ store, github: app, installationFor: async () => 163574754 }),
    },
  })
  await service.recover()

  const row = async ({ builderRunId, projectId }) => (await query(connectionString, `
    SELECT run.state, run.result_kind, run.result_source_revision, run.failure_code, working.working_source_revision, working.working_version
    FROM builder.builder_run run JOIN builder.project_working_state working USING (project_id)
    WHERE run.builder_run_id = $1 AND run.project_id = $2`, [builderRunId, projectId])).rows[0]
  assert.deepEqual(await row(lost), {
    state: 'FAILED', result_kind: 'SOURCE_CHANGED_BUILD_FAILED', result_source_revision: RESULT, failure_code: 'BUILDER_PREVIEW_NOT_BUILT',
    working_source_revision: RESULT, working_version: '1',
  })
  assert.deepEqual(await row(early), {
    state: 'INTERRUPTED', result_kind: null, result_source_revision: null, failure_code: 'HUB_RESTART',
    working_source_revision: BASE, working_version: '0',
  })
})
