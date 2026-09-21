import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const cacheRoot = resolve(repositoryRoot, 'node_modules/.cache')
mkdirSync(cacheRoot, { recursive: true })
const buildRoot = mkdtempSync(resolve(cacheRoot, 'builder-application-starter-'))
test.after(() => rmSync(buildRoot, { recursive: true, force: true }))

const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', buildRoot,
], { cwd: repositoryRoot, encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(compiled.stdout || compiled.stderr)

const {
  APPLICATION_CHECK_FILES,
  APPLICATION_CHECK_INSTRUCTION,
  materializeApplicationCheck,
  BUILDER_BASE_AGENT_INSTRUCTIONS,
  BUILDER_MODE_DEFINITIONS,
  BUILDER_MODE_INSTRUCTIONS,
  FIXED_APPLICATION_STARTER_FILES,
  materializeFixedApplicationStarter,
} = await import(pathToFileURL(resolve(buildRoot, 'builder/application-starter.js')).href)

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
    assert.match(BUILDER_BASE_AGENT_INSTRUCTIONS, /Session Workspace/)
    assert.match(BUILDER_BASE_AGENT_INSTRUCTIONS, /app\/\*\*/)
    assert.match(BUILDER_BASE_AGENT_INSTRUCTIONS, /REACT_VITE_V1/)
    assert.match(BUILDER_BASE_AGENT_INSTRUCTIONS, /portugu[eê]s brasileiro/i)
    assert.match(BUILDER_BASE_AGENT_INSTRUCTIONS, /chain-of-thought/i)
    assert.match(BUILDER_MODE_INSTRUCTIONS.BUILD, /implementar/i)
    assert.match(BUILDER_MODE_INSTRUCTIONS.PLAN, /somente leitura/i)
    assert.doesNotMatch(BUILDER_MODE_INSTRUCTIONS.PLAN, /editar|alterar/i)
    // The modes name Mastra Code's own tools, because that is the composition the run acts through.
    assert.deepEqual([...BUILDER_MODE_DEFINITIONS[0].availableTools],
      ['view', 'write_file', 'string_replace_lsp', 'find_files', 'delete_file', 'file_stat', 'mkdir', 'search_content', 'execute_command'])
    assert.deepEqual([...BUILDER_MODE_DEFINITIONS[1].availableTools], ['view', 'find_files', 'file_stat', 'search_content'])
    assert.deepEqual(BUILDER_MODE_DEFINITIONS[1].availableTools.some((tool) => /write|replace|delete|mkdir|execute/.test(tool)), false)

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

test('the application check is the compiler build command writing to /tmp/conexus-check-dist', () => {
  assert.deepEqual(APPLICATION_CHECK_FILES.map((file) => file.path), ['conexus.json', 'conexus/check.sh', '.gitignore'])
  const [manifest, check, ignore] = APPLICATION_CHECK_FILES.map((file) => file.content)
  assert.deepEqual(JSON.parse(manifest), { shape: 'REACT_VITE_V1', check: 'sh conexus/check.sh' })
  assert.equal(check, [
    '#!/bin/sh',
    '# Builds app/ the way Conexus builds it before a Preview. Run it from the repository root.',
    'set -eu',
    'root=$(cd "$(dirname "$0")/.." && pwd)',
    'ln -sfn /opt/conexus/compiler/node_modules "$root/app/node_modules"',
    'cd "$root/app"',
    'CONEXUS_COMPILE_ROOT="$root/app" exec node /opt/conexus/compiler/node_modules/vite/bin/vite.js build --config /opt/conexus/compiler/vite.config.mjs --configLoader native --outDir /tmp/conexus-check-dist --emptyOutDir',
    '',
  ].join('\n'))
  assert.equal(ignore, '/app/node_modules\n')
  assert.equal(APPLICATION_CHECK_INSTRUCTION, 'Before finishing a BUILD, run `sh conexus/check.sh` at the repository root and fix what it reports.')
})

test('writes only the application check files a checkout lacks, and never over a symlink', async () => {
  const root = mkdtempSync(resolve(cacheRoot, 'starter-check-'))
  try {
    mkdirSync(join(root, 'conexus'))
    writeFileSync(join(root, 'conexus/check.sh'), 'echo edited by the agent\n')
    const writes = []
    await materializeApplicationCheck({ repositoryRoot: root, ...localWorkspace(root, writes) })
    assert.deepEqual(writes, [join(root, 'conexus.json'), join(root, '.gitignore')])
    assert.equal(readFileSync(join(root, 'conexus/check.sh'), 'utf8'), 'echo edited by the agent\n')

    await materializeApplicationCheck({ repositoryRoot: root, ...localWorkspace(root, writes) })
    assert.equal(writes.length, 2)

    rmSync(join(root, '.gitignore'))
    symlinkSync('/etc/hostname', join(root, '.gitignore'))
    await assert.rejects(materializeApplicationCheck({ repositoryRoot: root, ...localWorkspace(root, writes) }), /BUILDER_STARTER_ENTRY_UNSAFE/)
    assert.equal(writes.length, 2)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
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
