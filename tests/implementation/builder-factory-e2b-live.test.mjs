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

// Left running by the agent: every 200 ms it copies any AUTHORIZATION it can read from any process
// environment into /workspace/stolen.
const WATCHER = `nohup setsid sh -c 'while :; do for p in /proc/[0-9]*; do tr "\\0" "\\n" < "$p/environ" 2>/dev/null; done | grep AUTHORIZATION >> /workspace/stolen; sleep 0.2; done' >/dev/null 2>&1 &`

test('on a real E2B VM the agent user cannot read a root git environment, and root still moves commits through its own mirror', { skip, timeout: 5 * 60_000 }, async () => {
  const { ConexusFactoryE2BSandbox } = await (await loadHub())('builder/factory.js')
  const { templateId, apiKey } = liveConfig()
  const sandbox = new ConexusFactoryE2BSandbox({ id: `conexus-live-agent-user-${randomUUID()}`, template: templateId, apiKey, timeout: 180_000, lifecycle: { onTimeout: 'kill' }, env: {}, workingDirectory: '/workspace' })
  const agent = (script, cwd = '/workspace') => sandbox.executeCommand('sh', ['-c', script], { env: {}, cwd })
  try {
    await sandbox.start()
    assert.equal((await agent('id -un')).stdout.trim(), 'conexus-agent')
    assert.notEqual((await agent('sudo -n true')).exitCode, 0, 'the agent user has no sudo')
    await agent(`: > /workspace/stolen && ${WATCHER}`)

    const control = await agent('GIT_CONFIG_VALUE_0="AUTHORIZATION: basic agent-user-control" sleep 2')
    assert.equal(control.exitCode, 0)
    const root = await sandbox.runAsRoot('sleep 2 && git --version', { GIT_CONFIG_VALUE_0: 'AUTHORIZATION: basic root-held-secret' })
    assert.equal(root.exitCode, 0)
    const stolen = (await agent('sort -u /workspace/stolen')).stdout
    process.stderr.write(`FACTORY_LIVE_STOLEN:${JSON.stringify(stolen)}\n`)
    assert.match(stolen, /agent-user-control/, 'the watcher reads a process of its own user')
    assert.doesNotMatch(stolen, /root-held-secret/, 'the watcher never reads the root process')

    const repo = '/workspace/live-repo'
    const committed = await agent(`git init -q -b main ${repo} && cd ${repo} && echo one > a.txt && git add --all && git -c user.name=a -c user.email=a@b.invalid commit -qm one && git bundle create --quiet /workspace/.conexus-result.bundle refs/heads/main && git rev-parse HEAD`)
    assert.equal(committed.exitCode, 0, committed.stderr)
    const result = committed.stdout.trim()
    const mirror = "git --git-dir='/var/lib/conexus-git/live.git'"
    const pushed = await sandbox.runAsRoot([
      "mkdir -p '/var/lib/conexus-git'",
      "git init --quiet --bare '/var/lib/conexus-git/live.git'",
      'git init --quiet --bare /var/lib/conexus-live-remote.git',
      `${mirror} fetch --quiet '/workspace/.conexus-result.bundle' 'refs/heads/main'`,
      `${mirror} push --quiet --force /var/lib/conexus-live-remote.git '${result}:refs/heads/conexus/live'`,
      "git --git-dir=/var/lib/conexus-live-remote.git rev-parse 'refs/heads/conexus/live'",
      `${mirror} update-ref refs/conexus/base '${result}'`,
      `${mirror} bundle create --quiet '/var/lib/conexus-git/live.base.bundle' refs/conexus/base`,
    ].join(' && '), {})
    assert.deepEqual([pushed.exitCode, pushed.stdout.trim()], [0, result], pushed.stderr)
    const pinned = await agent(`git fetch --quiet --no-tags '/var/lib/conexus-git/live.base.bundle' refs/conexus/base && git checkout --quiet -B conexus/live '${result}' && git rev-parse HEAD && echo two >> a.txt && git status --porcelain`, repo)
    assert.deepEqual([pinned.exitCode, pinned.stdout.trim()], [0, `${result}\n M a.txt`], pinned.stderr)
    assert.notEqual((await agent('touch /var/lib/conexus-git/live.git/HEAD')).exitCode, 0, 'the agent user cannot write the Hub mirror')
  } finally {
    await sandbox.destroy().catch(() => undefined)
  }
})

test('a VM that E2B killed for idling is replaced by the next command, and root commands reach the new one', { skip, timeout: 5 * 60_000 }, async () => {
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
    assert.equal((await sandbox.runAsRoot('id -un', {})).stdout.trim(), 'root')
  } finally {
    await sandbox.destroy().catch(() => undefined)
  }
})

test('the application check builds the starter in the real template, keeps its link out of Git, and fails on broken code', { skip, timeout: 5 * 60_000 }, async () => {
  const hub = await loadHub()
  const { ConexusFactoryE2BSandbox } = await hub('builder/factory.js')
  const { APPLICATION_CHECK_FILES, APPLICATION_CHECK_SETUP_COMMAND, FIXED_APPLICATION_STARTER_FILES } = await hub('builder/application-starter.js')
  const { templateId, apiKey } = liveConfig()
  const sandbox = new ConexusFactoryE2BSandbox({ id: `conexus-live-check-${randomUUID()}`, template: templateId, apiKey, timeout: 180_000, lifecycle: { onTimeout: 'kill' }, env: {}, workingDirectory: '/workspace' })
  const root = '/workspace/check-probe'
  const sh = (script) => sandbox.executeCommand('sh', ['-c', script], { env: {}, cwd: root })
  try {
    await sandbox.start()
    await sandbox.writeFiles([...FIXED_APPLICATION_STARTER_FILES, ...APPLICATION_CHECK_FILES].map((file) => ({ path: `${root}/${file.path}`, content: file.content })))
    const passed = await sh(`git init -q && ${APPLICATION_CHECK_SETUP_COMMAND} && sh conexus/check.sh >/dev/null && test -f /tmp/conexus-check-dist/index.html && git check-ignore -q app/node_modules && git status --porcelain --untracked-files=all`)
    assert.equal(passed.exitCode, 0, passed.stderr)
    assert.deepEqual(passed.stdout.trim().split('\n').sort(), [
      '?? app/index.html', '?? app/src/main.tsx', '?? app/src/style.css', '?? conexus.json', '?? conexus/check.sh',
    ])

    await sandbox.writeFiles([{ path: `${root}/app/src/main.tsx`, content: 'import { missing } from "./nowhere"\nmissing(\n' }])
    const failed = await sh('sh conexus/check.sh')
    assert.notEqual(failed.exitCode, 0, 'broken code fails the check')
  } finally {
    await sandbox.destroy().catch(() => undefined)
  }
})
