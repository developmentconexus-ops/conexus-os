import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { startFakeGithub } from './builder-factory-fake-github.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const hubBuild = mkdtempSync(resolve(repositoryRoot, 'apps/hub/builder-factory-runtime-build-'))
process.once('exit', () => rmSync(hubBuild, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', hubBuild,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
const built = (path) => pathToFileURL(resolve(hubBuild, path)).href
const { createBuilderService } = await import(built('builder/service.js'))
const { createFactoryCodingWorkerRuntime, factoryAgentInstructions } = await import(built('builder/factory-runtime.js'))
const { createGithubApp } = await import(built('builder/factory-github.js'))

const BASE = 'b'.repeat(40)
const RESULT = 'c'.repeat(40)
const OUTSIDE = 'e'.repeat(40)
const runId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'
const accountId = '33333333-3333-4333-8333-333333333333'
const conversationId = '44444444-4444-4444-8444-444444444444'
const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem' })
const listing = `100644 blob ${'d'.repeat(40)}      120\tapp/index.html\n`

const harness = async (t, { mode = 'BUILD', result = RESULT, head = BASE, turn, build, starter, pushExit = 0, reapExit = 0, onStart, onCommand } = {}) => {
  const github = await startFakeGithub()
  t.after(() => github.close())
  const repository = github.addRepository({ owner: 'acme-org', name: 'app', head })
  const binding = {
    projectId, factoryProjectId: 'factory-project', projectRepositoryId: 'project-repository', repositoryId: 'repository-row',
    repositoryExternalId: repository.id, repositorySlug: 'acme-org/app', defaultBranch: 'main', boundAt: '2026-09-21T12:00:00.000Z',
  }
  const events = []
  const calls = []
  const diagnostics = []
  const logs = []
  const invocations = []
  let buildStarted
  const buildRunning = new Promise((started) => { buildStarted = started })
  const sandbox = {
    sandboxId: 'sbx-1',
    start: async () => { events.push('start'); onStart?.(sandbox) },
    writeFiles: async () => {},
    reapAgentProcesses: async () => {
      events.push('reap')
      return { exitCode: reapExit, success: reapExit === 0, stdout: '', stderr: '' }
    },
    executeCommand: async (command, args = [], options = {}) => {
      const line = [command, ...args].join(' ')
      onCommand?.(sandbox, line)
      events.push(line)
      invocations.push({ argv: [command, ...args], env: options.env })
      if (line.includes('add --all')) return { exitCode: 0, success: true, stdout: `${result}\n`, stderr: '' }
      if (line.includes(' push ')) return { exitCode: pushExit, success: pushExit === 0, stdout: '', stderr: pushExit ? `fatal: https://x-access-token:${github.state.tokens.at(-1)?.token}@github.com refused` : '' }
      if (line.includes('ls-tree')) return { exitCode: 0, success: true, stdout: listing, stderr: '' }
      return { exitCode: 0, success: true, stdout: '', stderr: '' }
    },
    buildApplication: async (_appRoot, signal) => {
      events.push('build')
      buildStarted()
      if (build) return build(signal)
      return [{ path: 'index.html', mediaType: 'text/html', sha256: 'f'.repeat(64), bytes: 'PGh0bWw+' }]
    },
  }
  const runtime = createFactoryCodingWorkerRuntime({
    openSession: async (input) => {
      events.push(['open', input.conversationId, input.builderRunId])
      return {
        sandbox,
        configure: async ({ mode: configured, instructions }) => { events.push(['configure', configured, instructions.includes('/workspace/app')]) },
        hasModelSelection: () => true,
        sendTurn: async (_content, signal) => {
          events.push('turn')
          if (turn) return turn({ signal, sandbox })
          return { reason: 'complete', endedAt: new Date(), userMessageId: 'user-message', summary: 'Pronto.' }
        },
        close: async () => { events.push('close') },
      }
    },
    github: createGithubApp({ appId: '5015512', privateKey, baseUrl: github.baseUrl }),
    installationFor: async () => 163574754,
    materializeStarter: async () => { events.push('starter'); await starter?.() },
    log: (line) => { logs.push(line) },
  })
  const claimed = { builderRunId: runId, projectId, conversationId, state: 'RUNNING', phase: 'PREPARING', mode, baseSourceRevision: BASE, resultSourceRevision: null, resultKind: null, failureCode: null }
  const store = {
    createBuilderRun: async () => ({ ...claimed, state: 'QUEUED', phase: null }),
    claimBuilderRun: async () => claimed,
    setBuilderRunPhase: async (_id, phase) => { calls.push(['phase', phase]) },
    bindBuilderRunMessage: async (_id, messageId) => { calls.push(['message', messageId]) },
    bindBuilderRunSandbox: async (_id, sandboxId) => { calls.push(['sandbox', sandboxId]) },
    settleBuilderRun: async (input) => { calls.push(['settle', input.resultKind]) },
    advanceBuilderRunSource: async (_id, revision) => { calls.push(['advance', revision]) },
    settleBuilderRunBuild: async (input) => { calls.push(['settleBuild', input.sourceRevision, input.failureCode ?? null]) },
    failBuilderRun: async (_id, code) => { calls.push(['fail', code]) },
    interruptBuilderRun: async (_id, reason) => { calls.push(['interrupt', reason]) },
    requestBuilderRunCancellation: async () => ({ ...claimed, cancellationRequested: true }),
    close: async () => {},
  }
  const service = createBuilderService({
    store,
    source: { prepareProjectSource: () => { throw new Error('a Factory run never exports a source bundle') } },
    runtime: { kind: 'REMOTE_E2B', execute: async () => { throw new Error('a Factory run never reaches the legacy runtime') } },
    applicationArtifacts: {},
    factory: {
      runtime,
      readBindingForRun: async () => binding,
      appendDiagnostic: async (input) => { diagnostics.push({ ...input, from: 'service' }) },
      recoverAdmissions: async () => [],
    },
  })
  const start = () => service.createBuilderRun({ accountId, projectId, conversationId, idempotencyKey: 'key', content: 'Mostre UNIT1-nonce', mode })
  const main = () => github.state.refs.get('acme-org/app:main')
  const patches = () => github.state.requests.filter((request) => request.method === 'PATCH')
  const commands = () => events.filter((event) => typeof event === 'string')
  return { github, events, invocations, calls, diagnostics, logs, service, start, main, patches, commands, buildRunning }
}

test('a compare-and-swap GitHub refuses with 422 settles BUILDER_SOURCE_BASE_MOVED and leaves main alone', async (t) => {
  const run = await harness(t)
  run.github.state.patchResponder = () => ({ status: 422, body: { message: 'Update is not a fast forward' } })
  await run.start()
  await run.service.close()
  assert.equal(run.patches().length, 1)
  assert.equal(run.main(), BASE)
  assert.deepEqual(run.calls.filter(([kind]) => kind === 'fail' || kind === 'advance'), [['fail', 'BUILDER_SOURCE_BASE_MOVED']])
  assert.deepEqual(run.diagnostics, [{
    projectId, conversationId, builderRunId: runId, code: 'BUILDER_SOURCE_BASE_MOVED', outcome: 'SOURCE_BASE_MOVED', sourceRevision: BASE, from: 'service',
  }])
})

test('a default branch moved by someone else is never patched and settles BUILDER_SOURCE_BASE_MOVED', async (t) => {
  const run = await harness(t)
  let firstRead = true
  const originalGet = run.github.state.refs.get.bind(run.github.state.refs)
  run.github.state.refs.get = (key) => {
    if (key === 'acme-org/app:main' && firstRead && run.events.includes('build')) { firstRead = false; run.github.state.refs.set(key, OUTSIDE) }
    return originalGet(key)
  }
  await run.start()
  await run.service.close()
  assert.deepEqual(run.patches(), [])
  assert.equal(run.main(), OUTSIDE)
  assert.deepEqual(run.calls.filter(([kind]) => kind === 'fail' || kind === 'advance'), [['fail', 'BUILDER_SOURCE_BASE_MOVED']])
})

test('a stop during the compile never sends the PATCH and settles the run interrupted', async (t) => {
  const run = await harness(t, {
    build: (signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('APPLICATION_COMPILER_CANCELLED')), { once: true })),
  })
  await run.start()
  await run.buildRunning
  await run.service.cancelBuilderRun({ accountId, projectId, builderRunId: runId })
  await run.service.close()
  assert.deepEqual(run.patches(), [])
  assert.equal(run.main(), BASE)
  assert.deepEqual(run.calls.at(-1), ['interrupt', 'USER_CANCELLED'])
  assert.equal(run.calls.some(([kind]) => kind === 'advance'), false)
})

test('a stop that lands after the compile is still refused the PATCH', async (t) => {
  const context = {}
  const run = await harness(t, {
    build: async () => {
      await context.run.service.cancelBuilderRun({ accountId, projectId, builderRunId: runId })
      return [{ path: 'index.html', mediaType: 'text/html', sha256: 'f'.repeat(64), bytes: 'PGh0bWw+' }]
    },
  })
  context.run = run
  await run.start()
  await run.service.close()
  assert.deepEqual(run.patches(), [])
  assert.equal(run.main(), BASE)
  assert.deepEqual(run.calls.at(-1), ['interrupt', 'USER_CANCELLED'])
  assert.equal(run.calls.some(([kind, phase]) => kind === 'phase' && phase === 'SOURCE_ADMISSION'), false)
})

test('a stop that lands while the default head is read is still refused the PATCH', async (t) => {
  const run = await harness(t)
  const originalGet = run.github.state.refs.get.bind(run.github.state.refs)
  run.github.state.refs.get = (key) => {
    if (key === 'acme-org/app:main' && run.events.includes('build')) void run.service.cancelBuilderRun({ accountId, projectId, builderRunId: runId })
    return originalGet(key)
  }
  await run.start()
  await run.service.close()
  assert.deepEqual(run.patches(), [])
  assert.equal(run.main(), BASE)
  assert.deepEqual(run.calls.at(-1), ['interrupt', 'USER_CANCELLED'])
  assert.equal(run.calls.some(([kind]) => kind === 'advance'), false)
})

test('a replaced sandbox incarnation fails the run with BUILDER_SANDBOX_INCARNATION_CHANGED', async (t) => {
  const run = await harness(t, {
    turn: ({ sandbox }) => {
      sandbox.sandboxId = 'sbx-2'
      return { reason: 'complete', endedAt: new Date(), userMessageId: 'user-message', summary: '' }
    },
  })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['fail', 'BUILDER_SANDBOX_INCARNATION_CHANGED'])
  assert.equal(run.commands().some((line) => line.includes(' push ')), false)
  assert.deepEqual(run.patches(), [])
})

test('a build failure still admits the source by PATCH and settles SOURCE_CHANGED_BUILD_FAILED', async (t) => {
  const run = await harness(t, { build: async () => { throw new Error('APPLICATION_COMPILATION_FAILED') } })
  await run.start()
  await run.service.close()
  assert.equal(run.main(), RESULT)
  assert.deepEqual(run.patches().map((request) => request.body), [{ sha: RESULT, force: false }])
  assert.deepEqual(run.calls.filter(([kind]) => kind === 'advance' || kind === 'settleBuild' || kind === 'fail'), [
    ['advance', RESULT], ['settleBuild', RESULT, 'APPLICATION_COMPILATION_FAILED'],
  ])
  assert.deepEqual(run.diagnostics, [{
    projectId, conversationId, builderRunId: runId, code: 'APPLICATION_COMPILATION_FAILED', outcome: 'BUILD_FAILED', sourceRevision: RESULT, from: 'service',
  }])
})

test('the base is pinned by fetch, reset, clean and checkout, and HEAD is checked against it before the agent runs', async (t) => {
  const run = await harness(t, { build: async () => { throw new Error('APPLICATION_COMPILATION_FAILED') } })
  await run.start()
  await run.service.close()
  const git = "git -C '/workspace/app'"
  const pinIndex = run.events.findIndex((event) => typeof event === 'string' && event.includes(' fetch '))
  const pin = run.events[pinIndex]
  assert.equal(pin, `sh -c ${git} fetch --quiet --no-tags 'https://github.com/acme-org/app.git' '${BASE}' && ${git} reset --quiet --hard && ${git} clean -fdq && ${git} checkout --quiet -B 'conexus/${conversationId}' '${BASE}' && test "$(${git} rev-parse HEAD)" = '${BASE}'`)
  assert.ok(pinIndex < run.events.indexOf('turn'), 'the pin runs before the agent turn')
  assert.ok(run.events.indexOf('start') < pinIndex, 'the pin runs after the Factory start hook')
  const scrubs = run.commands().filter((line) => line.includes('remote set-url origin'))
  assert.equal(scrubs.length, 3)
})

test('a retry that finds the default branch already at the result counts it admitted without a PATCH', async (t) => {
  const run = await harness(t, { head: RESULT, build: async () => { throw new Error('APPLICATION_COMPILATION_FAILED') } })
  run.github.state.refs.set('acme-org/app:main', BASE)
  const originalGet = run.github.state.refs.get.bind(run.github.state.refs)
  run.github.state.refs.get = (key) => (key === 'acme-org/app:main' && run.events.includes('build') ? RESULT : originalGet(key))
  await run.start()
  await run.service.close()
  assert.deepEqual(run.patches(), [])
  assert.deepEqual(run.calls.filter(([kind]) => kind === 'advance' || kind === 'settleBuild'), [['advance', RESULT], ['settleBuild', RESULT, 'APPLICATION_COMPILATION_FAILED']])
})

test('a PLAN run that changed files is refused before anything is pushed', async (t) => {
  const run = await harness(t, { mode: 'PLAN' })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['fail', 'BUILDER_PLAN_SOURCE_RESULT_REFUSED'])
  assert.equal(run.commands().some((line) => line.includes(' push ')), false)
  assert.equal(run.events.includes('starter'), false)
})

test('Git tokens are scoped to the one repository, used inline, and never reach a message or a log', async (t) => {
  const run = await harness(t, { pushExit: 1 })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['fail', 'BUILDER_SOURCE_PUSH_FAILED'])
  const minted = run.github.state.tokens.map(({ repositoryIds, permissions }) => ({ repositoryIds, permissions }))
  // @octokit/auth-app reuses a live token minted for the same repository and permissions.
  assert.deepEqual(minted, [{ repositoryIds: [700001], permissions: { contents: 'write' } }])
  assert.equal(run.commands().some((line) => /remote add|credential\.helper [^-]|config --global/.test(line.replace('--unset-all credential.helper', ''))), false)
  assert.doesNotMatch(JSON.stringify([run.calls, run.logs, run.diagnostics]), /ghs_/)
})

test('a token never reaches argv, rides only in the git command environment, and a root reap precedes it', async (t) => {
  const run = await harness(t, { build: async () => { throw new Error('APPLICATION_COMPILATION_FAILED') } })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.github.state.tokens.map(({ token, permissions }) => [token, permissions]), [
    ['ghs_fake_1', { contents: 'write' }], ['ghs_fake_2', { contents: 'read' }],
  ])
  for (const { argv } of run.invocations) {
    for (const part of argv) {
      assert.doesNotMatch(part, /x-access-token:|ghs_fake_/)
    }
  }
  const header = {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from('x-access-token:ghs_fake_1').toString('base64')}`,
    GIT_TERMINAL_PROMPT: '0',
  }
  const bearing = run.invocations.filter(({ env }) => env && Object.keys(env).length > 0)
  assert.deepEqual(bearing.map(({ argv, env }) => [/ fetch /.test(argv.at(-1)) ? 'fetch' : / push /.test(argv.at(-1)) ? 'push' : argv.at(-1), env]), [
    ['fetch', header], ['push', header],
  ])
  assert.ok(run.invocations.every(({ env }) => env !== undefined), 'every command states its environment')
  for (const { argv } of bearing) {
    const index = run.events.indexOf(argv.join(' '))
    assert.equal(run.events[index - 1], 'reap', `a reap runs immediately before: ${argv.at(-1)}`)
  }
})

test('an agent that aborts with no stop from the person fails with a named reason, never as cancelled by them', async (t) => {
  const endedAt = new Date('2026-09-21T15:00:00.000Z')
  const run = await harness(t, { turn: () => ({ reason: 'aborted', endedAt, userMessageId: 'user-message', summary: '' }) })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.logs, [`BUILDER_FACTORY_AGENT_END:aborted:${runId}:2026-09-21T15:00:00.000Z`])
  assert.notDeepEqual(run.calls.at(-1), ['interrupt', 'USER_CANCELLED'])
  assert.ok(JSON.stringify(run.calls.at(-1)).includes('BUILDER_MODEL_INCOMPLETE'), JSON.stringify(run.calls.at(-1)))
  assert.equal(run.commands().some((line) => line.includes(' push ')), false)
})

test('a run that reached the agent and admitted nothing leaves one note that its edits were discarded at the base', async (t) => {
  const run = await harness(t, { turn: () => ({ reason: 'error', endedAt: new Date(), userMessageId: 'user-message', summary: 'Concluído.' }) })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['fail', 'BUILDER_MODEL_INCOMPLETE'])
  assert.deepEqual(run.diagnostics, [{
    projectId, conversationId, builderRunId: runId, code: 'BUILDER_MODEL_INCOMPLETE', outcome: 'RUN_NOT_FINISHED', sourceRevision: BASE, from: 'service',
  }])
})

test('a run the person stopped during the agent turn also leaves the discarded note', async (t) => {
  const context = {}
  const run = await harness(t, {
    turn: async () => {
      await context.run.service.cancelBuilderRun({ accountId, projectId, builderRunId: runId })
      return { reason: 'aborted', endedAt: new Date(), userMessageId: 'user-message', summary: '' }
    },
  })
  context.run = run
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['interrupt', 'USER_CANCELLED'])
  assert.deepEqual(run.diagnostics.map(({ code, outcome, sourceRevision }) => [code, outcome, sourceRevision]), [['BUILDER_RUN_CANCELLED', 'RUN_NOT_FINISHED', BASE]])
})

test('a reap that does not finish refuses the token-bearing command with BUILDER_SANDBOX_REAP_FAILED', async (t) => {
  const run = await harness(t, { reapExit: 3 })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['fail', 'BUILDER_SANDBOX_REAP_FAILED'])
  assert.deepEqual(run.diagnostics, [], 'a run that never reached the agent has no edits to disown')
  assert.deepEqual(run.github.state.tokens.length, 1)
  assert.equal(run.commands().some((line) => line.includes(' fetch ')), false)
  assert.equal(run.events.includes('turn'), false)
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
    ['sandbox', 'sbx-recreated'], ['advance', RESULT],
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
  assert.deepEqual(run.logs, [`BUILDER_FACTORY_RUN_FAILED:${runId}:BUILDER_STARTER_ENTRY_INSPECTION_FAILED {"exitCode":1,"stdout":"","stderr":"Error: sandbox not found"}`])
})

test('the Factory agent is told to run the application check, and not that the compiler runs elsewhere', () => {
  const instructions = factoryAgentInstructions('/workspace/app')
  assert.match(instructions, /^Work only in the exact Session Workspace at \/workspace\/app\./)
  assert.ok(instructions.endsWith('Before finishing a BUILD, run `sh conexus/check.sh` at the repository root and fix what it reports.'))
  assert.ok(instructions.includes(' The conversation history can describe edits from earlier turns that were discarded; trust the files in the workspace over the history. '))
  assert.doesNotMatch(instructions, /compiler runs separately|\/workspace\/repo/)
})
