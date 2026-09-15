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
    assert.deepEqual(BUILDER_MODE_DEFINITIONS[0].availableTools.includes('mastra_workspace_write_file'), true)
    assert.deepEqual(BUILDER_MODE_DEFINITIONS[1].availableTools.some((tool) => /write|edit|delete|execute/.test(tool)), false)

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
