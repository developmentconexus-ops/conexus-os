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

const isSmokeCommand = (command) => command.includes('.conexus-smoke.mjs')

const fakeSandbox = (output, { buildExitCode = 0, smokeVerdict = { ok: true, childCount: 1 }, smokeExitCode } = {}) => {
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
        if (isSmokeCommand(command)) {
          return { exitCode: smokeExitCode ?? (smokeVerdict.ok ? 0 : 1), stdout: JSON.stringify(smokeVerdict), stderr: '' }
        }
        return { exitCode: command.startsWith('node ') ? buildExitCode : 0, stdout: '', stderr: '' }
      },
    },
  }
  return { sandbox, calls }
}

test('buildApplicationInSandbox exports the fixed template identity', () => {
  assert.equal(TEMPLATE_REF, '537fnzf4c16x9d7oz21k:5591435e-3021-436b-926b-366ddc7e7189')
  assert.equal(RECIPE_SHA256, '74a04791ab9691c48e3f4fbff7aa84e8e3ef1b600d38a585e243fff21e5adebf')
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

test('buildApplicationInSandbox serves the built dist and drives headless Chromium at it before returning', async () => {
  const output = new Map([['/workspace/dist/index.html', Buffer.from('<!doctype html>')]])
  const { sandbox, calls } = fakeSandbox(output, { smokeVerdict: { ok: true, childCount: 3 } })
  const files = await buildApplicationInSandbox(sandbox, { appRoot })
  assert.equal(files.length, 1)
  const smokeCall = calls.find((call) => call.kind === 'run' && isSmokeCommand(call.command))
  assert.ok(smokeCall, 'a smoke command must run after the build produced output')
  assert.equal(smokeCall.command.includes(appRoot), false, 'the smoke server must serve /workspace/dist, not the app source root')
  assert.ok(smokeCall.command.includes('/workspace/dist'))
})

// A source that builds cleanly (vite exits 0) can still throw the instant its module body runs -
// vite never sees that, only a browser evaluating the bundle does. That is exactly what the smoke
// step exists to catch, and the record below is the sandbox script's own verdict for that case.
test('a source that builds but throws at module evaluation fails the smoke, not the build', async () => {
  const output = new Map([['/workspace/dist/index.html', Buffer.from('<!doctype html>')]])
  const { sandbox } = fakeSandbox(output, { smokeVerdict: { ok: false, reason: 'APPLICATION_SMOKE_UNCAUGHT_ERROR' } })
  await assert.rejects(buildApplicationInSandbox(sandbox, { appRoot }), /APPLICATION_SMOKE_UNCAUGHT_ERROR/)
})

test('an app that renders nothing into the root fails the smoke', async () => {
  const output = new Map([['/workspace/dist/index.html', Buffer.from('<!doctype html>')]])
  const { sandbox } = fakeSandbox(output, { smokeVerdict: { ok: false, reason: 'APPLICATION_SMOKE_NO_ROOT_CHILD' } })
  await assert.rejects(buildApplicationInSandbox(sandbox, { appRoot }), /APPLICATION_SMOKE_NO_ROOT_CHILD/)
})

test('a nonzero smoke exit code fails closed even if a stray earlier stdout line parsed as ok: true', async () => {
  const output = new Map([['/workspace/dist/index.html', Buffer.from('<!doctype html>')]])
  // The exit code and the JSON verdict are two independent witnesses; a killed or crashed run must
  // not pass just because something on stdout happened to look like a success line.
  const { sandbox } = fakeSandbox(output, { smokeExitCode: 1, smokeVerdict: { ok: true, childCount: 1 } })
  await assert.rejects(buildApplicationInSandbox(sandbox, { appRoot }), /APPLICATION_SMOKE/)
})

test('a smoke command whose stdout cannot be parsed as a verdict fails closed', async () => {
  const output = new Map([['/workspace/dist/index.html', Buffer.from('<!doctype html>')]])
  const { sandbox: base } = fakeSandbox(output)
  const sandbox = {
    ...base,
    commands: {
      run: async (command, options) => {
        if (isSmokeCommand(command)) return { exitCode: 1, stdout: 'not json', stderr: 'boom' }
        return base.commands.run(command, options)
      },
    },
  }
  await assert.rejects(buildApplicationInSandbox(sandbox, { appRoot }), /APPLICATION_SMOKE_VERDICT_UNREADABLE/)
})

test('the smoke command carries a bounded timeoutMs so a hung Chromium fails rather than hangs', async () => {
  const output = new Map([['/workspace/dist/index.html', Buffer.from('<!doctype html>')]])
  const { sandbox, calls } = fakeSandbox(output)
  await buildApplicationInSandbox(sandbox, { appRoot })
  const smokeCall = calls.find((call) => call.kind === 'run' && isSmokeCommand(call.command))
  assert.equal(typeof smokeCall.options.timeoutMs, 'number')
  assert.ok(smokeCall.options.timeoutMs > 0 && smokeCall.options.timeoutMs < 60_000, 'the bound must be finite and well inside the overall build budget')
})

test('the smoke command failing to run at all (E2B kills it on timeout) is reported as APPLICATION_SMOKE_FAILED, not a hang', async () => {
  const output = new Map([['/workspace/dist/index.html', Buffer.from('<!doctype html>')]])
  const { sandbox: base } = fakeSandbox(output)
  const sandbox = {
    ...base,
    commands: {
      run: async (command, options) => {
        if (isSmokeCommand(command)) throw new Error('sandbox command timed out')
        return base.commands.run(command, options)
      },
    },
  }
  await assert.rejects(buildApplicationInSandbox(sandbox, { appRoot }), /APPLICATION_SMOKE_FAILED/)
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
