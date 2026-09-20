import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const cacheRoot = resolve(repositoryRoot, 'node_modules/.cache')
mkdirSync(cacheRoot, { recursive: true })
const buildRoot = mkdtempSync(resolve(cacheRoot, 'conexus-application-runtime-build-'))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', buildRoot,
], { cwd: repositoryRoot, encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(compiled.stdout || compiled.stderr)
const built = pathToFileURL(resolve(buildRoot, 'builder/application-artifact-runtime.js')).href
const { buildApplicationInSandbox, TEMPLATE_REF, RECIPE_SHA256 } = await import(built)

test.after(() => rmSync(buildRoot, { recursive: true, force: true }))

const appRoot = '/workspace/repo/app'

const fakeSandbox = (output, { buildExitCode = 0 } = {}) => {
  const calls = []
  const sandbox = {
    files: {
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
        return { exitCode: command.startsWith('node ') ? buildExitCode : 0, stdout: '', stderr: '' }
      },
    },
  }
  return { sandbox, calls }
}

test('buildApplicationInSandbox exports the fixed template identity', () => {
  assert.equal(TEMPLATE_REF, '537fnzf4c16x9d7oz21k:392ec729-82d7-4f25-bbf0-cc09361611fe')
  assert.equal(RECIPE_SHA256, '6834ca0434e1e6a597340d22d5c1692339a4fc4860948ff834b9851e61406edc')
})

test('buildApplicationInSandbox symlinks the compiler dependencies into the given appRoot and builds it', async () => {
  const output = new Map([
    ['/workspace/dist/index.html', Buffer.from('<!doctype html>')],
    ['/workspace/dist/assets/app.js', Buffer.from('console.log("ok")')],
  ])
  const { sandbox, calls } = fakeSandbox(output)
  const files = await buildApplicationInSandbox(sandbox, { appRoot })
  assert.deepEqual(files.map(file => ({ ...file, bytes: [...file.bytes] })), [
    { path: 'assets/app.js', mediaType: 'text/javascript; charset=utf-8', bytes: [...output.get('/workspace/dist/assets/app.js')], sha256: createHash('sha256').update(output.get('/workspace/dist/assets/app.js')).digest('hex') },
    { path: 'index.html', mediaType: 'text/html; charset=utf-8', bytes: [...output.get('/workspace/dist/index.html')], sha256: createHash('sha256').update(output.get('/workspace/dist/index.html')).digest('hex') },
  ])
  const linkCall = calls.find(call => call.kind === 'run' && call.command.startsWith('ln '))
  assert.equal(linkCall.command, `ln -sfn /opt/conexus/compiler/node_modules ${appRoot}/node_modules`)
  const buildCall = calls.find(call => call.kind === 'run' && call.command.startsWith('node '))
  assert.equal(buildCall.command, 'node /opt/conexus/compiler/node_modules/vite/bin/vite.js build --config /opt/conexus/compiler/vite.config.mjs --configLoader native')
  assert.equal(buildCall.options.cwd, appRoot)
  assert.equal(buildCall.options.envs.CONEXUS_COMPILE_ROOT, appRoot)
})

test('buildApplicationInSandbox rejects an already-aborted request without running any command', async () => {
  const { sandbox, calls } = fakeSandbox(new Map())
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(buildApplicationInSandbox(sandbox, { appRoot, signal: controller.signal }), /APPLICATION_COMPILER_CANCELLED/)
  assert.equal(calls.length, 0)
})

test('buildApplicationInSandbox reports a failing vite exit code as APPLICATION_COMPILATION_FAILED', async () => {
  const { sandbox } = fakeSandbox(new Map([['/workspace/dist/index.html', Buffer.from('x')]]), { buildExitCode: 1 })
  await assert.rejects(buildApplicationInSandbox(sandbox, { appRoot }), /APPLICATION_COMPILATION_FAILED/)
})

for (const [name, entries, error] of [
  ['symlink', [{ path: '/workspace/dist/index.html', type: 'symlink', size: 1 }], /SYMLINK_REFUSED/],
  ['traversal', [{ path: '/workspace/dist/../index.html', type: 'file', size: 1 }], /PATH_REFUSED/],
  ['byte limit', [{ path: '/workspace/dist/index.html', type: 'file', size: 12 * 1024 * 1024 + 1 }], /LIMIT_REFUSED/],
  ['file count', Array.from({ length: 257 }, (_, index) => ({ path: `/workspace/dist/${index === 0 ? 'index' : index}.html`, type: 'file', size: 1 })), /LIMIT_REFUSED/],
]) {
  test(`buildApplicationInSandbox refuses output ${name} before downloading bytes`, async () => {
    const sandbox = {
      commands: { run: async () => ({ exitCode: 0, stdout: '', stderr: '' }) },
      files: { list: async () => entries, read: async () => assert.fail('Rejected output must not download') },
    }
    await assert.rejects(buildApplicationInSandbox(sandbox, { appRoot }), error)
  })
}
