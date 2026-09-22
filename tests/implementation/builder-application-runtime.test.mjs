import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const built = hubModuleUrl('builder/application-artifact-runtime.js')
const { buildApplicationInSandbox, TEMPLATE_REF, RECIPE_SHA256 } = await import(built)

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

test('a refusal E2B raises as an exit error still names which refusal it was', async () => {
  const output = new Map([['/workspace/dist/index.html', Buffer.from('<!doctype html>')]])
  const { sandbox } = fakeSandbox(output)
  const run = sandbox.commands.run
  // E2B raises a non-zero exit as a CommandExitError that still carries the command's own output,
  // which is where the script puts its verdict.
  sandbox.commands.run = async (command, options) => {
    const result = await run(command, options)
    if (!String(command).includes('CONEXUS_SMOKE_SCRIPT_EOF')) return result
    throw Object.assign(new Error('exit status 1'), {
      exitCode: 1, stderr: '', stdout: JSON.stringify({ ok: false, reason: 'APPLICATION_SMOKE_NO_ROOT_CHILD' }),
    })
  }
  await assert.rejects(
    buildApplicationInSandbox(sandbox, { appRoot: '/workspace/app' }),
    /APPLICATION_SMOKE_NO_ROOT_CHILD/,
  )
})

test('the smoke script the sandbox is handed parses as the module Node will load it as', async () => {
  const { mkdtempSync, writeFileSync, rmSync, readFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')

  // The sandbox writes it to a .mjs path, so Node parses it as an ES module, where a top-level
  // return is a syntax error. node --check on the same extension runs the same parser.
  const runtimeSource = readFileSync(resolve(repositoryRoot, 'apps/hub/src/builder/application-artifact-runtime.ts'), 'utf8')
  const scriptPath = /const SMOKE_SCRIPT_FILE = '([^']+)'/.exec(runtimeSource)?.[1]
  const heredoc = /const SMOKE_HEREDOC = '([^']+)'/.exec(runtimeSource)?.[1]
  assert.ok(scriptPath?.endsWith('.mjs'), 'the smoke script path moved; this test must follow its extension')
  assert.ok(heredoc, 'the smoke heredoc marker moved; this test must follow it')

  const { sandbox, calls } = fakeSandbox(new Map([['/workspace/dist/index.html', Buffer.from('<!doctype html>')]]))
  await buildApplicationInSandbox(sandbox, { appRoot: '/workspace/app' })
  const smoke = calls.find((call) => call.kind === 'run' && String(call.command).includes(heredoc))
  assert.ok(smoke, 'no command carried the smoke script')
  const body = String(smoke.command).split(`<<'${heredoc}'\n`)[1]?.split(`\n${heredoc}`)[0]
  assert.ok(body && body.length > 0, 'the smoke script came through empty')

  const directory = mkdtempSync(resolve(tmpdir(), 'conexus-smoke-parse-'))
  try {
    const file = resolve(directory, 'smoke.mjs')
    writeFileSync(file, body)
    const checked = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
    assert.equal(checked.status, 0, `the smoke script does not parse: ${String(checked.stderr).split('\n').filter(Boolean).slice(-3).join(' | ')}`)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('an app that imports a web font from an unreachable host still passes the smoke in a real browser', async (t) => {
  const { mkdtempSync, writeFileSync, rmSync, readFileSync, mkdirSync: makeDirectory, chmodSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { chromium } = await import('@playwright/test')

  const runtimeSource = readFileSync(resolve(repositoryRoot, 'apps/hub/src/builder/application-artifact-runtime.ts'), 'utf8')
  const heredoc = /const SMOKE_HEREDOC = '([^']+)'/.exec(runtimeSource)?.[1]
  const { sandbox, calls } = fakeSandbox(new Map([['/workspace/dist/index.html', Buffer.from('<!doctype html>')]]))
  await buildApplicationInSandbox(sandbox, { appRoot: '/workspace/app' })
  const smoke = calls.find((call) => call.kind === 'run' && String(call.command).includes(heredoc))
  const script = String(smoke.command).split(`<<'${heredoc}'\n`)[1]?.split(`\n${heredoc}`)[0]

  const directory = mkdtempSync(resolve(tmpdir(), 'conexus-smoke-external-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const dist = resolve(directory, 'dist')
  makeDirectory(dist)
  // 10.255.255.1 is not routable, so a connection to it neither succeeds nor is refused: it hangs,
  // which is what a slow or unreachable font host does to the load event.
  writeFileSync(resolve(dist, 'style.css'), "@import url('http://10.255.255.1/font.css');\nbody { margin: 0; }\n")
  writeFileSync(resolve(dist, 'index.html'), '<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head>'
    + '<body><div id="root"></div><script>document.getElementById("root").append(document.createElement("main"))</script></body></html>')
  const bin = resolve(directory, 'bin')
  makeDirectory(bin)
  writeFileSync(resolve(bin, 'chromium'), `#!/bin/sh\nexec ${JSON.stringify(chromium.executablePath())} "$@"\n`)
  chmodSync(resolve(bin, 'chromium'), 0o755)
  const file = resolve(directory, 'smoke.mjs')
  writeFileSync(file, script.replace(/const DIST_ROOT = "[^"]*"/, `const DIST_ROOT = ${JSON.stringify(dist)}`)
    .replace(/const PROFILE = "[^"]*"/, `const PROFILE = ${JSON.stringify(resolve(directory, 'profile'))}`))

  const started = Date.now()
  const ran = spawnSync(process.execPath, [file], { encoding: 'utf8', timeout: 60_000, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } })
  assert.deepEqual(JSON.parse(ran.stdout), { ok: true, childCount: 1 })
  assert.ok(Date.now() - started < 15_000, `the smoke waited on the unreachable font for ${Date.now() - started} ms`)
})

test('a build placed under a root-only directory runs, writes, smokes and reads there as root', async () => {
  const workRoot = '/var/lib/conexus-build/run-1'
  const { sandbox, calls } = fakeSandbox(new Map([[`${workRoot}/dist/index.html`, Buffer.from('<!doctype html>')]]))
  const files = await buildApplicationInSandbox(sandbox, { workRoot, appRoot: `${workRoot}/app`, user: 'root' })
  assert.deepEqual(files.map(({ path }) => path), ['index.html'])
  assert.deepEqual(calls.map(({ kind, options }) => [kind, options?.user]), [['run', 'root'], ['run', 'root'], ['list', 'root'], ['read', 'root'], ['run', 'root']])
  const commands = calls.filter(({ kind }) => kind === 'run').map(({ command }) => String(command))
  assert.ok(commands[1].endsWith(`--outDir '${workRoot}/dist'`), commands[1])
  assert.ok(commands[2].startsWith(`cat > ${workRoot}/.conexus-smoke.mjs `) && commands[2].includes(`const DIST_ROOT = "${workRoot}/dist"`) && commands[2].includes(`const PROFILE = "${workRoot}/.conexus-smoke-profile"`))
  assert.equal(commands.some((command) => command.includes('/workspace')), false)
})

test('buildApplicationInSandbox exports the fixed template identity', () => {
  assert.equal(TEMPLATE_REF, '537fnzf4c16x9d7oz21k:0f44de30-d856-40d1-b6b3-54a8bbf2f440')
  assert.equal(RECIPE_SHA256, 'df2e896284661a4402158d6e694493332df57de4b56f4c565e5b6ed19bfabde4')
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
  assert.equal(buildCall.command, "node /opt/conexus/compiler/node_modules/vite/bin/vite.js build --config /opt/conexus/compiler/vite.config.mjs --configLoader native --outDir '/workspace/dist'")
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
