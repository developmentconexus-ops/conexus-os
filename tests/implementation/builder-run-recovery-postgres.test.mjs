import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { hubModuleUrl as built } from './hub-build.mjs'
import { buildHubDatabase, query, testPool } from './hub-database.mjs'

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
const recoveryHarness = async (t, name, crashes) => {
  const { connectionString, connection, onCleanup } = await buildHubDatabase(t, name)
  const scratch = mkdtempSync(join(tmpdir(), 'conexus-recovery-'))
  onCleanup(() => rmSync(scratch, { recursive: true, force: true }))
  const git = createConexusGit({ root: join(scratch, 'git'), starter: [{ path: 'app/index.html', content: 'starter\n' }] })
  const owner = randomUUID()
  const workspaceId = randomUUID()
  await query(connectionString, "INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, 'https://recovery.test', $2, 'Owner')", [owner, owner])
  await query(connectionString, "INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, 'Recovery')", [workspaceId])
  const executorPool = testPool({ ...connection, max: 2, options: '-c role=hub_builder_executor' })
  const ingressPool = testPool({ ...connection, max: 2, options: '-c role=hub_builder_ingress' })
  const store = createBuilderStore({ ingressPool, executorPool })
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
    await query(connectionString, 'SELECT builder.register_project_repository($1)', [projectId])
    await query(connectionString, `
      INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, conversation_id, idempotency_digest, request_digest, mode, base_source_revision, state, phase)
      VALUES ($1, $2, $3, $4, $5, $6, 'BUILD', $7, 'RUNNING', $8)`,
    [builderRunId, projectId, owner, randomUUID(), builderRunId.replaceAll('-', '').padEnd(64, '0'), 'f'.repeat(64), base, crash.phase === 'SOURCE_ADMISSION' ? 'COMPILING' : crash.phase])
    if (crash.candidate) assert.equal((await executorPool.query('SELECT builder.record_builder_run_candidate($1,$2) AS value', [builderRunId, result])).rows[0].value, true)
    if (crash.advanced) {
      await store.advanceBuilderRunSource(builderRunId, result)
      if (crash.phase === 'FINALIZING') await store.setBuilderRunPhase(builderRunId, 'FINALIZING')
    }
    if (crash.stopped) await query(connectionString, "UPDATE builder.builder_run SET cancellation_requested_at = clock_timestamp(), cancellation_reason = 'USER_CANCELLED' WHERE builder_run_id = $1", [builderRunId])
    runs.push({ ...crash, projectId, builderRunId, result })
  }

  const outage = { active: false }
  const service = createBuilderService({
    store,
    applicationArtifacts: {},
    runs: {
      runtime: { execute: async () => { throw new Error('not reached') } },
      git: {
        readMain: git.readMain,
        mainContains: async (projectId, revision) => {
          if (outage.active) throw new Error('CONEXUS_GIT_FAILED')
          return git.mainContains(projectId, revision)
        },
      },
      source: {},
      appendDiagnostic: async () => { throw new Error('not reached') },
      reconcileEveryMs: 10,
    },
  })
  onCleanup(() => service.close())
  const row = async ({ builderRunId, result }) => {
    const [settled] = (await query(connectionString, 'SELECT state, result_kind, result_source_revision, failure_code FROM builder.builder_run WHERE builder_run_id = $1', [builderRunId])).rows
    return { ...settled, result_source_revision: settled.result_source_revision === result ? 'RESULT' : settled.result_source_revision }
  }
  const rows = async () => Object.fromEntries(await Promise.all(runs.map(async (entry) => [entry.name, await row(entry)])))
  return { service, runs, rows, outage }
}

const interrupted = { state: 'INTERRUPTED', result_kind: null, result_source_revision: null, failure_code: 'HUB_RESTART' }
const notAdmitted = { state: 'FAILED', result_kind: null, result_source_revision: null, failure_code: 'BUILDER_SOURCE_ADMISSION_FAILED' }
const admitted = { state: 'FAILED', result_kind: 'SOURCE_CHANGED_BUILD_FAILED', result_source_revision: 'RESULT', failure_code: 'BUILDER_PREVIEW_NOT_BUILT' }
const pending = { state: 'RUNNING', result_kind: null, result_source_revision: null, failure_code: null }

test('recovery settles every unsettled run by whether main holds its candidate, after a stop at each durable write', async (t) => {
  const crashes = [
    { name: 'compiled', phase: 'COMPILING', candidate: false, main: 'BASE', expected: interrupted },
    { name: 'offered-not-landed', phase: 'SOURCE_ADMISSION', candidate: true, main: 'BASE', expected: notAdmitted },
    { name: 'landed', phase: 'SOURCE_ADMISSION', candidate: true, main: 'RESULT', expected: admitted },
    { name: 'landed-then-built-on', phase: 'SOURCE_ADMISSION', candidate: true, main: 'ON_TOP', expected: admitted },
    { name: 'stopped-after-landing', phase: 'SOURCE_ADMISSION', candidate: true, main: 'RESULT', stopped: true, expected: admitted },
    { name: 'advanced', phase: 'SOURCE_ADMISSION', candidate: true, main: 'RESULT', advanced: true, expected: admitted },
    { name: 'finalizing', phase: 'FINALIZING', candidate: true, main: 'RESULT', advanced: true, expected: admitted },
  ]
  const { service, runs, rows } = await recoveryHarness(t, 'conexus_run_recovery', crashes)
  await service.recover()
  // A second recovery over the settled rows changes nothing.
  await service.recover()
  assert.deepEqual(await rows(), Object.fromEntries(runs.map(({ name, expected }) => [name, expected])))
})

test('a candidate recovery cannot confirm while the Conexus Git fails stays running, and is admitted once it answers, without another restart', async (t) => {
  const crashes = [
    { name: 'landed-unconfirmed', phase: 'SOURCE_ADMISSION', candidate: true, main: 'RESULT' },
    { name: 'compiled', phase: 'COMPILING', candidate: false, main: 'BASE' },
  ]
  const { service, rows, outage } = await recoveryHarness(t, 'conexus_run_recovery_outage', crashes)
  outage.active = true
  await service.recover()
  assert.deepEqual(await rows(), { 'landed-unconfirmed': pending, compiled: interrupted })
  outage.active = false
  let settled = await rows()
  for (let attempt = 0; attempt < 300 && settled['landed-unconfirmed'].state === 'RUNNING'; attempt++) {
    await new Promise((wake) => { setTimeout(wake, 10) })
    settled = await rows()
  }
  assert.deepEqual(settled, { 'landed-unconfirmed': admitted, compiled: interrupted })
})
