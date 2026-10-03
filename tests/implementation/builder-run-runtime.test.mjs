import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createReadStream, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import { createWorkspaceTools, LocalFilesystem, Workspace } from '@mastra/core/workspace'
import { connectorRecord } from './connector-record.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const built = hubModuleUrl
const { createBuilderService } = await import(built('builder/service.js'))
const { createBuilderRunRuntime } = await import(built('builder/run-runtime.js'))
const { sweepIdleMachines } = await import(built('builder/idle-machine-sweep.js'))
const { createConexusGit } = await import(built('builder/conexus-git.js'))
const { createProjectSourceReads } = await import(built('builder/source.js'))
const { conexusInstructions } = await import(built('builder/harness/prompt.js'))
const { RequestContext } = await import('@mastra/core/request-context')

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
// own `vm` directory, and the agent user's `kill -KILL -1` is recorded, never run. It is the
// conversation's one VM: every turn reaches the same directory until `loseVm` replaces it.
const harness = async (t, { turn, build, report, onCheck, repairs = [], skipGate = false, starter, agentUser = 'conexus-agent', onStart, onCommand, lostAdvances = 0, close, applicationServer, openConnectorRun, openError, onHoldOpen, corruptSeed = false, beforeFastForward, afterFastForward, beforeAcceptSnapshot, modelAccount = MODEL_ACCOUNT, starterFiles = STARTER, mirrorDebounceMs = 0, warmParkedMs } = {}) => {
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
    acceptSnapshot: async (...args) => {
      await beforeAcceptSnapshot?.()
      return conexusGit.acceptSnapshot(...args)
    },
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
  // The run's BUILDER_RUN_TIMING lines, kept apart from the lines that say what happened.
  const timings = []
  // The BUILDER_SANDBOX_EGRESS* lines, and the VM's two recorders: `pending` holds what the
  // processes would have written since the last poll, and the files are what the Hub reads back.
  const egressLogs = []
  const egress = { running: false, installs: 0, starts: 0, pollError: false, pollHangs: false, pending: { tcp: [], dns: [] }, files: new Map() }
  const egressAppend = (name, rows) => {
    if (rows.length === 0) return
    const path = `/var/log/conexus-egress/${name}.jsonl`
    egress.files.set(path, Buffer.concat([egress.files.get(path) ?? Buffer.alloc(0), Buffer.from(rows.map((row) => `${typeof row === 'string' ? row : JSON.stringify(row)}\n`).join(''))]))
  }
  const egressRoot = async (script) => {
    if (script.includes('--once')) {
      if (egress.pollHangs) return new Promise(() => {})
      if (egress.pollError) return { exitCode: 1, success: false, stdout: '', stderr: 'poller failed' }
      egressAppend('tcp', egress.pending.tcp.splice(0))
      egressAppend('dns', egress.pending.dns.splice(0))
      return { exitCode: 0, success: true, stdout: '', stderr: '' }
    }
    if (script.includes('setsid')) { egress.starts += 1; egress.running = true; return { exitCode: 0, success: true, stdout: '', stderr: '' } }
    return { exitCode: egress.running ? 0 : 1, success: egress.running, stdout: '', stderr: '' }
  }
  const invocations = []
  const rootInvocations = []
  // Each check the Hub ran on a candidate, with the tree it was handed and where `main` stood.
  const checks = []
  const agentChecks = []
  // What the gate told the agent at each "done" that went back to it.
  const feedbacks = []
  const paused = []
  const killed = []
  const discards = []
  // What the service read and recorded of the conversation's sandbox.
  const sandboxRefs = []
  let recordedSandbox = null
  // What the run put in its session's request context.
  const sessionContext = new Map()
  // What the service recorded of the conversation's session.
  const sessions = []
  const checkout = join(vm, 'workspace/repo')
  const sandbox = {
    sandboxId: 'sbx-1',
    workspace: new Workspace({ id: 'run-workspace', filesystem: new LocalFilesystem({ basePath: checkout }) }),
    pause: async () => { events.push('pause'); paused.push(sandbox.sandboxId) },
    release: () => { events.push('instance-release') },
    kill: async () => { events.push('kill'); killed.push(sandbox.sandboxId) },
    holdOpen: async (onLapse) => { events.push('hold-open'); await onHoldOpen?.(onLapse); return () => { events.push('release') } },
    start: async () => { events.push('start'); onStart?.(sandbox) },
    writeFiles: async () => {},
    runAsRoot: async (script, env) => {
      if (script.includes('conexus-egress')) return egressRoot(script)
      events.push(['root', script])
      rootInvocations.push({ script, env })
      const mapped = local(script)
      for (const [, target] of mapped.matchAll(/rm -rf '([^']+)'/g)) assert.ok(target.startsWith(vm), `root removes only under the harness: ${target}`)
      return shell('sh', ['-c', mapped], vm)
    },
    writeRootFile: async (path, bytes) => {
      if (path.startsWith('/usr/local/lib/conexus-egress/')) { egress.installs += 1; return }
      if (path.startsWith('/var/log/conexus-egress/')) { egress.files.set(path, Buffer.from(bytes)); return }
      events.push(['rootFile', path])
      mkdirSync(dirname(local(path)), { recursive: true })
      writeFileSync(local(path), corruptSeed && path.endsWith('.bundle') ? Buffer.from('not a bundle') : bytes)
    },
    readAgentFileStream: async (path) => Readable.toWeb(createReadStream(local(path))),
    readAgentFile: async (path) => {
      if (!path.startsWith('/var/log/conexus-egress/')) return readFileSync(local(path))
      const held = egress.files.get(path)
      if (!held) throw new Error(`ENOENT: ${path}`)
      return held
    },
    readAgentFileIfPresent: async (path) => egress.files.get(path) ?? null,
    executeCommand: async (command, args = [], options = {}) => {
      const line = [command, ...args].join(' ')
      onCommand?.(sandbox, line)
      events.push(line)
      invocations.push({ argv: [command, ...args], env: options.env })
      if (line === 'id -un') return { exitCode: 0, success: true, stdout: `${agentUser}\n`, stderr: '' }
      if (line.startsWith('sh -c kill -KILL -1')) return { exitCode: 0, success: true, stdout: '', stderr: '' }
      return shell(command, args.map(local), local(options.cwd ?? '/workspace'))
    },
    runCheck: async ({ root, out, collect, user }) => {
      if (user === 'agent') {
        agentChecks.push({ root, out, collect })
        return { report: PASSING_REPORT, files: null }
      }
      events.push('check')
      checks.push({ root, out, files: listFiles(local(root)), index: readFileSync(join(local(root), 'app/index.html'), 'utf8'), main: await conexusGit.readMain(projectId) })
      await onCheck?.(sandbox, checks.length)
      const reported = typeof report === 'function' ? report(checks.length - 1) : report ?? PASSING_REPORT
      const files = build ? await build() : [{ path: 'index.html', mediaType: 'text/html', sha256: 'f'.repeat(64), bytes: 'PGh0bWw+' }]
      return { report: reported, files: reported.ok ? files : null }
    },
  }
  // A write the way the agent makes one: the workspace's write tool, with whatever hooks the run set on it.
  const writeThroughTool = async (path, content) => {
    const tools = await createWorkspaceTools(sandbox.workspace)
    const written = await tools.mastra_workspace_write_file.execute({ path, content, overwrite: true }, {})
    assert.match(String(written), /^Wrote /, `the write tool wrote ${path}`)
  }
  const runtime = createBuilderRunRuntime({
    openSandbox: (ref) => { events.push(['sandbox', ref.conversationId]); sandboxRefs.push(ref); return sandbox },
    checkModel: async ({ builderRunId, accountId: payer }) => {
      events.push(['model-check', builderRunId, payer])
      if (!modelAccount) throw new Error('BUILDER_MODEL_NOT_SELECTED')
    },
    openSession: async (input) => {
      events.push(['open', input.conversationId, input.builderRunId, input.workspace.id])
      if (openError) throw openError
      input.bindContext({ setRaw: (key, value) => sessionContext.set(key, value) })
      // The turn as Mastra runs it: each time the agent says it is done the gate answers, and a red
      // check sends it back to work on the next scripted repair.
      const drive = async (signal, resume) => {
        const finish = async () => {
          const feedback = await input.gate.finish()
          if (feedback !== null) feedbacks.push(feedback)
          return feedback
        }
        const context = { signal, sandbox, checkout, runCheck: input.runCheck, write: writeThroughTool, bare: inBare, mirror, finish, resume }
        let ended
        if (turn) ended = await turn(context)
        else {
          writeFileSync(join(checkout, 'app/index.html'), '<h1>UNIT1</h1>\n')
          ended = completed()
        }
        if (ended.reason !== 'complete' || skipGate) return ended
        const queue = [...repairs]
        for (;;) {
          if (await finish() === null || input.gate.gaveUp()) return ended
          await queue.shift()?.(context)
        }
      }
      return {
        sendTurn: async (_content, signal) => {
          events.push('turn')
          return drive(signal)
        },
        resumeTurn: async (resume, signal) => {
          events.push('turn')
          return drive(signal, resume)
        },
        end: async () => { events.push('close'); if (close) await close() },
        release: async () => { events.push('session-release') },
      }
    },
    git,
    mirrorDebounceMs,
    ...(warmParkedMs === undefined ? {} : { warmParkedMs }),
    // Whether the parked run's session was still live when its open call was settled.
    discardParked: async () => { discards.push(!events.includes('session-release')) },
    materializeStarter: async () => { events.push('starter'); await starter?.() },
    ...(openConnectorRun ? { openConnectorRun } : {}),
    readProjectName: async () => 'Compras',
    log: (line) => { (line.startsWith('BUILDER_RUN_TIMING:') ? timings : line.startsWith('BUILDER_SANDBOX_EGRESS') ? egressLogs : logs).push(line) },
  })
  const claimed = { builderRunId: runId, projectId, conversationId, state: 'RUNNING', phase: 'PREPARING', baseSourceRevision: base, resultSourceRevision: null, resultKind: null, failureCode: null }
  // The one run's row as the database holds it.
  const row = { running: true, candidate: null, result: null }
  const store = {
    createBuilderRun: async (input) => {
      calls.push(['create'])
      claimed.baseSourceRevision = await input.readBase()
      return { ...claimed, state: 'QUEUED', phase: null }
    },
    admitSourceRevision: async () => true,
    claimBuilderRun: async () => claimed,
    setBuilderRunPhase: async (_id, phase) => { calls.push(['phase', phase]) },
    recordBuilderRunCandidate: async (_id, revision) => { calls.push(['candidate', revision]); row.candidate = revision },
    bindBuilderRunMessage: async (_id, messageId) => { calls.push(['message', messageId]) },
    bindBuilderRunSandbox: async (_id, sandboxId) => { calls.push(['sandbox', sandboxId]) },
    readConversationSandbox: async () => recordedSandbox,
    recordConversationSandbox: async ({ providerSandboxId }) => { recordedSandbox = providerSandboxId },
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
    readLatestCodeChangingBuilderRun: async () => null,
    failBuilderRun: async (_id, code) => { calls.push(['fail', code]); row.running = false },
    interruptBuilderRun: async (_id, reason) => { calls.push(['interrupt', reason]); row.running = false },
    requestBuilderRunCancellation: async () => ({ ...claimed, cancellationRequested: true }),
    recordConversationSession: async (input) => { sessions.push(input) },
    // A run a leg of this Hub works is beating; one with a candidate and no beat is stale.
    heartbeatBuilderRuns: async (_owner, ids) => { row.beating = ids.includes(runId) },
    expireParkedBuilderRuns: async () => [],
    takeOverStaleBuilderRuns: async () => row.running && row.candidate && !row.beating
      ? [{ builderRunId: runId, projectId, conversationId, started: true, candidateRevision: row.candidate, resultSourceRevision: row.result, previousOwnerId: null }]
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
        profile: 'REACT_VITE_V2', templateRef: compiled.templateRef, recipeSha256: compiled.recipeSha256,
        entryPath: 'index.html', files: [],
      }),
    },
    runs: {
      runtime,
      git,
      conversations: {
        ownerOf: async () => 'PROJECT',
      },
      source: createProjectSourceReads({ git }),
      appendDiagnostic: async (input) => { diagnostics.push({ ...input, from: 'service' }) },
    },
  })
  const start = () => service.createBuilderRun({ accountId, projectId, conversationId, idempotencyKey: 'key', content: 'Mostre UNIT1-nonce' })
  // The same run row started once more on the same sandbox, as the next run of the conversation would.
  const again = async () => {
    await new Promise((wake) => { setTimeout(wake, 20) })
    Object.assign(row, { running: true, candidate: null, result: null })
    return start()
  }
  // E2B lost the conversation's VM between turns: the next start gets a new one with no checkout.
  const loseVm = (sandboxId) => {
    rmSync(checkout, { recursive: true, force: true })
    sandbox.sandboxId = sandboxId
  }
  const main = () => conexusGit.readMain(projectId)
  const MIRROR = `refs/conexus/conversations/${conversationId}`
  // The conversation's mirror head, and the files it holds, as the Conexus Git has them.
  const mirror = () => inBare('rev-parse', '--verify', '--quiet', MIRROR) || null
  const mirrorFiles = () => inBare('ls-tree', '-r', '--name-only', MIRROR).split('\n').filter(Boolean)
  // The candidate the run offered, as the Conexus Git holds it under the run's own ref.
  const result = () => inBare('rev-parse', '--verify', '--quiet', `refs/conexus/runs/${runId}`) || null
  const commands = () => events.filter((event) => typeof event === 'string')
  // The run's own ending, or the lease's: a heartbeat for the legs in flight, then a sweep.
  const settled = async () => {
    for (let attempt = 0; row.running && attempt < 400; attempt++) {
      row.beating = false
      await service.heartbeat()
      await service.sweep()
      if (row.running) await new Promise((wake) => { setTimeout(wake, 5) })
    }
    return !row.running
  }
  return { runtime, runtimeInput: { projectId, accountId, conversationId, executionId: runId, intent: 'Mostre UNIT1-nonce', baseSourceRevision: base }, discards, mirror, mirrorFiles, sessions, MIRROR, inBare, agentChecks, base, again, events, invocations, rootInvocations, calls, diagnostics, logs, timings, egress, egressLogs, service, start, main, result, commands, checks, feedbacks, settled, sessionContext, checkout, outside, moveMain, paused, killed, sandboxRefs, loseVm, bare, vm }
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

test("the session's check tool runs the Hub's check on the checkout as the agent user, never on the admission path", async (t) => {
  let report
  const run = await harness(t, { turn: async ({ runCheck }) => { report = await runCheck(); return completed('Feito.') } })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.agentChecks, [{ root: '/workspace/repo', out: '/tmp/conexus-agent-check', collect: false }])
  assert.deepEqual(report, PASSING_REPORT)
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

test('a stop once main already holds the candidate is too late, and the run settles admitted', async (t) => {
  const context = {}
  const run = await harness(t, {
    afterFastForward: () => { void context.run.service.cancelBuilderRun({ accountId, projectId, builderRunId: runId }) },
  })
  context.run = run
  await run.start()
  await run.service.close()
  const result = run.result()
  assert.equal(await run.main(), result)
  assert.deepEqual(admissionCalls(run), [['candidate', result], ['advance', result], ['settleBuild', result, null]])
})

test('a stop that lands while the candidate is checked is refused the admission', async (t) => {
  const context = {}
  const run = await harness(t, {
    onCheck: () => { void context.run.service.cancelBuilderRun({ accountId, projectId, builderRunId: runId }) },
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
  // A runner the Hub cannot reach is not the source's fault: the note tells the agent to change nothing.
  assert.deepEqual(unconfigured.diagnostics.map(({ code, outcome }) => [code, outcome]), [['APPLICATION_RUNNER_UNAVAILABLE', 'PLATFORM_FAILED']])
})

test('a fast forward that moved main and then failed is admitted by a sweep, never failed or disowned', async (t) => {
  const run = await harness(t, { afterFastForward: () => { throw new Error('CONEXUS_GIT_FAILED') } })
  await run.start()
  assert.equal(await run.settled(), true, 'a sweep settled it without a restart')
  await run.service.close()
  const result = run.result()
  assert.equal(await run.main(), result)
  assert.deepEqual(admissionCalls(run), [['candidate', result], ['advance', result], ['settleBuild', result, 'BUILDER_PREVIEW_NOT_BUILT']])
  assert.deepEqual(run.diagnostics, [])
})

test('a fast forward that failed before main moved fails the run with the discarded note once a sweep reads main', async (t) => {
  const run = await harness(t, { beforeFastForward: () => { throw new Error('CONEXUS_GIT_FAILED') } })
  await run.start()
  assert.equal(await run.settled(), true, 'a sweep settled it without a restart')
  await run.service.close()
  assert.equal(await run.main(), run.base)
  assert.deepEqual(admissionCalls(run), [['candidate', run.result()], ['fail', 'BUILDER_SOURCE_ADMISSION_FAILED']])
})

test('a database failure recording the advance after main moved leaves the run pending, and a sweep admits it', async (t) => {
  const run = await harness(t, { lostAdvances: 1 })
  await run.start()
  assert.equal(await run.settled(), true, 'a sweep settled it without a restart')
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
  assert.deepEqual({ killed: run.killed, paused: run.paused }, { killed: ['sbx-2'], paused: [] }, 'a VM replaced mid-turn is killed, never kept')
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

test('a run releases its sandbox after the turn and completes normally', async (t) => {
  const run = await harness(t)
  await run.start()
  await run.service.close()
  const turnIndex = run.events.indexOf('turn')
  const releaseIndex = run.events.indexOf('release')
  assert.ok(turnIndex >= 0 && releaseIndex >= 0, 'the run both turns and releases')
  assert.ok(turnIndex < releaseIndex, `release (${releaseIndex}) must run after the turn (${turnIndex})`)
  assert.equal(run.logs.some((line) => line.startsWith('BUILDER_SANDBOX_KEEPALIVE_FAILED:')), false)
  const plain = await harness(t)
  await plain.start()
  await plain.service.close()
  const settledAs = (call) => call.filter((_, index) => index !== 1)
  assert.deepEqual(settledAs(run.calls.at(-1)), settledAs(plain.calls.at(-1)))
})

test('a terminal keepalive lapse aborts the turn and fails the run for recovery from main', async (t) => {
  const run = await harness(t, {
    onHoldOpen: (onLapse) => onLapse(new Error('Sandbox sbx-1 not found')),
    turn: ({ signal, checkout }) => {
      if (signal.aborted) return { reason: 'aborted', userMessageId: 'user-message', summary: '' }
      writeFileSync(join(checkout, 'app/index.html'), '<h1>UNIT1</h1>\n')
      return completed()
    },
  })
  await run.start()
  await run.service.close()
  assert.equal(await run.main(), run.base)
  assert.deepEqual(run.calls.filter(([kind]) => ['fail', 'advance', 'settleBuild'].includes(kind)), [['fail', 'BUILDER_SANDBOX_KEEPALIVE_FAILED']])
  assert.deepEqual(run.diagnostics.map(({ code, outcome }) => [code, outcome]), [['BUILDER_SANDBOX_KEEPALIVE_FAILED', 'RUN_NOT_FINISHED']])
  assert.deepEqual(run.logs.filter((line) => line.startsWith('BUILDER_SANDBOX_KEEPALIVE_FAILED:')), [
    `BUILDER_SANDBOX_KEEPALIVE_FAILED:${runId}:Sandbox sbx-1 not found`,
  ])
  assert.deepEqual({ killed: run.killed, paused: run.paused }, { killed: ['sbx-1'], paused: [] }, 'a VM whose keepalive lapsed is killed, never kept')
})

test("a check that fails in Conexus fails the run with its code, keeps the files in the mirror and leaves main at the base", async (t) => {
  const run = await harness(t, { build: async () => { throw new Error('APPLICATION_COMPILATION_FAILED') } })
  await run.start()
  await run.service.close()
  assert.equal(await run.main(), run.base)
  assert.deepEqual(run.calls.filter(([kind]) => kind === 'advance' || kind === 'settleBuild' || kind === 'fail'), [['fail', 'APPLICATION_COMPILATION_FAILED']])
  assert.equal(run.mirror(), run.result())
  assert.equal(run.checks.length, 2, 'a Conexus failure is not kept: settling checks once more, and nothing sent the agent back to work')
  assert.deepEqual(run.feedbacks, [])
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
  const seedWrite = run.events.findIndex((event) => Array.isArray(event) && event[0] === 'rootFile' && event[1] === '/var/lib/conexus-seed/turn.bundle')
  const seeded = run.events.findIndex((event) => typeof event === 'string' && event.includes('/var/lib/conexus-seed/turn.bundle'))
  assert.ok(run.events.indexOf('start') < seedWrite && seedWrite < seeded && seeded < run.events.indexOf('turn'), 'start, root writes the seed, the checkout fetches it, then the agent')
  assert.equal(run.commands().some((line) => /https?:\/\/|remote add|credential/.test(line)), false, 'the checkout reaches no remote')
})

test("a failed turn's files are there at the next turn, and the next turn admits them with its own", async (t) => {
  const seen = []
  let turns = 0
  const run = await harness(t, {
    turn: ({ checkout }) => {
      seen.push({ index: readFileSync(join(checkout, 'app/index.html'), 'utf8'), files: listFiles(checkout).filter((path) => !path.startsWith('.git/')) })
      if (turns++ > 0) {
        writeFileSync(join(checkout, 'app/second.ts'), 'second\n')
        return completed()
      }
      writeFileSync(join(checkout, 'stray.txt'), 'left behind\n')
      writeFileSync(join(checkout, 'app/index.html'), '<h1>edited</h1>\n')
      return { reason: 'error', userMessageId: 'user-message', summary: '' }
    },
  })
  await run.start()
  assert.equal(await run.settled(), true)
  const kept = run.mirror()
  await run.again()
  assert.equal(await run.settled(), true)
  await run.service.close()
  assert.deepEqual(seen, [
    { index: '<h1>base</h1>\n', files: BASE_FILES },
    { index: '<h1>edited</h1>\n', files: ['AGENTS.md', 'app/index.html', 'stray.txt'] },
  ])
  const result = run.result()
  assert.equal(await run.main(), result)
  assert.equal(run.inBare('rev-list', '--parents', '-n', '1', result), `${result} ${kept}`)
  assert.deepEqual(run.inBare('ls-tree', '-r', '--name-only', result).split('\n'), ['AGENTS.md', 'app/index.html', 'app/second.ts', 'stray.txt'])
})

test("a stopped turn's files are there at the next turn, and a turn that only answers makes them the version", async (t) => {
  const context = {}
  const seen = []
  let turns = 0
  const run = await harness(t, {
    turn: async ({ checkout }) => {
      seen.push(listFiles(checkout).filter((path) => !path.startsWith('.git/')))
      if (turns++ > 0) return completed('Só uma resposta.')
      writeFileSync(join(checkout, 'app/stopped.ts'), 'export const stopped = true\n')
      await context.run.service.cancelBuilderRun({ accountId, projectId, builderRunId: runId })
      return { reason: 'aborted', userMessageId: 'user-message', summary: '' }
    },
  })
  context.run = run
  await run.start()
  assert.equal(await run.settled(), true)
  const kept = run.mirror()
  await run.again()
  assert.equal(await run.settled(), true)
  await run.service.close()
  assert.deepEqual(seen, [BASE_FILES, ['AGENTS.md', 'app/index.html', 'app/stopped.ts']])
  assert.deepEqual(admissionCalls(run), [['interrupt', 'USER_CANCELLED'], ['candidate', kept], ['advance', kept], ['settleBuild', kept, null]])
  assert.equal(await run.main(), kept)
})

// The instructions the agent's last turn received, built from what the run put in its session context.
const agentInstructions = (run) => {
  const requestContext = new RequestContext()
  requestContext.set('controller', { session: { modeId: 'build' } })
  for (const [key, value] of run.sessionContext) requestContext.setRaw(key, value)
  return conexusInstructions()({ requestContext })
}

// A commit another conversation put on `main`, made the way any writer of the Conexus Git would.
const commitOnMain = (run, files) => {
  const work = mkdtempSync(join(tmpdir(), 'conexus-other-conversation-'))
  try {
    const git = (...args) => spawnSync('git', args, { cwd: work, encoding: 'utf8', env: GIT_ENV })
    git('clone', '--quiet', run.bare, '.')
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(work, path)), { recursive: true })
      writeFileSync(join(work, path), content)
    }
    git('add', '--all')
    git('commit', '--quiet', '-m', 'another conversation')
    git('push', '--quiet', 'origin', 'HEAD:refs/heads/main')
    return git('rev-parse', 'HEAD').stdout.trim()
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

test("main that moved meanwhile merges clean into the conversation's files at the next turn", async (t) => {
  const seen = []
  let turns = 0
  const run = await harness(t, {
    turn: ({ checkout }) => {
      seen.push(listFiles(checkout).filter((path) => !path.startsWith('.git/')))
      if (turns++ > 0) return completed()
      writeFileSync(join(checkout, 'app/kept.ts'), 'kept\n')
      return { reason: 'error', userMessageId: 'user-message', summary: '' }
    },
  })
  await run.start()
  assert.equal(await run.settled(), true)
  const kept = run.mirror()
  const other = commitOnMain(run, { 'app/other.ts': 'other\n' })
  await run.again()
  assert.equal(await run.settled(), true)
  await run.service.close()
  assert.deepEqual(seen, [BASE_FILES, ['AGENTS.md', 'app/index.html', 'app/kept.ts', 'app/other.ts']])
  const merge = await run.main()
  assert.equal(run.inBare('rev-list', '--parents', '-n', '1', merge), `${merge} ${kept} ${other}`)
  assert.equal(run.mirror(), merge)
  assert.deepEqual(run.sessions.at(-1), { projectId, conversationId, mirrorHead: merge, syncedMain: other, turnEnded: true })
  assert.deepEqual(run.logs.filter((line) => line.startsWith('BUILDER_TURN_START_CONFLICT:')), [])
  assert.equal(run.sessionContext.get('conexusTurnConflicts'), '')
  assert.equal(agentInstructions(run).includes('Merge conflicts'), false)
  assert.deepEqual(run.logs.filter((line) => line.startsWith('BUILDER_TURN_CHECKOUT:')), [
    `BUILDER_TURN_CHECKOUT:${runId}:SEEDED:sbx-1`, `BUILDER_TURN_CHECKOUT:${runId}:RESUMED:sbx-1`,
  ], 'the kept VM fetched the merge and took it in place')
})

test('a conflict with main is left in the checkout with its markers, and the turn resolves it and proceeds', async (t) => {
  const seen = []
  let turns = 0
  const run = await harness(t, {
    turn: ({ checkout }) => {
      seen.push(readFileSync(join(checkout, 'app/index.html'), 'utf8'))
      if (turns++ > 0) {
        writeFileSync(join(checkout, 'app/index.html'), '<h1>resolved</h1>\n')
        return completed()
      }
      writeFileSync(join(checkout, 'app/index.html'), '<h1>mine</h1>\n')
      return { reason: 'error', userMessageId: 'user-message', summary: '' }
    },
  })
  await run.start()
  assert.equal(await run.settled(), true)
  commitOnMain(run, { 'app/index.html': '<h1>theirs</h1>\n' })
  await run.again()
  assert.equal(await run.settled(), true)
  await run.service.close()
  assert.equal(seen[0], '<h1>base</h1>\n')
  assert.match(seen[1], /^<<<<<<< [0-9a-f]{40}\n<h1>mine<\/h1>\n=======\n<h1>theirs<\/h1>\n>>>>>>> [0-9a-f]{40}\n$/)
  assert.deepEqual(run.logs.filter((line) => line.startsWith('BUILDER_TURN_START_CONFLICT:')), [`BUILDER_TURN_START_CONFLICT:${runId}:app/index.html`])
  assert.equal(agentInstructions(run).includes("## Merge conflicts\n\nBringing the Project's current main into these files left conflict markers; resolve them before any other change: `app/index.html`."), true)
  assert.equal(await run.main(), run.result())
  assert.equal(run.inBare('show', `${run.result()}:app/index.html`), '<h1>resolved</h1>')
})

test('an admission that finds main already at the candidate counts it admitted', async (t) => {
  const run = await harness(t, { beforeFastForward: ({ moveMain }) => { moveMain(run_.result()) } })
  const run_ = run
  await run.start()
  await run.service.close()
  const result = run.result()
  assert.equal(await run.main(), result)
  assert.deepEqual(run.calls.filter(([kind]) => kind === 'advance' || kind === 'settleBuild'), [['advance', result], ['settleBuild', result, null]])
})

test("the check runs on the candidate from the Conexus Git in a root-only directory, and a process of the agent's that outlives its turn only makes a new candidate", async (t) => {
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
  const checkRoot = `/var/lib/conexus-build/${runId}`
  const result = run.result()
  // The write after the kill is pulled and checked as a revision of its own, and that is what main admits.
  assert.deepEqual(run.checks.map(({ root, out, files, index }) => [root, out, files, index]), [
    [checkRoot, `${checkRoot}.dist`, ['app/index.html'], '<h1>UNIT1</h1>\n'],
    [checkRoot, `${checkRoot}.dist`, ['app/index.html'], '<h1>late write</h1>\n'],
  ])
  assert.equal(run.checks[1].main, run.base, 'main still holds the base when the check runs')
  assert.equal(await run.main(), result)
  assert.equal(run.inBare('show', `${result}:app/index.html`), '<h1>late write</h1>')
  const killed = run.events.indexOf('sh -c kill -KILL -1 2>/dev/null; true')
  const unpacked = run.events.findIndex((event) => Array.isArray(event) && event[0] === 'root' && event[1].startsWith("rm -rf '/var/lib/conexus-build'"))
  const written = run.events.findIndex((event) => Array.isArray(event) && event[0] === 'rootFile' && event[1] === `/var/lib/conexus-seed/${runId}.candidate.tar`)
  assert.match(run.events[unpacked][1], new RegExp(`mkdir -m 755 '${checkRoot}' && tar -x -C '${checkRoot}'`))
  const checks = run.events.flatMap((event, index) => event === 'check' ? [index] : [])
  assert.ok(run.events.indexOf('turn') < written && written < unpacked && unpacked < checks[0] && checks[0] < killed && killed < checks[1], JSON.stringify([written, unpacked, checks, killed]))
  assert.equal(run.commands().some((line) => line.includes('ls-tree') || line.includes(' archive ')), false, 'no agent-user command lists or archives the tree the check admits')
})

test('a turn that writes the plan and the memory with its app change commits them with the version (AC-5)', async (t) => {
  const run = await harness(t, {
    turn: ({ checkout }) => {
      mkdirSync(join(checkout, '.conexus/memory'), { recursive: true })
      writeFileSync(join(checkout, '.conexus/plan.md'), '# Painel\n\nEstado: entregue\n')
      writeFileSync(join(checkout, '.conexus/memory/MEMORY.md'), '## Regras\n')
      writeFileSync(join(checkout, 'app/index.html'), '<h1>painel</h1>\n')
      return completed('Pronto.')
    },
  })
  await run.start()
  await run.service.close()
  assert.equal(await run.main(), run.result())
  assert.deepEqual(run.inBare('ls-tree', '-r', '--name-only', run.result()).split('\n'), ['.conexus/memory/MEMORY.md', '.conexus/plan.md', 'AGENTS.md', 'app/index.html'])
})

test('a turn that only wrote the plan is a version that holds it, admitted like any other', async (t) => {
  const run = await harness(t, {
    turn: ({ checkout }) => {
      mkdirSync(join(checkout, '.conexus'), { recursive: true })
      writeFileSync(join(checkout, '.conexus/plan.md'), '# Painel\n')
      return completed('Plano escrito.')
    },
  })
  await run.start()
  await run.service.close()
  assert.equal(await run.main(), run.result())
  assert.deepEqual(admissionCalls(run), [['candidate', run.result()], ['advance', run.result()], ['settleBuild', run.result(), null]])
})

const timingStages = (run) => {
  const lines = run.timings
  assert.deepEqual(lines.map((line) => line.split(':').slice(0, 2).join(':')), [`BUILDER_RUN_TIMING:${runId}`], 'one timing line per run')
  return lines[0].split(':').slice(2).map((pair) => {
    const [stage, value] = pair.split('=')
    assert.match(value, /^\d+$/, `${stage} is whole milliseconds`)
    return stage
  })
}

test('each run logs one BUILDER_RUN_TIMING line with the stages it reached, in run order', async (t) => {
  const built = await harness(t)
  await built.start()
  await built.service.close()
  assert.deepEqual(timingStages(built), ['sandbox', 'seed', 'starter', 'session', 'agent', 'pull', 'admission'])

  const answered = await harness(t, { turn: () => completed('Explicado.') })
  await answered.start()
  await answered.service.close()
  assert.deepEqual(timingStages(answered), ['sandbox', 'seed', 'starter', 'session', 'agent', 'pull'])
})

test('every agent-user command states an empty environment, and root commands get none', async (t) => {
  const run = await harness(t, { report: failedReport('typecheck', [{ file: 'app/src/main.tsx', message: 'broken' }]) })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.invocations.filter(({ env }) => env === undefined || Object.keys(env).length > 0), [])
  assert.deepEqual(run.rootInvocations.filter(({ env }) => Object.keys(env).length > 0), [])
})

test('a turn that continued its session after a transient failure logs how many times', async (t) => {
  const run = await harness(t, { turn: () => ({ ...completed(), continuations: 2 }) })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.logs.filter((line) => line.startsWith('BUILDER_AGENT_CONTINUED:')), [`BUILDER_AGENT_CONTINUED:2:${runId}`])
})

test('an agent that aborts with no stop from the person fails with a named reason, never as cancelled by them', async (t) => {
  const run = await harness(t, { turn: () => ({ reason: 'aborted', userMessageId: 'user-message', summary: '' }) })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.logs, [`BUILDER_TURN_CHECKOUT:${runId}:SEEDED:sbx-1`, `BUILDER_AGENT_END:aborted:${runId}`, `BUILDER_RUN_FAILED:${runId}:BUILDER_MODEL_INCOMPLETE`])
  assert.notDeepEqual(run.calls.at(-1), ['interrupt', 'USER_CANCELLED'])
  assert.ok(JSON.stringify(run.calls.at(-1)).includes('BUILDER_MODEL_INCOMPLETE'), JSON.stringify(run.calls.at(-1)))
  assert.equal(await run.main(), run.base)
})

test('a run that reached the agent and admitted nothing leaves one note that its files are kept, with main still at the base', async (t) => {
  const run = await harness(t, { turn: () => ({ reason: 'error', userMessageId: 'user-message', summary: 'Concluído.' }) })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['fail', 'BUILDER_MODEL_INCOMPLETE'])
  assert.deepEqual(run.diagnostics, [{
    projectId, conversationId, builderRunId: runId, code: 'BUILDER_MODEL_INCOMPLETE', outcome: 'RUN_NOT_FINISHED', sourceRevision: run.base, from: 'service',
  }])
})

test('a run the person stopped during the agent turn also leaves the note that its files are kept', async (t) => {
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

test('a candidate whose AGENTS.md is missing, over 8 KB or not UTF-8 is admitted: the Hub no longer refuses it (AC-10)', async (t) => {
  for (const change of [
    (checkout) => rmSync(join(checkout, 'AGENTS.md')),
    (checkout) => writeFileSync(join(checkout, 'AGENTS.md'), 'x'.repeat(8193)),
    (checkout) => writeFileSync(join(checkout, 'AGENTS.md'), Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a])),
  ]) {
    const run = await refusedCandidate(t, (checkout) => {
      writeFileSync(join(checkout, 'app/index.html'), '<h1>UNIT1</h1>\n')
      change(checkout)
    })
    assert.equal(await run.main(), run.result())
    assert.deepEqual(run.diagnostics, [])
  }
})

// A server error the Builder needs whole to fix: longer than the 400 and 1,200 characters the record cut before.
const LONG_SERVER_MESSAGE = `conexus/handlers/notes.ts imports "../../app/src/${'a'.repeat(700)}": a handler may import only .ts, .js or .json files inside conexus/ and node: built-ins`

const CHECK_PROBLEMS = [
  { file: 'app/src/main.tsx', line: 3, column: 7, code: 'TS2322', message: "Type 'string' is not assignable to type 'number'." },
  { file: 'conexus/handlers/notes.ts', message: LONG_SERVER_MESSAGE },
]
const CHECK_DETAIL = [
  'typecheck failed:',
  "app/src/main.tsx:3:7: TS2322 Type 'string' is not assignable to type 'number'.",
  `conexus/handlers/notes.ts: ${LONG_SERVER_MESSAGE}`,
].join('\n')
const redThenGreen = (n) => n === 0 ? failedReport('typecheck', CHECK_PROBLEMS) : PASSING_REPORT
const writeIndex = (content) => ({ checkout }) => writeFileSync(join(checkout, 'app/index.html'), content)

test("a red check goes back to the agent in the same turn with the failed step's problems whole, and a green repair is admitted with one check per revision (AC-9)", async (t) => {
  const run = await harness(t, {
    report: redThenGreen,
    turn: ({ checkout }) => {
      writeFileSync(join(checkout, 'app/index.html'), '<h1>UNIT1</h1>\n')
      // A check of the candidate's own that says everything is fine changes nothing.
      mkdirSync(join(checkout, 'conexus'), { recursive: true })
      writeFileSync(join(checkout, 'conexus/check.sh'), '#!/bin/sh\nexit 0\n')
      return completed()
    },
    repairs: [writeIndex('<h1>repaired</h1>\n')],
  })
  await run.start()
  await run.service.close()
  const result = run.result()
  assert.deepEqual(run.feedbacks, [[
    'Verificação do Conexus: o app não passou (1 de 3).',
    CHECK_DETAIL,
    'Corrija estes problemas e termine de novo: o Conexus verifica o app outra vez quando você terminar.',
  ].join('\n')])
  assert.deepEqual(run.checks.map(({ index }) => index), ['<h1>UNIT1</h1>\n', '<h1>repaired</h1>\n'])
  assert.equal(run.events.filter((event) => event === 'turn').length, 1, 'the repair happened inside the one turn')
  assert.equal(await run.main(), result)
  assert.equal(run.inBare('show', `${result}:app/index.html`), '<h1>repaired</h1>')
  assert.deepEqual(admissionCalls(run), [['candidate', result], ['advance', result], ['settleBuild', result, null]])
  assert.deepEqual(run.diagnostics, [])
  assert.equal(run.commands().some((line) => line.includes('check.sh')), false, 'no command runs a script of the candidate')
  assert.ok(run.checks[0].files.includes('conexus/check.sh'), 'the candidate file is only data in the tree the Hub checks')
  assert.equal(run.checks.every(({ main }) => main === run.base), true, 'main stays at the base until the check is green')
})

test('the third red finish ends the run refused with BUILDER_APP_NOT_FIXED, files kept and main at the base, with no second note', async (t) => {
  const run = await harness(t, {
    report: failedReport('typecheck', CHECK_PROBLEMS),
    repairs: [writeIndex('<h1>second</h1>\n'), writeIndex('<h1>third</h1>\n')],
  })
  await run.start()
  await run.service.close()
  assert.equal(run.checks.length, 3, 'each changed revision is checked once')
  assert.deepEqual(run.feedbacks.map((feedback) => feedback.split('\n')[0]), [
    'Verificação do Conexus: o app não passou (1 de 3).',
    'Verificação do Conexus: o app não passou (2 de 3).',
    'Verificação do Conexus: o app não passou (3 de 3).',
  ])
  assert.ok(run.feedbacks[2].endsWith('O limite de tentativas acabou. A execução para aqui, e os arquivos ficam nesta conversa.'))
  assert.deepEqual(run.calls.at(-1), ['fail', 'BUILDER_APP_NOT_FIXED'])
  assert.equal(await run.main(), run.base)
  assert.equal(run.inBare('show', `${run.MIRROR}:app/index.html`), '<h1>third</h1>')
  assert.deepEqual(run.diagnostics, [], 'the last feedback already told the person why')
})

test('a done on a red revision the agent did not change spends a finish and does not check again', async (t) => {
  const run = await harness(t, { report: failedReport('typecheck', CHECK_PROBLEMS) })
  await run.start()
  await run.service.close()
  assert.equal(run.checks.length, 1)
  assert.equal(run.feedbacks.length, 3)
  assert.deepEqual(run.calls.at(-1), ['fail', 'BUILDER_APP_NOT_FIXED'])
})

test('a run parked on a question keeps its red finishes for the next leg, which has only the rest of the budget', async (t) => {
  const run = await harness(t, {
    report: failedReport('typecheck', CHECK_PROBLEMS),
    turn: async ({ checkout, finish, resume }) => {
      if (resume) return completed()
      writeFileSync(join(checkout, 'app/index.html'), '<h1>UNIT1</h1>\n')
      assert.match(await finish(), /\(1 de 3\)/)
      return SUSPENDED
    },
  })
  await run.start()
  await until(() => run.calls.some(([kind, phase]) => kind === 'phase' && phase === 'PARKED') && run.events.includes('pause'), 'the park')
  assert.equal(run.feedbacks.length, 1)
  await assert.rejects(run.runtime.execute({
    ...run.runtimeInput, resume: { toolCallId: 'c1', resumeData: ['Azul'] }, providerSandboxId: 'sbx-1',
    bindPhysicalSandbox: async () => {}, bindMessage: async () => {}, setPhase: async () => {}, recordCandidate: async () => {}, recordMirror: async () => {},
  }), { message: 'BUILDER_APP_NOT_FIXED' })
  assert.deepEqual(run.feedbacks.map((feedback) => /\((\d de 3)\)/.exec(feedback)[1]), ['1 de 3', '2 de 3', '3 de 3'], 'the second leg counted on from one')
  await run.service.close()
})

test('a candidate the loop ended without checking is checked when the turn settles, and a refused one leaves the problems for the next turn', async (t) => {
  const run = await harness(t, { report: failedReport('typecheck', CHECK_PROBLEMS), skipGate: true })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['fail', 'BUILDER_CHECK_FAILED'])
  assert.equal(await run.main(), run.base)
  assert.deepEqual(run.diagnostics.map(({ outcome, detail }) => [outcome, detail]), [['CANDIDATE_REFUSED', CHECK_DETAIL]])
})

test("an agent that puts its checkout back to the turn's start after a red finish ends the turn as a response, with main at the base", async (t) => {
  const run = await harness(t, {
    report: failedReport('typecheck', CHECK_PROBLEMS),
    repairs: [writeIndex('<h1>base</h1>\n')],
  })
  await run.start()
  await run.service.close()
  assert.equal(run.checks.length, 1, 'only the edited revision was checked')
  assert.equal(run.feedbacks.length, 1)
  assert.deepEqual(run.calls.at(-1), ['settle', 'RESPONSE_ONLY'])
  assert.equal(await run.main(), run.base)
})

test('each check the run makes leaves one line in the Hub log with its steps', async (t) => {
  const run = await harness(t)
  await run.start()
  await run.service.close()
  const steps = 'generate=passed:1ms typecheck=passed:1ms build=passed:1ms server=passed:1ms boot=passed:1ms'
  assert.deepEqual(run.logs.filter((line) => line.startsWith('BUILDER_CHECK:')), [`BUILDER_CHECK:gate:${runId}:${run.result().slice(0, 12)}:${steps}`])
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

test('a boot problem that leaves the page rendered keeps the Preview, reaches the Hub log and tells the next turn', async (t) => {
  const problems = [{ code: 'BOOT_CONSOLE_ERROR', message: 'console.error: Failed to load notes' }]
  const run = await harness(t, { report: failedReport('boot', problems) })
  await run.start()
  await run.service.close()
  const result = run.result()
  assert.deepEqual(run.calls.filter(([kind]) => kind === 'advance' || kind === 'settleBuild'), [['advance', result], ['settleBuild', result, null]])
  assert.deepEqual(run.diagnostics.map(({ code, outcome, detail }) => [code, outcome, detail]), [['APPLICATION_BOOT_PROBLEMS', 'BOOT_PROBLEMS', `boot failed:\nBOOT_CONSOLE_ERROR console.error: Failed to load notes`]])
  assert.deepEqual(run.logs.filter((line) => line.startsWith('BUILDER_CHECK_BOOT_PROBLEMS:')), [`BUILDER_CHECK_BOOT_PROBLEMS:${runId}:${JSON.stringify(problems)}`])
})

test('a page that does not boot leaves the admitted source without a Preview and tells the next turn why, whole', async (t) => {
  const thrown = `Error: ${'boom '.repeat(200)}`
  const run = await harness(t, { report: failedReport('boot', [{ code: 'BOOT_UNCAUGHT_ERROR', message: thrown, file: 'assets/index.js', line: 1, column: 9 }]) })
  await run.start()
  await run.service.close()
  const result = run.result()
  assert.equal(await run.main(), result)
  assert.deepEqual(run.calls.filter(([kind]) => kind === 'advance' || kind === 'settleBuild'), [['advance', result], ['settleBuild', result, 'APPLICATION_SMOKE_FAILED']])
  assert.deepEqual(run.diagnostics.map(({ code, outcome, detail }) => [code, outcome, detail]), [['APPLICATION_SMOKE_FAILED', 'BUILD_FAILED', `boot failed:\nassets/index.js:1:9: BOOT_UNCAUGHT_ERROR ${thrown}`]])
})

test('the session context marks a Project new while main is the starter, and not after a saved version', async (t) => {
  const run = await harness(t)
  await run.start()
  assert.equal(await run.settled(), true)
  assert.equal(run.sessionContext.get('conexusProjectNew'), 'true')
  await run.again()
  assert.equal(await run.settled(), true)
  await run.service.close()
  assert.equal(run.sessionContext.get('conexusProjectNew'), '')
})

test("the session context carries the Project's name, the date, and the base's AGENTS.md and MEMORY.md, cut with their notes (AC-9)", async (t) => {
  const short = await harness(t)
  await short.start()
  await short.service.close()
  assert.equal(short.sessionContext.get('conexusProjectName'), 'Compras')
  assert.match(short.sessionContext.get('conexusTurnDate'), /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(short.sessionContext.get('conexusProjectInstructions'), AGENTS_MD.trim())
  assert.equal(short.sessionContext.get('conexusProjectMemory'), '[.conexus/memory/MEMORY.md is missing; treat it as empty.]')

  const long = `# Instruções\n${'ção '.repeat(3_000)}`
  const memory = Array.from({ length: 250 }, (_, line) => `- linha ${line}`).join('\n')
  const run = await harness(t, { starterFiles: [{ path: 'AGENTS.md', content: long }, { path: '.conexus/memory/MEMORY.md', content: memory }, ...STARTER.slice(1)] })
  await run.start()
  await run.service.close()
  const instructions = run.sessionContext.get('conexusProjectInstructions')
  const note = '\n\n[AGENTS.md was cut at 8 KB; the rest is not shown.]'
  assert.ok(instructions.endsWith(note), instructions.slice(-60))
  const kept = instructions.slice(0, -note.length)
  assert.ok(Buffer.byteLength(kept) <= 8192 && long.startsWith(kept), 'a prefix of the file within 8 KB, cut between characters')
  const index = run.sessionContext.get('conexusProjectMemory')
  assert.ok(index.endsWith('- linha 199\n\n[MEMORY.md was cut at 200 lines or 16 KB; the rest is not shown. Keep the index shorter.]'), index.slice(-120))
  assert.equal(index.includes('linha 200'), false)
})

test('a person with no model account is refused before a sandbox exists', async (t) => {
  const run = await harness(t, { modelAccount: null })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['fail', 'BUILDER_MODEL_NOT_SELECTED'])
  assert.equal(run.events.some((event) => Array.isArray(event) && event[0] === 'sandbox'), false)
})

test("a run checks its start model once, names its payer in every turn's context, and keeps the conversation's sandbox however it ends: the agent's processes are killed, then the VM pauses", async (t) => {
  const ok = await harness(t)
  await ok.start()
  await ok.service.close()
  const failed = await harness(t, { turn: () => ({ reason: 'error', userMessageId: 'user-message', summary: '' }) })
  await failed.start()
  await failed.service.close()
  for (const run of [ok, failed]) {
    assert.deepEqual(run.events.filter((event) => Array.isArray(event) && event[0] === 'model-check'), [['model-check', runId, accountId]])
    assert.equal(run.sessionContext.get('conexusBuilderAccountId'), accountId)
    assert.deepEqual({ paused: run.paused, killed: run.killed }, { paused: ['sbx-1'], killed: [] })
    const processesKilled = run.events.lastIndexOf('sh -c kill -KILL -1 2>/dev/null; true')
    assert.ok(run.events.indexOf('turn') < processesKilled && processesKilled < run.events.indexOf('pause'), 'the agent\'s processes die after its turn and before the pause')
    assert.equal(run.events.filter((event) => event !== 'session-release').at(-1), 'pause', 'the pause is the last step of the run itself; only the held session closes after it')
  }
})

test('a run deletes the session it opened, once, after the agent and its admission, whether it completed, failed, threw or aborted', async (t) => {
  const sessionEnds = (run) => run.events.filter((event) => event === 'close' || event === 'session-release')
  const completedRun = await harness(t)
  await completedRun.start()
  await completedRun.service.close()
  const failedTurn = await harness(t, { turn: () => ({ reason: 'error', userMessageId: 'user-message', summary: '' }) })
  await failedTurn.start()
  await failedTurn.service.close()
  const thrown = await harness(t, { turn: () => { throw new Error('BOOM') } })
  await thrown.start()
  await thrown.service.close()
  const stopped = await harness(t, { turn: () => ({ reason: 'aborted', userMessageId: 'user-message', summary: '' }) })
  await stopped.start()
  await stopped.service.close()
  assert.deepEqual(sessionEnds(completedRun), ['close', 'session-release'], 'a completed run ends its turn, then deletes the session after the admission')
  for (const run of [failedTurn, thrown, stopped]) assert.deepEqual(run.events.filter((event) => event === 'session-release'), ['session-release'])
  for (const run of [completedRun, failedTurn, thrown, stopped]) {
    assert.ok(run.events.indexOf('session-release') > run.events.indexOf('turn'), 'the session outlives the agent turn')
    assert.equal(run.events.at(-1), 'session-release', 'and is held through the terminal publication, so it closes last, after the VM pauses')
  }
  assert.ok(completedRun.events.indexOf('check') < completedRun.events.indexOf('session-release'), 'the browser stream sees the admission and the check in the session')
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
  assert.deepEqual({ killed: run.killed, paused: run.paused }, { killed: ['sbx-1'], paused: [] }, 'a checkout that cannot take the start takes its VM with it')
})

test('a start that fails, or a first command that fails on the VM it started, kills that VM and keeps the run failure', async (t) => {
  const startFailed = await harness(t, { onStart: () => { throw new Error('E2B_START_FAILED') } })
  await startFailed.start()
  await startFailed.service.close()
  const firstCommandFailed = await harness(t, {
    onCommand: (_sandbox, line) => { if (line === 'true') throw new Error('E2B_COMMAND_FAILED') },
  })
  await firstCommandFailed.start()
  await firstCommandFailed.service.close()
  for (const [run, code] of [[startFailed, 'E2B_START_FAILED'], [firstCommandFailed, 'E2B_COMMAND_FAILED']]) {
    assert.deepEqual(run.calls.at(-1)[0], 'fail', code)
    assert.deepEqual({ killed: run.killed, paused: run.paused }, { killed: ['sbx-1'], paused: [] }, `${code}: the VM the start holds is killed, never paused`)
    assert.equal(run.calls.some(([kind]) => kind === 'sandbox'), false, `${code}: no incarnation was recorded`)
  }
})

test('a failed start whose kill fails logs BUILDER_SANDBOX_KILL_FAILED and still fails the run', async (t) => {
  const run = await harness(t, {
    onStart: (sandbox) => {
      sandbox.kill = async () => { throw new Error('E2B_UNREACHABLE') }
      throw new Error('E2B_START_FAILED')
    },
  })
  await run.start()
  await run.service.close()
  assert.equal(run.calls.at(-1)[0], 'fail')
  assert.ok(run.logs.includes(`BUILDER_SANDBOX_KILL_FAILED:${runId}:E2B_UNREACHABLE`), JSON.stringify(run.logs))
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
  assert.deepEqual(run.logs, [
    `BUILDER_TURN_CHECKOUT:${runId}:SEEDED:sbx-1`,
    `BUILDER_RUN_FAILED:${runId}:BUILDER_STARTER_ENTRY_INSPECTION_FAILED {"exitCode":1,"stdout":"","stderr":"Error: sandbox not found"}`,
  ])
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
  assert.ok(other.brief.includes('- `other-project-binding`: sankhya (skill `conexus-sankhya`)'), 'the other Project is told its own binding')

  const run = await harness(t, { openConnectorRun: openRun })
  await run.start()
  await run.service.close()
  const instructions = run.sessionContext.get('conexusConnectorBrief')
  const { CONNECTOR_BRIEF_UNBOUND } = await import(hubModuleUrl('connectors/builder-brief.js'))
  assert.equal(instructions, CONNECTOR_BRIEF_UNBOUND, 'told it has no Connection, and what to do')
  for (const leak of ['other-project-binding', otherBinding.connectionId, 'connectors.call']) {
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
  assert.ok(instructions.startsWith('- `erp`: sankhya (skill `conexus-sankhya`)\n'), 'its own brief lists its binding with the skill that teaches it')
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
    'the check fails in Conexus after the turn': { build: async () => { throw new Error('APPLICATION_COMPILATION_FAILED') } },
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
    'the check fails in Conexus after the turn': { ...scoped, settled: 'fail' },
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

const until = async (predicate, what) => {
  for (let attempt = 0; attempt < 400; attempt++) {
    if (predicate()) return
    await new Promise((wake) => { setTimeout(wake, 5) })
  }
  assert.fail(`timed out waiting for ${what}`)
}
const MIRRORED_THREE = ['AGENTS.md', 'app/a.ts', 'app/b.ts', 'app/c.ts', 'app/index.html']

test('a sandbox that dies mid-turn leaves every file the write tool wrote in the conversation mirror, and main at the base', async (t) => {
  const run = await harness(t, {
    turn: async ({ sandbox, write, mirror }) => {
      for (const name of ['a', 'b', 'c']) await write(`app/${name}.ts`, `export const ${name} = 1\n`)
      await until(() => mirror() !== null && run.mirrorFiles().length === 5, 'the edit-time mirror')
      sandbox.sandboxId = 'sbx-2'
      return completed()
    },
  })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['fail', 'BUILDER_SANDBOX_INCARNATION_CHANGED'])
  assert.deepEqual(run.mirrorFiles(), MIRRORED_THREE)
  assert.equal(run.inBare('rev-list', '--parents', '-n', '1', run.MIRROR), `${run.mirror()} ${run.base}`)
  assert.equal(await run.main(), run.base)
  assert.deepEqual(run.logs.filter((line) => line.startsWith('BUILDER_MIRROR_FAILED:')), [])
})

test('a mirror write in flight when the sandbox dies lands before the run ends', async (t) => {
  let held = 0
  const run = await harness(t, {
    beforeAcceptSnapshot: () => new Promise((release) => { held += 1; setTimeout(release, 150) }),
    turn: async ({ sandbox, write }) => {
      await write('app/a.ts', 'export const a = 1\n')
      await until(() => held > 0, 'the mirror write reached its accept')
      sandbox.sandboxId = 'sbx-2'
      return completed()
    },
  })
  await run.start()
  await run.service.close()
  assert.equal(run.mirrorFiles().includes('app/a.ts'), true)
})

test('a turn the person stops keeps its file in the mirror, written at the turn end', async (t) => {
  const context = {}
  const run = await harness(t, {
    mirrorDebounceMs: 60_000,
    turn: async ({ write }) => {
      await write('app/stopped.ts', 'export const stopped = true\n')
      await context.run.service.cancelBuilderRun({ accountId, projectId, builderRunId: runId })
      return { reason: 'aborted', userMessageId: 'user-message', summary: '' }
    },
  })
  context.run = run
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['interrupt', 'USER_CANCELLED'])
  assert.deepEqual(run.mirrorFiles(), ['AGENTS.md', 'app/index.html', 'app/stopped.ts'])
  assert.deepEqual(run.sessions, [{ projectId, conversationId, mirrorHead: run.mirror(), syncedMain: run.base, turnEnded: true }])
  assert.equal(await run.main(), run.base)
})

test('a candidate the check refuses stays in the mirror, and main stays at the base', async (t) => {
  const run = await harness(t, { report: failedReport('typecheck', [{ file: 'app/src/main.tsx', message: 'broken' }]) })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['fail', 'BUILDER_APP_NOT_FIXED'])
  assert.equal(run.mirror(), run.result())
  assert.equal(run.inBare('show', `${run.MIRROR}:app/index.html`), '<h1>UNIT1</h1>')
  assert.equal(await run.main(), run.base)
})

test('an admitted turn moves the mirror to its candidate without a second bundle', async (t) => {
  const run = await harness(t)
  await run.start()
  await run.service.close()
  const result = run.result()
  assert.equal(await run.main(), result)
  assert.equal(run.mirror(), result)
  assert.equal(run.commands().some((line) => line.includes('conexus-mirror')), false)
  assert.deepEqual(run.sessions, [{ projectId, conversationId, mirrorHead: result, syncedMain: run.base, turnEnded: true }])
})

test('a turn that changed nothing leaves the conversation without a mirror', async (t) => {
  const run = await harness(t, { turn: () => completed('Só uma resposta.') })
  await run.start()
  await run.service.close()
  assert.equal(run.mirror(), null)
  assert.deepEqual(run.sessions, [])
})

test('an edit mirror that runs during the turn-end pull corrupts neither the candidate nor the mirror', async (t) => {
  let pulling = false
  const context = {}
  const run = await harness(t, {
    onCommand: (_sandbox, line) => {
      if (pulling || !line.includes('conexus-candidate-index')) return
      pulling = true
      void context.write('app/index.html', '<h1>UNIT1</h1>\n')
    },
    turn: ({ checkout, write }) => {
      context.write = write
      writeFileSync(join(checkout, 'app/index.html'), '<h1>UNIT1</h1>\n')
      return completed()
    },
  })
  await run.start()
  await run.service.close()
  const result = run.result()
  assert.equal(await run.main(), result)
  assert.equal(run.mirror(), result)
  assert.equal(run.inBare('rev-parse', `${result}^{tree}`), run.inBare('rev-parse', `${run.MIRROR}^{tree}`))
  assert.equal(run.inBare('show', `${result}:app/index.html`), '<h1>UNIT1</h1>')
  assert.deepEqual(run.logs.filter((line) => line.startsWith('BUILDER_MIRROR_FAILED:')), [])
})

test('a mirror moved by someone else after the turn started fails the write with a log line, and the run settles as it would have', async (t) => {
  const run = await harness(t, {
    turn: ({ checkout, bare }) => {
      bare('update-ref', `refs/conexus/conversations/${conversationId}`, bare('rev-parse', 'refs/heads/main'))
      writeFileSync(join(checkout, 'app/index.html'), '<h1>UNIT1</h1>\n')
      return completed()
    },
  })
  await run.start()
  await run.service.close()
  const result = run.result()
  assert.equal(await run.main(), result)
  assert.deepEqual(admissionCalls(run), [['candidate', result], ['advance', result], ['settleBuild', result, null]])
  assert.equal(run.mirror(), run.base)
  assert.deepEqual(run.logs.filter((line) => line.startsWith('BUILDER_MIRROR_FAILED:')), [`BUILDER_MIRROR_FAILED:${runId}:CONEXUS_GIT_REF_MOVED`])
})

// The seed bundle's root writes, one per turn that fetched one.
const seedWrites = (run) => run.events.filter((event) => Array.isArray(event) && event[0] === 'rootFile' && event[1] === '/var/lib/conexus-seed/turn.bundle').length

test("the conversation's next turn runs on the same sandbox, resumed by the id the first turn recorded", async (t) => {
  let turns = 0
  const run = await harness(t, {
    turn: ({ checkout }) => {
      turns += 1
      if (turns === 1) writeFileSync(join(checkout, 'app/index.html'), '<h1>first</h1>\n')
      return turns === 1 ? { reason: 'error', userMessageId: 'user-message', summary: '' } : completed()
    },
  })
  await run.start()
  assert.equal(await run.settled(), true)
  await run.again()
  assert.equal(await run.settled(), true)
  await run.service.close()
  assert.deepEqual(run.sandboxRefs, [{ conversationId, providerSandboxId: null }, { conversationId, providerSandboxId: 'sbx-1' }])
  assert.deepEqual(run.calls.filter(([kind]) => kind === 'sandbox'), [['sandbox', 'sbx-1'], ['sandbox', 'sbx-1']])
  assert.deepEqual(run.logs.filter((line) => line.startsWith('BUILDER_TURN_CHECKOUT:')), [
    `BUILDER_TURN_CHECKOUT:${runId}:SEEDED:sbx-1`, `BUILDER_TURN_CHECKOUT:${runId}:RESUMED:sbx-1`,
  ])
  assert.deepEqual({ paused: run.paused, killed: run.killed }, { paused: ['sbx-1', 'sbx-1'], killed: [] })
})

test("a paused sandbox resumes with the previous turn's files, its plan and an edit the mirror never saw, without a new seed", async (t) => {
  let turns = 0
  const seen = []
  const run = await harness(t, {
    turn: async ({ checkout, write, mirror }) => {
      turns += 1
      if (turns === 1) {
        await write('app/a.ts', 'export const a = 1\n')
        mkdirSync(join(checkout, '.conexus/plans'), { recursive: true })
        writeFileSync(join(checkout, '.conexus/plans/plan.md'), '# plano\n')
        return { reason: 'error', userMessageId: 'user-message', summary: '' }
      }
      seen.push({ files: listFiles(checkout).filter((path) => !path.startsWith('.git/')), mirror: mirror() })
      return completed()
    },
  })
  await run.start()
  assert.equal(await run.settled(), true)
  const mirrored = run.mirror()
  // Written into the VM after the turn-end mirror, as by a mirror that failed; only the VM has it.
  writeFileSync(join(run.checkout, 'app/late.ts'), 'export const late = 1\n')
  await run.again()
  assert.equal(await run.settled(), true)
  await run.service.close()
  assert.deepEqual(seen, [{ files: ['.conexus/plans/plan.md', 'AGENTS.md', 'app/a.ts', 'app/index.html', 'app/late.ts'], mirror: mirrored }])
  assert.equal(seedWrites(run), 1, 'only the first turn wrote a seed bundle')
  assert.deepEqual(run.logs.filter((line) => line.startsWith('BUILDER_TURN_CHECKOUT:')).at(-1), `BUILDER_TURN_CHECKOUT:${runId}:RESUMED:sbx-1`)
})

test('a sandbox E2B lost between turns is rebuilt from the mirror on a new VM, and the conversation records the new one', async (t) => {
  let turns = 0
  const seen = []
  const run = await harness(t, {
    turn: async ({ checkout, write }) => {
      turns += 1
      if (turns === 1) {
        await write('app/a.ts', 'export const a = 1\n')
        return { reason: 'error', userMessageId: 'user-message', summary: '' }
      }
      seen.push({ files: listFiles(checkout).filter((path) => !path.startsWith('.git/')), a: readFileSync(join(checkout, 'app/a.ts'), 'utf8') })
      return completed()
    },
  })
  await run.start()
  assert.equal(await run.settled(), true)
  run.loseVm('sbx-2')
  await run.again()
  assert.equal(await run.settled(), true)
  await run.service.close()
  assert.deepEqual(seen, [{ files: ['AGENTS.md', 'app/a.ts', 'app/index.html'], a: 'export const a = 1\n' }])
  assert.deepEqual(run.logs.filter((line) => line.startsWith('BUILDER_TURN_CHECKOUT:')), [
    `BUILDER_TURN_CHECKOUT:${runId}:SEEDED:sbx-1`, `BUILDER_TURN_CHECKOUT:${runId}:SEEDED:sbx-2`,
  ])
  assert.deepEqual(run.calls.filter(([kind]) => kind === 'sandbox'), [['sandbox', 'sbx-1'], ['sandbox', 'sbx-2']])
  assert.deepEqual(run.sandboxRefs.at(-1), { conversationId, providerSandboxId: 'sbx-1' })
  assert.equal(seedWrites(run), 2)
})

test("a local edit that main also changed makes the resumed checkout seed again from the conversation's mirror", async (t) => {
  let turns = 0
  const seen = []
  const run = await harness(t, {
    turn: async ({ checkout, write }) => {
      turns += 1
      if (turns === 1) {
        await write('app/a.ts', 'export const a = 1\n')
        return { reason: 'error', userMessageId: 'user-message', summary: '' }
      }
      seen.push({ knowledge: readFileSync(join(checkout, 'AGENTS.md'), 'utf8'), a: readFileSync(join(checkout, 'app/a.ts'), 'utf8') })
      return completed()
    },
  })
  await run.start()
  assert.equal(await run.settled(), true)
  writeFileSync(join(run.checkout, 'AGENTS.md'), '# unmirrored\n')
  const knowledge = '# Project knowledge\n\nMain moved.\n'
  const blob = spawnSync('git', ['--git-dir', run.bare, 'hash-object', '-w', '--stdin'], { input: knowledge, encoding: 'utf8', env: GIT_ENV }).stdout.trim()
  const listing = run.inBare('ls-tree', run.base).replace(/^100644 blob [0-9a-f]{40}\tAGENTS\.md$/m, `100644 blob ${blob}\tAGENTS.md`)
  const tree = spawnSync('git', ['--git-dir', run.bare, 'mktree'], { input: `${listing}\n`, encoding: 'utf8', env: GIT_ENV }).stdout.trim()
  run.moveMain(run.inBare('commit-tree', tree, '-p', run.base, '-m', 'main edits AGENTS.md'))
  await run.again()
  assert.equal(await run.settled(), true)
  await run.service.close()
  assert.deepEqual(run.logs.filter((line) => line.startsWith('BUILDER_TURN_CHECKOUT:')).at(-1), `BUILDER_TURN_CHECKOUT:${runId}:RESEEDED:sbx-1`)
  assert.deepEqual(seen, [{ knowledge, a: 'export const a = 1\n' }])
})

test('#423 the conversation of an idle machine that the sweep deleted runs its next turn on a new machine, with the files its mirror kept', async (t) => {
  const seen = []
  const run = await harness(t, {
    turn: ({ checkout }) => {
      seen.push(listFiles(checkout).filter((path) => !path.startsWith('.git/')))
      if (seen.length === 1) {
        writeFileSync(join(checkout, 'stray.txt'), 'left behind\n')
        return { reason: 'error', userMessageId: 'user-message', summary: '' }
      }
      return completed()
    },
  })
  await run.start()
  assert.equal(await run.settled(), true)
  assert.equal(run.mirror() === null, false, 'the first turn left its files in the mirror')
  const deleted = []
  const log = []
  const day = 86_400_000
  const now = Date.now()
  await sweepIdleMachines({
    listPaused: async () => [{ providerSandboxId: 'ivm-idle', conversationId, idleSince: new Date(now - 8 * day) }],
    openRunConversations: async () => new Set(),
    kill: async (ids) => { deleted.push(...ids); run.loseVm('sbx-new'); return ids },
    log: (line) => log.push(line),
    now: () => now,
  })
  assert.deepEqual(deleted, ['ivm-idle'])
  assert.deepEqual(log, [`BUILDER_IDLE_MACHINE_DELETED:${conversationId}:ivm-idle:8d`])
  await run.again()
  assert.equal(await run.settled(), true)
  await run.service.close()
  assert.deepEqual(seen[1], ['AGENTS.md', 'app/index.html', 'stray.txt'], 'the new machine holds the mirror\'s files')
  assert.deepEqual(run.calls.filter(([kind]) => kind === 'sandbox').map(([, id]) => id).at(-1), 'sbx-new', 'the run recorded the new machine')
})

test("a turn's end logs the hosts its sandbox reached, and the recorders start once per sandbox", async (t) => {
  const run = await harness(t, { turn: async () => completed() })
  run.egress.pending.dns.push({ t: 1000, name: 'registry.npmjs.org', ips: ['104.16.0.1'] })
  run.egress.pending.tcp.push({ t: 2000, ip: '104.16.0.1', port: 443 }, { t: 3000, ip: '104.16.0.1', port: 443 })
  await run.start()
  assert.equal(await run.settled(), true)
  assert.equal(run.egress.starts, 1)
  assert.equal(run.egress.installs, 2)
  assert.deepEqual(run.egressLogs.filter((line) => line.startsWith('BUILDER_SANDBOX_EGRESS:')), [
    `BUILDER_SANDBOX_EGRESS:${runId}:${conversationId}:registry.npmjs.org:443:tcp:${new Date(2000).toISOString()}:2`,
  ])
  assert.match(run.egressLogs.at(-1), new RegExp(`^BUILDER_SANDBOX_EGRESS_SUMMARY:${runId}:(complete|partial):1$`))
  await run.again()
  assert.equal(await run.settled(), true)
  await run.service.close()
  assert.equal(run.egress.starts, 1)
})

test('a poll that fails is logged and the run still completes', async (t) => {
  const run = await harness(t, { turn: async () => completed() })
  run.egress.pollError = true
  const original = run.egress
  original.running = false
  const start = original.starts
  await run.start()
  assert.equal(await run.settled(), true)
  await run.service.close()
  assert.equal(original.starts, start + 1)
  assert.ok(run.egressLogs.some((line) => line.startsWith(`BUILDER_SANDBOX_EGRESS_COLLECT_FAILED:${runId}:`)))
  assert.ok(run.egressLogs.includes(`BUILDER_SANDBOX_EGRESS_SUMMARY:${runId}:failed:0`))
  assert.deepEqual(run.logs.filter((line) => line.startsWith('BUILDER_SANDBOX_EGRESS')), [])
})

test('a failed run without a cause still logs BUILDER_RUN_FAILED with its code and run id, never the message text', async (t) => {
  const coded = await harness(t, { turn: () => { throw new Error('BUILDER_MODEL_INCOMPLETE') } })
  await coded.start()
  await coded.service.close()
  assert.deepEqual(coded.logs.filter((line) => line.startsWith('BUILDER_RUN_FAILED')), ['BUILDER_RUN_FAILED:11111111-1111-4111-8111-111111111111:BUILDER_MODEL_INCOMPLETE'])
  const prose = await harness(t, { turn: () => { throw new Error('the tool said sk-secret-token') } })
  await prose.start()
  await prose.service.close()
  assert.deepEqual(prose.logs.filter((line) => line.startsWith('BUILDER_RUN_FAILED')), ['BUILDER_RUN_FAILED:11111111-1111-4111-8111-111111111111:BUILDER_PREPARATION_FAILED'])
  assert.equal(prose.logs.some((line) => line.includes('sk-secret-token')), false)
})

const SUSPENDED = { reason: 'suspended', userMessageId: 'user-message', summary: '' }
const parkedLife = (run) => run.events.filter((event) => ['pause', 'session-release', 'instance-release', 'kill'].includes(event))
const evictions = (run) => run.logs.filter((line) => line.startsWith('BUILDER_PARKED_SESSION_EVICTED'))
const parks = async (run) => {
  await run.start()
  await until(() => run.calls.some(([kind, phase]) => kind === 'phase' && phase === 'PARKED') && run.events.includes('pause'), 'the park')
}

test('a parked run keeps its session and sandbox instance until the warm limit, then lets both go with the VM left paused', async (t) => {
  const run = await harness(t, { warmParkedMs: 40, turn: async () => SUSPENDED })
  await parks(run)
  assert.deepEqual(parkedLife(run), ['pause'], 'parking pauses the VM and keeps the session and the instance')
  await until(() => evictions(run).length > 0, 'the warm limit')
  assert.deepEqual(parkedLife(run), ['pause', 'session-release', 'instance-release'])
  assert.deepEqual(evictions(run), [`BUILDER_PARKED_SESSION_EVICTED:${runId}:TTL`])
  await run.service.close()
})

test("the answer's leg takes over what its parked run kept warm, so the warm limit lets nothing go under it", async (t) => {
  let turns = 0
  const run = await harness(t, { warmParkedMs: 40, turn: async () => (turns++ === 0 ? SUSPENDED : completed()) })
  await parks(run)
  await run.again()
  assert.equal(await run.settled(), true)
  await new Promise((wake) => { setTimeout(wake, 120) })
  assert.deepEqual(evictions(run), [])
  assert.deepEqual(parkedLife(run), ['pause', 'pause', 'session-release'], 'only the answering leg released the session, once its end was published')
  await run.service.close()
})

test('the heap check lets go of every warm parked run at once and answers how many, and a second call finds none', async (t) => {
  const run = await harness(t, { turn: async () => SUSPENDED })
  await parks(run)
  assert.equal(await run.runtime.evictParked(), 1)
  assert.equal(await run.runtime.evictParked(), 0)
  assert.deepEqual(parkedLife(run), ['pause', 'session-release', 'instance-release'])
  assert.deepEqual(evictions(run), [`BUILDER_PARKED_SESSION_EVICTED:${runId}:HEAP`])
  await run.service.close()
})

test('a discard settles the open call first and then lets go of what the parked run kept warm', async (t) => {
  const run = await harness(t, { turn: async () => SUSPENDED })
  await parks(run)
  await run.runtime.discardParked({ projectId, conversationId })
  assert.deepEqual(run.discards, [true], 'the call was settled on the live session')
  assert.deepEqual(parkedLife(run), ['pause', 'session-release', 'instance-release'])
  assert.deepEqual(evictions(run), [`BUILDER_PARKED_SESSION_EVICTED:${runId}:ENDED`])
  assert.equal(await run.runtime.evictParked(), 0, 'nothing is left warm')
  await run.service.close()
})
