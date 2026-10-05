import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { hubModuleUrl as built } from './hub-build.mjs'
import { query } from './hub-database.mjs'
import { setupBuilder } from './builder-fixture.mjs'
import { ID } from './project-fixture.mjs'

const { Failure } = await import(built('platform/failure.js'))
const { createBuilderStore } = await import(built('builder/store.js'))
const { createBuilderService } = await import(built('builder/service.js'))
const { createConexusGit } = await import(built('builder/conexus-git.js'))

const run = (cwd, args) => execFileSync('git', args, {
  cwd, encoding: 'utf8',
  env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t' },
}).trim()

// A database and a Conexus Git holding one run per crash, each as a Hub stopped after its last
// durable write. Every Project's history is starter, result, then one commit on top; each crash
// sets `main` to one of them, and the run's candidate is always the result.
const EXECUTOR = { via: 'executor' }
const OWNER_OF_PLAN = '0f000000-0000-4000-8000-000000000005'
const CRASHED = '0f000000-0000-4000-8000-000000000002'
const SWEEPER = '0f000000-0000-4000-8000-000000000001'
const recoveryHarness = async (t, name, crashes) => {
  const { connection: connectionString, database, onCleanup } = await setupBuilder(t, name)
  const scratch = mkdtempSync(join(tmpdir(), 'conexus-recovery-'))
  onCleanup(() => rmSync(scratch, { recursive: true, force: true }))
  const git = createConexusGit({ root: join(scratch, 'git'), starter: [{ path: 'app/index.html', content: 'starter\n' }] })
  const owner = ID.owner
  const workspaceId = ID.workspace
  const sweeper = createBuilderStore({ database, ownerId: SWEEPER })
  const store = createBuilderStore({ database, ownerId: CRASHED })
  const runs = []
  for (const crash of crashes) {
    const projectId = randomUUID()
    const base = await git.ensureRepository(projectId)
    const repository = join(scratch, 'git', `${projectId}.git`)
    const work = join(scratch, crash.name)
    run(scratch, ['clone', '--quiet', repository, work])
    writeFileSync(join(work, 'app/index.html'), 'result\n')
    run(work, ['commit', '--quiet', '-am', 'result'])
    const result = run(work, ['rev-parse', 'HEAD'])
    writeFileSync(join(work, 'app/index.html'), 'on top\n')
    run(work, ['commit', '--quiet', '-am', 'on top'])
    const onTop = run(work, ['rev-parse', 'HEAD'])
    const main = { BASE: base, RESULT: result, ON_TOP: onTop }[crash.main]
    const builderRunId = randomUUID()
    run(work, ['push', '--quiet', repository, `${result}:refs/conexus/runs/${builderRunId}`, `+${main}:refs/heads/main`])

    await query(connectionString, "INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, $3, 'NEW', $4, $3)", [projectId, workspaceId, crash.name, base])
    await query(connectionString, 'INSERT INTO builder.project_working_state(project_id) VALUES ($1)', [projectId])
    await query(connectionString, 'INSERT INTO builder.project_repository(project_id) VALUES ($1)', [projectId])
    await query(connectionString, `
      INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, conversation_id, idempotency_digest, request_digest, base_source_revision, state, phase, started_at, owner_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $8 = 'RUNNING' THEN clock_timestamp() END, $10)`,
    [builderRunId, projectId, owner, randomUUID(), builderRunId.replaceAll('-', '').padEnd(64, '0'), 'f'.repeat(64), base, crash.queued ? 'QUEUED' : 'RUNNING',
      crash.queued ? null : crash.phase === 'SOURCE_ADMISSION' ? 'COMPILING' : crash.phase, crash.owner ?? (crash.queued ? null : CRASHED)])
    if (crash.candidate) await store.recordBuilderRunCandidate({ builderRunId, accountId: owner, sourceRevision: result })
    if (crash.advanced) {
      await store.advanceBuilderRunSource({ builderRunId, sourceRevision: result })
      if (crash.phase === 'FINALIZING') await store.setBuilderRunPhase({ builderRunId, phase: 'FINALIZING', actor: { via: 'executor' } })
    }
    if (crash.stopped) await query(connectionString, "UPDATE builder.builder_run SET phase = NULL, cancellation_requested_at = clock_timestamp(), cancellation_reason = 'USER_CANCELLED' WHERE builder_run_id = $1", [builderRunId])
    runs.push({ ...crash, projectId, builderRunId, result })
  }

  const outage = { active: false }
  const service = createBuilderService({
    store: sweeper,
    applicationArtifacts: {},
    runs: {
      ports: {},
      git: {
        readMain: git.readMain,
        mainContains: async (projectId, revision) => {
          if (outage.active) throw new Failure('CONEXUS_GIT_FAILED')
          return git.mainContains(projectId, revision)
        },
      },
      source: {},
      appendDiagnostic: async () => { throw new Error('not reached') },
      publishRun: async () => {},
      questionWaitMs: 60_000,
      staleAfterMs: 0,
    },
  })
  onCleanup(() => service.close())
  const row = async ({ builderRunId, result }) => {
    const [settled] = (await query(connectionString, 'SELECT state, result_kind, result_source_revision, failure_code FROM builder.builder_run WHERE builder_run_id = $1', [builderRunId])).rows
    return { ...settled, result_source_revision: settled.result_source_revision === result ? 'RESULT' : settled.result_source_revision }
  }
  const rows = async () => Object.fromEntries(await Promise.all(runs.map(async (entry) => [entry.name, await row(entry)])))
  return { service, runs, rows, outage, store, database, connectionString }
}

const interrupted = { state: 'INTERRUPTED', result_kind: null, result_source_revision: null, failure_code: 'HUB_RESTART' }
const notAdmitted = { state: 'FAILED', result_kind: null, result_source_revision: null, failure_code: 'BUILDER_SOURCE_ADMISSION_FAILED' }
const admitted = { state: 'FAILED', result_kind: 'SOURCE_CHANGED_BUILD_FAILED', result_source_revision: 'RESULT', failure_code: 'BUILDER_PREVIEW_NOT_BUILT' }
const pending = { state: 'RUNNING', result_kind: null, result_source_revision: null, failure_code: null }

test('a sweep settles every stale run by whether main holds its candidate, after a stop at each durable write', async (t) => {
  const crashes = [
    { name: 'compiled', phase: 'COMPILING', candidate: false, main: 'BASE', expected: interrupted },
    { name: 'offered-not-landed', phase: 'SOURCE_ADMISSION', candidate: true, main: 'BASE', expected: notAdmitted },
    { name: 'landed', phase: 'SOURCE_ADMISSION', candidate: true, main: 'RESULT', expected: admitted },
    { name: 'landed-then-built-on', phase: 'SOURCE_ADMISSION', candidate: true, main: 'ON_TOP', expected: admitted },
    { name: 'stopped-after-landing', phase: 'SOURCE_ADMISSION', candidate: true, main: 'RESULT', stopped: true, expected: admitted },
    { name: 'advanced', phase: 'SOURCE_ADMISSION', candidate: true, main: 'RESULT', advanced: true, expected: admitted },
    { name: 'finalizing', phase: 'FINALIZING', candidate: true, main: 'RESULT', advanced: true, expected: admitted },
    { name: 'waiting-on-a-question', phase: 'WAITING', candidate: false, main: 'BASE', expected: interrupted },
    { name: 'queued-never-claimed', queued: true, candidate: false, main: 'BASE', expected: interrupted },
    { name: 'own-ending-lost', phase: 'AGENT', candidate: false, main: 'BASE', owner: SWEEPER, expected: { state: 'FAILED', result_kind: null, result_source_revision: null, failure_code: 'BUILDER_RUN_SETTLE_LOST' } },
  ]
  const { service, runs, rows } = await recoveryHarness(t, 'conexus_run_recovery', crashes)
  await service.renewLease(new AbortController().signal)
  // A second sweep over the settled rows changes nothing.
  await service.renewLease(new AbortController().signal)
  assert.deepEqual(await rows(), Object.fromEntries(runs.map(({ name, expected }) => [name, expected])))
})

test('a candidate a sweep cannot confirm while the Conexus Git fails stays running, and the next sweep admits it once it answers', async (t) => {
  const crashes = [
    { name: 'landed-unconfirmed', phase: 'SOURCE_ADMISSION', candidate: true, main: 'RESULT' },
    { name: 'compiled', phase: 'COMPILING', candidate: false, main: 'BASE' },
  ]
  const { service, rows, outage } = await recoveryHarness(t, 'conexus_run_recovery_outage', crashes)
  outage.active = true
  await service.renewLease(new AbortController().signal)
  assert.deepEqual(await rows(), { 'landed-unconfirmed': pending, compiled: interrupted })
  outage.active = false
  await service.renewLease(new AbortController().signal)
  assert.deepEqual(await rows(), { 'landed-unconfirmed': admitted, compiled: interrupted })
})

test('a run that started in Planejar and built after the plan approval records, advances and settles its source (AC-4)', async (t) => {
  const { connection: connectionString, database, seedBuilderProject } = await setupBuilder(t, 'conexus_plan_settlement')
  const owner = ID.owner
  const projectId = await seedBuilderProject('Plan')
  const builderRunId = randomUUID()
  const base = 'a'.repeat(40)
  const candidate = 'b'.repeat(40)
  await query(connectionString, `
    INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, conversation_id, idempotency_digest, request_digest, base_source_revision, state, phase)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'RUNNING', 'AGENT')`,
  [builderRunId, projectId, owner, randomUUID(), '1'.repeat(64), '2'.repeat(64), base])
  await query(connectionString, 'UPDATE builder.builder_run SET owner_id = $2, started_at = now() WHERE builder_run_id = $1', [builderRunId, OWNER_OF_PLAN])
  const store = createBuilderStore({ database, ownerId: OWNER_OF_PLAN })

  await store.recordBuilderRunCandidate({ builderRunId, accountId: owner, sourceRevision: candidate })
  await store.advanceBuilderRunSource({ builderRunId, sourceRevision: candidate })
  const [admitted] = (await query(connectionString, 'SELECT builder.admit_verified_application_source($1,$2,$3,$4) AS value', [owner, projectId, builderRunId, candidate])).rows
  await store.settleBuilderRunBuild({ builderRunId, sourceRevision: candidate, failureCode: 'BUILDER_PREVIEW_NOT_BUILT' })
  const [row] = (await query(connectionString, 'SELECT state, result_kind, result_source_revision, failure_code FROM builder.builder_run WHERE builder_run_id = $1', [builderRunId])).rows
  assert.deepEqual({ admitted: admitted.value, ...row }, {
    admitted: true, state: 'FAILED', result_kind: 'SOURCE_CHANGED_BUILD_FAILED', result_source_revision: candidate, failure_code: 'BUILDER_PREVIEW_NOT_BUILT',
  })
})

test("a stop on a working or waiting run only marks the request, and the run's next phase write is refused", async (t) => {
  const crashes = [{ name: 'waiting', phase: 'WAITING', candidate: false, main: 'BASE' }]
  const { runs, store, connectionString } = await recoveryHarness(t, 'conexus_run_waiting_stop', crashes)
  const [waiting] = runs
  const phase = async ({ builderRunId }) => (await query(connectionString, 'SELECT state, phase FROM builder.builder_run WHERE builder_run_id = $1', [builderRunId])).rows[0]
  const working = await store.setBuilderRunPhase({ builderRunId: waiting.builderRunId, phase: 'AGENT', actor: EXECUTOR })
  assert.deepEqual({ state: working.state, phase: working.phase }, { state: 'RUNNING', phase: 'AGENT' }, 'a phase write answers the run as the session read serves it')
  await store.setBuilderRunPhase({ builderRunId: waiting.builderRunId, phase: 'WAITING', actor: EXECUTOR })
  const [{ account_id: accountId }] = (await query(connectionString, 'SELECT account_id FROM builder.builder_run WHERE builder_run_id = $1', [waiting.builderRunId])).rows
  const cancelled = await store.requestBuilderRunCancellation({ accountId, projectId: waiting.projectId, builderRunId: waiting.builderRunId })
  assert.deepEqual({ state: cancelled.state, cancellationRequested: cancelled.cancellationRequested }, { state: 'RUNNING', cancellationRequested: true }, 'the run writes its own end')
  assert.equal(await store.setBuilderRunPhase({ builderRunId: waiting.builderRunId, phase: 'AGENT', actor: EXECUTOR }), null)
  assert.deepEqual(await phase(waiting), { state: 'RUNNING', phase: null }, 'a requested stop clears the phase')
  await store.interruptBuilderRun({ builderRunId: waiting.builderRunId, failureCode: 'USER_CANCELLED' })
  assert.deepEqual(await phase(waiting), { state: 'INTERRUPTED', phase: null })
})

test('a fresh heartbeat keeps a run from every lease pass, a waiting run is taken like any other, and two passes at once take each stale run once', async (t) => {
  const live = '0f000000-0000-4000-8000-000000000003'
  const crashes = [
    { name: 'beating', phase: 'AGENT', candidate: false, main: 'BASE', owner: live },
    { name: 'quiet-a', phase: 'PREPARING', candidate: false, main: 'BASE' },
    { name: 'quiet-b', phase: 'COMPILING', candidate: false, main: 'BASE' },
    { name: 'waiting', phase: 'WAITING', candidate: false, main: 'BASE' },
  ]
  const { runs, database, connectionString } = await recoveryHarness(t, 'conexus_run_lease', crashes)
  await query(connectionString, "UPDATE builder.builder_run SET heartbeat_at = clock_timestamp() - interval '1 minute', created_at = clock_timestamp() - interval '1 minute'")
  await query(connectionString, 'UPDATE builder.builder_run SET heartbeat_at = clock_timestamp() WHERE builder_run_id = $1', [runs[0].builderRunId])
  const sweeps = ['0f000000-0000-4000-8000-000000000001', '0f000000-0000-4000-8000-000000000004'].map((ownerId) => createBuilderStore({ database, ownerId }))
  const [one, other] = await Promise.all(sweeps.map((sweeper) => sweeper.renewRunLease({ liveRunIds: [], staleAfterMs: 30_000 })))
  const names = new Map(runs.map(({ builderRunId, name }) => [builderRunId, name]))
  assert.deepEqual([...one, ...other].map(({ builderRunId }) => names.get(builderRunId)).sort(), ['quiet-a', 'quiet-b', 'waiting'])
})
