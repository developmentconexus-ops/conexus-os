import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { connectorRecord } from './connector-record.mjs'
import { hubModuleUrl } from './hub-build.mjs'

import {
  endLines, failureLines, runId, projectId, accountId, conversationId, AGENTS_MD, CONNECTOR_BRIEF_UNBOUND, CONNECTOR_BRIEF_UNAVAILABLE, BASE_FILES, GIT_ENV, completed, listFiles, PASSING_REPORT, failedReport, harness, Failure, sweepIdleMachines, conexusInstructions, RequestContext, STARTER,
} from './builder-run-harness.mjs'

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
  assert.deepEqual(report, { ok: true, steps: PASSING_REPORT.steps }, 'the agent reads the steps only, never the bundle hash or the artifact')
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
  assert.deepEqual({ killed: run.killed, idled: run.idled }, { killed: ['sbx-2'], idled: [] }, 'a VM replaced mid-turn is killed, never kept')
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
  assert.deepEqual(failureLines('BUILDER_SANDBOX_KEEPALIVE_FAILED'), [])
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
  assert.deepEqual(failureLines('BUILDER_SANDBOX_KEEPALIVE_FAILED').map((line) => line.level), ['error'], 'one line, at the run end')
  assert.deepEqual({ killed: run.killed, idled: run.idled }, { killed: ['sbx-1'], idled: [] }, 'a VM whose keepalive lapsed is killed, never kept')
})

test("a check that fails in Conexus fails the run with its code, keeps the files in the mirror and leaves main at the base", async (t) => {
  const run = await harness(t, { build: async () => {
    await new Promise((settle) => { setTimeout(settle, 1100) })
    throw new Failure('APPLICATION_SMOKE_FAILED')
  } })
  await run.start()
  await run.service.close()
  assert.equal(await run.main(), run.base)
  assert.deepEqual(run.calls.filter(([kind]) => kind === 'advance' || kind === 'settleBuild' || kind === 'fail'), [['fail', 'APPLICATION_SMOKE_FAILED']])
  assert.equal(run.mirror(), run.result())
  assert.equal(run.checks.length, 2, 'a Conexus failure is not kept: settling checks once more, and nothing sent the agent back to work')
  assert.deepEqual(run.feedbacks, [])
})

test('a session whose delete fails does not discard a candidate whose build passed', async (t) => {
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
  assert.ok(endLines.some((line) => line.message === 'BUILDER_SESSION_RELEASE_FAILED'), 'the failure is logged, not silenced')
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
  assert.deepEqual(run.sessions.at(-1), { builderRunId: runId, conversationId, mirrorHead: merge, syncedMain: other, turnEnded: true })
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
  const checkRoot = '/var/lib/conexus-build/candidate'
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
  assert.deepEqual(run.timings.map((fields) => fields['builder.run_id']), [runId], 'one timing event per run')
  const stages = Object.entries(run.timings[0]).flatMap(([key, value]) => {
    const stage = /^builder\.stage\.(\w+)_ms$/.exec(key)?.[1]
    return stage ? [[stage, value]] : []
  })
  for (const [stage, value] of stages) assert.ok(Number.isInteger(value) && value >= 0, `${stage} is whole milliseconds`)
  return stages.map(([stage]) => stage)
}

test('each run logs one BUILDER_RUN_TIMING event with the stages it reached, in run order', async (t) => {
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

test('an agent that aborts with no stop from the person fails with a named reason, never as cancelled by them', async (t) => {
  const run = await harness(t, { turn: () => ({ reason: 'aborted', userMessageId: 'user-message', summary: '' }) })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.logs, [`BUILDER_TURN_CHECKOUT:${runId}:SEEDED:sbx-1`, `BUILDER_AGENT_END:${runId}:aborted`])
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
    'Resolva estes problemas e diga que terminou: o Conexus verifica o app quando você terminar.',
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
  assert.deepEqual(run.logs.filter((line) => line.startsWith('BUILDER_CHECK:')), [`BUILDER_CHECK:${runId}:${run.result().slice(0, 12)}:${steps}`])
})

test('the Hub check is placed at run start by its hash, root owned and read only, before the agent runs', async (t) => {
  const { CHECK_BUNDLE } = await import('./builder-run-harness.mjs')
  const run = await harness(t)
  await run.start()
  await run.service.close()
  const entry = `/opt/conexus/check/${CHECK_BUNDLE.sha256}/main.mjs`
  const install = run.events.findIndex((event) => Array.isArray(event) && event[0] === 'rootFile' && event[1].startsWith('/opt/conexus/check/.tmp-'))
  assert.ok(install > -1 && install < run.events.indexOf('turn'), 'installed before the agent turn')
  const placed = join(run.vm, entry)
  assert.deepEqual(readFileSync(placed), Buffer.from(CHECK_BUNDLE.bytes), 'the placed file is the Hub bundle')
  assert.equal(statSync(placed).mode & 0o777, 0o444)
  assert.equal(readdirSync(join(run.vm, 'opt/conexus/check')).filter((name) => name.startsWith('.tmp-')).length, 0, 'no staging directory is left')
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

test("a run checks its start model once, names its payer in every turn's context, and keeps the conversation's sandbox however it ends: the agent's processes are killed, then the VM is left its idle window", async (t) => {
  const ok = await harness(t)
  await ok.start()
  await ok.service.close()
  const failed = await harness(t, { turn: () => ({ reason: 'error', userMessageId: 'user-message', summary: '' }) })
  await failed.start()
  await failed.service.close()
  for (const run of [ok, failed]) {
    assert.deepEqual(run.events.filter((event) => Array.isArray(event) && event[0] === 'model-check'), [['model-check', runId, accountId]])
    assert.equal(run.sessionContext.get('conexusBuilderAccountId'), accountId)
    assert.deepEqual({ idled: run.idled, killed: run.killed }, { idled: ['sbx-1'], killed: [] })
    const processesKilled = run.events.lastIndexOf('sh -c kill -KILL -1 2>/dev/null; true')
    assert.ok(run.events.indexOf('turn') < processesKilled && processesKilled < run.events.indexOf('idle'), 'the agent\'s processes die after its turn and before the idle window starts')
    assert.equal(run.events.filter((event) => event !== 'session-release').at(-1), 'idle', 'the idle window is the last step of the run itself; only the session closes after it')
  }
})

test('a run deletes the session it opened, once, after the agent and its admission, whether it completed, failed, threw or aborted', async (t) => {
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
  for (const run of [completedRun, failedTurn, thrown, stopped]) assert.deepEqual(run.events.filter((event) => event === 'session-release'), ['session-release'])
  for (const run of [completedRun, failedTurn, thrown, stopped]) {
    assert.ok(run.events.indexOf('session-release') > run.events.indexOf('turn'), 'the session outlives the agent turn')
    assert.equal(run.events.at(-1), 'session-release', 'and is held through the terminal publication, so it closes last, after the VM is let go')
  }
  assert.ok(completedRun.events.indexOf('check') < completedRun.events.indexOf('session-release'), 'the browser stream sees the admission and the check in the session')
})

test('a seed the checkout cannot fetch refuses the pin with BUILDER_SOURCE_BASE_PIN_REFUSED before the agent runs', async (t) => {
  const run = await harness(t, { corruptSeed: true })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['fail', 'BUILDER_SOURCE_BASE_PIN_REFUSED'])
  assert.deepEqual(run.logs, [])
  const [line] = endLines.splice(0)
  assert.deepEqual([line.level, line.message, line.fields['builder.run_id']], ['error', 'BUILDER_SOURCE_BASE_PIN_REFUSED', runId])
  assert.match(line.fields['builder.run.evidence'], /^\{"exitCode":128,/)
  assert.deepEqual(run.diagnostics, [], 'a run that never reached the agent has no edits to disown')
  assert.equal(run.events.includes('turn'), false)
  assert.deepEqual({ killed: run.killed, idled: run.idled }, { killed: ['sbx-1'], idled: [] }, 'a checkout that cannot take the start takes its VM with it')
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
    assert.deepEqual({ killed: run.killed, idled: run.idled }, { killed: ['sbx-1'], idled: [] }, `${code}: the VM the start holds is killed, never left to pause`)
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
  assert.deepEqual(failureLines('BUILDER_SANDBOX_KILL_FAILED').map((line) => line.fields['exception.type']), ['Error'])
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
      throw new Failure('BUILDER_STARTER_ENTRY_INSPECTION_FAILED', { cause: { exitCode: 1, stdout: '', stderr: 'Error: sandbox not found' } })
    },
  })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['fail', 'BUILDER_STARTER_ENTRY_INSPECTION_FAILED'])
  assert.deepEqual(run.logs, [`BUILDER_TURN_CHECKOUT:${runId}:SEEDED:sbx-1`])
  const [line] = endLines.splice(0)
  assert.deepEqual([line.message, line.fields['builder.run.evidence']], ['BUILDER_STARTER_ENTRY_INSPECTION_FAILED', '{"exitCode":1,"stdout":"","stderr":"Error: sandbox not found"}'])
})

const briefOnly = (brief) => async () => ({ brief, bind: () => {}, end: () => {} })

test("the run hands its own Project's connector brief to the session context, and an empty one when the port is absent", async (t) => {
  const opened = []
  const withBrief = await harness(t, { openConnectorRun: async (input) => { opened.push(input); return briefOnly('CONNECTOR_BRIEF_MARKER')() } })
  await withBrief.start()
  await withBrief.service.close()
  assert.deepEqual(opened, [{ projectId, accountId, builderRunId: runId }])
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
  const other = await openRun({ projectId: otherProjectId, accountId, builderRunId: runId })
  assert.ok(other.brief.includes('- `other-project-binding`: sankhya (skill `conexus-sankhya`)'), 'the other Project is told its own binding')

  const run = await harness(t, { openConnectorRun: openRun })
  await run.start()
  await run.service.close()
  const instructions = run.sessionContext.get('conexusConnectorBrief')
  assert.equal(instructions, CONNECTOR_BRIEF_UNBOUND, 'told it has no Connection, and what to do')
  for (const leak of ['other-project-binding', otherBinding.connectionId, 'connectors.call']) {
    assert.equal(instructions.includes(leak), false, leak)
  }
})

test('a Project bound to Sankhya gets its own bindings, and is never told to refuse for lack of a Connection', async (t) => {
  const binding = { bindingId: '88888888-8888-4888-8888-888888888888', name: 'erp', connectionId: '99999999-9999-4999-8999-999999999999', connectorId: 'sankhya' }
  const run = await harness(t, { openConnectorRun: await connectorRuns({ listBindings: async () => [binding] }) })
  await run.start()
  await run.service.close()
  const instructions = run.sessionContext.get('conexusConnectorBrief')
  assert.ok(instructions.startsWith('- `erp`: sankhya (skill `conexus-sankhya`)\n'), 'its own brief lists its binding with the skill that teaches it')
  assert.equal(instructions.includes(CONNECTOR_BRIEF_UNBOUND), false)
})

test('a run whose connector bindings cannot be read still runs, told only that connector data is out of reach', async (t) => {
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
    'the check fails in Conexus after the turn': { build: async () => { throw new Failure('APPLICATION_SMOKE_FAILED') } },
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
  assert.deepEqual([run.calls.at(-1), minted.map((scope) => isMintedScope(scope))], [['fail', 'INTERNAL_UNEXPECTED'], [false]])
})

test('a run whose session cannot open still lets its VM go and leaves it to pause', async (t) => {
  const run = await harness(t, { openError: new Error('BUILDER_SESSION_OPEN_FAILED') })
  await run.start()
  await run.settled()
  await run.service.close()
  const vmEvents = run.events.filter((event) => ['hold-open', 'release', 'idle', 'kill'].includes(event))
  assert.deepEqual([vmEvents, run.calls.at(-1), run.idled, run.killed], [['hold-open', 'release', 'idle'], ['fail', 'INTERNAL_UNEXPECTED'], ['sbx-1'], []])
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
  assert.deepEqual(failureLines('BUILDER_MIRROR_FAILED'), [])
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
  assert.deepEqual(run.sessions, [{ builderRunId: runId, conversationId, mirrorHead: run.mirror(), syncedMain: run.base, turnEnded: true }])
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
  assert.deepEqual(run.sessions, [{ builderRunId: runId, conversationId, mirrorHead: result, syncedMain: run.base, turnEnded: true }])
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
  assert.deepEqual(failureLines('BUILDER_MIRROR_FAILED'), [])
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
  assert.deepEqual(failureLines('BUILDER_MIRROR_FAILED').map((line) => line.fields['exception.type']), ['Error'])
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
  assert.deepEqual(run.sandboxRefs, [{ projectId, conversationId }, { projectId, conversationId }])
  assert.deepEqual(run.calls.filter(([kind]) => kind === 'sandbox'), [['sandbox', 'sbx-1'], ['sandbox', 'sbx-1']])
  assert.deepEqual(run.logs.filter((line) => line.startsWith('BUILDER_TURN_CHECKOUT:')), [
    `BUILDER_TURN_CHECKOUT:${runId}:SEEDED:sbx-1`, `BUILDER_TURN_CHECKOUT:${runId}:RESUMED:sbx-1`,
  ])
  assert.deepEqual({ idled: run.idled, killed: run.killed }, { idled: ['sbx-1', 'sbx-1'], killed: [] })
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
    log: (code, fields) => log.push([code, ...Object.values(fields)].join(':')),
    now: () => now,
  }, new AbortController().signal)
  assert.deepEqual(deleted, ['ivm-idle'])
  assert.deepEqual(log, [`BUILDER_IDLE_MACHINE_DELETED:${conversationId}:ivm-idle:8`])
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
  assert.equal(failureLines('BUILDER_SANDBOX_EGRESS_COLLECT_FAILED').length, 1)
  assert.ok(run.egressLogs.includes(`BUILDER_SANDBOX_EGRESS_SUMMARY:${runId}:failed:0`))
  assert.deepEqual(run.logs.filter((line) => line.startsWith('BUILDER_SANDBOX_EGRESS')), [])
})

test('a failed run logs once through its row, at the row\'s level, with the run id', async (t) => {
  endLines.splice(0)
  const coded = await harness(t, { turn: () => { throw new Failure('BUILDER_MODEL_INCOMPLETE') } })
  await coded.start()
  await coded.service.close()
  assert.deepEqual(endLines.map((line) => [line.level, line.message, line.fields['builder.run_id']]), [['warn', 'BUILDER_MODEL_INCOMPLETE', '11111111-1111-4111-8111-111111111111']])
  endLines.splice(0)
  const prose = await harness(t, { turn: () => { throw new Error('the tool said something') } })
  await prose.start()
  await prose.service.close()
  assert.deepEqual(endLines.map((line) => [line.level, line.message]), [['error', 'INTERNAL_UNEXPECTED']])
  assert.equal(prose.logs.some((line) => line.includes('the tool said')), false)
})

const SUSPENDED = { reason: 'suspended', userMessageId: 'user-message', toolCallId: 'c1' }
const answer = (resumeData) => (service) => service.answerQuestion({ projectId, conversationId, toolCallId: 'c1', resumeData })
const phases = (run) => run.calls.filter(([kind]) => kind === 'phase').map(([, phase]) => phase)

test('an answer resumes the question on the same session and sandbox, and the run admits its change without preparing again', async (t) => {
  const run = await harness(t, {
    answers: [answer(['Azul'])],
    turn: async ({ checkout, resume }) => {
      if (!resume) return SUSPENDED
      assert.deepEqual(resume, { toolCallId: 'c1', resumeData: ['Azul'] })
      writeFileSync(join(checkout, 'app/index.html'), '<h1>UNIT1</h1>\n')
      return completed()
    },
  })
  await run.start()
  await run.service.close()
  assert.deepEqual(phases(run).slice(0, 4), ['PREPARING', 'AGENT', 'WAITING', 'AGENT'])
  assert.equal(run.events.filter((event) => event === 'start').length, 1, 'the VM started once')
  assert.equal(run.events.filter((event) => Array.isArray(event) && event[0] === 'open').length, 1, 'one session for the run')
  assert.deepEqual(run.events.filter((event) => event === 'hold-open' || event === 'release'), ['hold-open', 'release', 'hold-open', 'release'], 'the wait lets the VM go and the answer holds it again')
  assert.equal(await run.main(), run.result())
  assert.deepEqual(admissionCalls(run), [['candidate', run.result()], ['advance', run.result()], ['settleBuild', run.result(), null]])
})

test('the red budget counts across a question: the run after the answer has only what is left of it', async (t) => {
  const run = await harness(t, {
    report: failedReport('typecheck', CHECK_PROBLEMS),
    answers: [answer(['Azul'])],
    turn: async ({ checkout, finish, resume }) => {
      if (resume) return completed()
      writeFileSync(join(checkout, 'app/index.html'), '<h1>UNIT1</h1>\n')
      assert.match(await finish(), /\(1 de 3\)/)
      return SUSPENDED
    },
  })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.feedbacks.map((feedback) => /\((\d de 3)\)/.exec(feedback)[1]), ['1 de 3', '2 de 3', '3 de 3'])
  assert.deepEqual(run.calls.at(-1), ['fail', 'BUILDER_APP_NOT_FIXED'])
})

test('a message while the question waits ends the question and goes on as a plain turn of the same run', async (t) => {
  let turns = 0
  const run = await harness(t, {
    answers: [async (service) => {
      const taken = await service.sendBuilderMessage({ accountId, projectId, conversationId, idempotencyKey: 'second', content: 'Use verde' })
      assert.equal(taken.created, false)
      const again = await service.sendBuilderMessage({ accountId, projectId, conversationId, idempotencyKey: 'second', content: 'Use verde' })
      assert.equal(again.created, false, 'a resent message is taken once')
    }],
    turn: async ({ resume }) => {
      assert.equal(resume, undefined, 'a message is no answer')
      return turns++ === 0 ? SUSPENDED : completed()
    },
  })
  await run.start()
  await run.service.close()
  assert.equal(run.events.filter((event) => event === 'turn').length, 2, 'the message is a second SEND on the same session')
  assert.equal(run.calls.filter(([kind]) => kind === 'create').length, 1, 'no second run')
  assert.deepEqual(run.calls.at(-1), ['settle', 'RESPONSE_ONLY'])
})

test('a reply sent before the row says WAITING is refused, so a WAITING write that fails loses no message', async (t) => {
  const offered = []
  const run = await harness(t, {
    onWaitingWrite: async (service) => {
      offered.push(await service.sendBuilderMessage({ accountId, projectId, conversationId, idempotencyKey: 'early', content: 'Use verde' }).then(() => 'ACCEPTED', (error) => error.id))
      offered.push(service.answerQuestion({ projectId, conversationId, toolCallId: 'c1', resumeData: ['Azul'] }))
      return 'REFUSE'
    },
    persisted: (claimed) => ({ ...claimed, state: 'RUNNING', cancellationRequested: true }),
    turn: async () => SUSPENDED,
  })
  await run.start()
  await run.service.close()
  assert.deepEqual(offered, ['BUILDER_BUSY', 'ENDED'])
  assert.deepEqual(run.calls.at(-1), ['interrupt', 'USER_CANCELLED'], 'a refused phase write is a stop that won')
})

test('a Hub that stops while the claim fails ends the unclaimed row at once, as interrupted, with no lease pass', async (t) => {
  let run
  run = await harness(t, { claim: async () => { await new Promise((wake) => { setTimeout(wake, 0) }); run.service.stopRuns(); throw new Error('claim down') } })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.filter(([kind]) => kind.startsWith('end') || kind === 'fail' || kind === 'interrupt'), [['endUnclaimed', 'INTERRUPTED', 'HUB_RESTART']])
})

test('a phase write refused because the row already ended elsewhere writes no ending of its own', async (t) => {
  const run = await harness(t, {
    onWaitingWrite: async () => 'REFUSE',
    persisted: (claimed) => ({ ...claimed, state: 'INTERRUPTED', failureCode: 'HUB_RESTART' }),
    turn: async () => SUSPENDED,
  })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.filter(([kind]) => kind === 'interrupt' || kind === 'fail'), [], 'the ending a takeover wrote stands')
})

test('a phase write refused by a stop the row records ends the run USER_CANCELLED', async (t) => {
  const run = await harness(t, {
    onWaitingWrite: async () => 'REFUSE',
    persisted: (claimed) => ({ ...claimed, state: 'RUNNING', cancellationRequested: true }),
    turn: async () => SUSPENDED,
  })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['interrupt', 'USER_CANCELLED'])
})

test('a question nobody answers ends the run INTERRUPTED with BUILDER_QUESTION_EXPIRED, after the question ends', async (t) => {
  const run = await harness(t, { questionWaitMs: 20, turn: async () => SUSPENDED })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['interrupt', 'BUILDER_QUESTION_EXPIRED'])
  assert.ok(run.events.indexOf('end-questions') < run.events.indexOf('idle'), 'the question ends before the VM is let go')
  assert.equal(run.events.at(-1), 'session-release')
})

test('a stop while the question waits ends the run INTERRUPTED USER_CANCELLED, and an answer after it finds the question ended', async (t) => {
  const run = await harness(t, {
    answers: [async (service) => { await service.cancelBuilderRun({ accountId, projectId, builderRunId: runId }) }],
    turn: async () => SUSPENDED,
  })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['interrupt', 'USER_CANCELLED'])
  assert.ok(run.events.includes('end-questions'))
  assert.equal(run.service.answerQuestion({ projectId, conversationId, toolCallId: 'c1', resumeData: ['Azul'] }), 'ENDED')
})

test('a Hub that stops while a question waits ends the run INTERRUPTED HUB_RESTART without waiting out the question', async (t) => {
  const run = await harness(t, { questionWaitMs: 60 * 60_000, answers: [async (service) => { service.stopRuns() }], turn: async () => SUSPENDED })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['interrupt', 'HUB_RESTART'])
})

test('the answer outcomes: a second answer to the same call, a call the session does not hold, and a conversation with no run', async (t) => {
  const outcomes = []
  const run = await harness(t, {
    answers: [async (service) => {
      const offer = (toolCallId) => service.answerQuestion({ projectId, conversationId, toolCallId, resumeData: ['Azul'] })
      outcomes.push(offer('other'), offer('c1'), offer('c1'))
    }],
    turn: async ({ resume }) => (resume ? completed() : SUSPENDED),
  })
  await run.start()
  await run.service.close()
  assert.deepEqual(outcomes, ['UNKNOWN_CALL', 'ACCEPTED', 'ALREADY_ANSWERED'])
  assert.equal(run.service.answerQuestion({ projectId, conversationId, toolCallId: 'c1', resumeData: [] }), 'ENDED')
})
