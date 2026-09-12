import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { Sandbox } from 'e2b'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = mkdtempSync(resolve(repositoryRoot, 'node_modules/.cache/conexus-application-runtime-build-'))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', buildRoot,
], { cwd: repositoryRoot, encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(compiled.stdout || compiled.stderr)
const built = pathToFileURL(resolve(buildRoot, 'builder/application-artifact-runtime.js')).href
const { createE2BApplicationCompiler } = await import(built)

test.after(() => rmSync(buildRoot, { recursive: true, force: true }))

const projectId = '11111111-1111-4111-8111-111111111111'
const changeId = '22222222-2222-4222-8222-222222222222'
const sourceRevision = 'a'.repeat(40)
const validInput = {
  projectId,
  changeId,
  sourceRevision,
  files: [{ path: 'index.html', content: '<!doctype html><html></html>' }],
}

test('application compiler rejects unsafe source before creating an E2B sandbox', async () => {
  const originalCreate = Sandbox.create
  let createCalls = 0
  Sandbox.create = async () => {
    createCalls += 1
    throw new Error('provider must not be called')
  }
  try {
    const compiler = createE2BApplicationCompiler({ apiKey: 'fixture-key' })
    await assert.rejects(
      compiler.compile({ ...validInput, files: [{ path: '../index.html', content: 'bad' }] }),
      /APPLICATION_COMPILER_INPUT_REFUSED/,
    )
    await assert.rejects(
      compiler.compile({ ...validInput, files: [{ path: 'vite.config.mjs', content: 'bad' }] }),
      /APPLICATION_COMPILER_INPUT_REFUSED/,
    )
    await assert.rejects(
      compiler.compile({ ...validInput, files: [{ path: 'index.html', content: '\u0000' }] }),
      /APPLICATION_COMPILER_INPUT_REFUSED/,
    )
    assert.equal(createCalls, 0)
  } finally {
    Sandbox.create = originalCreate
  }
})

test('application compiler rejects an already-aborted request without creating a sandbox', async () => {
  const originalCreate = Sandbox.create
  let createCalls = 0
  Sandbox.create = async () => {
    createCalls += 1
    throw new Error('provider must not be called')
  }
  try {
    const controller = new AbortController()
    controller.abort()
    const compiler = createE2BApplicationCompiler({ apiKey: 'fixture-key' })
    await assert.rejects(compiler.compile({ ...validInput, signal: controller.signal }), /APPLICATION_COMPILER_CANCELLED/)
    assert.equal(createCalls, 0)
  } finally {
    Sandbox.create = originalCreate
  }
})

test('application compiler preserves source identity and hashes actual regular output bytes', async () => {
  const originalCreate = Sandbox.create
  const output = new Map([
    ['/workspace/dist/index.html', Buffer.from('<!doctype html>')],
    ['/workspace/dist/assets/app.js', Buffer.from('console.log("ok")')],
  ])
  const calls = []
  const sandbox = {
    sandboxId: 'sbx-compiler-fixture',
    files: {
      write: async (entries, options) => { calls.push({ kind: 'write', entries, options }); return [] },
      list: async (_path, options) => {
        calls.push({ kind: 'list', options })
        return [...output].map(([path, bytes]) => ({ path, type: 'file', size: bytes.byteLength }))
      },
      read: async (path, options) => {
        calls.push({ kind: 'read', path, options })
        const bytes = new Uint8Array(output.get(path))
        return new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close() } })
      },
    },
    commands: {
      run: async (command, options) => {
        calls.push({ kind: 'run', command, options })
        return { exitCode: 0, stdout: '', stderr: '' }
      },
    },
    kill: async () => { calls.push({ kind: 'kill' }); return true },
  }
  Sandbox.create = async (template, options) => {
    calls.push({ kind: 'create', template, options })
    return sandbox
  }
  try {
    const compiler = createE2BApplicationCompiler({ apiKey: 'fixture-key' })
    const result = await compiler.compile(validInput)
    assert.equal(result.projectId, projectId)
    assert.equal(result.changeId, changeId)
    assert.equal(result.sourceRevision, sourceRevision)
    assert.equal(result.templateRef, 'xdli9puqp1nepk4ht6lw:8a1e3885-c6d7-4b06-aea6-860632f407e6')
    assert.equal(result.recipeSha256, '32230b4ba0b72625474b7f722e2294a256f9ab2f7c1c9b1eb107f38770edbe97')
    assert.deepEqual(result.files.map(file => ({ ...file, bytes: [...file.bytes] })), [
      { path: 'assets/app.js', mediaType: 'text/javascript; charset=utf-8', bytes: [...output.get('/workspace/dist/assets/app.js')], sha256: createHash('sha256').update(output.get('/workspace/dist/assets/app.js')).digest('hex') },
      { path: 'index.html', mediaType: 'text/html; charset=utf-8', bytes: [...output.get('/workspace/dist/index.html')], sha256: createHash('sha256').update(output.get('/workspace/dist/index.html')).digest('hex') },
    ])
    assert.equal(calls.at(-1).kind, 'kill')
    const buildCall = calls.find(call => call.kind === 'run' && call.command.startsWith('node '))
    assert.equal(buildCall.command, 'node /opt/conexus/compiler/node_modules/vite/bin/vite.js build --config /opt/conexus/compiler/vite.config.mjs --configLoader native')
    assert.equal(buildCall.options.cwd, '/workspace/app')
  } finally {
    Sandbox.create = originalCreate
  }
})

test('application compiler refuses late output after cancellation and still kills the exact sandbox', async () => {
  const originalCreate = Sandbox.create
  const controller = new AbortController()
  let killed = 0
  const sandbox = {
    sandboxId: 'sbx-late-result-fixture',
    files: {
      write: async () => [],
      list: async () => {
        controller.abort()
        return [{ path: '/workspace/dist/index.html', type: 'file', size: 1 }]
      },
      read: async () => new ReadableStream({ start(stream) { stream.enqueue(new Uint8Array([60])); stream.close() } }),
    },
    commands: { run: async () => ({ exitCode: 0, stdout: '', stderr: '' }) },
    kill: async () => { killed += 1; return true },
  }
  Sandbox.create = async () => sandbox
  try {
    const compiler = createE2BApplicationCompiler({ apiKey: 'fixture-key' })
    await assert.rejects(compiler.compile({ ...validInput, signal: controller.signal }), /APPLICATION_COMPILER_CANCELLED/)
    assert.equal(killed, 1)
  } finally {
    Sandbox.create = originalCreate
  }
})

test('application compiler reports cleanup failure instead of returning an artifact', async () => {
  const originalCreate = Sandbox.create
  const sandbox = {
    sandboxId: 'sbx-cleanup-failure-fixture',
    files: { write: async () => [], list: async () => [], read: async () => new ReadableStream({ start(stream) { stream.close() } }) },
    commands: { run: async () => ({ exitCode: 0, stdout: '', stderr: '' }) },
    kill: async () => { throw new Error('kill failed') },
  }
  Sandbox.create = async () => sandbox
  try {
    const compiler = createE2BApplicationCompiler({ apiKey: 'fixture-key' })
    await assert.rejects(compiler.compile(validInput), /APPLICATION_COMPILER_CLEANUP_FAILED/)
  } finally {
    Sandbox.create = originalCreate
  }
})

test('application compiler refuses cancellation during final sandbox cleanup', async () => {
  const originalCreate = Sandbox.create
  const controller = new AbortController()
  Sandbox.create = async () => ({
    sandboxId: 'cancel-during-cleanup',
    files: {
      write: async () => [],
      list: async () => [{ path: '/workspace/dist/index.html', type: 'file', size: 1 }],
      read: async () => new ReadableStream({ start(stream) { stream.enqueue(new Uint8Array([60])); stream.close() } }),
    },
    commands: { run: async () => ({ exitCode: 0, stdout: '', stderr: '' }) },
    kill: async () => { controller.abort(); return true },
  })
  try {
    await assert.rejects(createE2BApplicationCompiler({ apiKey: 'fixture-key' }).compile({ ...validInput, signal: controller.signal }), /APPLICATION_COMPILER_CANCELLED/)
  } finally { Sandbox.create = originalCreate }
})

for (const [name, entries, error] of [
  ['symlink', [{ path: '/workspace/dist/index.html', type: 'symlink', size: 1 }], /SYMLINK_REFUSED/],
  ['traversal', [{ path: '/workspace/dist/../index.html', type: 'file', size: 1 }], /PATH_REFUSED/],
  ['byte limit', [{ path: '/workspace/dist/index.html', type: 'file', size: 12 * 1024 * 1024 + 1 }], /LIMIT_REFUSED/],
  ['file count', Array.from({ length: 257 }, (_, index) => ({ path: `/workspace/dist/${index === 0 ? 'index' : index}.html`, type: 'file', size: 1 })), /LIMIT_REFUSED/],
]) {
  test(`application compiler refuses output ${name} before downloading bytes`, async () => {
    const originalCreate = Sandbox.create
    let killed = false
    Sandbox.create = async () => ({
      sandboxId: 'invalid-output-fixture',
      files: { write: async () => [], list: async () => entries, read: async () => assert.fail('Rejected output must not download') },
      commands: { run: async () => ({ exitCode: 0, stdout: '', stderr: '' }) },
      kill: async () => { killed = true; return true },
    })
    try {
      await assert.rejects(createE2BApplicationCompiler({ apiKey: 'fixture-key' }).compile(validInput), error)
      assert.equal(killed, true)
    } finally { Sandbox.create = originalCreate }
  })
}
