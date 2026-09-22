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
const hubBuild = mkdtempSync(resolve(repositoryRoot, 'apps/hub/builder-factory-source-head-build-'))
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
const { createFactoryCodingWorkerRuntime } = await import(built('builder/factory-runtime.js'))
const { createGithubApp } = await import(built('builder/factory-github.js'))

const STARTER = 'a'.repeat(40)
const OLD = 'd'.repeat(40)
const OUTSIDE = 'e'.repeat(40)
const LATER = '9'.repeat(40)
const RESULT = 'c'.repeat(40)
const PREVIEW_ARTIFACT = '12121212-1212-4212-8212-121212121212'
const PREVIEW_DIGEST = 'f'.repeat(64)
const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem' })

// The pilot's stuck Project: bound at OLD, with its last good Preview built from OLD.
const pilot = async (t) => {
  const { connectionString, connection, onCleanup } = await buildHubDatabase(t, 'conexus_factory_source_head')
  const github = await startFakeGithub()
  onCleanup(() => github.close())
  const owner = randomUUID()
  const workspaceId = randomUUID()
  const projectId = randomUUID()
  await query(connectionString, "INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, 'https://factory.test', $2, 'Owner')", [owner, owner])
  await query(connectionString, "INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, 'Factory')", [workspaceId])
  await query(connectionString, "INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'owner')", [owner, workspaceId])
  await query(connectionString, "INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, 'pilot', 'NEW', $3, 'pilot')", [projectId, workspaceId, STARTER])
  await query(connectionString, 'INSERT INTO builder.project_working_state(project_id, working_source_revision, working_version) VALUES ($1, $2, 0)', [projectId, STARTER])
  const repository = github.addRepository({ owner: 'acme-org', name: 'pilot', head: OLD })
  const executorPool = new pg.Pool({ ...connection, max: 2, options: '-c role=hub_builder_executor' })
  const ingressPool = new pg.Pool({ ...connection, max: 2, options: '-c role=hub_builder_ingress' })
  const store = createBuilderStore({ ingressPool, executorPool })
  let closed = false
  onCleanup(async () => { if (!closed) await store.close() })
  await executorPool.query('SELECT builder.bind_factory_project($1,$2,$3,$4,$5)', [projectId, 'fp-pilot', 'pr-pilot', 'r-pilot', OLD])
  await query(connectionString, "UPDATE builder.project_working_state SET current_state = 'PREVIEW_READY', last_preview_source_revision = $2, last_preview_artifact_revision_id = $3, last_preview_artifact_digest = $4 WHERE project_id = $1", [projectId, OLD, PREVIEW_ARTIFACT, PREVIEW_DIGEST])

  const app = createGithubApp({ appId: '5015512', privateKey, baseUrl: github.baseUrl })
  const main = () => github.state.refs.get('acme-org/pilot:main')
  const setMain = (sha) => github.state.refs.set('acme-org/pilot:main', sha)
  const pins = []
  const notes = []
  let onBuilt = () => {}
  const sandbox = {
    sandboxId: 'sbx-pilot',
    start: async () => {},
    writeFiles: async () => {},
    runAsRoot: async (script) => {
      const pin = / fetch --quiet --no-tags '[^']+' '([0-9a-f]{40})'/.exec(script)
      if (pin) pins.push(pin[1])
      return { exitCode: 0, success: true, stdout: '', stderr: '' }
    },
    executeCommand: async (command, args = []) => {
      const line = [command, ...args].join(' ')
      if (line === 'id -un') return { exitCode: 0, success: true, stdout: 'conexus-agent\n', stderr: '' }
      if (line.includes('add --all')) return { exitCode: 0, success: true, stdout: `${RESULT}\n`, stderr: '' }
      if (line.includes('ls-tree')) return { exitCode: 0, success: true, stdout: `100644 blob ${'1'.repeat(40)}      120\tapp/index.html\n`, stderr: '' }
      return { exitCode: 0, success: true, stdout: '', stderr: '' }
    },
    buildApplication: async () => {
      onBuilt()
      throw new Error('APPLICATION_COMPILATION_FAILED')
    },
  }
  const resolveRepository = async () => ({ installation: 163574754, externalId: repository.id, slug: 'acme-org/pilot', defaultBranch: 'main' })
  const runtime = createFactoryCodingWorkerRuntime({
    openSession: async () => ({
      sandbox,
      configure: async () => {},
      hasModelSelection: () => true,
      sendTurn: async () => ({ reason: 'complete', endedAt: new Date(), userMessageId: 'user-message', summary: 'Pronto.' }),
      close: async () => {},
    }),
    github: app,
    resolveRepository,
    materializeStarter: async () => {},
    log: () => {},
  })
  const service = createBuilderService({
    store,
    source: {},
    runtime: { kind: 'REMOTE_E2B', execute: async () => { throw new Error('a Factory run never reaches the legacy runtime') } },
    applicationArtifacts: {},
    factory: {
      runtime,
      readBindingForRun: store.readFactoryBindingForRun,
      readSourceHead: async (binding) => {
        const bound = await resolveRepository(binding)
        return app.readBranchHead(bound.installation, bound, bound.defaultBranch)
      },
      readConversationRepository: async () => 'pr-pilot',
      appendDiagnostic: async (note) => { notes.push(note) },
      recoverAdmissions: async () => [],
    },
  })
  const request = (idempotencyKey = randomUUID()) => service.createBuilderRun({
    accountId: owner, projectId, conversationId: randomUUID(), idempotencyKey, content: 'Adicione o botão Contar', mode: 'BUILD',
  })
  const settle = async () => {
    closed = true
    await service.close()
  }
  const runRow = async (builderRunId) => (await query(connectionString,
    'SELECT state, result_kind, base_source_revision, result_source_revision, failure_code FROM builder.builder_run WHERE builder_run_id = $1', [builderRunId])).rows[0]
  const working = async () => (await query(connectionString,
    'SELECT working_source_revision, working_version, last_preview_source_revision, last_preview_artifact_revision_id FROM builder.project_working_state WHERE project_id = $1', [projectId])).rows[0]
  const settled = async (builderRunId) => {
    for (let attempt = 0; attempt < 250; attempt += 1) {
      if (!['QUEUED', 'RUNNING'].includes((await runRow(builderRunId)).state)) return
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    throw new Error(`run ${builderRunId} never settled`)
  }
  const finish = (builderRunId) => query(connectionString, "UPDATE builder.builder_run SET state = 'SUCCEEDED', result_kind = 'RESPONSE_ONLY', finished_at = clock_timestamp() WHERE builder_run_id = $1", [builderRunId])
  return {
    owner, projectId, store, request, settle, settled, finish, runRow, working, main, setMain, pins, notes,
    onBuilt: (hook) => { onBuilt = hook },
  }
}

test('a commit pushed to main outside Conexus is the base of the next request, which is admitted while the Preview stays last good', async (t) => {
  const project = await pilot(t)
  project.setMain(OUTSIDE)
  const run = await project.request()
  assert.equal(run.baseSourceRevision, OUTSIDE)
  await project.settle()

  assert.deepEqual(project.pins, [OUTSIDE])
  assert.equal(project.main(), RESULT)
  assert.deepEqual(await project.runRow(run.builderRunId), {
    state: 'FAILED', result_kind: 'SOURCE_CHANGED_BUILD_FAILED', base_source_revision: OUTSIDE, result_source_revision: RESULT, failure_code: 'APPLICATION_COMPILATION_FAILED',
  })
  assert.deepEqual(await project.working(), {
    working_source_revision: RESULT, working_version: '2', last_preview_source_revision: OLD, last_preview_artifact_revision_id: PREVIEW_ARTIFACT,
  })
})

test('a run that loses the race to an outside push still settles BUILDER_SOURCE_BASE_MOVED with its note, and the next request starts from the new main', async (t) => {
  const project = await pilot(t)
  project.onBuilt(() => project.setMain(OUTSIDE))
  const lost = await project.request()
  assert.equal(lost.baseSourceRevision, OLD)
  await project.settled(lost.builderRunId)

  assert.equal(project.main(), OUTSIDE)
  assert.deepEqual(await project.runRow(lost.builderRunId), {
    state: 'FAILED', result_kind: null, base_source_revision: OLD, result_source_revision: null, failure_code: 'BUILDER_SOURCE_BASE_MOVED',
  })
  assert.deepEqual(project.notes.map(({ builderRunId, code, outcome, sourceRevision }) => ({ builderRunId, code, outcome, sourceRevision })), [
    { builderRunId: lost.builderRunId, code: 'BUILDER_SOURCE_BASE_MOVED', outcome: 'SOURCE_BASE_MOVED', sourceRevision: OLD },
  ])

  project.onBuilt(() => {})
  const next = await project.request()
  assert.equal(next.baseSourceRevision, OUTSIDE)
  await project.settle()
  assert.equal(project.main(), RESULT)
  assert.equal((await project.runRow(next.builderRunId)).result_source_revision, RESULT)
})

test('adoption converges: a replayed request keeps its base, and an unchanged head does not move the working version', async (t) => {
  const project = await pilot(t)
  const create = (idempotencyKey, sourceHead) => project.store.createBuilderRun({
    accountId: project.owner, projectId: project.projectId, conversationId: 'conversa', idempotencyKey, content: 'Olá', mode: 'PLAN', sourceHead,
  })
  const first = await create('same-key', OUTSIDE)
  assert.equal(first.baseSourceRevision, OUTSIDE)
  const replay = await create('same-key', LATER)
  assert.equal(replay.builderRunId, first.builderRunId)
  assert.equal(replay.baseSourceRevision, OUTSIDE)
  assert.deepEqual(await project.working(), {
    working_source_revision: OUTSIDE, working_version: '1', last_preview_source_revision: OLD, last_preview_artifact_revision_id: PREVIEW_ARTIFACT,
  })

  await project.finish(first.builderRunId)
  const again = await create('another-key', OUTSIDE)
  assert.equal(again.baseSourceRevision, OUTSIDE)
  assert.equal((await project.working()).working_version, '1')
  await project.finish(again.builderRunId)

  await assert.rejects(create('no-head', null), /BUILDER_SOURCE_HEAD_REQUIRED/)
})
