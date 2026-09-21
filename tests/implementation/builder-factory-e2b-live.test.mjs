import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import test from 'node:test'
import { readBuilderE2BApiKey } from '../../scripts/builder-e2b-template.mjs'

// Paid: each test creates short-lived sandboxes on the Builder's real E2B template and kills them
// before it ends. Run with `npm run rb:builder:live`, which reads the Hub env file.
const live = process.env.CONEXUS_FACTORY_LIVE === 'true'
const skip = !live && 'opt-in: CONEXUS_FACTORY_LIVE=true with CONEXUS_BUILDER_E2B_API_KEY_FILE and CONEXUS_BUILDER_E2B_TEMPLATE_ID'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const loadHub = () => {
  const hubBuild = mkdtempSync(resolve(repositoryRoot, 'apps/hub/builder-factory-e2b-live-build-'))
  process.once('exit', () => rmSync(hubBuild, { recursive: true, force: true }))
  const compiled = spawnSync(process.execPath, [
    resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
    '--noEmit', 'false', '--outDir', hubBuild,
  ], { encoding: 'utf8' })
  if (compiled.status !== 0) throw new Error(`HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
  return (path) => import(pathToFileURL(resolve(hubBuild, path)).href)
}

const liveConfig = () => {
  const templateId = process.env.CONEXUS_BUILDER_E2B_TEMPLATE_ID
  if (!templateId || !/^[a-z0-9]+:[0-9a-f-]{36}$/.test(templateId)) throw new Error('CONEXUS_FACTORY_LIVE_CONFIG_REFUSED')
  return { templateId, apiKey: readBuilderE2BApiKey(process.env.CONEXUS_BUILDER_E2B_API_KEY_FILE) }
}

const PROCESS_TABLE = [
  'started() { sed -E \'s/^.*\\) //\' "$1/stat" 2>/dev/null | cut -d" " -f20; }',
  'cd /proc || exit 1',
  'for pid in [0-9]*; do readlink "$pid/exe" >/dev/null 2>&1 || continue; s=$(started "$pid"); [ -z "$s" ] || echo "$pid:$s $(cat "$pid/comm" 2>/dev/null)"; done',
].join('\n')

const processTable = async (sandbox) => {
  const listed = await sandbox.e2b.commands.run(PROCESS_TABLE, { user: 'root', cwd: '/', envs: {}, timeoutMs: 30_000 })
  return new Map(listed.stdout.trim().split('\n').map((line) => line.split(' ')))
}

const countSleeps = async (sandbox) => {
  const counted = await sandbox.e2b.commands.run('pgrep -xc sleep || true', { user: 'root', cwd: '/', envs: {}, timeoutMs: 30_000 })
  return Number(counted.stdout.trim())
}

test('on a real E2B VM the reap kills what the agent left running and every boot service survives', { skip, timeout: 5 * 60_000 }, async () => {
  const { ConexusFactoryE2BSandbox } = await (await loadHub())('builder/factory.js')
  const { templateId, apiKey } = liveConfig()
  const options = { id: `conexus-live-reap-${randomUUID()}`, template: templateId, apiKey, timeout: 180_000, lifecycle: { onTimeout: 'kill' }, env: {}, workingDirectory: '/workspace' }
  const first = new ConexusFactoryE2BSandbox(options)
  const replacement = new ConexusFactoryE2BSandbox(options)
  try {
    await first.start()
    assert.equal(first.processBaseline.sandboxId, first.sandboxId)

    await first.executeCommand('sh', ['-c', 'nohup setsid sleep 601 >/dev/null 2>&1 &'], { env: {} })
    await first.processes.spawn('sleep 600', { env: {} })
    assert.equal(await countSleeps(first), 2, 'both agent-left sleeps run before the reap')

    const beforeReap = await processTable(first)
    const boot = new Map([...beforeReap].filter(([entry]) => first.processBaseline.processes.has(entry)))
    const bootNames = [...new Set(boot.values())].sort()
    process.stderr.write(`FACTORY_LIVE_BOOT_SERVICES:${bootNames.join(',')}\n`)
    for (const service of ['sshd', 'chronyd', 'envd']) assert.ok(bootNames.includes(service), `${service} is a boot service of this template`)

    const reaped = await first.reapAgentProcesses()
    assert.equal(reaped.exitCode, 0)
    assert.equal(await countSleeps(first), 0, 'no agent-left sleep survives the reap')
    const afterReap = await processTable(first)
    const killed = [...boot].filter(([entry]) => !afterReap.has(entry)).map(([entry, name]) => `${name}:${entry}`)
    assert.deepEqual(killed, [], 'every boot service keeps its pid and start time')

    // A second Hub object for the same conversation has no baseline for the VM it finds, so it
    // kills that VM and creates its own rather than adopting what an earlier turn left running.
    await replacement.start()
    assert.notEqual(replacement.sandboxId, first.sandboxId)
    assert.equal(replacement.processBaseline.sandboxId, replacement.sandboxId)
    assert.equal(await first.e2b.isRunning(), false, 'the VM found by id was killed')
  } finally {
    await Promise.allSettled([first.destroy(), replacement.destroy()])
  }
})

test('a VM that E2B killed for idling is replaced by the next command, with a baseline of its own', { skip, timeout: 5 * 60_000 }, async () => {
  const { ConexusFactoryE2BSandbox } = await (await loadHub())('builder/factory.js')
  const { templateId, apiKey } = liveConfig()
  const sandbox = new ConexusFactoryE2BSandbox({ id: `conexus-live-idle-${randomUUID()}`, template: templateId, apiKey, timeout: 15_000, lifecycle: { onTimeout: 'kill' }, env: {}, workingDirectory: '/workspace' })
  try {
    await sandbox.start()
    const dead = sandbox.sandboxId
    await sleep(35_000)
    const ran = await sandbox.executeCommand('true', [], { env: {} })
    assert.equal(ran.exitCode, 0)
    assert.notEqual(sandbox.sandboxId, dead)
    assert.equal(sandbox.processBaseline.sandboxId, sandbox.sandboxId)
    assert.equal((await sandbox.reapAgentProcesses()).exitCode, 0)
  } finally {
    await sandbox.destroy().catch(() => undefined)
  }
})

test('the application check builds the starter in the real template, keeps its link out of Git, and fails on broken code', { skip, timeout: 5 * 60_000 }, async () => {
  const hub = await loadHub()
  const { ConexusFactoryE2BSandbox } = await hub('builder/factory.js')
  const { APPLICATION_CHECK_FILES, FIXED_APPLICATION_STARTER_FILES } = await hub('builder/application-starter.js')
  const { templateId, apiKey } = liveConfig()
  const sandbox = new ConexusFactoryE2BSandbox({ id: `conexus-live-check-${randomUUID()}`, template: templateId, apiKey, timeout: 180_000, lifecycle: { onTimeout: 'kill' }, env: {}, workingDirectory: '/workspace' })
  const root = '/workspace/check-probe'
  const sh = (script) => sandbox.executeCommand('sh', ['-c', script], { env: {}, cwd: root })
  try {
    await sandbox.start()
    await sandbox.writeFiles([...FIXED_APPLICATION_STARTER_FILES, ...APPLICATION_CHECK_FILES].map((file) => ({ path: `${root}/${file.path}`, content: file.content })))
    const passed = await sh('git init -q && sh conexus/check.sh >/dev/null && test -f /tmp/conexus-check-dist/index.html && git check-ignore -q app/node_modules && git status --porcelain --untracked-files=all')
    assert.equal(passed.exitCode, 0, passed.stderr)
    assert.deepEqual(passed.stdout.trim().split('\n').sort(), [
      '?? .gitignore', '?? app/index.html', '?? app/src/main.tsx', '?? app/src/style.css', '?? conexus.json', '?? conexus/check.sh',
    ])

    await sandbox.writeFiles([{ path: `${root}/app/src/main.tsx`, content: 'import { missing } from "./nowhere"\nmissing(\n' }])
    const failed = await sh('sh conexus/check.sh')
    assert.notEqual(failed.exitCode, 0, 'broken code fails the check')
  } finally {
    await sandbox.destroy().catch(() => undefined)
  }
})
