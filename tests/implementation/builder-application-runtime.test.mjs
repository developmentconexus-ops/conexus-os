import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const built = hubModuleUrl('builder/application-artifact-runtime.js')
const { checkApplicationInSandbox, TEMPLATE_REF, RECIPE_SHA256 } = await import(built)

const { loadCheckBundle } = await import(hubModuleUrl('builder/check-delivery.js'))
const CHECK = loadCheckBundle()
const CONTENT = Buffer.from('<!doctype html>')
const INDEX_ARTIFACT = { path: 'index.html', bytes: CONTENT.byteLength, sha256: createHash('sha256').update(CONTENT).digest('hex') }
const PASSING_REPORT = {
  ok: true,
  checkSha256: CHECK.sha256,
  steps: [
    { step: 'generate', status: 'passed', durationMs: 0 },
    { step: 'typecheck', status: 'passed', durationMs: 900 },
    { step: 'build', status: 'passed', durationMs: 4000 },
    { step: 'server', status: 'passed', durationMs: 700 },
    { step: 'boot', status: 'passed', durationMs: 1500 },
  ],
  artifact: { templateRef: TEMPLATE_REF, files: [INDEX_ARTIFACT] },
}
const withCheck = (input) => ({ check: CHECK, caller: 'gate', ...input })

const fakeSandbox = (output, { report = PASSING_REPORT, stdout, exitCode = 0 } = {}) => {
  const calls = []
  const sandbox = {
    files: {
      list: async (path, options) => {
        calls.push({ kind: 'list', path, options })
        return [...output].map(([entry, bytes]) => ({ path: entry, type: 'file', size: bytes.byteLength }))
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
        return { exitCode, stdout: stdout ?? `progress noise\n${JSON.stringify(report)}\n`, stderr: '' }
      },
    },
  }
  return { sandbox, calls }
}

const root = '/var/lib/conexus-build/run-1'
const out = `${root}/dist`

test('the template identity is the current V2 pin', () => {
  assert.equal(TEMPLATE_REF, '537fnzf4c16x9d7oz21k:419afad1-5af3-405c-9a52-3f6dc81dee5c')
  assert.equal(RECIPE_SHA256, 'aba3957596f114f821e290dd89416aba2fa1785fc34cb5162a899de759e84ffc')
})

test('the gate runs the bundle by its hash as root with the agent identity named, then reads the build as root', async () => {
  const bytes = CONTENT
  const { sandbox, calls } = fakeSandbox(new Map([[`${out}/index.html`, bytes]]))
  const run = await checkApplicationInSandbox(sandbox, withCheck({ root, out, collect: true }))
  assert.deepEqual(run.report, PASSING_REPORT)
  assert.deepEqual(run.files.map((file) => ({ path: file.path, mediaType: file.mediaType, sha256: file.sha256 })), [
    { path: 'index.html', mediaType: 'text/html; charset=utf-8', sha256: createHash('sha256').update(bytes).digest('hex') },
  ])
  const [command] = calls.filter((call) => call.kind === 'run')
  assert.equal(command.command, `/usr/local/bin/node /opt/conexus/check/${CHECK.sha256}/main.mjs check --caller gate --root '${root}' --out '${out}' --template-ref '${TEMPLATE_REF}' --as 1500:1500`)
  assert.equal(command.options.user, 'root')
  assert.equal(command.options.cwd, '/')
  assert.deepEqual(calls.filter((call) => call.kind !== 'run').map(({ kind, options }) => [kind, options.user]), [['list', 'root'], ['read', 'root']])
})

test('the thumbnail is read only from the path the Hub names, and that path is handed to the check', async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
  const thumbnail = '/var/lib/conexus-build/run-1.png'
  const { sandbox, calls } = fakeSandbox(new Map([[`${out}/index.html`, Buffer.from('<!doctype html>')]]))
  const read = sandbox.files.read
  sandbox.files.read = async (path, options) => (path === thumbnail ? png : read(path, options))
  const run = await checkApplicationInSandbox(sandbox, withCheck({ root, out, collect: true, thumbnail }))
  assert.deepEqual([...run.thumbnail.bytes], [...png])
  assert.match(calls.find((call) => call.kind === 'run').command, new RegExp(`--out '${out}' --thumbnail '${thumbnail}' --template-ref `))
  assert.equal(calls.some((call) => call.path === `${root}/conexus-thumbnail.png`), false)
  const none = fakeSandbox(new Map([[`${out}/index.html`, Buffer.from('<!doctype html>')]]))
  assert.equal((await checkApplicationInSandbox(none.sandbox, withCheck({ root, out, collect: true }))).thumbnail, null)
  assert.deepEqual(none.calls.filter((call) => call.kind === 'read').map((call) => call.path), [`${out}/index.html`])
})

test('a check that did not pass its blocking steps reads no build', async () => {
  const report = { ...PASSING_REPORT, ok: false, steps: [
    PASSING_REPORT.steps[0],
    { step: 'typecheck', status: 'failed', code: 'TYPECHECK_ERRORS', durationMs: 800, problems: [{ file: 'app/src/main.tsx', line: 1, column: 7, code: 'TS2322', message: 'no' }] },
    ...['build', 'server', 'boot'].map((step) => ({ step, status: 'skipped', code: 'AFTER_BLOCKING_FAILURE', reason: 'after failed typecheck' })),
  ], artifact: null }
  const { sandbox, calls } = fakeSandbox(new Map(), { report })
  const run = await checkApplicationInSandbox(sandbox, withCheck({ root, out, collect: true }))
  assert.equal(run.report.ok, false)
  assert.equal(run.files, null)
  assert.deepEqual(calls.map(({ kind }) => kind), ['run'])
})

test('a failed boot alone does not stop the build being read', async () => {
  const report = { ...PASSING_REPORT, steps: [...PASSING_REPORT.steps.slice(0, 4), { step: 'boot', status: 'failed', code: 'BOOT_UNCAUGHT_ERROR', durationMs: 900, problems: [{ code: 'BOOT_UNCAUGHT_ERROR', message: 'Error: boom' }] }] }
  const { sandbox } = fakeSandbox(new Map([[`${out}/index.html`, Buffer.from('<!doctype html>')]]), { report })
  const run = await checkApplicationInSandbox(sandbox, withCheck({ root, out, collect: true }))
  assert.equal(run.report.ok, true)
  assert.equal(run.files.length, 1)
})

test('output that is not a report is a platform failure, not a refusal of the source', async () => {
  for (const stdout of ['', 'Segmentation fault', 'not json at all\n']) {
    const { sandbox } = fakeSandbox(new Map(), { stdout })
    await assert.rejects(checkApplicationInSandbox(sandbox, withCheck({ root, out, collect: false })), /APPLICATION_CHECK_REPORT_UNREADABLE/)
  }
})

test('JSON that breaks the schema or its rules is unreadable, not a missing report', async () => {
  for (const stdout of ['{"ok":true}', JSON.stringify({ ...PASSING_REPORT, ok: false }), JSON.stringify({ ...PASSING_REPORT, facts: {} })]) {
    const { sandbox } = fakeSandbox(new Map(), { stdout })
    await assert.rejects(checkApplicationInSandbox(sandbox, withCheck({ root, out, collect: false })), /APPLICATION_CHECK_UNREADABLE/)
  }
})

test('a report from another bundle is an identity mismatch, before its files are read', async () => {
  const { sandbox, calls } = fakeSandbox(new Map(), { report: { ...PASSING_REPORT, checkSha256: 'a'.repeat(64) } })
  await assert.rejects(checkApplicationInSandbox(sandbox, withCheck({ root, out, collect: true })), /BUILDER_CHECK_IDENTITY_MISMATCH/)
  assert.deepEqual(calls.map(({ kind }) => kind), ['run'])
})

test('collected files that differ from the manifest, by content, by name or by count, are unreadable', async () => {
  const listed = (...files) => ({ ...PASSING_REPORT, artifact: { templateRef: TEMPLATE_REF, files } })
  const other = { path: 'app.js', bytes: 1, sha256: createHash('sha256').update('x').digest('hex') }
  for (const [output, report] of [
    [new Map([[`${out}/index.html`, Buffer.from('<!doctype html>!')]]), PASSING_REPORT],
    [new Map([[`${out}/index.html`, CONTENT]]), listed(INDEX_ARTIFACT, other)],
    [new Map([[`${out}/index.html`, CONTENT], [`${out}/app.js`, Buffer.from('x')]]), PASSING_REPORT],
  ]) {
    const { sandbox } = fakeSandbox(output, { report })
    await assert.rejects(checkApplicationInSandbox(sandbox, withCheck({ root, out, collect: true })), /APPLICATION_CHECK_UNREADABLE/)
  }
})

test('the tool caller runs the same bundle as the agent', async () => {
  const { sandbox, calls } = fakeSandbox(new Map())
  await checkApplicationInSandbox(sandbox, withCheck({ caller: 'tool', root, out, collect: false }))
  const [command] = calls.filter((call) => call.kind === 'run')
  assert.match(command.command, /main\.mjs check --caller tool /)
  assert.equal(command.options.user, 'conexus-agent')
})

test('a script that exits nonzero, which E2B raises as an error, is a platform failure with its stderr redacted', async () => {
  const { sandbox } = fakeSandbox(new Map())
  sandbox.commands.run = async () => { throw Object.assign(new Error('exit status 3'), { exitCode: 3, stdout: '', stderr: 'check setup failed: token ghp_abcdefghijklmnop' }) }
  await assert.rejects(checkApplicationInSandbox(sandbox, withCheck({ root, out, collect: false })), (error) => {
    assert.equal(error.message, 'APPLICATION_CHECK_UNREADABLE')
    assert.deepEqual(error.cause, { exitCode: 3, stderr: 'check setup failed: token [redacted]' })
    return true
  })
})

test('a root or out path outside the sandbox folders refuses before any command runs', async () => {
  const { sandbox, calls } = fakeSandbox(new Map())
  await assert.rejects(checkApplicationInSandbox(sandbox, withCheck({ root: `${root}'; rm -rf /`, out, collect: false })), /APPLICATION_COMPILER_WORKSPACE_REFUSED/)
  assert.equal(calls.length, 0)
})

for (const [name, entries, error] of [
  ['symlink', [{ path: `${out}/index.html`, type: 'symlink', size: 1 }], /SYMLINK_REFUSED/],
  ['traversal', [{ path: `${out}/../index.html`, type: 'file', size: 1 }], /PATH_REFUSED/],
  ['byte limit', [{ path: `${out}/index.html`, type: 'file', size: 12 * 1024 * 1024 + 1 }], /LIMIT_REFUSED/],
  ['file count', Array.from({ length: 257 }, (_, index) => ({ path: `${out}/${index === 0 ? 'index' : index}.html`, type: 'file', size: 1 })), /LIMIT_REFUSED/],
]) {
  test(`the build's output ${name} is refused before downloading bytes`, async () => {
    const { sandbox } = fakeSandbox(new Map())
    sandbox.files = { list: async () => entries, read: async () => assert.fail('Rejected output must not download') }
    await assert.rejects(checkApplicationInSandbox(sandbox, withCheck({ root, out, collect: true })), error)
  })
}
