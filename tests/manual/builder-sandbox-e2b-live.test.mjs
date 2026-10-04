import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import test from 'node:test'
import { Sandbox } from 'e2b'
import { readBuilderE2BApiKey } from '../../scripts/builder-e2b-template.mjs'
import { hubModuleUrl } from '../implementation/hub-build.mjs'

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
    process.stdout.write(`E2B_SANDBOX ${sandbox.sandboxId}\n`)
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
    process.stdout.write(`E2B_SANDBOX ${sandbox.sandboxId}\n`)
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

const CHECK_ROOT = '/var/lib/conexus-build/live'
const CHECK_OUT = `${CHECK_ROOT}.dist`

// The Hub's bundle placed the way a run places it (`installCheck`, by its hash), and a tree only root can change.
const placeHubCheck = async (sandbox, files) => {
  const hub = await loadHub()
  const { loadCheckBundle, installCheck } = await hub('builder/check-delivery.js')
  const bundle = loadCheckBundle()
  await installCheck({ asRoot: (script) => sandbox.runAsRoot(script, {}), writeRootFile: (path, bytes) => sandbox.writeRootFile(path, bytes) }, bundle)
  assert.equal((await sandbox.runAsRoot("rm -rf /var/lib/conexus-build && mkdir -p -m 711 /var/lib/conexus-build", {})).exitCode, 0)
  for (const [path, content] of Object.entries(files)) await sandbox.writeRootFile(`${CHECK_ROOT}/${path}`, Buffer.from(content))
  return bundle
}

const checkLine = async (bundle, caller, root, out) => {
  const hub = await loadHub()
  const { checkCommand } = await hub('builder/application-check.js')
  return checkCommand({ sha256: bundle.sha256, caller, root, out })
}

const rootCheck = async (sandbox, bundle, { root = CHECK_ROOT, out = CHECK_OUT } = {}) => {
  const ran = await sandbox.runAsRoot(await checkLine(bundle, 'gate', root, out), {})
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
    process.stdout.write(`E2B_SANDBOX ${sandbox.sandboxId}\n`)
    const files = await starterFiles()
    const bundle = await placeHubCheck(sandbox, files)
    const started = Date.now()
    const report = await rootCheck(sandbox, bundle)
    t.diagnostic(`root check ${Date.now() - started} ms wall, steps ${JSON.stringify(report.steps.map((step) => [step.step, step.status, step.durationMs]))}`)
    assert.equal(report.ok, true, JSON.stringify(report.steps))
    assert.deepEqual(report.steps.map((step) => step.status), ['passed', 'passed', 'passed', 'passed', 'passed'])
    assert.equal((await sandbox.runAsRoot(`stat -c %U ${CHECK_OUT}/index.html`, {})).stdout.trim(), 'conexus-agent', 'the build was written by the agent user')

    // The same script as the agent user: what the Builder's tool will do.
    await sandbox.writeFiles(Object.entries(files).map(([path, content]) => ({ path: `/workspace/check-probe/${path}`, content })))
    const agentLine = (await checkLine(bundle, 'tool', '/workspace/check-probe', '/workspace/check-probe-dist')).split(' ')
    const asAgent = await sandbox.executeCommand(agentLine[0], agentLine.slice(1).map((part) => part.replace(/^'|'$/g, '')), { env: {}, cwd: '/workspace' })
    const { readCheckReport } = await (await loadHub())('builder/application-check.js')
    const agentReport = readCheckReport(asAgent.stdout)
    t.diagnostic(`agent check steps ${JSON.stringify(agentReport.steps.map((step) => [step.step, step.status, step.durationMs]))}`)
    assert.deepEqual(agentReport.steps.map((step) => step.status), ['passed', 'passed', 'passed', 'passed', 'passed'], 'Chromium boots the starter as the agent user')

    assert.notEqual((await sandbox.executeCommand('sh', ['-c', `echo x > /opt/conexus/check/${bundle.sha256}/main.mjs`], { env: {}, cwd: '/workspace' })).exitCode, 0, 'the agent user cannot replace the bundle')

    await sandbox.writeFiles([{ path: '/workspace/check-probe/app/src/main.tsx', content: 'const answer: number = "six"\nexport { answer }\n' }])
    const refused = readCheckReport((await sandbox.executeCommand(agentLine[0], agentLine.slice(1).map((part) => part.replace(/^'|'$/g, '')), { env: {}, cwd: '/workspace' })).stdout)
    assert.equal(refused.ok, false)
    assert.deepEqual(refused.steps.find((step) => step.status === 'failed').problems, [
      { file: 'app/src/main.tsx', line: 1, column: 7, code: 'TS2322', message: "Type 'string' is not assignable to type 'number'." },
    ])
  } finally {
    await sandbox.destroy().catch(() => undefined)
  }
})

// The agent's user, as a command on the VM: what a hostile app's code can attempt.
const asAgent = (sandbox, script) => sandbox.executeCommand('sh', ['-c', script], { env: {}, cwd: '/workspace' })

const openCheckSandbox = async () => {
  const { ConexusRunSandbox } = await (await loadHub())('builder/sandbox.js')
  const { templateId, apiKey } = liveConfig()
  return new ConexusRunSandbox({ id: `conexus-live-check-${randomUUID()}`, template: templateId, apiKey, timeout: 240_000, lifecycle: { onTimeout: 'kill' }, env: {} })
}

test('AC-7: as uid 1500 every write, replace, rename, chmod, symlink and delete under the bundle folder and the gate cache store is refused, and nothing the agent plants runs as root', { skip, timeout: 5 * 60_000 }, async () => {
  const sandbox = await openCheckSandbox()
  try {
    await sandbox.start()
    process.stdout.write(`E2B_SANDBOX ${sandbox.sandboxId}\n`)
    const files = await starterFiles()
    const bundle = await placeHubCheck(sandbox, files)
    await rootCheck(sandbox, bundle)
    const folder = `/opt/conexus/check/${bundle.sha256}`
    const store = `/var/lib/conexus-check-cache/${bundle.sha256}/gate/app`
    const attempts = [
      `echo x > ${folder}/main.mjs`, `echo x >> ${folder}/main.mjs`, `rm -f ${folder}/main.mjs`, `mv ${folder}/main.mjs ${folder}/other.mjs`,
      `chmod 777 ${folder}/main.mjs`, `chmod 777 ${folder}`, `ln -sf /tmp/x ${folder}/main.mjs`, `touch ${folder}/new.mjs`,
      `rm -rf ${folder}`, `mv ${folder} /opt/conexus/check/moved`, 'touch /opt/conexus/check/new-dir-file', 'rm -rf /opt/conexus/check',
      `echo x > ${store}/tsbuildinfo`, `rm -f ${store}/tsbuildinfo`, `ln -sf /tmp/x ${store}/tsbuildinfo`, `touch ${store}/new`, 'ls /var/lib/conexus-check-cache',
    ]
    for (const attempt of attempts) assert.notEqual((await asAgent(sandbox, attempt)).exitCode, 0, `refused: ${attempt}`)
    // Files the agent plants in its tree are data: a sentinel they would create as root never appears.
    const planted = { ...files, 'conexus.json': JSON.stringify({ shape: 'REACT_VITE_V1', check: 'touch /var/lib/conexus-sentinel' }), 'conexus/check.sh': '#!/bin/sh\ntouch /var/lib/conexus-sentinel\n', 'app/.vite-plugin.mjs': "import { writeFileSync } from 'node:fs'\nwriteFileSync('/var/lib/conexus-sentinel', 'x')\n" }
    for (const [path, content] of Object.entries(planted)) await sandbox.writeRootFile(`${CHECK_ROOT}/${path}`, Buffer.from(content))
    await rootCheck(sandbox, bundle)
    assert.equal((await sandbox.runAsRoot('test ! -e /var/lib/conexus-sentinel', {})).exitCode, 0, 'no planted file ran as root')
    assert.equal((await sandbox.runAsRoot(`sha256sum ${folder}/main.mjs | cut -d' ' -f1`, {})).stdout.trim(), bundle.sha256, 'the bundle is the Hub bytes')
  } finally {
    await sandbox.destroy().catch(() => undefined)
  }
})

test('AC-8: tsc runs as uid 1500, so an import of a file only root can read is an error that does not show its content', { skip, timeout: 5 * 60_000 }, async () => {
  const sandbox = await openCheckSandbox()
  try {
    await sandbox.start()
    process.stdout.write(`E2B_SANDBOX ${sandbox.sandboxId}\n`)
    const files = await starterFiles()
    const bundle = await placeHubCheck(sandbox, { ...files, 'app/src/main.tsx': `import { secret } from '/root/conexus-probe-secret'\nexport const leaked: string = secret\n${files['app/src/main.tsx']}` })
    assert.equal((await sandbox.runAsRoot("mkdir -p /root && printf 'export const secret = \"ROOT_ONLY_MARKER\"\\n' > /root/conexus-probe-secret.ts && chmod 600 /root/conexus-probe-secret.ts", {})).exitCode, 0)
    const report = await rootCheck(sandbox, bundle)
    const typecheck = report.steps.find((step) => step.step === 'typecheck')
    assert.equal(typecheck.status, 'failed')
    assert.ok(typecheck.problems.length > 0)
    assert.equal(JSON.stringify(report).includes('ROOT_ONLY_MARKER'), false, 'the root only file content is nowhere in the report')
  } finally {
    await sandbox.destroy().catch(() => undefined)
  }
})

test('AC-9: the gate reads only its own root-only store, whatever the agent plants, and a type error is still reported', { skip, timeout: 8 * 60_000 }, async () => {
  const sandbox = await openCheckSandbox()
  try {
    await sandbox.start()
    process.stdout.write(`E2B_SANDBOX ${sandbox.sandboxId}\n`)
    const files = await starterFiles()
    const bundle = await placeHubCheck(sandbox, files)
    assert.equal((await rootCheck(sandbox, bundle)).ok, true, 'a clean tree fills the gate store')
    const store = `/var/lib/conexus-check-cache/${bundle.sha256}/gate/app`
    assert.equal((await sandbox.runAsRoot(`stat -c '%U %a' ${store}/tsbuildinfo`, {})).stdout.trim(), 'root 600')
    // The cache the gate reads is the store, and only the store: a check of the unchanged tree finds
    // nothing to write back, so the file keeps the date it was given. A gate that read any other file
    // (the tool's cache, a folder the agent can write) would rewrite it.
    const marked = '@1577836800'
    assert.equal((await sandbox.runAsRoot(`touch -d ${marked} ${store}/tsbuildinfo`, {})).exitCode, 0)
    const clean = (await sandbox.runAsRoot(`cat ${store}/tsbuildinfo`, {})).stdout
    const lend = `/tmp/conexus-lend-${createHash('sha256').update(store).digest('hex').slice(0, 16)}`
    // The agent plants its forgery everywhere it can write, among them the folder the gate lends from.
    assert.equal((await asAgent(sandbox, `mkdir -p ${lend} ${`/home/conexus-agent/.conexus-check-cache/${bundle.sha256}`}/tool/app ${`/home/conexus-agent/.conexus-check-cache/${bundle.sha256}`}/gate/app && echo decoy > ${lend}/decoy`)).exitCode, 0)
    await sandbox.writeFiles([
      { path: '/workspace/tsbuildinfo', content: clean }, { path: `${lend}/tsbuildinfo`, content: 'forged' },
      { path: `/home/conexus-agent/.conexus-check-cache/${bundle.sha256}/tool/app/tsbuildinfo`, content: 'forged' },
      { path: `/home/conexus-agent/.conexus-check-cache/${bundle.sha256}/gate/app/tsbuildinfo`, content: 'forged' },
    ])
    assert.equal((await rootCheck(sandbox, bundle)).ok, true)
    assert.equal((await sandbox.runAsRoot(`stat -c %Y ${store}/tsbuildinfo`, {})).stdout.trim(), '1577836800', 'the gate read the store and nothing it wrote was needed')
    assert.notEqual((await sandbox.runAsRoot(`test -e ${lend}`, {})).exitCode, 0, 'the lent folder, planted decoy and all, is gone after the check')
    await sandbox.writeRootFile(`${CHECK_ROOT}/app/src/main.tsx`, Buffer.from(`${files['app/src/main.tsx']}export const answer: number = 'six'\n`))
    const refused = await rootCheck(sandbox, bundle)
    assert.equal(refused.ok, false)
    assert.deepEqual(refused.steps.find((step) => step.step === 'typecheck').problems.map((problem) => problem.code), ['TS2322'])
    assert.notEqual((await sandbox.runAsRoot('pgrep -u 1500', {})).exitCode, 0, 'no uid 1500 process outlives the check')
    assert.equal((await sandbox.runAsRoot(`ls ${store} | tr '\\n' ' '`, {})).stdout.trim(), 'tsbuildinfo', 'the store holds only its own file, and the lock is released')
  } finally {
    await sandbox.destroy().catch(() => undefined)
  }
})

test('AC-12: a step past its limit is stopped with its whole process group, in the real VM under a root check', { skip, timeout: 5 * 60_000 }, async () => {
  const sandbox = await openCheckSandbox()
  try {
    await sandbox.start()
    process.stdout.write(`E2B_SANDBOX ${sandbox.sandboxId}\n`)
    const bundle = await placeHubCheck(sandbox, await starterFiles())
    // A probe layout of its own: the bundle beside a compiler whose vite config never returns and leaves a sleeper behind.
    const probe = '/var/lib/conexus-probe/opt'
    await sandbox.writeRootFile(`${probe}/check/${bundle.sha256}/main.mjs`, Buffer.from(bundle.bytes))
    await sandbox.writeRootFile(`${probe}/compiler/vite.config.mjs`, Buffer.from("import { spawn } from 'node:child_process'\nspawn('sleep', ['300'], { stdio: 'ignore' })\nawait new Promise(() => {})\n"))
    assert.equal((await sandbox.runAsRoot(`for entry in /opt/conexus/compiler/*; do name=$(basename "$entry"); [ "$name" = vite.config.mjs ] || ln -s "$entry" ${probe}/compiler/$name; done; chmod -R a+rX /var/lib/conexus-probe`, {})).exitCode, 0)
    const line = `/usr/local/bin/node ${probe}/check/${bundle.sha256}/main.mjs check --caller gate --root '${CHECK_ROOT}' --out '${CHECK_OUT}' --template-ref 'probe' --as 1500:1500 --limit build=2000`
    const started = Date.now()
    const ran = await sandbox.runAsRoot(line, {})
    assert.equal(ran.exitCode, 0, ran.stderr)
    const { readCheckReport } = await (await loadHub())('builder/application-check.js')
    const report = readCheckReport(ran.stdout.trim().split('\n').pop())
    assert.ok(Date.now() - started < 60_000)
    assert.deepEqual(report.steps.find((step) => step.step === 'build').problems, [{ code: 'STEP_TIMEOUT', message: 'build exceeded 2 s and was stopped' }])
    assert.notEqual((await sandbox.runAsRoot('pgrep -x sleep', {})).exitCode, 0, 'no sleep process survives the step')
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

// The run runtime on a real VM, with a session that only suspends: the lifecycle of the VM is what is
// under test, so no model is called and no candidate reaches admission.
