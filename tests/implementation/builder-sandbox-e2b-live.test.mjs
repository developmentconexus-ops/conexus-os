import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import test from 'node:test'
import { Sandbox } from 'e2b'
import { readBuilderE2BApiKey } from '../../scripts/builder-e2b-template.mjs'
import { hubModuleUrl } from './hub-build.mjs'

// Paid: each test creates short-lived sandboxes on the Builder's real E2B template and kills them
// before it ends. Run with `npm run builder:sandbox:live`, which reads the Hub env file.
const live = process.env.CONEXUS_FACTORY_LIVE === 'true'
const skip = !live && 'opt-in: CONEXUS_FACTORY_LIVE=true with CONEXUS_BUILDER_E2B_API_KEY_FILE and CONEXUS_BUILDER_E2B_TEMPLATE_ID'

const loadHub = () => (path) => import(hubModuleUrl(path))

const liveConfig = () => {
  const templateId = process.env.CONEXUS_BUILDER_E2B_TEMPLATE_ID
  if (!templateId || !/^[a-z0-9]+:[0-9a-f-]{36}$/.test(templateId)) throw new Error('CONEXUS_FACTORY_LIVE_CONFIG_REFUSED')
  return { templateId, apiKey: readBuilderE2BApiKey(process.env.CONEXUS_BUILDER_E2B_API_KEY_FILE) }
}

const killEverySandboxSeen = async (apiKey, sandboxIds) => {
  for (const id of new Set(sandboxIds)) await Sandbox.kill(id, { apiKey }).catch(() => undefined)
}

test('on a real E2B VM the checkout is seeded from a bundle only root can change, and the Hub takes the run back as one commit on the base', { skip, timeout: 5 * 60_000 }, async (t) => {
  const hub = await loadHub()
  const { ConexusRunSandbox, SANDBOX_CHECKOUT } = await hub('builder/sandbox.js')
  const { candidateSnapshot, createConexusGit, pullSnapshot, startCheckout } = await hub('builder/conexus-git.js')
  const { templateId, apiKey } = liveConfig()
  const gitRoot = mkdtempSync(join(tmpdir(), 'conexus-live-git-'))
  t.after(() => rmSync(gitRoot, { recursive: true, force: true }))
  const git = createConexusGit({ root: gitRoot, starter: [{ path: 'app/index.html', content: '<p>starter</p>\n' }] })
  const projectId = randomUUID()
  const runId = randomUUID()
  const base = await git.ensureRepository(projectId)
  const sandbox = new ConexusRunSandbox({ id: `conexus-live-agent-user-${randomUUID()}`, template: templateId, apiKey, timeout: 180_000, lifecycle: { onTimeout: 'kill' }, env: {} })
  const agent = (script, cwd = '/workspace') => sandbox.executeCommand('sh', ['-c', script], { env: {}, cwd })
  const source = {
    direct: (command, args) => sandbox.executeCommand(command, args, { env: {}, cwd: '/workspace' }),
    writeRootFile: (path, bytes) => sandbox.writeRootFile(path, bytes),
    readAgentFile: (path) => sandbox.readAgentFile(path),
    readAgentFileStream: (path) => sandbox.readAgentFileStream(path),
  }
  try {
    await sandbox.start()
    assert.equal((await agent('id -un')).stdout.trim(), 'conexus-agent')
    assert.notEqual((await agent('sudo -n true')).exitCode, 0, 'the agent user has no sudo')
    const seedFile = '/var/lib/conexus-seed/turn.bundle'
    const turn = await git.startTurn(projectId, randomUUID(), base)
    assert.equal(await startCheckout({ git, projectId, turn, sandbox: source, checkout: SANDBOX_CHECKOUT, seedFile }), 'SEEDED')
    assert.equal((await agent('git rev-parse HEAD', SANDBOX_CHECKOUT)).stdout.trim(), base)
    assert.notEqual((await agent(`: > '${seedFile}'`)).exitCode, 0, 'the agent user cannot replace the seed')
    assert.equal((await agent('echo changed > app/index.html && mkdir -p .conexus/plans && echo plan > .conexus/plans/p.md', SANDBOX_CHECKOUT)).exitCode, 0)
    const candidate = await pullSnapshot({ git, projectId, snapshot: candidateSnapshot(runId, base), scratch: 'candidate', sandbox: source, checkout: SANDBOX_CHECKOUT })
    await git.fastForwardMain(projectId, { base, candidate })
    assert.deepEqual((await git.listTree(projectId, candidate)).map((entry) => entry.path), ['app', 'app/index.html'])
    assert.equal((await git.readBlob(projectId, candidate, 'app/index.html', 1024)).bytes.toString('utf8'), 'changed\n')
  } finally {
    await sandbox.destroy().catch(() => undefined)
  }
})

test('a VM that E2B killed for idling is replaced by the next command, and root commands reach the new one', { skip, timeout: 5 * 60_000 }, async () => {
  const { ConexusRunSandbox } = await (await loadHub())('builder/sandbox.js')
  const { templateId, apiKey } = liveConfig()
  const sandbox = new ConexusRunSandbox({ id: `conexus-live-idle-${randomUUID()}`, template: templateId, apiKey, timeout: 15_000, lifecycle: { onTimeout: 'kill' }, env: {} })
  try {
    await sandbox.start()
    const dead = sandbox.sandboxId
    await sleep(35_000)
    const ran = await sandbox.executeCommand('true', [], { env: {} })
    assert.equal(ran.exitCode, 0)
    assert.notEqual(sandbox.sandboxId, dead)
    assert.equal((await sandbox.runAsRoot('id -un', {})).stdout.trim(), 'root')
  } finally {
    await sandbox.destroy().catch(() => undefined)
  }
})

const serverPass = 'process.exit(0)\n'
const CHECK_ROOT = '/var/lib/conexus-build/live'
const CHECK_OUT = `${CHECK_ROOT}.dist`

// The Hub's check placed the way a run places it, and a tree only root can change.
const placeHubCheck = async (sandbox, files) => {
  const hub = await loadHub()
  const { checkScriptSource } = await hub('builder/application-check.js')
  const { serverBuildScriptSource } = await hub('builder/application-server-build.js')
  await sandbox.writeRootFile('/opt/conexus/check.mjs', Buffer.from(checkScriptSource()))
  await sandbox.writeRootFile('/opt/conexus/server-build.mjs', Buffer.from(serverBuildScriptSource()))
  assert.equal((await sandbox.runAsRoot("chmod 555 /opt/conexus/check.mjs /opt/conexus/server-build.mjs && rm -rf /var/lib/conexus-build && mkdir -p -m 711 /var/lib/conexus-build", {})).exitCode, 0)
  for (const [path, content] of Object.entries(files)) await sandbox.writeRootFile(`${CHECK_ROOT}/${path}`, Buffer.from(content))
}

const rootCheck = async (sandbox, extra = '') => {
  const ran = await sandbox.runAsRoot(`/usr/local/bin/node /opt/conexus/check.mjs --root ${CHECK_ROOT} --out ${CHECK_OUT} --as 1500:1500 ${extra}`, {})
  const { readCheckReport } = await (await loadHub())('builder/application-check.js')
  assert.equal(ran.exitCode, 0, ran.stderr)
  return readCheckReport(ran.stdout)
}

const starterFiles = async () => {
  const { fixedApplicationStarterFiles } = await (await loadHub())('builder/application-starter.js')
  return Object.fromEntries(fixedApplicationStarterFiles().map((file) => [file.path, file.content]))
}

test('the Hub check runs the starter in the real template as root with every step as the agent user, and as the agent user itself', { skip, timeout: 5 * 60_000 }, async (t) => {
  const { ConexusRunSandbox } = await (await loadHub())('builder/sandbox.js')
  const { templateId, apiKey } = liveConfig()
  const sandbox = new ConexusRunSandbox({ id: `conexus-live-check-${randomUUID()}`, template: templateId, apiKey, timeout: 240_000, lifecycle: { onTimeout: 'kill' }, env: {} })
  try {
    await sandbox.start()
    const files = await starterFiles()
    await placeHubCheck(sandbox, files)
    const started = Date.now()
    const report = await rootCheck(sandbox)
    t.diagnostic(`root check ${Date.now() - started} ms wall, steps ${JSON.stringify(report.steps.map((step) => [step.step, step.status, step.durationMs]))}`)
    assert.equal(report.ok, true, JSON.stringify(report.steps))
    assert.deepEqual(report.steps.map((step) => step.status), ['passed', 'passed', 'passed', 'passed', 'passed'])
    assert.equal((await sandbox.runAsRoot(`stat -c %U ${CHECK_OUT}/index.html`, {})).stdout.trim(), 'conexus-agent', 'the build was written by the agent user')

    // The same script as the agent user: what the Builder's tool will do.
    await sandbox.writeFiles(Object.entries(files).map(([path, content]) => ({ path: `/workspace/check-probe/${path}`, content })))
    const asAgent = await sandbox.executeCommand('/usr/local/bin/node', ['/opt/conexus/check.mjs', '--root', '/workspace/check-probe', '--out', '/workspace/check-probe-dist'], { env: {}, cwd: '/workspace' })
    const { readCheckReport } = await (await loadHub())('builder/application-check.js')
    const agentReport = readCheckReport(asAgent.stdout)
    t.diagnostic(`agent check steps ${JSON.stringify(agentReport.steps.map((step) => [step.step, step.status, step.durationMs]))}`)
    assert.deepEqual(agentReport.steps.map((step) => step.status), ['passed', 'passed', 'passed', 'passed', 'passed'], 'Chromium boots the starter as the agent user')

    assert.notEqual((await sandbox.executeCommand('sh', ['-c', 'echo x > /opt/conexus/check.mjs'], { env: {}, cwd: '/workspace' })).exitCode, 0, 'the agent user cannot replace the script')

    await sandbox.writeFiles([{ path: '/workspace/check-probe/app/src/main.tsx', content: 'const answer: number = "six"\nexport { answer }\n' }])
    const refused = readCheckReport((await sandbox.executeCommand('/usr/local/bin/node', ['/opt/conexus/check.mjs', '--root', '/workspace/check-probe', '--out', '/workspace/check-probe-dist'], { env: {}, cwd: '/workspace' })).stdout)
    assert.equal(refused.ok, false)
    assert.deepEqual(refused.steps.find((step) => step.status === 'failed').problems, [
      { file: 'app/src/main.tsx', line: 1, column: 7, code: 'TS2322', message: "Type 'string' is not assignable to type 'number'." },
    ])
  } finally {
    await sandbox.destroy().catch(() => undefined)
  }
})

test('under a root check, application code cannot write /opt/conexus, a hung step is killed with its processes, and Chromium runs as uid 1500', { skip, timeout: 5 * 60_000 }, async () => {
  const { ConexusRunSandbox } = await (await loadHub())('builder/sandbox.js')
  const { templateId, apiKey } = liveConfig()
  const sandbox = new ConexusRunSandbox({ id: `conexus-live-check-${randomUUID()}`, template: templateId, apiKey, timeout: 240_000, lifecycle: { onTimeout: 'kill' }, env: {} })
  const tools = '/var/lib/conexus-probe/opt'
  try {
    await sandbox.start()
    await placeHubCheck(sandbox, await starterFiles())
    // A tools folder of the probe's own: the real compiler, and a server step and a browser that report what they run as.
    await sandbox.writeRootFile(`${tools}/server-build.mjs`, Buffer.from(`import { writeFileSync } from 'node:fs'
try { writeFileSync('/opt/conexus/pwned', 'x') ; process.stdout.write('WROTE') } catch (error) { process.stderr.write('uid ' + process.getuid() + ' ' + error.code); process.exit(1) }
`))
    await sandbox.writeRootFile('/var/lib/conexus-probe/chromium', Buffer.from('#!/bin/sh\nid -u > /var/lib/conexus-probe/chromium-uid\nexec /usr/bin/chromium "$@"\n'))
    assert.equal((await sandbox.runAsRoot(`chmod 755 /var/lib/conexus-probe/chromium && mkdir -p ${tools}/compiler && ln -s /opt/conexus/compiler/node_modules ${tools}/compiler/node_modules && cp /opt/conexus/compiler/vite.config.mjs ${tools}/compiler/ && chmod 1777 /var/lib/conexus-probe`, {})).exitCode, 0)
    const report = await rootCheck(sandbox, `--tools ${tools} --chromium /var/lib/conexus-probe/chromium`)
    const server = report.steps.find((step) => step.step === 'server')
    assert.equal(server.status, 'failed')
    assert.deepEqual(server.problems, [{ message: 'uid 1500 EACCES' }])
    assert.equal((await sandbox.runAsRoot('test ! -e /opt/conexus/pwned', {})).exitCode, 0)

    await sandbox.writeRootFile(`${tools}/server-build.mjs`, Buffer.from(`import { spawn } from 'node:child_process'
spawn('sleep', ['300'], { stdio: 'ignore' })
setTimeout(() => {}, 300_000)
`))
    const hung = await rootCheck(sandbox, `--tools ${tools} --chromium /var/lib/conexus-probe/chromium --limit server=2000`)
    assert.deepEqual(hung.steps.find((step) => step.step === 'server').problems, [{ code: 'STEP_TIMEOUT', message: 'server exceeded 2 s and was stopped' }])
    assert.notEqual((await sandbox.runAsRoot('pgrep -x sleep', {})).exitCode, 0, 'no sleep process survives the step')

    await sandbox.writeRootFile(`${tools}/server-build.mjs`, Buffer.from(serverPass))
    const booted = await rootCheck(sandbox, `--tools ${tools} --chromium /var/lib/conexus-probe/chromium`)
    assert.equal(booted.steps.find((step) => step.step === 'boot').status, 'passed')
    assert.equal((await sandbox.runAsRoot('cat /var/lib/conexus-probe/chromium-uid', {})).stdout.trim(), '1500')
  } finally {
    await sandbox.destroy().catch(() => undefined)
  }
})

const TIMEOUT_MS = 15_000
const PAST_DEADLINE_MS = TIMEOUT_MS * 2

const openLiveSandbox = async (loadHub, providerSandboxId = null, conversationId = randomUUID()) => {
  const { createConversationSandbox } = await (await loadHub())('builder/sandbox.js')
  const { templateId, apiKey } = liveConfig()
  const sandbox = createConversationSandbox({ apiKey, templateId, conversationId, providerSandboxId, timeoutMs: TIMEOUT_MS })
  const started = await sandbox.start()
  return { sandbox, apiKey, conversationId, started }
}

test('a conversation sandbox left alone past its timeout pauses, and the next command resumes the same VM with its files', { skip, timeout: 3 * 60_000 }, async () => {
  const { sandbox, apiKey } = await openLiveSandbox(loadHub)
  const seen = [sandbox.sandboxId]
  try {
    assert.equal((await sandbox.executeCommand('sh', ['-c', 'echo kept > /workspace/left.txt'], { env: {} })).exitCode, 0)
    await sleep(PAST_DEADLINE_MS)
    assert.equal((await Sandbox.getInfo(seen[0], { apiKey })).state, 'paused', 'E2B paused the VM at its deadline instead of killing it')
    const read = await sandbox.executeCommand('cat', ['/workspace/left.txt'], { env: {} })
    seen.push(sandbox.sandboxId)
    assert.deepEqual({ sandboxId: sandbox.sandboxId, file: read.stdout }, { sandboxId: seen[0], file: 'kept\n' })
  } finally {
    await killEverySandboxSeen(apiKey, seen)
  }
})

test("a conversation sandbox paused at a turn end resumes on the Hub's next instance by its provider id, with its checkout and none of the agent's processes", { skip, timeout: 3 * 60_000 }, async () => {
  const first = await openLiveSandbox(loadHub)
  const seen = [first.sandbox.sandboxId]
  try {
    assert.deepEqual(first.started, { outcome: 'created' })
    const agent = (sandbox, script) => sandbox.executeCommand('sh', ['-c', script], { env: {}, cwd: '/workspace' })
    assert.equal((await agent(first.sandbox, 'mkdir -p repo && echo turn-one > repo/a.txt && (setsid sleep 900 >/dev/null 2>&1 &)')).exitCode, 0)
    // The turn end: the agent's processes die, then the VM pauses.
    await agent(first.sandbox, 'kill -KILL -1 2>/dev/null; true')
    await first.sandbox.pause()
    assert.equal((await Sandbox.getInfo(seen[0], { apiKey: first.apiKey })).state, 'paused')

    const resumedAt = Date.now()
    const next = await openLiveSandbox(loadHub, seen[0], first.conversationId)
    const resumeMs = Date.now() - resumedAt
    seen.push(next.sandbox.sandboxId)
    const file = await agent(next.sandbox, 'cat repo/a.txt')
    const sleeping = await agent(next.sandbox, 'pgrep -u conexus-agent -x sleep || true')
    console.log(`conversation sandbox resumed in ${resumeMs} ms`)
    assert.deepEqual({ started: next.started, sandboxId: next.sandbox.sandboxId, file: file.stdout, sleeping: sleeping.stdout }, { started: { outcome: 'connected' }, sandboxId: seen[0], file: 'turn-one\n', sleeping: '' })
  } finally {
    await killEverySandboxSeen(first.apiKey, seen)
  }
})

test('holdOpen() pushes a real sandbox\'s deadline out: the same incarnation survives past its original timeout', { skip, timeout: 90_000 }, async () => {
  const { sandbox, apiKey } = await openLiveSandbox(loadHub)
  const seen = [sandbox.sandboxId]
  let release
  try {
    await sandbox.executeCommand('true', [], { env: {} })
    release = await sandbox.holdOpen(() => {})
    await sleep(PAST_DEADLINE_MS)
    release()
    release = undefined
    await sandbox.executeCommand('true', [], { env: {} })
    seen.push(sandbox.sandboxId)
    assert.equal(sandbox.sandboxId, seen[0], 'holdOpen kept the same incarnation alive past its original deadline')
    assert.equal((await Sandbox.getInfo(seen[0], { apiKey })).state, 'running', 'held open, it never paused')
  } finally {
    if (release) release()
    await killEverySandboxSeen(apiKey, seen)
  }
})

// The run runtime on a real VM, with a session that only parks: the lifecycle of the VM is what is
// under test, so no model is called and no candidate reaches admission.
const CONVERSATION_METADATA_KEY = 'conexus-builder-conversation'
const SUSPENDED = { reason: 'suspended', userMessageId: 'user-message', summary: '' }
const NOTE = '/workspace/repo/note.txt'

const until = async (condition, what, limitMs = 90_000) => {
  const deadline = Date.now() + limitMs
  for (;;) {
    const value = await condition()
    if (value) return value
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await sleep(500)
  }
}

const liveParkedRuntime = async (t, { warmParkedMs } = {}) => {
  const hub = await loadHub()
  const { createBuilderRunRuntime, e2bConversationSandboxes } = await hub('builder/run-runtime.js')
  const { createConexusGit } = await hub('builder/conexus-git.js')
  const { templateId, apiKey } = liveConfig()
  const gitRoot = mkdtempSync(join(tmpdir(), 'conexus-live-parked-git-'))
  const projectId = randomUUID()
  const conversationId = randomUUID()
  const git = createConexusGit({ root: gitRoot, starter: [{ path: 'app/index.html', content: '<p>starter</p>\n' }] })
  const base = await git.ensureRepository(projectId)
  const seen = new Set()
  const sandboxes = e2bConversationSandboxes({ apiKey, templateId })
  const opened = []
  const logs = []
  const settledAsDenied = []
  const answers = []
  let current
  let recorded = null
  const runtime = createBuilderRunRuntime({
    openSandbox: (ref) => {
      opened.push(ref.providerSandboxId)
      current = sandboxes.open(ref)
      return current
    },
    checkModel: async () => {},
    openSession: async () => ({
      sendTurn: async () => {
        assert.equal((await current.executeCommand('sh', ['-c', `echo parked-file > ${NOTE}`], { env: {}, cwd: '/workspace' })).exitCode, 0)
        return SUSPENDED
      },
      resumeTurn: async () => {
        answers.push({ sandboxId: current.sandboxId, note: (await current.executeCommand('cat', [NOTE], { env: {}, cwd: '/workspace' })).stdout })
        return SUSPENDED
      },
      end: async () => {},
      release: async () => {},
    }),
    discardParked: async (input) => { settledAsDenied.push(input) },
    git,
    materializeStarter: async () => {},
    readProjectName: async () => 'Live',
    mirrorDebounceMs: 0,
    ...(warmParkedMs === undefined ? {} : { warmParkedMs }),
    log: (line) => logs.push(line),
  })
  const leg = (resume) => runtime.execute({
    projectId, accountId: randomUUID(), conversationId, executionId: randomUUID(), intent: 'pergunta', baseSourceRevision: base,
    ...(resume ? { resume: { toolCallId: 'call-1', resumeData: { answer: 'sim' } } } : {}),
    providerSandboxId: recorded,
    bindPhysicalSandbox: async (id) => { recorded = id; seen.add(id) },
    bindMessage: async () => {},
    setPhase: async () => {},
    recordCandidate: async () => {},
    recordMirror: async () => {},
  })
  const machines = async () => {
    const found = []
    const pages = Sandbox.list({ apiKey, query: { metadata: { [CONVERSATION_METADATA_KEY]: conversationId }, state: ['running', 'paused'] } })
    while (pages.hasNext) found.push(...await pages.nextItems())
    return found
  }
  const stateOf = async (id) => (await Sandbox.getInfo(id, { apiKey })).state
  t.after(async () => {
    for (const info of await machines().catch(() => [])) seen.add(info.sandboxId)
    await killEverySandboxSeen(apiKey, [...seen])
    rmSync(gitRoot, { recursive: true, force: true })
  })
  return { runtime, leg, machines, stateOf, opened, logs, settledAsDenied, answers, conversationId, recorded: () => recorded }
}

test('a run that parks on a question pauses its VM, and the answer within the warm window resumes that same VM', { skip, timeout: 5 * 60_000 }, async (t) => {
  const run = await liveParkedRuntime(t)
  const first = await run.leg(false)
  assert.equal(first.kind, 'PARKED')
  const vm = first.sandboxId
  assert.equal(run.recorded(), vm)
  await until(async () => (await run.stateOf(vm)) === 'paused', 'the parked VM to be paused')
  assert.equal(await run.stateOf(vm), 'paused')
  assert.deepEqual((await run.machines()).map((info) => [info.sandboxId, info.state]), [[vm, 'paused']])

  const second = await run.leg(true)
  assert.equal(second.kind, 'PARKED')
  assert.equal(second.sandboxId, vm, 'the answer ran on the same provider sandbox id')
  assert.deepEqual(run.answers, [{ sandboxId: vm, note: 'parked-file\n' }])
  await until(async () => (await run.stateOf(vm)) === 'paused', 'the VM to pause again after the answer leg')
  assert.deepEqual((await run.machines()).map((info) => [info.sandboxId, info.state]), [[vm, 'paused']], 'no second VM was created for the conversation')
  assert.deepEqual(run.logs.filter((line) => line.startsWith('BUILDER_PARKED_SESSION_EVICTED')), [])
})

test('past the warm limit the parked session is evicted, and the answer resumes the same paused VM from storage with the checkout intact', { skip, timeout: 5 * 60_000 }, async (t) => {
  const run = await liveParkedRuntime(t, { warmParkedMs: 3_000 })
  const first = await run.leg(false)
  const vm = first.sandboxId
  const evicted = await until(() => run.logs.find((line) => line.startsWith('BUILDER_PARKED_SESSION_EVICTED')), 'the warm limit')
  assert.match(evicted, /^BUILDER_PARKED_SESSION_EVICTED:[0-9a-f-]{36}:TTL$/)
  assert.equal(await run.stateOf(vm), 'paused')

  const second = await run.leg(true)
  assert.deepEqual(run.opened, [null, vm], 'the second leg opened its instance by the recorded provider id')
  assert.equal(second.sandboxId, vm)
  assert.deepEqual(run.answers, [{ sandboxId: vm, note: 'parked-file\n' }], 'the checkout file written before the pause is still there')
  assert.deepEqual((await run.machines()).map((info) => info.sandboxId), [vm], 'still one VM for the conversation')
})

test('stopping a parked run leaves its VM paused and settles the open question as denied', { skip, timeout: 5 * 60_000 }, async (t) => {
  const run = await liveParkedRuntime(t)
  const first = await run.leg(false)
  const vm = first.sandboxId
  await until(async () => (await run.stateOf(vm)) === 'paused', 'the parked VM to be paused')
  const projectId = first.projectId
  await run.runtime.discardParked({ projectId, conversationId: run.conversationId })
  assert.deepEqual(run.settledAsDenied, [{ projectId, conversationId: run.conversationId }])
  assert.equal(await run.stateOf(vm), 'paused', 'a stop pauses, it never kills')
  assert.deepEqual((await run.machines()).map((info) => [info.sandboxId, info.state]), [[vm, 'paused']])
  assert.equal(run.logs.filter((line) => line.startsWith('BUILDER_PARKED_SESSION_EVICTED'))[0].endsWith(':ENDED'), true)
})
