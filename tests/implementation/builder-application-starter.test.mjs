import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const cacheRoot = resolve(repositoryRoot, 'node_modules/.cache')
mkdirSync(cacheRoot, { recursive: true })

const {
  APPLICATION_CHECK_FILES,
  APPLICATION_CHECK_INSTRUCTION,
  materializeApplicationCheck,
  FIXED_APPLICATION_STARTER_FILES,
  materializeFixedApplicationStarter,
  removeStaleServerSkill,
} = await import(hubModuleUrl('builder/application-starter.js'))

const commandResult = (result) => ({
  success: result.status === 0,
  exitCode: result.status ?? -1,
  stdout: result.stdout ?? '',
  stderr: result.stderr ?? '',
  executionTimeMs: 0,
})

const localWorkspace = (root, writes = []) => ({
  directCommand: async (command, args) => commandResult(spawnSync(command, args, { cwd: root, encoding: 'utf8' })),
  writeFiles: async (files) => {
    for (const file of files) {
      writes.push(file.path)
      mkdirSync(dirname(file.path), { recursive: true })
      writeFileSync(file.path, file.content)
    }
  },
})

test('materializes the fixed empty React starter into an app-less checkout', async () => {
  const root = mkdtempSync(resolve(cacheRoot, 'starter-empty-'))
  try {
    const writes = []
    const result = await materializeFixedApplicationStarter({
      repositoryRoot: root,
      ...localWorkspace(root, writes),
    })

    assert.equal(result, 'MATERIALIZED')
    assert.deepEqual(FIXED_APPLICATION_STARTER_FILES.map((file) => file.path), [
      'app/index.html',
      'app/src/main.tsx',
      'app/src/style.css',
    ])
    assert.deepEqual(writes, FIXED_APPLICATION_STARTER_FILES.map((file) => join(root, file.path)))
    for (const file of FIXED_APPLICATION_STARTER_FILES) {
      assert.equal(readFileSync(join(root, file.path), 'utf8'), file.content)
    }
    assert.match(readFileSync(join(root, 'app/index.html'), 'utf8'), /<div id="root"><\/div>/)
    assert.match(readFileSync(join(root, 'app/index.html'), 'utf8'), /src="\/src\/main\.tsx"/)
    assert.match(readFileSync(join(root, 'app/src/main.tsx'), 'utf8'), /createRoot/)
    assert.match(readFileSync(join(root, 'app/src/main.tsx'), 'utf8'), /\.\/style\.css/)
    assert.doesNotMatch(readFileSync(join(root, 'app/src/main.tsx'), 'utf8'), /counter|business|seed/i)
    assert.match(readFileSync(join(root, 'app/src/style.css'), 'utf8'), /body \{[\s\S]*margin: 0;/)

    const beforeSecondRequest = new Map(FIXED_APPLICATION_STARTER_FILES.map((file) => [file.path, readFileSync(join(root, file.path), 'utf8')]))
    assert.equal(await materializeFixedApplicationStarter({
      repositoryRoot: root,
      ...localWorkspace(root, writes),
    }), 'PRESERVED')
    assert.deepEqual(writes, FIXED_APPLICATION_STARTER_FILES.map((file) => join(root, file.path)))
    for (const [path, content] of beforeSecondRequest) assert.equal(readFileSync(join(root, path), 'utf8'), content)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('preserves every existing app entry, including a different source filename', async () => {
  const root = mkdtempSync(resolve(cacheRoot, 'starter-existing-'))
  try {
    const existing = {
      'app/index.html': '<!doctype html><script type="module" src="/src/entry.tsx"></script>\n',
      'app/src/entry.tsx': 'export const existing = true\n',
      'app/src/custom.css': 'body { color: rebeccapurple }\n',
    }
    for (const [path, content] of Object.entries(existing)) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), content)
    }
    const writes = []
    const result = await materializeFixedApplicationStarter({
      repositoryRoot: root,
      ...localWorkspace(root, writes),
    })

    assert.equal(result, 'PRESERVED')
    assert.deepEqual(writes, [])
    for (const [path, content] of Object.entries(existing)) assert.equal(readFileSync(join(root, path), 'utf8'), content)
    assert.equal(readFileSync(join(root, 'app/src/entry.tsx'), 'utf8'), existing['app/src/entry.tsx'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the application check builds app/ and then the server half into /tmp/conexus-check-dist', () => {
  assert.deepEqual(APPLICATION_CHECK_FILES.map((file) => file.path), ['conexus.json', 'conexus/check.sh'])
  const [manifest, check] = APPLICATION_CHECK_FILES.map((file) => file.content)
  assert.deepEqual(JSON.parse(manifest), { shape: 'REACT_VITE_V1', check: 'sh conexus/check.sh' })
  assert.equal(check, [
    '#!/bin/sh',
    '# Builds app/ and the conexus/ server half the way Conexus builds them before a Preview. Run it from the repository root.',
    'set -eu',
    'root=$(cd "$(dirname "$0")/.." && pwd)',
    'ln -sfn /opt/conexus/compiler/node_modules "$root/app/node_modules"',
    'cd "$root/app"',
    'CONEXUS_COMPILE_ROOT="$root/app" node /opt/conexus/compiler/node_modules/vite/bin/vite.js build --config /opt/conexus/compiler/vite.config.mjs --configLoader native --outDir /tmp/conexus-check-dist --emptyOutDir',
    'node /opt/conexus/server-build.mjs "$root" /tmp/conexus-check-dist',
    '',
  ].join('\n'))
  assert.equal(APPLICATION_CHECK_INSTRUCTION, 'Before finishing a BUILD, run `sh conexus/check.sh` at the repository root and fix what it reports.')
})

test('the global conexus-server skill matches the check it documents', () => {
  const guide = readFileSync(resolve(repositoryRoot, 'factory-skills/conexus-server/SKILL.md'), 'utf8')
  // The guide's example is the contract the check enforces, so it must be one the check admits.
  const example = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(guide)[1])
  assert.deepEqual(Object.keys(example.operations), ['listItems'])
  assert.match(guide, /fetch\('\/__conexus\/api\/listItems'/)
  assert.match(guide, /^---\nname: conexus-server\ndescription: [^\n]+\n---\n/m)
  assert.doesNotMatch(guide, /\bKysely\b|\bPrisma\b|\bDrizzle\b/)
  // The handler contract names the caller beside db and tells the Builder never to take it from input.
  assert.match(guide, /type Caller = \{ accountId: string; email: string \| null; displayName: string \}/)
  assert.match(guide, /\{ db, caller \}: \{ db: Db; caller: Caller \}/)
  assert.match(guide, /never add a name or author field to the input/)
})

test('writes only the application check files a checkout lacks, and never over a symlink', async () => {
  const root = mkdtempSync(resolve(cacheRoot, 'starter-check-'))
  try {
    mkdirSync(join(root, 'conexus'))
    writeFileSync(join(root, 'conexus/check.sh'), 'echo edited by the agent\n')
    const writes = []
    await materializeApplicationCheck({ repositoryRoot: root, ...localWorkspace(root, writes) })
    assert.deepEqual(writes, [join(root, 'conexus.json')])
    assert.equal(readFileSync(join(root, 'conexus/check.sh'), 'utf8'), 'echo edited by the agent\n')

    await materializeApplicationCheck({ repositoryRoot: root, ...localWorkspace(root, writes) })
    assert.equal(writes.length, 1)

    rmSync(join(root, 'conexus.json'))
    symlinkSync('/etc/hostname', join(root, 'conexus.json'))
    await assert.rejects(materializeApplicationCheck({ repositoryRoot: root, ...localWorkspace(root, writes) }), /BUILDER_STARTER_ENTRY_UNSAFE/)
    assert.equal(writes.length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('removeStaleServerSkill deletes a checkout own copy of the skill the Builder now serves globally', async () => {
  const root = mkdtempSync(resolve(cacheRoot, 'stale-skill-'))
  try {
    mkdirSync(join(root, '.agents/skills/conexus-server'), { recursive: true })
    writeFileSync(join(root, '.agents/skills/conexus-server/SKILL.md'), 'a stale Project copy\n')
    writeFileSync(join(root, '.agents/skills/conexus-server/extra.txt'), 'leftover\n')
    const writes = []
    await removeStaleServerSkill({ repositoryRoot: root, ...localWorkspace(root, writes) })
    assert.deepEqual(readdirSync(join(root, '.agents/skills')), [])
    assert.deepEqual(writes, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('removeStaleServerSkill is a no-op when the checkout never carried the skill', async () => {
  const root = mkdtempSync(resolve(cacheRoot, 'stale-skill-absent-'))
  try {
    const writes = []
    await removeStaleServerSkill({ repositoryRoot: root, ...localWorkspace(root, writes) })
    assert.deepEqual(readdirSync(root), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

const scriptedWorkspace = (result, writes = []) => ({
  directCommand: async () => ({ executionTimeMs: 0, ...result }),
  writeFiles: async (files) => { writes.push(...files.map((file) => file.path)) },
})

test('a successful inspection that also wrote to stderr still decides the entry', async () => {
  const writes = []
  const result = await materializeFixedApplicationStarter({
    repositoryRoot: '/workspace/app',
    ...scriptedWorkspace({ success: true, exitCode: 0, stdout: 'ABSENT', stderr: 'sh: warning: setlocale: LC_ALL: cannot change locale\n' }, writes),
  })
  assert.equal(result, 'MATERIALIZED')
  assert.deepEqual(writes, ['/workspace/app/app/index.html', '/workspace/app/app/src/main.tsx', '/workspace/app/app/src/style.css'])
})

test('a failed inspection keeps its exit code and a bounded, redacted stderr as the cause', async () => {
  const stderr = `Error: sandbox ijevj4 not found; header AUTHORIZATION: basic eC1hY2Nlc3MtdG9rZW46Z2hzX3NlY3JldA== token ghs_abcdefSECRET ${'x'.repeat(900)}`
  const error = await materializeFixedApplicationStarter({
    repositoryRoot: '/workspace/app',
    ...scriptedWorkspace({ success: false, exitCode: 1, stdout: '', stderr }),
  }).then(() => null, (thrown) => thrown)
  assert.equal(error?.message, 'BUILDER_STARTER_ENTRY_INSPECTION_FAILED')
  assert.equal(error.cause.exitCode, 1)
  assert.equal(error.cause.stdout, '')
  assert.equal(error.cause.stderr, `Error: sandbox ijevj4 not found; header AUTHORIZATION: [redacted] token [redacted] ${'x'.repeat(317)}…`)
})

test('an inspection that exits 0 with an unknown answer fails and keeps what it printed', async () => {
  const error = await materializeFixedApplicationStarter({
    repositoryRoot: '/workspace/app',
    ...scriptedWorkspace({ success: true, exitCode: 0, stdout: 'MAYBE\n', stderr: '' }),
  }).then(() => null, (thrown) => thrown)
  assert.equal(error?.message, 'BUILDER_STARTER_ENTRY_INSPECTION_FAILED')
  assert.deepEqual(error.cause, { exitCode: 0, stdout: 'MAYBE\n', stderr: '' })
})

test('refuses an unsafe app symlink before writing starter files', async () => {
  const root = mkdtempSync(resolve(cacheRoot, 'starter-unsafe-'))
  const outside = mkdtempSync(resolve(cacheRoot, 'starter-outside-'))
  try {
    symlinkSync(outside, join(root, 'app'), 'dir')
    const writes = []
    await assert.rejects(
      materializeFixedApplicationStarter({
        repositoryRoot: root,
        ...localWorkspace(root, writes),
      }),
      /BUILDER_STARTER_ENTRY_UNSAFE/,
    )
    assert.deepEqual(writes, [])
    assert.deepEqual([], readdirSync(outside))
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
})
