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
// Between the base and the result in the result's own history.
const MIDDLE = '9'.repeat(40)
const runId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'
const accountId = '33333333-3333-4333-8333-333333333333'
const conversationId = '44444444-4444-4444-8444-444444444444'
const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem' })
const listing = `100644 blob ${'d'.repeat(40)}      120\tapp/index.html\n`

const harness = async (t, { mode = 'BUILD', result = RESULT, head = BASE, turn, build, starter, pushExit = 0, pinExit = 0, agentUser = 'conexus-agent', onStart, onCommand, conversationRepository = 'project-repository' } = {}) => {
  const github = await startFakeGithub()
  t.after(() => github.close())
  const repository = github.addRepository({ owner: 'acme-org', name: 'app', head })
  const binding = {
    projectId, factoryProjectId: 'factory-project', projectRepositoryId: 'project-repository', repositoryId: 'repository-row',
    boundAt: '2026-09-21T12:00:00.000Z',
  }
  const events = []
  const calls = []
  const diagnostics = []
  const logs = []
  const invocations = []
  const rootInvocations = []
  const builtFrom = []
  let buildStarted
  const buildRunning = new Promise((started) => { buildStarted = started })
  const sandbox = {
    sandboxId: 'sbx-1',
    start: async () => { events.push('start'); onStart?.(sandbox) },
    writeFiles: async () => {},
    runAsRoot: async (script, env) => {
      events.push(['root', script])
      rootInvocations.push({ script, env })
      const admitted = github.leasedPush(script)
      if (admitted) return admitted
      if (script.includes(' ls-tree ')) return { exitCode: 0, success: true, stdout: listing, stderr: '' }
      const exitCode = script.includes(' push ') ? pushExit : script.includes(' fetch ') ? pinExit : 0
      return { exitCode, success: exitCode === 0, stdout: '', stderr: exitCode ? `fatal: https://x-access-token:${github.state.tokens.at(-1)?.token}@github.com refused` : '' }
    },
    executeCommand: async (command, args = [], options = {}) => {
      const line = [command, ...args].join(' ')
      onCommand?.(sandbox, line)
      events.push(line)
      invocations.push({ argv: [command, ...args], env: options.env })
      if (line.includes('add --all')) return { exitCode: 0, success: true, stdout: `${result}\n`, stderr: '' }
      if (line === 'id -un') return { exitCode: 0, success: true, stdout: `${agentUser}\n`, stderr: '' }
      return { exitCode: 0, success: true, stdout: '', stderr: '' }
    },
    buildApplication: async (buildRoot, signal) => {
      events.push('build')
      builtFrom.push(buildRoot)
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
    resolveRepository: async () => ({ installation: 163574754, externalId: repository.id, slug: 'acme-org/app', defaultBranch: 'main' }),
    materializeStarter: async () => { events.push('starter'); await starter?.() },
    log: (line) => { logs.push(line) },
  })
  const claimed = { builderRunId: runId, projectId, conversationId, state: 'RUNNING', phase: 'PREPARING', mode, baseSourceRevision: BASE, resultSourceRevision: null, resultKind: null, failureCode: null }
  const store = {
    createBuilderRun: async () => { calls.push(['create']); return { ...claimed, state: 'QUEUED', phase: null } },
    readFactoryBinding: async () => binding,
    claimBuilderRun: async () => claimed,
    setBuilderRunPhase: async (_id, phase) => { calls.push(['phase', phase]) },
    recordBuilderRunCandidate: async (_id, revision) => { calls.push(['candidate', revision]) },
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
      readSourceHead: async () => BASE,
      readConversationRepository: async () => conversationRepository,
      appendDiagnostic: async (input) => { diagnostics.push({ ...input, from: 'service' }) },
      recoverAdmissions: async () => [],
    },
  })
  const start = () => service.createBuilderRun({ accountId, projectId, conversationId, idempotencyKey: 'key', content: 'Mostre UNIT1-nonce', mode })
  const main = () => github.state.refs.get('acme-org/app:main')
  const commands = () => events.filter((event) => typeof event === 'string')
  const rootScripts = () => rootInvocations.map(({ script }) => script)
  const pushed = () => rootScripts().some((script) => script.includes(' push '))
  const admissions = () => rootScripts().filter((script) => script.includes('--force-with-lease'))
  return { github, events, invocations, rootInvocations, calls, diagnostics, logs, service, start, main, commands, rootScripts, pushed, admissions, buildRunning, builtFrom }
}

test('a writer that moves main between the read and the update, even to an ancestor of the result, is refused and keeps its move', async (t) => {
  for (const moved of [MIDDLE, OUTSIDE]) {
    const run = await harness(t)
    run.github.state.beforeRefUpdate = (key) => { if (key === 'acme-org/app:main') run.github.state.refs.set(key, moved) }
    await run.start()
    await run.service.close()
    assert.equal(run.main(), moved)
    assert.deepEqual(run.calls.filter(([kind]) => kind === 'fail' || kind === 'advance'), [['fail', 'BUILDER_SOURCE_BASE_MOVED']])
    assert.deepEqual(run.diagnostics, [{
      projectId, conversationId, builderRunId: runId, code: 'BUILDER_SOURCE_BASE_MOVED', outcome: 'SOURCE_BASE_MOVED', sourceRevision: BASE, from: 'service',
    }])
  }
})

test('a stop during the compile never offers main the result and settles the run interrupted', async (t) => {
  const run = await harness(t, {
    build: (signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('APPLICATION_COMPILER_CANCELLED')), { once: true })),
  })
  await run.start()
  await run.buildRunning
  await run.service.cancelBuilderRun({ accountId, projectId, builderRunId: runId })
  await run.service.close()
  assert.deepEqual(run.admissions(), [])
  assert.equal(run.main(), BASE)
  assert.deepEqual(run.calls.at(-1), ['interrupt', 'USER_CANCELLED'])
  assert.equal(run.calls.some(([kind]) => kind === 'advance'), false)
})

test('a stop that lands after the compile is still refused the admission', async (t) => {
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
  assert.deepEqual(run.admissions(), [])
  assert.equal(run.main(), BASE)
  assert.deepEqual(run.calls.at(-1), ['interrupt', 'USER_CANCELLED'])
  assert.equal(run.calls.some(([kind, phase]) => kind === 'candidate' || (kind === 'phase' && phase === 'SOURCE_ADMISSION')), false)
})

const admissionCalls = (run) => run.calls.filter(([kind]) => ['candidate', 'advance', 'settleBuild', 'fail', 'interrupt'].includes(kind))

test('a push whose response is lost after GitHub applied it is admitted, never failed or disowned', async (t) => {
  const run = await harness(t, { build: async () => { throw new Error('APPLICATION_COMPILATION_FAILED') } })
  run.github.state.pushResponseLost = true
  await run.start()
  await run.service.close()
  assert.equal(run.main(), RESULT)
  assert.deepEqual(admissionCalls(run), [['candidate', RESULT], ['advance', RESULT], ['settleBuild', RESULT, 'APPLICATION_COMPILATION_FAILED']])
  assert.deepEqual(run.diagnostics.map(({ outcome }) => outcome), ['BUILD_FAILED'])
})

test('a push that lost its response and never reached main fails with the discarded note', async (t) => {
  const run = await harness(t)
  run.github.state.pushResponseLost = true
  run.github.state.beforeRefUpdate = (key) => { run.github.state.refs.set(key, OUTSIDE) }
  await run.start()
  await run.service.close()
  assert.equal(run.main(), OUTSIDE)
  assert.deepEqual(admissionCalls(run), [['candidate', RESULT], ['fail', 'BUILDER_SOURCE_ADMISSION_FAILED']])
  assert.deepEqual(run.diagnostics.map(({ code, outcome, sourceRevision }) => [code, outcome, sourceRevision]), [['BUILDER_SOURCE_ADMISSION_FAILED', 'RUN_NOT_FINISHED', BASE]])
})

test('a push that lost its response while GitHub cannot say where main is stays running for recovery, candidate recorded', async (t) => {
  const run = await harness(t)
  run.github.state.pushResponseLost = true
  run.github.state.compareStatus = 502
  await run.start()
  await run.service.close()
  assert.deepEqual(admissionCalls(run), [['candidate', RESULT]])
  assert.deepEqual(run.diagnostics, [])
  assert.ok(run.logs.some((line) => line.startsWith(`BUILDER_FACTORY_RUN_FAILED:${runId}:BUILDER_SOURCE_ADMISSION_UNKNOWN `)), run.logs.join('\n'))
})

test('a conversation of another Project is refused before a run is created or its sandbox opened', async (t) => {
  for (const conversationRepository of ['other-project-repository', null]) {
    const run = await harness(t, { conversationRepository })
    await assert.rejects(run.start(), /^Error: BUILDER_CONVERSATION_INPUT_REFUSED$/)
    await run.service.close()
    assert.deepEqual([run.calls, run.events], [[], []])
  }
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
  assert.equal(run.pushed(), false)
})

test('a build failure still admits the source by a push leased on the base and settles SOURCE_CHANGED_BUILD_FAILED', async (t) => {
  const run = await harness(t, { build: async () => { throw new Error('APPLICATION_COMPILATION_FAILED') } })
  await run.start()
  await run.service.close()
  assert.equal(run.main(), RESULT)
  assert.deepEqual(run.admissions(), [
    `git --git-dir='/var/lib/conexus-git/app.git' push --porcelain --force-with-lease='refs/heads/main:${BASE}' 'https://github.com/acme-org/app.git' '${RESULT}:refs/heads/main'`,
  ])
  assert.deepEqual(run.calls.filter(([kind]) => kind === 'advance' || kind === 'settleBuild' || kind === 'fail'), [
    ['advance', RESULT], ['settleBuild', RESULT, 'APPLICATION_COMPILATION_FAILED'],
  ])
  assert.deepEqual(run.diagnostics, [{
    projectId, conversationId, builderRunId: runId, code: 'APPLICATION_COMPILATION_FAILED', outcome: 'BUILD_FAILED', sourceRevision: RESULT, from: 'service',
  }])
})

test('root fetches the base into its own mirror, and the checkout takes it from a bundle, resets, cleans and checks HEAD before the agent runs', async (t) => {
  const run = await harness(t, { build: async () => { throw new Error('APPLICATION_COMPILATION_FAILED') } })
  await run.start()
  await run.service.close()
  const mirror = "git --git-dir='/var/lib/conexus-git/app.git'"
  const git = "git -C '/workspace/app'"
  const rootPin = run.events.findIndex((event) => Array.isArray(event) && event[0] === 'root')
  assert.equal(run.events[rootPin][1], [
    "mkdir -p '/var/lib/conexus-git'",
    "{ test -d '/var/lib/conexus-git/app.git' || git init --quiet --bare '/var/lib/conexus-git/app.git'; }",
    `${mirror} fetch --quiet --no-tags 'https://github.com/acme-org/app.git' '${BASE}'`,
    `${mirror} update-ref refs/conexus/base '${BASE}'`,
    `${mirror} bundle create --quiet '/var/lib/conexus-git/app.base.bundle' refs/conexus/base`,
  ].join(' && '))
  const checkout = run.events.findIndex((event) => typeof event === 'string' && event.includes('app.base.bundle'))
  assert.equal(run.events[checkout], `sh -c ${git} fetch --quiet --no-tags '/var/lib/conexus-git/app.base.bundle' refs/conexus/base && ${git} reset --quiet --hard && ${git} clean -fdq && ${git} checkout --quiet -B 'conexus/${conversationId}' '${BASE}' && test "$(${git} rev-parse HEAD)" = '${BASE}'`)
  assert.ok(run.events.indexOf('start') < rootPin && rootPin < checkout && checkout < run.events.indexOf('turn'), 'start hook, root pin, checkout, then the agent')
  assert.equal(run.commands().filter((line) => line.includes('remote set-url origin')).length, 1)
})

test('an admission that finds the default branch already at the result counts it admitted', async (t) => {
  const run = await harness(t, { build: async () => { throw new Error('APPLICATION_COMPILATION_FAILED') } })
  run.github.state.beforeRefUpdate = (key) => { run.github.state.refs.set(key, RESULT) }
  await run.start()
  await run.service.close()
  assert.equal(run.main(), RESULT)
  assert.deepEqual(run.calls.filter(([kind]) => kind === 'advance' || kind === 'settleBuild'), [['advance', RESULT], ['settleBuild', RESULT, 'APPLICATION_COMPILATION_FAILED']])
})

test('the build reads the result from the mirror into a root-only directory after the agent user\'s processes are killed, never the checkout', async (t) => {
  const run = await harness(t)
  await run.start()
  await run.service.close()
  const buildRoot = `/var/lib/conexus-build/${runId}`
  assert.deepEqual(run.builtFrom, [buildRoot])
  const mirror = "git --git-dir='/var/lib/conexus-git/app.git'"
  const listed = run.events.findIndex((event) => Array.isArray(event) && event[1] === `${mirror} ls-tree -r -l '${RESULT}' app/`)
  const killed = run.events.indexOf('sh -c kill -KILL -1 2>/dev/null; true')
  const snapshot = run.events.findIndex((event) => Array.isArray(event) && event[1] === [
    "rm -rf '/var/lib/conexus-build'",
    "mkdir -p -m 700 '/var/lib/conexus-build'",
    `mkdir -m 700 '${buildRoot}'`,
    `${mirror} archive --format=tar '${RESULT}' app | tar -x -C '${buildRoot}'`,
    "rm -rf '/workspace/.vite'",
  ].join(' && '))
  assert.ok(run.events.indexOf('turn') < listed && listed < killed && killed < snapshot && snapshot < run.events.indexOf('build'), JSON.stringify([listed, killed, snapshot]))
  assert.equal(run.commands().some((line) => line.includes('ls-tree')), false, 'no agent-user command lists the tree the build is admitted by')
  assert.deepEqual(run.calls.filter(([kind]) => kind === 'advance'), [['advance', RESULT]])
})

test('a PLAN run that changed files is refused before anything is pushed', async (t) => {
  const run = await harness(t, { mode: 'PLAN' })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['fail', 'BUILDER_PLAN_SOURCE_RESULT_REFUSED'])
  assert.equal(run.pushed(), false)
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
  assert.equal([...run.commands(), ...run.rootScripts()].some((line) => /remote add|credential\.helper [^-]|config --global/.test(line.replace('--unset-all credential.helper', ''))), false)
  assert.doesNotMatch(JSON.stringify([run.calls, run.logs, run.diagnostics]), /ghs_/)
})

test('a token rides only in the environment of root commands on the Hub mirror, never in argv or an agent-user command', async (t) => {
  const run = await harness(t, { build: async () => { throw new Error('APPLICATION_COMPILATION_FAILED') } })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.github.state.tokens.map(({ token, permissions }) => [token, permissions]), [
    ['ghs_fake_1', { contents: 'write' }],
  ])
  for (const part of [...run.invocations.flatMap(({ argv }) => argv), ...run.rootScripts()]) {
    assert.doesNotMatch(part, /x-access-token:|ghs_fake_/)
  }
  const header = {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from('x-access-token:ghs_fake_1').toString('base64')}`,
    GIT_TERMINAL_PROMPT: '0',
  }
  assert.deepEqual(run.rootInvocations.map(({ script, env }) => [/--force-with-lease/.test(script) ? 'admit' : / push /.test(script) ? 'push' : / fetch /.test(script) ? 'fetch' : / ls-tree /.test(script) ? 'list' : / archive /.test(script) ? 'snapshot' : script, env]), [
    ['fetch', header], ['push', header], ['list', {}], ['snapshot', {}], ['admit', header],
  ])
  assert.ok(run.rootScripts().every((script) => script.includes("--git-dir='/var/lib/conexus-git/app.git'") && !script.includes("-C '/workspace/app'")), 'root git never reads the agent checkout')
  assert.deepEqual(run.invocations.filter(({ env }) => env === undefined || Object.keys(env).length > 0), [], 'every agent-user command states an empty environment')
  assert.ok(run.rootScripts()[1].startsWith(`git --git-dir='/var/lib/conexus-git/app.git' fetch --quiet '/workspace/.conexus-result.bundle' 'refs/heads/conexus/${conversationId}' && `), run.rootScripts()[1])
  assert.ok(run.commands().includes(`sh -c git -C '/workspace/app' bundle create --quiet '/workspace/.conexus-result.bundle' 'refs/heads/conexus/${conversationId}'`))
})

test('an agent that aborts with no stop from the person fails with a named reason, never as cancelled by them', async (t) => {
  const endedAt = new Date('2026-09-21T15:00:00.000Z')
  const run = await harness(t, { turn: () => ({ reason: 'aborted', endedAt, userMessageId: 'user-message', summary: '' }) })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.logs, [`BUILDER_FACTORY_AGENT_END:aborted:${runId}:2026-09-21T15:00:00.000Z`])
  assert.notDeepEqual(run.calls.at(-1), ['interrupt', 'USER_CANCELLED'])
  assert.ok(JSON.stringify(run.calls.at(-1)).includes('BUILDER_MODEL_INCOMPLETE'), JSON.stringify(run.calls.at(-1)))
  assert.equal(run.pushed(), false)
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

test('a root fetch that fails refuses the pin with BUILDER_SOURCE_BASE_PIN_REFUSED before the checkout moves or the agent runs', async (t) => {
  const run = await harness(t, { pinExit: 128 })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['fail', 'BUILDER_SOURCE_BASE_PIN_REFUSED'])
  assert.deepEqual(run.logs, [`BUILDER_FACTORY_RUN_FAILED:${runId}:BUILDER_SOURCE_BASE_PIN_REFUSED {"step":"fetch","exitCode":128,"stderr":"fatal: https://x-access-token:[redacted]@github.com refused"}`])
  assert.deepEqual(run.diagnostics, [], 'a run that never reached the agent has no edits to disown')
  assert.equal(run.commands().some((line) => line.includes('app.base.bundle')), false)
  assert.equal(run.events.includes('turn'), false)
})

test('a VM whose commands run as root, from a template before the agent user, is refused before any token is minted', async (t) => {
  const run = await harness(t, { agentUser: 'root' })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['fail', 'BUILDER_SANDBOX_AGENT_USER_REQUIRED'])
  assert.deepEqual([run.github.state.tokens.length, run.rootScripts().length, run.events.includes('turn')], [0, 0, false])
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
