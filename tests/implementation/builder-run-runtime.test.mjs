import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { test } from 'node:test'
import { connectorRecord } from './connector-record.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const built = hubModuleUrl
const { createBuilderService } = await import(built('builder/service.js'))
const { createBuilderRunRuntime } = await import(built('builder/run-runtime.js'))
const { createConexusGit } = await import(built('builder/conexus-git.js'))
const { createProjectSourceReads } = await import(built('builder/source.js'))

const runId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'
const accountId = '33333333-3333-4333-8333-333333333333'
const conversationId = '44444444-4444-4444-8444-444444444444'
const AGENTS_MD = '# Project knowledge\n\nA base app.\n'
const STARTER = [
  { path: 'AGENTS.md', content: AGENTS_MD },
  { path: 'app/index.html', content: '<h1>base</h1>\n' },
]
const BASE_FILES = ['AGENTS.md', 'app/index.html']
const MODEL_ACCOUNT = '55555555-5555-4555-8555-555555555555'
const GIT_ENV = { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t' }
const completed = (summary = 'Pronto.') => ({ reason: 'complete', userMessageId: 'user-message', summary })
const listFiles = (root) => readdirSync(root, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile()).map((entry) => relative(root, join(entry.parentPath, entry.name))).sort()

const PASSING_REPORT = {
  ok: true,
  steps: ['generate', 'typecheck', 'build', 'server', 'boot'].map((step) => ({ step, status: 'passed', durationMs: 1 })),
  facts: { operations: 0, migrations: 0, jsGzipBytes: 1 },
}
const failedReport = (step, problems) => {
  const order = ['generate', 'typecheck', 'build', 'server', 'boot']
  const failedAt = order.indexOf(step)
  return {
    ok: step === 'boot',
    steps: order.map((id, index) => index < failedAt ? { step: id, status: 'passed', durationMs: 1 }
      : index === failedAt ? { step: id, status: 'failed', durationMs: 1, problems }
        : { step: id, status: 'skipped', reason: `after failed ${step}` }),
    facts: { operations: 0, migrations: 0, jsGzipBytes: 0 },
  }
}

// A run against a real Conexus Git and a sandbox that is a directory on this machine: every path the
// runtime names under /workspace, /var/lib or /opt lands under the harness's
// own `vm` directory, and the agent user's `kill -KILL -1` is recorded, never run.
const harness = async (t, { mode = 'BUILD', turn, build, admissionReport, buildReport, onAdmissionCheck, starter, agentUser = 'conexus-agent', onStart, onCommand, lostAdvances = 0, close, applicationServer, openConnectorRun, openError, onHoldOpen, corruptSeed = false, beforeFastForward, afterFastForward, modelAccount = MODEL_ACCOUNT, starterFiles = STARTER } = {}) => {
  const scratch = mkdtempSync(join(tmpdir(), 'conexus-runtime-'))
  t.after(() => rmSync(scratch, { recursive: true, force: true }))
  const vm = join(scratch, 'vm')
  for (const directory of ['workspace', 'opt/conexus', 'tmp']) mkdirSync(join(vm, directory), { recursive: true })
  const conexusGit = createConexusGit({ root: join(scratch, 'git'), starter: starterFiles })
  const base = await conexusGit.ensureRepository(projectId)
  const bare = join(scratch, 'git', `${projectId}.git`)
  const inBare = (...args) => spawnSync('git', ['--git-dir', bare, ...args], { encoding: 'utf8', env: GIT_ENV }).stdout.trim()
  // A commit on top of the base that no run made, for a writer that moves `main` behind the run's back.
  const outside = () => inBare('commit-tree', `${base}^{tree}`, '-p', base, '-m', 'outside')
  const moveMain = (revision) => inBare('update-ref', 'refs/heads/main', revision)
  const git = {
    ...conexusGit,
    fastForwardMain: async (...args) => {
      await beforeFastForward?.({ moveMain, outside })
      const moved = await conexusGit.fastForwardMain(...args)
      await afterFastForward?.()
      return moved
    },
  }
  const local = (text) => text.replaceAll('/workspace', `${vm}/workspace`).replaceAll('/var/lib/', `${vm}/var/lib/`).replaceAll('/opt/conexus', `${vm}/opt/conexus`)

  const shell = (command, args, cwd) => {
    const ran = spawnSync(command, args, { cwd, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: scratch, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } })
    return { exitCode: ran.status ?? 1, success: ran.status === 0, stdout: ran.stdout ?? '', stderr: ran.stderr ?? '' }
  }
  const events = []
  const calls = []
  const diagnostics = []
  const logs = []
  const invocations = []
  const rootInvocations = []
  const builtFrom = []
  const admissionChecks = []
  const destroyed = []
  // What the run put in its session's request context.
  const sessionContext = new Map()
  let buildStarted
  const buildRunning = new Promise((started) => { buildStarted = started })
  const checkout = join(vm, 'workspace/repo')
  const sandbox = {
    sandboxId: 'sbx-1',
    workspace: { id: 'run-workspace' },
    destroy: async () => { events.push('destroy'); destroyed.push(sandbox.sandboxId) },
    holdOpen: async (onLapse) => { events.push('hold-open'); await onHoldOpen?.(onLapse); return () => { events.push('release') } },
    start: async () => { events.push('start'); onStart?.(sandbox) },
    writeFiles: async () => {},
    runAsRoot: async (script, env) => {
      events.push(['root', script])
      rootInvocations.push({ script, env })
      const mapped = local(script)
      for (const [, target] of mapped.matchAll(/rm -rf '([^']+)'/g)) assert.ok(target.startsWith(vm), `root removes only under the harness: ${target}`)
      return shell('sh', ['-c', mapped], vm)
    },
    writeRootFile: async (path, bytes) => {
      events.push(['rootFile', path])
      mkdirSync(dirname(local(path)), { recursive: true })
      writeFileSync(local(path), corruptSeed && path.endsWith('.bundle') ? Buffer.from('not a bundle') : bytes)
    },
    readAgentFile: async (path) => readFileSync(local(path)),
    executeCommand: async (command, args = [], options = {}) => {
      const line = [command, ...args].join(' ')
      onCommand?.(sandbox, line)
      events.push(line)
      invocations.push({ argv: [command, ...args], env: options.env })
      if (line === 'id -un') return { exitCode: 0, success: true, stdout: `${agentUser}\n`, stderr: '' }
      if (line.startsWith('sh -c kill -KILL -1')) return { exitCode: 0, success: true, stdout: '', stderr: '' }
      return shell(command, args.map(local), local(options.cwd ?? '/workspace'))
    },
    runCheck: async ({ root, out, collect }) => {
      if (!collect) {
        events.push('admission-check')
        admissionChecks.push({ root, out, files: listFiles(local(root)), index: readFileSync(join(local(root), 'app/index.html'), 'utf8') })
        await onAdmissionCheck?.(sandbox)
        return { report: admissionReport ?? PASSING_REPORT, files: null }
      }
      events.push('build')
      builtFrom.push({ buildRoot: root, files: listFiles(local(root)), index: readFileSync(join(local(root), 'app/index.html'), 'utf8'), main: await conexusGit.readMain(projectId) })
      buildStarted()
      if (buildReport) return { report: buildReport, files: buildReport.ok ? [{ path: 'index.html', mediaType: 'text/html', sha256: 'f'.repeat(64), bytes: 'PGh0bWw+' }] : null }
      const files = build ? await build() : [{ path: 'index.html', mediaType: 'text/html', sha256: 'f'.repeat(64), bytes: 'PGh0bWw+' }]
      return { report: PASSING_REPORT, files }
    },
  }
  const runtime = createBuilderRunRuntime({
    createSandbox: (builderRunId) => { events.push(['sandbox', builderRunId]); return sandbox },
    checkModel: async ({ builderRunId, accountId: payer }) => {
      events.push(['model-check', builderRunId, payer])
      if (!modelAccount) throw new Error('BUILDER_MODEL_NOT_SELECTED')
    },
    openSession: async (input) => {
      events.push(['open', input.conversationId, input.builderRunId, input.workspace.id])
      if (openError) throw openError
      input.bindContext({ setRaw: (key, value) => sessionContext.set(key, value) })
      return {
        sendTurn: async (_content, signal) => {
          events.push('turn')
          if (turn) return turn({ signal, sandbox, checkout })
          writeFileSync(join(checkout, 'app/index.html'), '<h1>UNIT1</h1>\n')
          return completed()
        },
        close: async () => { events.push('close'); if (close) await close() },
      }
    },
    git,
    materializeStarter: async () => { events.push('starter'); await starter?.() },
    ...(openConnectorRun ? { openConnectorRun } : {}),
    log: (line) => { logs.push(line) },
  })
  const claimed = { builderRunId: runId, projectId, conversationId, state: 'RUNNING', phase: 'PREPARING', mode, baseSourceRevision: base, resultSourceRevision: null, resultKind: null, failureCode: null }
  // The one run's row as the database holds it.
  const row = { running: true, candidate: null, result: null }
  const store = {
    createBuilderRun: async (input) => {
      calls.push(['create'])
      return { ...claimed, baseSourceRevision: await input.readBase(), state: 'QUEUED', phase: null }
    },
    admitSourceRevision: async () => true,
    claimBuilderRun: async () => claimed,
    setBuilderRunPhase: async (_id, phase) => { calls.push(['phase', phase]) },
    recordBuilderRunCandidate: async (_id, revision) => { calls.push(['candidate', revision]); row.candidate = revision },
    bindBuilderRunMessage: async (_id, messageId) => { calls.push(['message', messageId]) },
    bindBuilderRunSandbox: async (_id, sandboxId) => { calls.push(['sandbox', sandboxId]) },
    settleBuilderRun: async (input) => { calls.push(['settle', input.resultKind]); row.running = false },
    advanceBuilderRunSource: async (_id, revision) => {
      if (lostAdvances-- > 0) {
        calls.push(['advanceLost', revision])
        throw new Error('Connection terminated unexpectedly')
      }
      calls.push(['advance', revision])
      row.result = revision
    },
    settleBuilderRunBuild: async (input) => { calls.push(['settleBuild', input.sourceRevision, input.failureCode ?? null]); row.running = false },
    failBuilderRun: async (_id, code) => { calls.push(['fail', code]); row.running = false },
    interruptBuilderRun: async (_id, reason) => { calls.push(['interrupt', reason]); row.running = false },
    requestBuilderRunCancellation: async () => ({ ...claimed, cancellationRequested: true }),
    listAdmissionRuns: async () => row.running && row.candidate
      ? [{ builderRunId: runId, projectId, conversationId, baseSourceRevision: base, candidateRevision: row.candidate, resultSourceRevision: row.result }]
      : [],
    close: async () => {},
  }
  const service = createBuilderService({
    store,
    ...(applicationServer ? { applicationServer } : {}),
    applicationArtifacts: {
      retainApplication: async ({ compiled }) => ({
        artifactRevisionId: 'artifact-1', artifactDigest: 'g'.repeat(64),
        projectId: compiled.projectId, sourceRevision: compiled.sourceRevision,
        profile: 'REACT_VITE_V1', templateRef: compiled.templateRef, recipeSha256: compiled.recipeSha256,
        entryPath: 'index.html', files: [],
      }),
    },
    runs: {
      runtime,
      git,
      conversations: {
        modeOf: async () => (mode === 'PLAN' ? 'plan' : 'build'),
        titleFromRequest: async () => {},
      },
      source: createProjectSourceReads({ git }),
      appendDiagnostic: async (input) => { diagnostics.push({ ...input, from: 'service' }) },
      reconcileEveryMs: 5,
    },
  })
  const start = () => service.createBuilderRun({ accountId, projectId, conversationId, idempotencyKey: 'key', content: 'Mostre UNIT1-nonce' })
  // The same run row started once more on the same sandbox, as the next run of the conversation would.
  const again = async () => {
    await new Promise((wake) => { setTimeout(wake, 20) })
    Object.assign(row, { running: true, candidate: null, result: null })
    return start()
  }
  const main = () => conexusGit.readMain(projectId)
  // The candidate the run offered, as the Conexus Git holds it under the run's own ref.
  const result = () => inBare('rev-parse', '--verify', '--quiet', `refs/conexus/runs/${runId}`) || null
  const commands = () => events.filter((event) => typeof event === 'string')
  const settled = async () => {
    for (let attempt = 0; row.running && attempt < 400; attempt++) await new Promise((wake) => { setTimeout(wake, 5) })
    return !row.running
  }
  return { base, again, events, invocations, rootInvocations, calls, diagnostics, logs, service, start, main, result, commands, buildRunning, builtFrom, admissionChecks, settled, sessionContext, checkout, outside, moveMain, destroyed, bare, vm }
}

const admissionCalls = (run) => run.calls.filter(([kind]) => ['candidate', 'advance', 'settleBuild', 'fail', 'interrupt'].includes(kind))

test('a run commits the checkout as one commit on its base and fast forwards main to it', async (t) => {
  const run = await harness(t)
  await run.start()
  await run.service.close()
  const result = run.result()
  assert.equal(await run.main(), result)
  assert.deepEqual(admissionCalls(run), [['candidate', result], ['advance', result], ['settleBuild', result, null]])
  const files = await run.service.getSourceFile({ accountId, projectId, sourceRevision: result, path: 'app/index.html' })
  assert.equal(files.content, '<h1>UNIT1</h1>\n')
  assert.deepEqual(await run.service.compareSourceRevisions({ accountId, projectId, baseSourceRevision: run.base, resultSourceRevision: result }), {
    baseSourceRevision: run.base, resultSourceRevision: result, files: [{ path: 'app/index.html', status: 'MODIFIED', previousPath: null }],
  })
})

test('a turn that changed nothing settles as a response and leaves main at the base', async (t) => {
  const run = await harness(t, { turn: () => completed('Explicado.') })
  await run.start()
  await run.service.close()
  assert.equal(await run.main(), run.base)
  assert.equal(run.result(), null)
  assert.deepEqual(run.calls.at(-1), ['settle', 'RESPONSE_ONLY'])
})

test('a writer that moves main between the read and the update is refused and keeps its move', async (t) => {
  let moved
  const run = await harness(t, { beforeFastForward: ({ moveMain, outside }) => { moved = outside(); moveMain(moved) } })
  await run.start()
  await run.service.close()
  assert.equal(await run.main(), moved)
  assert.deepEqual(run.calls.filter(([kind]) => kind === 'fail' || kind === 'advance'), [['fail', 'BUILDER_SOURCE_BASE_MOVED']])
  assert.deepEqual(run.diagnostics, [{
    projectId, conversationId, builderRunId: runId, code: 'BUILDER_SOURCE_BASE_MOVED', outcome: 'SOURCE_BASE_MOVED', sourceRevision: run.base, from: 'service',
  }])
})

test('a stop during the compile is too late: main already holds the candidate and the run settles admitted', async (t) => {
  let release
  const building = new Promise((resume) => { release = resume })
  const run = await harness(t, {
    build: async () => {
      await building
      return [{ path: 'index.html', mediaType: 'text/html', sha256: 'f'.repeat(64), bytes: 'PGh0bWw+' }]
    },
  })
  await run.start()
  await run.buildRunning
  await run.service.cancelBuilderRun({ accountId, projectId, builderRunId: runId })
  release()
  await run.service.close()
  const result = run.result()
  assert.equal(await run.main(), result)
  assert.deepEqual(admissionCalls(run), [['candidate', result], ['advance', result], ['settleBuild', result, null]])
})

test('a stop that lands while the candidate is checked is refused the admission', async (t) => {
  const context = {}
  const run = await harness(t, {
    onAdmissionCheck: () => { void context.run.service.cancelBuilderRun({ accountId, projectId, builderRunId: runId }) },
  })
  context.run = run
  await run.start()
  await run.service.close()
  assert.equal(await run.main(), run.base)
  assert.deepEqual(run.calls.at(-1), ['interrupt', 'USER_CANCELLED'])
  assert.equal(run.calls.some(([kind]) => kind === 'candidate' || kind === 'advance'), false)
})

const withServerTree = async () => [
  { path: 'index.html', mediaType: 'text/html', sha256: 'f'.repeat(64), bytes: 'PGh0bWw+' },
  { path: 'conexus-server/manifest.json', mediaType: 'application/json', sha256: 'e'.repeat(64), bytes: '{}' },
]

test('an artifact with a server tree reaches its Preview only after its migrations apply', async (t) => {
  const prepared = []
  const ready = await harness(t, { build: withServerTree, applicationServer: { prepare: async (input) => { prepared.push(input); return { state: 'READY', reset: false, applied: ['001_notes.sql'] } } } })
  await ready.start()
  await ready.service.close()
  assert.deepEqual(prepared, [{ projectId, files: [{ path: 'conexus-server/manifest.json', sha256: 'e'.repeat(64), content: Buffer.from('{}').toString('base64') }] }])
  assert.deepEqual(ready.calls.filter(([kind]) => kind === 'settleBuild'), [['settleBuild', ready.result(), null]])
  assert.deepEqual(ready.diagnostics, [])

  const failed = await harness(t, { build: withServerTree, applicationServer: { prepare: async () => ({ state: 'MIGRATION_FAILED', detail: '42P01 relation "missing_table" does not exist' }) } })
  await failed.start()
  await failed.service.close()
  assert.deepEqual(failed.calls.filter(([kind]) => kind === 'settleBuild'), [['settleBuild', failed.result(), 'APPLICATION_MIGRATION_FAILED']])
  assert.deepEqual(failed.diagnostics.map(({ code, outcome, detail }) => [code, outcome, detail]), [['APPLICATION_MIGRATION_FAILED', 'BUILD_FAILED', '42P01 relation "missing_table" does not exist']])

  const divergedDetail = 'A migração já aplicada 001_notes.sql foi alterada, removida ou reordenada.'
  const diverged = await harness(t, { build: withServerTree, applicationServer: { prepare: async () => ({ state: 'MIGRATION_HISTORY_DIVERGED', detail: divergedDetail }) } })
  await diverged.start()
  await diverged.service.close()
  assert.deepEqual(diverged.calls.filter(([kind]) => kind === 'settleBuild'), [['settleBuild', diverged.result(), 'APPLICATION_MIGRATION_HISTORY_DIVERGED']])
  assert.deepEqual(diverged.diagnostics.map(({ code, outcome, detail }) => [code, outcome, detail]), [['APPLICATION_MIGRATION_HISTORY_DIVERGED', 'BUILD_FAILED', divergedDetail]])

  const reset = await harness(t, { build: withServerTree, applicationServer: { prepare: async () => ({ state: 'READY', reset: true, applied: ['001_notes.sql'] }) } })
  await reset.start()
  await reset.service.close()
  assert.deepEqual(reset.calls.filter(([kind]) => kind === 'settleBuild'), [['settleBuild', reset.result(), null]])
  assert.deepEqual(reset.diagnostics.map(({ code, outcome }) => [code, outcome]), [['APPLICATION_PREVIEW_DATA_RESET', 'PREVIEW_DATA_RESET']])

  const unconfigured = await harness(t, { build: withServerTree })
  await unconfigured.start()
  await unconfigured.service.close()
  assert.deepEqual(unconfigured.calls.filter(([kind]) => kind === 'settleBuild'), [['settleBuild', unconfigured.result(), 'APPLICATION_RUNNER_UNAVAILABLE']])
  // A runner the Hub cannot reach is not the source's fault, so the agent is not asked to fix it.
  assert.deepEqual(unconfigured.diagnostics.map(({ code, outcome }) => [code, outcome]), [['APPLICATION_RUNNER_UNAVAILABLE', 'PLATFORM_FAILED']])
})

test('a fast forward that moved main and then failed is admitted by reconciliation, never failed or disowned', async (t) => {
  const run = await harness(t, {
    build: async () => { throw new Error('APPLICATION_COMPILATION_FAILED') },
    afterFastForward: () => { throw new Error('CONEXUS_GIT_FAILED') },
  })
  await run.start()
  assert.equal(await run.settled(), true, 'reconciled without a restart')
  await run.service.close()
  const result = run.result()
  assert.equal(await run.main(), result)
  assert.deepEqual(admissionCalls(run), [['candidate', result], ['advance', result], ['settleBuild', result, 'BUILDER_PREVIEW_NOT_BUILT']])
  assert.deepEqual(run.diagnostics, [])
})

test('a fast forward that failed before main moved fails the run with the discarded note once reconciliation reads main', async (t) => {
  const run = await harness(t, { beforeFastForward: () => { throw new Error('CONEXUS_GIT_FAILED') } })
  await run.start()
  assert.equal(await run.settled(), true, 'reconciled without a restart')
  await run.service.close()
  assert.equal(await run.main(), run.base)
  assert.deepEqual(admissionCalls(run), [['candidate', run.result()], ['fail', 'BUILDER_SOURCE_ADMISSION_FAILED']])
})

test('a database failure recording the advance after main moved leaves the run pending, and reconciliation admits it', async (t) => {
  const run = await harness(t, { lostAdvances: 1 })
  await run.start()
  assert.equal(await run.settled(), true, 'reconciled without a restart')
  await run.service.close()
  const result = run.result()
  assert.equal(await run.main(), result)
  assert.deepEqual(admissionCalls(run).filter(([kind]) => kind !== 'candidate'), [['advance', result], ['settleBuild', result, 'BUILDER_PREVIEW_NOT_BUILT']])
  assert.deepEqual(run.calls.filter(([kind]) => kind === 'advanceLost'), [['advanceLost', result]])
})

test('a replaced sandbox incarnation fails the run with BUILDER_SANDBOX_INCARNATION_CHANGED', async (t) => {
  const run = await harness(t, {
    turn: ({ sandbox, checkout }) => {
      writeFileSync(join(checkout, 'app/index.html'), '<h1>UNIT1</h1>\n')
      sandbox.sandboxId = 'sbx-2'
      return completed('')
    },
  })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['fail', 'BUILDER_SANDBOX_INCARNATION_CHANGED'])
  assert.equal(await run.main(), run.base)
})

test('a run holds its sandbox open before its first command', async (t) => {
  const run = await harness(t)
  await run.start()
  await run.service.close()
  const holdOpenIndex = run.events.indexOf('hold-open')
  const firstCommandIndex = run.events.indexOf('id -un')
  assert.ok(holdOpenIndex >= 0, 'the run holds the sandbox open at all')
  assert.ok(holdOpenIndex < firstCommandIndex, `hold-open (${holdOpenIndex}) must run before the first command (${firstCommandIndex})`)
})

test('a sandbox that cannot be held open refuses the run before the agent', async (t) => {
  const run = await harness(t, {
    onHoldOpen: () => { throw new Error('E2B_SANDBOX_NOT_FOUND') },
  })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['fail', 'BUILDER_SANDBOX_KEEPALIVE_FAILED'])
  assert.equal(run.events.includes('turn'), false, 'the run never reaches the agent on a sandbox about to die')
})

test('a run releases its sandbox after the turn, and logs a lapse without failing', async (t) => {
  const run = await harness(t, {
    onHoldOpen: (onLapse) => { onLapse(new Error('E2B_TIMEOUT_REFUSED')) },
  })
  await run.start()
  await run.service.close()
  const turnIndex = run.events.indexOf('turn')
  const releaseIndex = run.events.indexOf('release')
  assert.ok(turnIndex >= 0 && releaseIndex >= 0, 'the run both turns and releases')
  assert.ok(turnIndex < releaseIndex, `release (${releaseIndex}) must run after the turn (${turnIndex})`)
  const plain = await harness(t)
  await plain.start()
  await plain.service.close()
  const settledAs = (call) => call.filter((_, index) => index !== 1)
  assert.deepEqual(settledAs(run.calls.at(-1)), settledAs(plain.calls.at(-1)), 'the lapse never changes how the run settles')
  assert.ok(run.logs.some((line) => line.startsWith('BUILDER_SANDBOX_KEEPALIVE_FAILED:') && line.endsWith(':E2B_TIMEOUT_REFUSED')), JSON.stringify(run.logs))
})

test('a build failure still fast forwards main to the candidate and settles SOURCE_CHANGED_BUILD_FAILED', async (t) => {
  const run = await harness(t, { build: async () => { throw new Error('APPLICATION_COMPILATION_FAILED') } })
  await run.start()
  await run.service.close()
  const result = run.result()
  assert.equal(await run.main(), result)
  assert.deepEqual(run.calls.filter(([kind]) => kind === 'advance' || kind === 'settleBuild' || kind === 'fail'), [
    ['advance', result], ['settleBuild', result, 'APPLICATION_COMPILATION_FAILED'],
  ])
  assert.deepEqual(run.diagnostics, [{
    projectId, conversationId, builderRunId: runId, code: 'APPLICATION_COMPILATION_FAILED', outcome: 'BUILD_FAILED', sourceRevision: result, from: 'service',
  }])
})

test('an observational-memory failure while closing the session does not discard a candidate whose build passed', async (t) => {
  const run = await harness(t, {
    close: async () => { throw new Error('BUILDER_OM_OBSERVATION_FAILED') },
  })
  await run.start()
  await run.service.close()
  const result = run.result()
  assert.equal(await run.main(), result)
  assert.deepEqual(run.calls.filter(([kind]) => kind === 'advance' || kind === 'settleBuild' || kind === 'fail'), [
    ['advance', result], ['settleBuild', result, null],
  ])
  assert.ok(run.logs.some((line) => line.includes('BUILDER_OM_OBSERVATION_FAILED')), 'the OM failure is logged, not silenced')
})

test('the checkout is seeded from a bundle of the base that root wrote, and holds exactly the base before the agent runs', async (t) => {
  let before
  const run = await harness(t, {
    turn: ({ checkout }) => {
      before = { index: readFileSync(join(checkout, 'app/index.html'), 'utf8'), files: listFiles(checkout).filter((path) => !path.startsWith('.git/')) }
      return completed()
    },
  })
  await run.start()
  await run.service.close()
  assert.deepEqual(before, { index: '<h1>base</h1>\n', files: BASE_FILES })
  const seedWrite = run.events.findIndex((event) => Array.isArray(event) && event[0] === 'rootFile' && event[1] === `/var/lib/conexus-seed/${runId}.bundle`)
  const seeded = run.events.findIndex((event) => typeof event === 'string' && event.includes(`/var/lib/conexus-seed/${runId}.bundle`))
  assert.ok(run.events.indexOf('start') < seedWrite && seedWrite < seeded && seeded < run.events.indexOf('turn'), 'start, root writes the seed, the checkout fetches it, then the agent')
  assert.equal(run.commands().some((line) => /https?:\/\/|remote add|credential/.test(line)), false, 'the checkout reaches no remote')
})

test('the next run discards what a failed run left in the checkout', async (t) => {
  const seen = []
  const run = await harness(t, {
    turn: ({ checkout }) => {
      seen.push({ index: readFileSync(join(checkout, 'app/index.html'), 'utf8'), files: listFiles(checkout).filter((path) => !path.startsWith('.git/')) })
      writeFileSync(join(checkout, 'stray.txt'), 'left behind\n')
      writeFileSync(join(checkout, 'app/index.html'), '<h1>edited</h1>\n')
      return { reason: 'error', userMessageId: 'user-message', summary: '' }
    },
  })
  await run.start()
  assert.equal(await run.settled(), true)
  await run.again()
  assert.equal(await run.settled(), true)
  await run.service.close()
  const base = { index: '<h1>base</h1>\n', files: BASE_FILES }
  assert.deepEqual(seen, [base, base])
  assert.equal(await run.main(), run.base)
})

test('an admission that finds main already at the candidate counts it admitted', async (t) => {
  const run = await harness(t, {
    build: async () => { throw new Error('APPLICATION_COMPILATION_FAILED') },
    beforeFastForward: ({ moveMain }) => { moveMain(run_.result()) },
  })
  const run_ = run
  await run.start()
  await run.service.close()
  const result = run.result()
  assert.equal(await run.main(), result)
  assert.deepEqual(run.calls.filter(([kind]) => kind === 'advance' || kind === 'settleBuild'), [['advance', result], ['settleBuild', result, 'APPLICATION_COMPILATION_FAILED']])
})

test('the build compiles the candidate from the Conexus Git in a root-only directory after the agent user\'s processes are killed, never the checkout', async (t) => {
  const run = await harness(t, {
    turn: ({ checkout }) => {
      writeFileSync(join(checkout, 'app/index.html'), '<h1>UNIT1</h1>\n')
      return completed()
    },
    // A process of the agent's that outlived its turn keeps writing the checkout.
    onCommand: (_sandbox, line) => {
      if (line.startsWith('sh -c kill -KILL -1')) writeFileSync(join(run_.checkout, 'app/index.html'), '<h1>late write</h1>\n')
    },
  })
  const run_ = run
  await run.start()
  await run.service.close()
  const buildRoot = `/var/lib/conexus-build/${runId}`
  assert.deepEqual(run.builtFrom, [{ buildRoot, files: ['app/index.html'], index: '<h1>UNIT1</h1>\n', main: run.result() }], 'main already holds the candidate when the compile starts')
  const killed = run.events.indexOf('sh -c kill -KILL -1 2>/dev/null; true')
  const prepared = run.events.findIndex((event) => Array.isArray(event) && event[0] === 'root' && event[1].startsWith("rm -rf '/var/lib/conexus-build'"))
  const written = run.events.findIndex((event) => Array.isArray(event) && event[0] === 'rootFile' && event[1] === `/var/lib/conexus-build/${runId}.tar`)
  const unpacked = run.events.findIndex((event) => Array.isArray(event) && event[0] === 'root' && event[1].startsWith(`tar -x -C '${buildRoot}'`))
  assert.ok(run.events.indexOf('turn') < killed && killed < prepared && prepared < written && written < unpacked && unpacked < run.events.indexOf('build'), JSON.stringify([killed, prepared, written, unpacked]))
  assert.equal(run.commands().some((line) => line.includes('ls-tree') || line.includes(' archive ')), false, 'no agent-user command lists or archives the tree the build is admitted by')
})

test('a run that starts in Planejar and builds after the plan approval admits its source (AC-4)', async (t) => {
  const run = await harness(t, { mode: 'PLAN' })
  await run.start()
  await run.service.close()
  const result = run.result()
  assert.equal(await run.main(), result)
  assert.deepEqual(admissionCalls(run), [['candidate', result], ['advance', result], ['settleBuild', result, null]])
  assert.equal((await run.service.getSourceFile({ accountId, projectId, sourceRevision: result, path: 'app/index.html' })).content, '<h1>UNIT1</h1>\n')
  assert.equal(run.events.includes('starter'), true)
})

test('a Planejar run that only wrote its plan settles as a response and leaves main at the base', async (t) => {
  const run = await harness(t, {
    mode: 'PLAN',
    turn: ({ checkout }) => {
      mkdirSync(join(checkout, '.conexus/plans'), { recursive: true })
      writeFileSync(join(checkout, '.conexus/plans/p.md'), '# Plano\n')
      return completed('Plano enviado.')
    },
  })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['settle', 'RESPONSE_ONLY'])
  assert.equal(await run.main(), run.base)
  assert.equal(run.result(), null)
})

test('every agent-user command states an empty environment, and root commands get none', async (t) => {
  const run = await harness(t, { build: async () => { throw new Error('APPLICATION_COMPILATION_FAILED') } })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.invocations.filter(({ env }) => env === undefined || Object.keys(env).length > 0), [])
  assert.deepEqual(run.rootInvocations.filter(({ env }) => Object.keys(env).length > 0), [])
})

test('an agent that aborts with no stop from the person fails with a named reason, never as cancelled by them', async (t) => {
  const run = await harness(t, { turn: () => ({ reason: 'aborted', userMessageId: 'user-message', summary: '' }) })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.logs, [`BUILDER_AGENT_END:aborted:${runId}`])
  assert.notDeepEqual(run.calls.at(-1), ['interrupt', 'USER_CANCELLED'])
  assert.ok(JSON.stringify(run.calls.at(-1)).includes('BUILDER_MODEL_INCOMPLETE'), JSON.stringify(run.calls.at(-1)))
  assert.equal(await run.main(), run.base)
})

test('a run that reached the agent and admitted nothing leaves one note that its edits were discarded at the base', async (t) => {
  const run = await harness(t, { turn: () => ({ reason: 'error', userMessageId: 'user-message', summary: 'Concluído.' }) })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['fail', 'BUILDER_MODEL_INCOMPLETE'])
  assert.deepEqual(run.diagnostics, [{
    projectId, conversationId, builderRunId: runId, code: 'BUILDER_MODEL_INCOMPLETE', outcome: 'RUN_NOT_FINISHED', sourceRevision: run.base, from: 'service',
  }])
})

test('a run the person stopped during the agent turn also leaves the discarded note', async (t) => {
  const context = {}
  const run = await harness(t, {
    turn: async () => {
      await context.run.service.cancelBuilderRun({ accountId, projectId, builderRunId: runId })
      return { reason: 'aborted', userMessageId: 'user-message', summary: '' }
    },
  })
  context.run = run
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['interrupt', 'USER_CANCELLED'])
  assert.deepEqual(run.diagnostics.map(({ code, outcome, sourceRevision }) => [code, outcome, sourceRevision]), [['BUILDER_RUN_CANCELLED', 'RUN_NOT_FINISHED', run.base]])
})

const refusedCandidate = async (t, turn) => {
  const run = await harness(t, { turn: ({ checkout }) => { turn(checkout); return completed() } })
  await run.start()
  await run.service.close()
  return run
}

test('a candidate whose AGENTS.md is missing, over 8 KB, or not UTF-8 is refused before its check, and main stays at the base (AC-9)', async (t) => {
  const cases = {
    missing: (checkout) => rmSync(join(checkout, 'AGENTS.md')),
    'over 8 KB': (checkout) => writeFileSync(join(checkout, 'AGENTS.md'), 'x'.repeat(8193)),
    'not UTF-8': (checkout) => writeFileSync(join(checkout, 'AGENTS.md'), Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a])),
  }
  const outcomes = {}
  for (const [name, change] of Object.entries(cases)) {
    const run = await refusedCandidate(t, (checkout) => {
      writeFileSync(join(checkout, 'app/index.html'), '<h1>UNIT1</h1>\n')
      change(checkout)
    })
    outcomes[name] = {
      settled: run.calls.at(-1),
      main: await run.main() === run.base,
      checked: run.events.includes('admission-check'),
      note: run.diagnostics.map(({ outcome, detail }) => [outcome, detail]),
    }
  }
  const refused = { settled: ['fail', 'BUILDER_AGENTS_MD_REFUSED'], main: true, checked: false }
  assert.deepEqual(outcomes, {
    missing: { ...refused, note: [['CANDIDATE_REFUSED', 'AGENTS.md is missing at the repository root. Write it with what this run confirmed, under 8 KB.']] },
    'over 8 KB': { ...refused, note: [['CANDIDATE_REFUSED', 'AGENTS.md has 8193 bytes; the limit is 8192 bytes (8 KB). Shorten it, keeping only confirmed facts.']] },
    'not UTF-8': { ...refused, note: [['CANDIDATE_REFUSED', 'AGENTS.md is not valid UTF-8. Rewrite it as plain UTF-8 text.']] },
  })
})

// A server error the Builder needs whole to fix: longer than the 400 and 1,200 characters the record cut before.
const LONG_SERVER_MESSAGE = `conexus/handlers/notes.ts imports "../../app/src/${'a'.repeat(700)}": a handler may import only .ts, .js or .json files inside conexus/ and node: built-ins`

test("a candidate the Hub's check refuses is refused with the failed step's problems whole, main stays at the base, and nothing compiles (AC-9)", async (t) => {
  const problems = [
    { file: 'app/src/main.tsx', line: 3, column: 7, code: 'TS2322', message: "Type 'string' is not assignable to type 'number'." },
    { file: 'conexus/handlers/notes.ts', message: LONG_SERVER_MESSAGE },
  ]
  const run = await harness(t, {
    admissionReport: failedReport('typecheck', problems),
    turn: ({ checkout }) => {
      writeFileSync(join(checkout, 'app/index.html'), '<h1>UNIT1</h1>\n')
      // A check of the candidate's own that says everything is fine changes nothing.
      mkdirSync(join(checkout, 'conexus'), { recursive: true })
      writeFileSync(join(checkout, 'conexus/check.sh'), '#!/bin/sh\nexit 0\n')
      return completed()
    },
  })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['fail', 'BUILDER_CHECK_FAILED'])
  assert.equal(await run.main(), run.base)
  assert.equal(run.events.includes('build'), false)
  assert.deepEqual(run.diagnostics.map(({ outcome, detail }) => [outcome, detail]), [['CANDIDATE_REFUSED', [
    'typecheck failed:',
    "app/src/main.tsx:3:7: TS2322 Type 'string' is not assignable to type 'number'.",
    `conexus/handlers/notes.ts: ${LONG_SERVER_MESSAGE}`,
  ].join('\n')]])
  assert.equal(run.commands().some((line) => line.includes('check.sh')), false, 'no command runs a script of the candidate')
  assert.ok(run.admissionChecks[0].files.includes('conexus/check.sh'), 'the candidate file is only data in the tree the Hub checks')
})

test('each check the run makes leaves one line in the Hub log with its steps', async (t) => {
  const run = await harness(t)
  await run.start()
  await run.service.close()
  const steps = 'generate=passed:1ms typecheck=passed:1ms build=passed:1ms server=passed:1ms boot=passed:1ms'
  assert.deepEqual(run.logs.filter((line) => line.startsWith('BUILDER_CHECK:')), [`BUILDER_CHECK:admission:${runId}:${steps}`, `BUILDER_CHECK:preview:${runId}:${steps}`])
})

test('the Hub check is placed at run start, root owned and read only, before the agent runs', async (t) => {
  const { checkScriptSource } = await import(built('builder/application-check.js'))
  const run = await harness(t)
  await run.start()
  await run.service.close()
  const install = run.events.findIndex((event) => Array.isArray(event) && event[0] === 'root' && event[1].includes("cat > '/opt/conexus/check.mjs.next'"))
  assert.ok(install > -1 && install < run.events.indexOf('turn'), 'installed before the agent turn')
  assert.match(run.events[install][1], /chmod 555 '\/opt\/conexus\/server-build\.mjs\.next' '\/opt\/conexus\/check\.mjs\.next'/)
  const placed = join(run.vm, 'opt/conexus/check.mjs')
  // The harness maps /opt/conexus into its own folder in every script it runs.
  assert.ok(readFileSync(placed, 'utf8').trimEnd() === checkScriptSource().replaceAll('/opt/conexus', join(run.vm, 'opt/conexus')).trimEnd(), 'the placed script is the Hub script')
  assert.equal(statSync(placed).mode & 0o777, 0o555)
})

test("the check runs on the candidate's own tree from the Conexus Git, not on the checkout the agent can still change", async (t) => {
  const run = await harness(t, {
    turn: ({ checkout }) => {
      writeFileSync(join(checkout, 'app/index.html'), '<h1>UNIT1</h1>\n')
      return completed()
    },
    onCommand: (_sandbox, line) => {
      if (line.startsWith('sh -c kill -KILL -1')) writeFileSync(join(run_.checkout, 'app/index.html'), '<h1>late write</h1>\n')
    },
  })
  const run_ = run
  await run.start()
  await run.service.close()
  assert.deepEqual(run.admissionChecks.map(({ root, out, index }) => [root, out, index]), [[`/var/lib/conexus-build/${runId}.admission`, `/var/lib/conexus-build/${runId}.admission.dist`, '<h1>UNIT1</h1>\n']])
  assert.deepEqual(admissionCalls(run), [['candidate', run.result()], ['advance', run.result()], ['settleBuild', run.result(), null]])
})

test('a generated file the agent wrote never reaches Git, and a file beside it does', async (t) => {
  const run = await harness(t, {
    turn: ({ checkout }) => {
      mkdirSync(join(checkout, 'app/src'), { recursive: true })
      mkdirSync(join(checkout, 'conexus'), { recursive: true })
      writeFileSync(join(checkout, 'app/index.html'), '<h1>UNIT1</h1>\n')
      writeFileSync(join(checkout, 'app/src/api.gen.ts'), 'export const stale = true\n')
      writeFileSync(join(checkout, 'conexus/types.gen.ts'), 'export type Stale = string\n')
      writeFileSync(join(checkout, 'app/src/keep.ts'), 'export const kept = true\n')
      return completed()
    },
  })
  await run.start()
  await run.service.close()
  const result = run.result()
  assert.deepEqual((await run.service.compareSourceRevisions({ accountId, projectId, baseSourceRevision: run.base, resultSourceRevision: result })).files, [
    { path: 'app/index.html', status: 'MODIFIED', previousPath: null },
    { path: 'app/src/keep.ts', status: 'ADDED', previousPath: null },
  ])
})

test('a boot problem that leaves the page rendered keeps the Preview and reaches the Hub log', async (t) => {
  const problems = [{ code: 'BOOT_CSP_VIOLATION', message: "Loading the stylesheet 'https://fonts.googleapis.com/css2' violates the following Content Security Policy directive: \"style-src 'self'\"." }]
  const run = await harness(t, { buildReport: failedReport('boot', problems) })
  await run.start()
  await run.service.close()
  const result = run.result()
  assert.deepEqual(run.calls.filter(([kind]) => kind === 'advance' || kind === 'settleBuild'), [['advance', result], ['settleBuild', result, null]])
  assert.deepEqual(run.diagnostics, [])
  assert.deepEqual(run.logs.filter((line) => line.startsWith('BUILDER_CHECK_BOOT_PROBLEMS:')), [`BUILDER_CHECK_BOOT_PROBLEMS:${runId}:${JSON.stringify(problems)}`])
})

test('a page that does not boot leaves the admitted source without a Preview and tells the next turn why, whole', async (t) => {
  const thrown = `Error: ${'boom '.repeat(200)}`
  const run = await harness(t, { buildReport: failedReport('boot', [{ code: 'BOOT_UNCAUGHT_ERROR', message: thrown, file: 'assets/index.js', line: 1, column: 9 }]) })
  await run.start()
  await run.service.close()
  const result = run.result()
  assert.equal(await run.main(), result)
  assert.deepEqual(run.calls.filter(([kind]) => kind === 'advance' || kind === 'settleBuild'), [['advance', result], ['settleBuild', result, 'APPLICATION_SMOKE_FAILED']])
  assert.deepEqual(run.diagnostics.map(({ code, outcome, detail }) => [code, outcome, detail]), [['APPLICATION_SMOKE_FAILED', 'BUILD_FAILED', `boot failed:\nassets/index.js:1:9: BOOT_UNCAUGHT_ERROR ${thrown}`]])
})

test("the session context carries the base's AGENTS.md, cut at 8 KB with the note when it is longer (AC-8)", async (t) => {
  const short = await harness(t)
  await short.start()
  await short.service.close()
  assert.equal(short.sessionContext.get('conexusProjectKnowledge'), AGENTS_MD.trim())

  const long = `# Knowledge\n${'ção '.repeat(3_000)}`
  const run = await harness(t, { starterFiles: [{ path: 'AGENTS.md', content: long }, ...STARTER.slice(1)] })
  await run.start()
  await run.service.close()
  const knowledge = run.sessionContext.get('conexusProjectKnowledge')
  assert.ok(knowledge.endsWith('\n\nAGENTS.md truncated at 8 KB; shorten it.'), knowledge.slice(-60))
  const kept = knowledge.slice(0, -'\n\nAGENTS.md truncated at 8 KB; shorten it.'.length)
  assert.ok(Buffer.byteLength(kept) <= 8192 && long.startsWith(kept), 'a prefix of the file within 8 KB, cut between characters')
})

test('a person with no model account is refused before a sandbox exists', async (t) => {
  const run = await harness(t, { modelAccount: null })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['fail', 'BUILDER_MODEL_NOT_SELECTED'])
  assert.equal(run.events.some((event) => Array.isArray(event) && event[0] === 'sandbox'), false)
})

test("a run checks its start model once, names its payer in every turn's context, and destroys its own sandbox however it ends", async (t) => {
  const ok = await harness(t)
  await ok.start()
  await ok.service.close()
  const failed = await harness(t, { turn: () => ({ reason: 'error', userMessageId: 'user-message', summary: '' }) })
  await failed.start()
  await failed.service.close()
  for (const run of [ok, failed]) {
    assert.deepEqual(run.events.filter((event) => Array.isArray(event) && event[0] === 'model-check'), [['model-check', runId, accountId]])
    assert.equal(run.sessionContext.get('conexusBuilderAccountId'), accountId)
    assert.deepEqual(run.destroyed, ['sbx-1'])
    assert.equal(run.events.at(-1), 'destroy')
  }
})

test('a seed the checkout cannot fetch refuses the pin with BUILDER_SOURCE_BASE_PIN_REFUSED before the agent runs', async (t) => {
  const run = await harness(t, { corruptSeed: true })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['fail', 'BUILDER_SOURCE_BASE_PIN_REFUSED'])
  assert.equal(run.logs.length, 1)
  assert.match(run.logs[0], new RegExp(`^BUILDER_RUN_FAILED:${runId}:BUILDER_SOURCE_BASE_PIN_REFUSED \\{"exitCode":128,`))
  assert.deepEqual(run.diagnostics, [], 'a run that never reached the agent has no edits to disown')
  assert.equal(run.events.includes('turn'), false)
})

test('a VM whose commands run as root, from a template before the agent user, is refused before the seed', async (t) => {
  const run = await harness(t, { agentUser: 'root' })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['fail', 'BUILDER_SANDBOX_AGENT_USER_REQUIRED'])
  assert.deepEqual([run.rootInvocations.length, run.events.some((event) => Array.isArray(event) && event[0] === 'rootFile'), run.events.includes('turn')], [0, false, false])
})

test('a VM that died while the conversation was idle is replaced before the run records its incarnation', async (t) => {
  let replaced = false
  const run = await harness(t, {
    build: async () => { throw new Error('APPLICATION_COMPILATION_FAILED') },
    onCommand: (sandbox) => {
      if (replaced) return
      replaced = true
      sandbox.sandboxId = 'sbx-recreated'
    },
  })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.filter(([kind]) => kind === 'sandbox' || kind === 'fail' || kind === 'advance'), [
    ['sandbox', 'sbx-recreated'], ['advance', run.result()],
  ])
})

test('a starter inspection that fails writes its command evidence to the Hub log under the run', async (t) => {
  const run = await harness(t, {
    starter: async () => {
      throw new Error('BUILDER_STARTER_ENTRY_INSPECTION_FAILED', { cause: { exitCode: 1, stdout: '', stderr: 'Error: sandbox not found' } })
    },
  })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['fail', 'BUILDER_STARTER_ENTRY_INSPECTION_FAILED'])
  assert.deepEqual(run.logs, [`BUILDER_RUN_FAILED:${runId}:BUILDER_STARTER_ENTRY_INSPECTION_FAILED {"exitCode":1,"stdout":"","stderr":"Error: sandbox not found"}`])
})

const briefOnly = (brief) => async () => ({ brief, bind: () => {}, end: () => {} })

test("the run hands its own Project's connector brief to the session context, and an empty one when the port is absent", async (t) => {
  const opened = []
  const withBrief = await harness(t, { openConnectorRun: async (input) => { opened.push(input); return briefOnly('CONNECTOR_BRIEF_MARKER')() } })
  await withBrief.start()
  await withBrief.service.close()
  assert.deepEqual(opened, [{ projectId, builderRunId: runId }])
  assert.equal(withBrief.sessionContext.get('conexusConnectorBrief'), 'CONNECTOR_BRIEF_MARKER')

  const withoutBrief = await harness(t)
  await withoutBrief.start()
  await withoutBrief.service.close()
  assert.equal(withoutBrief.sessionContext.get('conexusConnectorBrief'), '')
})

const connectorRuns = async (store, record = connectorRecord()) => {
  const { createConnectorBrief } = await import(hubModuleUrl('connectors/builder-brief.js'))
  const { openBuilderRun } = await import(hubModuleUrl('connectors/builder-tool.js'))
  const { sankhyaDefinition } = await import(hubModuleUrl('connectors/sankhya/definition.js'))
  const brief = createConnectorBrief({ connectors: [{ definition: sankhyaDefinition, adapter: null }], store, observability: record.observability })
  return (input) => openBuilderRun({ brief, ...input })
}

test("a Project with no binding is told it has no Connection and nothing about another Project's Connection", async (t) => {
  const otherProjectId = '55555555-5555-4555-8555-555555555555'
  const otherBinding = { bindingId: '66666666-6666-4666-8666-666666666666', name: 'other-project-binding', connectionId: '77777777-7777-4777-8777-777777777777', connectorId: 'sankhya' }
  const openRun = await connectorRuns({ listBindings: async ({ projectId: asked }) => (asked === otherProjectId ? [otherBinding] : []) })
  const other = await openRun({ projectId: otherProjectId, builderRunId: runId })
  assert.ok(other.brief.includes('`other-project-binding` (integrator sankhya)'), 'the other Project is told its own binding')

  const run = await harness(t, { openConnectorRun: openRun })
  await run.start()
  await run.service.close()
  const instructions = run.sessionContext.get('conexusConnectorBrief')
  const { CONNECTOR_BRIEF_UNBOUND } = await import(hubModuleUrl('connectors/builder-brief.js'))
  assert.equal(instructions, CONNECTOR_BRIEF_UNBOUND, 'told it has no Connection, and what to do')
  for (const leak of ['sankhya.purchase-order.read', 'other-project-binding', otherBinding.connectionId, 'connectors.call']) {
    assert.equal(instructions.includes(leak), false, leak)
  }
})

test('a Project bound to Sankhya gets its own bindings, and is never told to refuse for lack of a Connection', async (t) => {
  const { CONNECTOR_BRIEF_UNBOUND } = await import(hubModuleUrl('connectors/builder-brief.js'))
  const binding = { bindingId: '88888888-8888-4888-8888-888888888888', name: 'erp', connectionId: '99999999-9999-4999-8999-999999999999', connectorId: 'sankhya' }
  const run = await harness(t, { openConnectorRun: await connectorRuns({ listBindings: async () => [binding] }) })
  await run.start()
  await run.service.close()
  const instructions = run.sessionContext.get('conexusConnectorBrief')
  assert.ok(instructions.includes('`erp` (integrator sankhya)') && instructions.includes('sankhya.purchase-order.read'), 'its own brief lists its binding and the read it can make')
  assert.equal(instructions.includes(CONNECTOR_BRIEF_UNBOUND), false)
})

test('a run whose connector bindings cannot be read still runs, told only that connector data is out of reach', async (t) => {
  const { CONNECTOR_BRIEF_UNAVAILABLE } = await import(hubModuleUrl('connectors/builder-brief.js'))
  const record = connectorRecord()
  const openRun = await connectorRuns({ listBindings: async () => { throw new Error('connect ECONNREFUSED 10.0.0.9:5432 STORE_DETAIL_MARKER') } }, record)
  const run = await harness(t, { openConnectorRun: openRun })
  await run.start()
  assert.equal(await run.settled(), true)
  await run.service.close()
  assert.equal(run.calls.some(([kind]) => kind === 'fail' || kind === 'interrupt'), false, JSON.stringify(run.calls))
  assert.equal(run.sessionContext.get('conexusConnectorBrief'), CONNECTOR_BRIEF_UNAVAILABLE)
  assert.deepEqual(await record.facts(), [{ name: 'connector.brief', root: true, error: true, projectId, result: 'STORE_UNAVAILABLE' }])
  assert.equal(JSON.stringify([[...run.sessionContext.values()].filter((value) => typeof value === 'string'), run.logs, run.diagnostics, record.exporter.events, record.lines]).includes('STORE_DETAIL_MARKER'), false)
})

test("the run's connector scope reaches its session, is live during the agent turn, and is revoked when the run ends however it ends", async (t) => {
  const { isMintedScope } = await import(hubModuleUrl('connectors/scope.js'))
  const openRun = await connectorRuns({ listBindings: async () => [] })
  const consumerOf = (run) => run.sessionContext.get('conexusConnectorConsumer')
  const cases = {
    'the run succeeds': {},
    'the agent turn fails': { turn: () => ({ reason: 'error', userMessageId: 'user-message', summary: '' }) },
    'the person stops the run during the turn': { stop: true },
    'the compile fails after the turn': { build: async () => { throw new Error('APPLICATION_COMPILATION_FAILED') } },
  }
  const outcomes = {}
  for (const [name, { stop, ...options }] of Object.entries(cases)) {
    const context = {}
    let liveInTurn
    const run = await harness(t, {
      ...options,
      openConnectorRun: openRun,
      turn: async (turn) => {
        liveInTurn = isMintedScope(consumerOf(context.run).scope)
        if (stop) await context.run.service.cancelBuilderRun({ accountId, projectId, builderRunId: runId })
        if (options.turn) return options.turn(turn)
        writeFileSync(join(turn.checkout, 'app/index.html'), '<h1>UNIT1</h1>\n')
        return { reason: stop ? 'aborted' : 'complete', userMessageId: 'user-message', summary: 'Pronto.' }
      },
    })
    context.run = run
    await run.start()
    await run.settled()
    await run.service.close()
    const consumer = consumerOf(run)
    outcomes[name] = { kind: consumer.kind, sessionId: consumer.sessionId, projectId: consumer.scope.projectId, liveInTurn, liveAfter: isMintedScope(consumer.scope), settled: run.calls.at(-1)[0] }
  }
  const scoped = { kind: 'agent', sessionId: runId, projectId, liveInTurn: true, liveAfter: false }
  assert.deepEqual(outcomes, {
    'the run succeeds': { ...scoped, settled: 'settleBuild' },
    'the agent turn fails': { ...scoped, settled: 'fail' },
    'the person stops the run during the turn': { ...scoped, settled: 'interrupt' },
    'the compile fails after the turn': { ...scoped, settled: 'settleBuild' },
  })
})

test('a run whose session cannot open still revokes the scope it minted', async (t) => {
  const { isMintedScope } = await import(hubModuleUrl('connectors/scope.js'))
  const { openBuilderRun } = await import(hubModuleUrl('connectors/builder-tool.js'))
  const minted = []
  const bound = new Map()
  const run = await harness(t, {
    openError: new Error('BUILDER_SESSION_OPEN_FAILED'),
    openConnectorRun: async (input) => {
      const opened = await openBuilderRun({ brief: async () => '', ...input })
      opened.bind({ setRaw: (key, value) => bound.set(key, value) })
      minted.push([...bound.values()][0].scope)
      return opened
    },
  })
  await run.start()
  await run.settled()
  await run.service.close()
  assert.deepEqual([run.calls.at(-1), minted.map((scope) => isMintedScope(scope))], [['fail', 'BUILDER_SESSION_OPEN_FAILED'], [false]])
})
