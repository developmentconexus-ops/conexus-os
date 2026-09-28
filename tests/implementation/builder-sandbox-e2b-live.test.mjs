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
// before it ends. Run with `npm run rb:builder:live`, which reads the Hub env file.
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
  const { createConexusGit, pullCandidate, seedSandbox } = await hub('builder/conexus-git.js')
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
  }
  try {
    await sandbox.start()
    assert.equal((await agent('id -un')).stdout.trim(), 'conexus-agent')
    assert.notEqual((await agent('sudo -n true')).exitCode, 0, 'the agent user has no sudo')
    const seedFile = `/var/lib/conexus-seed/${runId}.bundle`
    await seedSandbox({ git, projectId, base, sandbox: source, checkout: SANDBOX_CHECKOUT, seedFile })
    assert.equal((await agent('git rev-parse HEAD', SANDBOX_CHECKOUT)).stdout.trim(), base)
    assert.notEqual((await agent(`: > '${seedFile}'`)).exitCode, 0, 'the agent user cannot replace the seed')
    assert.equal((await agent('echo changed > app/index.html && mkdir -p .conexus/plans && echo plan > .conexus/plans/p.md', SANDBOX_CHECKOUT)).exitCode, 0)
    const candidate = await pullCandidate({ git, projectId, runId, base, sandbox: source, checkout: SANDBOX_CHECKOUT })
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

test('the application check builds the starter in the real template, keeps its link out of Git, and fails on broken code', { skip, timeout: 5 * 60_000 }, async () => {
  const hub = await loadHub()
  const { ConexusRunSandbox } = await hub('builder/sandbox.js')
  const { APPLICATION_CHECK_EXCLUDED, APPLICATION_CHECK_FILES, FIXED_APPLICATION_STARTER_FILES } = await hub('builder/application-starter.js')
  const { templateId, apiKey } = liveConfig()
  const sandbox = new ConexusRunSandbox({ id: `conexus-live-check-${randomUUID()}`, template: templateId, apiKey, timeout: 180_000, lifecycle: { onTimeout: 'kill' }, env: {} })
  const root = '/workspace/check-probe'
  const sh = (script) => sandbox.executeCommand('sh', ['-c', script], { env: {}, cwd: root })
  try {
    await sandbox.start()
    await sandbox.writeFiles([...FIXED_APPLICATION_STARTER_FILES, ...APPLICATION_CHECK_FILES].map((file) => ({ path: `${root}/${file.path}`, content: file.content })))
    const excluded = APPLICATION_CHECK_EXCLUDED.map((path) => `':(exclude)${path}'`).join(' ')
    const passed = await sh(`git init -q && sh conexus/check.sh >/dev/null && test -f /tmp/conexus-check-dist/index.html && test -L app/node_modules && git add --all -- . ${excluded} && git diff --cached --name-only`)
    assert.equal(passed.exitCode, 0, passed.stderr)
    assert.deepEqual(passed.stdout.trim().split('\n').sort(), [
      'app/index.html', 'app/src/main.tsx', 'app/src/style.css', 'conexus.json', 'conexus/check.sh',
    ])

    await sandbox.writeFiles([{ path: `${root}/app/src/main.tsx`, content: 'import { missing } from "./nowhere"\nmissing(\n' }])
    const failed = await sh('sh conexus/check.sh')
    assert.notEqual(failed.exitCode, 0, 'broken code fails the check')
  } finally {
    await sandbox.destroy().catch(() => undefined)
  }
})

const TIMEOUT_MS = 15_000
const PAST_DEADLINE_MS = TIMEOUT_MS * 2

const openLiveSandbox = async (loadHub, label) => {
  const { createRunSandbox } = await (await loadHub())('builder/sandbox.js')
  const { templateId, apiKey } = liveConfig()
  const sandbox = createRunSandbox({ apiKey, templateId, builderRunId: `live-keepalive-${label}-${randomUUID()}`, timeoutMs: TIMEOUT_MS })
  await sandbox.start()
  return { sandbox, apiKey }
}

test('a sandbox left alone past its timeout is gone: the next command silently gets a new incarnation', { skip, timeout: 90_000 }, async () => {
  const { sandbox, apiKey } = await openLiveSandbox(loadHub, 'baseline')
  const seen = [sandbox.sandboxId]
  try {
    await sandbox.executeCommand('true', [], { env: {} })
    assert.equal(sandbox.sandboxId, seen[0], 'still the sandbox it created')
    await sleep(PAST_DEADLINE_MS)
    await sandbox.executeCommand('true', [], { env: {} })
    seen.push(sandbox.sandboxId)
    assert.notEqual(sandbox.sandboxId, seen[0], 'E2B killed the sandbox at its deadline; the next command got a different incarnation')
  } finally {
    await killEverySandboxSeen(apiKey, seen)
  }
})

test('holdOpen() pushes a real sandbox\'s deadline out: the same incarnation survives past its original timeout', { skip, timeout: 90_000 }, async () => {
  const { sandbox, apiKey } = await openLiveSandbox(loadHub, 'fix')
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
  } finally {
    if (release) release()
    await killEverySandboxSeen(apiKey, seen)
  }
})
