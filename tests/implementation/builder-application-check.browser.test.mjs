import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { chromium } from '@playwright/test'
import { ensureCompilerRoot } from './compiler-root.mjs'
import { hubBuildDirectory, hubModuleUrl } from './hub-build.mjs'

const { failedStepEvidence } = await import(hubModuleUrl('builder/application-check.js'))
const { checkReportSchema } = await import(hubModuleUrl('builder/check/report.js'))
const { fixedApplicationStarterFiles } = await import(hubModuleUrl('builder/application-starter.js'))

const repositoryRoot = resolve(import.meta.dirname, '../..')
const compilerRoot = await ensureCompilerRoot()
const templateConfig = readFileSync(resolve(compilerRoot, 'vite.config.mjs'), 'utf8')

const STARTER = {
  'app/index.html': '<!doctype html><html><head><meta charset="UTF-8" /><title>t</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n',
  'app/src/main.tsx': `import * as React from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

const root = document.getElementById('root')
if (!root) throw new Error('CONEXUS_APP_ROOT_MISSING')

createRoot(root).render(<React.StrictMode><div>hello</div></React.StrictMode>)
`,
  'app/src/style.css': 'body { margin: 0; }\n',
}

const MANIFEST = {
  operations: {
    countNotes: {
      handler: 'handlers/notes.ts', export: 'countNotes',
      input: { type: 'object', properties: {}, required: [], additionalProperties: false },
      output: { type: 'object', properties: { total: { type: 'integer', minimum: 3 } }, required: ['total'], additionalProperties: false },
    },
  },
}
const HANDLER = `export async function countNotes(): Promise<{ total: number }> {
  return { total: 3 }
}
`

const withMain = (main) => ({ ...STARTER, 'app/src/main.tsx': main })

// Runs the built bundle against a real install of the template's compiler (its lockfile, its
// allowlist view of node_modules) and the Playwright Chromium, in a folder laid out like the VM:
// `opt/compiler` and `opt/check/<sha256>/main.mjs`. The browser is the `chromium` on the PATH.
const TEMPLATE_REF = 'test-template:00000000-0000-4000-8000-000000000000'
const bundleBytes = readFileSync(join(hubBuildDirectory(), 'app-check/main.mjs'))
const BUNDLE_SHA256 = createHash('sha256').update(bundleBytes).digest('hex')

const check = (t, files, { limits = [], compilerFiles = {}, before, thumbnail, chromiumPath = () => chromium.executablePath(), onlyBrowserOnPath = false, scratch: reused } = {}) => {
  const scratch = reused ?? mkdtempSync(join(tmpdir(), 'conexus-check-test-'))
  if (!reused) t.after(() => rmSync(scratch, { recursive: true, force: true }))
  const root = join(scratch, 'repo')
  rmSync(root, { recursive: true, force: true })
  rmSync(join(scratch, 'dist'), { recursive: true, force: true })
  const tools = join(scratch, 'opt')
  const out = join(scratch, 'dist')
  for (const [path, content] of Object.entries({ ...files })) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), typeof content === 'string' ? content : JSON.stringify(content))
  }
  mkdirSync(join(tools, 'compiler'), { recursive: true })
  for (const name of ['node_modules', 'full']) if (!existsSync(join(tools, 'compiler', name))) symlinkSync(join(compilerRoot, name), join(tools, 'compiler', name))
  for (const name of ['allowlist.mjs', 'generate-client.mjs', 'tsconfig.mjs', 'package.json']) copyFileSync(join(compilerRoot, name), join(tools, 'compiler', name))
  writeFileSync(join(tools, 'compiler/vite.config.mjs'), templateConfig.replace("'/workspace/.vite'", JSON.stringify(join(scratch, 'vite-cache'))))
  for (const [path, content] of Object.entries(compilerFiles)) writeFileSync(join(tools, 'compiler', path), content)
  before?.(root)
  const main = join(tools, 'check', BUNDLE_SHA256, 'main.mjs')
  mkdirSync(dirname(main), { recursive: true })
  writeFileSync(main, bundleBytes)
  const bin = join(scratch, 'bin')
  mkdirSync(bin, { recursive: true })
  const browser = chromiumPath(scratch)
  rmSync(join(bin, 'chromium'), { force: true })
  if (browser) symlinkSync(browser, join(bin, 'chromium'))
  const ran = spawnSync(process.execPath, [
    main, 'check', '--caller', 'tool', '--root', root, '--out', out, '--template-ref', TEMPLATE_REF, '--as', `${process.getuid()}:${process.getgid()}`,
    ...limits.flatMap((limit) => ['--limit', limit]),
    ...(thumbnail ? ['--thumbnail', thumbnail(scratch)] : []),
  ], { encoding: 'utf8', timeout: 120_000, env: { PATH: onlyBrowserOnPath ? bin : `${bin}:/usr/bin:/bin`, HOME: scratch } })
  assert.equal(ran.status, 0, ran.stderr)
  const raw = JSON.parse(ran.stdout.trim().split('\n').pop())
  return { report: checkReportSchema.parse(raw), raw, root, out, scratch }
}

const stepsOf = (report) => report.steps.map((step) => [step.step, step.status])
const failedStep = (report, id) => report.steps.find((step) => step.step === id && step.status === 'failed')

test('the browser is launched with the background Google services switched off', (t) => {
  const argvFile = join(tmpdir(), `conexus-chromium-argv-${process.pid}-${Date.now()}`)
  t.after(() => rmSync(argvFile, { force: true }))
  const { report } = check(t, STARTER, {
    chromiumPath: (scratch) => {
      const wrapper = join(scratch, 'chromium-recorder.sh')
      writeFileSync(wrapper, `#!/bin/sh\nprintf '%s\\n' "$@" > ${JSON.stringify(argvFile)}\nexec ${JSON.stringify(chromium.executablePath())} "$@"\n`, { mode: 0o755 })
      return wrapper
    },
  })
  assert.deepEqual(report.steps.find((step) => step.step === 'boot')?.status, 'passed')
  const argv = readFileSync(argvFile, 'utf8').split('\n').filter(Boolean)
  for (const flag of ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--disable-default-apps']) {
    assert.ok(argv.includes(flag), flag)
  }
  assert.deepEqual(argv.filter((arg) => arg.startsWith('--disable-features=')), ['--disable-features=Translate,OptimizationHints,MediaRouter,AutofillServerCommunication'])
})

test('boot waits for the DevTools port when the browser first leaves its file empty', (t) => {
  const { report } = check(t, STARTER, {
    chromiumPath: (scratch) => {
      const wrapper = join(scratch, 'chromium-slow-port.sh')
      writeFileSync(wrapper, `#!/bin/sh\nfor argument in "$@"; do case "$argument" in --user-data-dir=*) profile="\${argument#--user-data-dir=}";; esac; done\n: > "$profile/DevToolsActivePort"\nsleep 1\nexec ${JSON.stringify(chromium.executablePath())} "$@"\n`, { mode: 0o755 })
      return wrapper
    },
  })
  assert.deepEqual(report.steps.find((step) => step.step === 'boot')?.status, 'passed')
})

test('a browser that refuses its DevTools connection skips the boot step instead of crashing it', (t) => {
  const { report } = check(t, STARTER, {
    chromiumPath: (scratch) => {
      const fake = join(scratch, 'chromium-refusing-socket.mjs')
      writeFileSync(fake, `#!${process.execPath}
import { createServer } from 'node:http'
import { writeFileSync } from 'node:fs'
const profile = process.argv.find((argument) => argument.startsWith('--user-data-dir=')).slice('--user-data-dir='.length)
const server = createServer((request, response) => {
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify([{ type: 'page', webSocketDebuggerUrl: 'ws://127.0.0.1:' + server.address().port + '/devtools/page/refused' }]))
})
server.on('upgrade', (request, socket) => socket.destroy())
server.listen(0, '127.0.0.1', () => writeFileSync(profile + '/DevToolsActivePort', server.address().port + '\\n/devtools/browser/refused\\n'))
`, { mode: 0o755 })
      return fake
    },
  })
  assert.deepEqual(report.steps.find((step) => step.step === 'boot'), { step: 'boot', status: 'skipped', code: 'BOOT_BROWSER_UNAVAILABLE', reason: 'the browser refused its DevTools connection' })
  assert.equal(report.ok, true)
})

test('a missing browser skips the boot step and the check still passes', (t) => {
  const { report } = check(t, STARTER, { chromiumPath: () => null, onlyBrowserOnPath: true })
  const boot = report.steps.find((step) => step.step === 'boot')
  assert.deepEqual([boot.status, boot.code, boot.reason.startsWith('the browser did not start: ')], ['skipped', 'BOOT_BROWSER_UNAVAILABLE', true])
  assert.equal(report.ok, true)
  assert.equal(report.artifact.files.some((file) => file.path === 'index.html'), true)
})

const passedSteps = ['generate', 'typecheck', 'build', 'server', 'boot'].map((step) => ({ step, status: 'passed' }))
// A report without what only a clock or a hash decides.
const settled = (report) => report.steps.map(({ durationMs, ...rest }) => ({ ...rest, ...(durationMs === undefined ? {} : { durationMs: 'measured' }) }))

test('a starter with no server half passes all five steps and reports its artifact, with no facts', (t) => {
  const { report, raw, out } = check(t, STARTER)
  assert.equal(report.ok, true)
  assert.deepEqual(settled(report), passedSteps.map((step) => ({ ...step, durationMs: 'measured' })))
  assert.equal('facts' in raw, false)
  assert.equal(report.checkSha256, BUNDLE_SHA256)
  assert.equal(report.artifact.templateRef, TEMPLATE_REF)
  assert.deepEqual(report.artifact.files.map((file) => file.path), readdirSync(out, { recursive: true }).map(String).filter((path) => lstatSync(join(out, path)).isFile()).sort())
  assert.ok(report.artifact.files.some((file) => file.path === 'index.html' && file.bytes > 0), 'index.html is listed')
  for (const file of report.artifact.files) assert.equal(file.sha256, createHash('sha256').update(readFileSync(join(out, file.path))).digest('hex'), file.path)
})

const V2_STARTER = Object.fromEntries(fixedApplicationStarterFiles(repositoryRoot).map((file) => [file.path, file.content]))

test('the v2 starter itself passes all five steps, with its real components and no CSP violation at boot', (t) => {
  const { report } = check(t, V2_STARTER)
  assert.deepEqual(stepsOf(report), [['generate', 'passed'], ['typecheck', 'passed'], ['build', 'passed'], ['server', 'passed'], ['boot', 'passed']], JSON.stringify(report.steps))
  assert.equal(report.ok, true)
})

test('a screen that imports node:fs is a blocking typecheck problem', (t) => {
  const { report } = check(t, { ...V2_STARTER, 'app/src/lib/extra.ts': "import { readFileSync } from 'node:fs'\nexport const extra = readFileSync\n" })
  assert.equal(report.ok, false)
  assert.deepEqual(stepsOf(report).slice(0, 3), [['generate', 'passed'], ['typecheck', 'failed'], ['build', 'skipped']])
  assert.deepEqual(failedStep(report, 'typecheck').problems.map(({ file, line, code }) => [file, line, code]), [['app/src/lib/extra.ts', 1, 'TS2591']])
})

test('a screen that imports a package outside the allowlist is a blocking typecheck problem that names it', (t) => {
  const { report } = check(t, { ...V2_STARTER, 'app/src/lib/extra.ts': "import { produce } from 'immer'\nexport const extra = produce\n" })
  assert.equal(report.ok, false)
  const problems = failedStep(report, 'typecheck').problems
  assert.deepEqual(problems.map(({ file, code }) => [file, code]), [['app/src/lib/extra.ts', 'TS2307']])
  assert.match(problems[0].message, /'immer'/)
})

test('typecheck covers the handlers too: a handler type error is a typecheck problem in conexus/', (t) => {
  const { report } = check(t, { ...STARTER, 'conexus/manifest.json': MANIFEST, 'conexus/handlers/notes.ts': HANDLER.replace('return { total: 3 }', "return { total: 'three' }") })
  assert.equal(report.ok, false)
  assert.deepEqual(failedStep(report, 'typecheck').problems.map(({ file, line, code }) => [file, line, code]), [['conexus/handlers/notes.ts', 2, 'TS2322']])
})

test('typecheck lets a handler import node: and refuses a package import', (t) => {
  const node = check(t, { ...STARTER, 'conexus/manifest.json': MANIFEST, 'conexus/handlers/notes.ts': `import { createHash } from 'node:crypto'\n${HANDLER.replace('return { total: 3 }', "return { total: createHash('sha256').digest().length - 29 }")}` })
  assert.deepEqual(stepsOf(node.report)[1], ['typecheck', 'passed'], JSON.stringify(node.report.steps))
  const pkg = check(t, { ...STARTER, 'conexus/manifest.json': MANIFEST, 'conexus/handlers/notes.ts': `import { z } from 'zod'\n${HANDLER}export { z }\n` })
  assert.deepEqual(failedStep(pkg.report, 'typecheck').problems.map(({ file, code }) => [file, code]), [['conexus/handlers/notes.ts', 'TS2307']])
})

test('generate writes the typed client from the manifest and a screen that calls api.countNotes typechecks against it', (t) => {
  const { report, root } = check(t, {
    ...STARTER, 'conexus/manifest.json': MANIFEST, 'conexus/handlers/notes.ts': HANDLER,
    'app/src/main.tsx': `import { api } from '@/conexus/api.gen'\nconst total: Promise<{ total: number }> = api.countNotes({})\nexport { total }\ndocument.getElementById('root')!.append(document.createElement('p'))\n`,
  })
  assert.equal(report.ok, true, JSON.stringify(report.steps))
  assert.match(readFileSync(join(root, 'app/src/conexus/api.gen.ts'), 'utf8'), /countNotes: \{\n {4}input: z\.strictObject\(\{ {2}\}\),\n {4}output: z\.strictObject\(\{ total: z\.number\(\)\.int\(\)\.min\(3\) \}\),/)
  assert.match(readFileSync(join(root, 'conexus/types.gen.ts'), 'utf8'), /countNotes: \{ input: \{\}; output: \{ total: number \} \}/)
})

const ORDER_LINES_MANIFEST = {
  operations: {
    orderLines: {
      handler: 'handlers/lines.ts', export: 'orderLines',
      input: { type: 'object', properties: { order: { type: 'integer' } }, required: ['order'], additionalProperties: false },
      output: { type: 'object', properties: { codes: { type: 'array', items: { type: 'string' } }, complete: { type: 'boolean' }, failure: { type: 'string', maxLength: 40 } }, required: ['codes', 'complete'], additionalProperties: false },
    },
  },
}
// The handler types its context the way the server guide shows, and hands it to the reader.
const ORDER_LINES_HANDLER = `import type { Input, Output } from '../types.gen.ts'
import { loadAllRecords } from '../sankhya.gen.ts'

type Connectors = { fetch(request: { connection: string; method: string; path: string; query?: Record<string, string>; body?: unknown }): Promise<{ ok: true; status: number; bytes: number; body: any } | { ok: false; code: string; issues?: string[]; status?: number; vendorStatus?: string }> }

export async function orderLines(input: Input<'orderLines'>, { connectors }: { connectors: Connectors }): Promise<Output<'orderLines'>> {
  const read = await loadAllRecords(connectors, 'erp', { rootEntity: 'ItemNota', criteria: { expression: { $: 'this.NUNOTA = ?' }, parameter: [{ $: String(input.order), type: 'I' }] } })
  if (!read.ok) return { codes: [], complete: false, failure: read.code }
  return { codes: read.rows.map((row) => row.CODPROD ?? ''), complete: read.complete }
}
`

test('generate writes the Sankhya reader, and a handler typed as the guide shows imports it, typechecks and bundles', (t) => {
  const { report, root, out } = check(t, { ...STARTER, 'conexus/manifest.json': ORDER_LINES_MANIFEST, 'conexus/handlers/lines.ts': ORDER_LINES_HANDLER })
  assert.deepEqual(stepsOf(report), [['generate', 'passed'], ['typecheck', 'passed'], ['build', 'passed'], ['server', 'passed'], ['boot', 'passed']], JSON.stringify(report.steps))
  assert.equal(readFileSync(join(root, 'conexus/sankhya.gen.ts'), 'utf8'), readFileSync(join(repositoryRoot, 'apps/hub/src/builder/handler-kit/sankhya.ts'), 'utf8'))
  assert.match(readFileSync(join(out, 'conexus-server/handlers/lines.mjs'), 'utf8'), /CRUDServiceProvider\.loadRecords/)
})

test('generate refuses a bad manifest with the runner message, and an unsatisfiable bound, as generate problems', (t) => {
  const bad = check(t, { ...STARTER, 'conexus/manifest.json': { operations: { ...MANIFEST.operations, Bad: MANIFEST.operations.countNotes } } })
  assert.equal(bad.report.ok, false)
  assert.deepEqual(stepsOf(bad.report), [['generate', 'failed'], ['typecheck', 'skipped'], ['build', 'skipped'], ['server', 'skipped'], ['boot', 'skipped']])
  assert.deepEqual(failedStep(bad.report, 'generate').problems, [{ file: 'conexus/manifest.json', code: 'MANIFEST_REFUSED', message: 'operations.Bad: an operation id is camelCase letters and digits, starting lowercase' }])
  assert.equal(failedStep(bad.report, 'generate').code, 'MANIFEST_REFUSED')
  const inverted = { operations: { countNotes: { ...MANIFEST.operations.countNotes, output: { type: 'object', properties: { total: { type: 'integer', minimum: 5, maximum: 2 } }, required: ['total'], additionalProperties: false } } } }
  const bounds = check(t, { ...STARTER, 'conexus/manifest.json': inverted, 'conexus/handlers/notes.ts': HANDLER })
  assert.deepEqual(failedStep(bounds.report, 'generate').problems, [{ file: 'conexus/manifest.json', code: 'MANIFEST_REFUSED', message: 'operations.countNotes.output.properties.total: "minimum" is above "maximum"' }])
})

test('generate admits a string enum and refuses pattern, naming the key', (t) => {
  const withString = (string) => ({ operations: { countNotes: { ...MANIFEST.operations.countNotes, input: { type: 'object', properties: { status: string }, required: ['status'], additionalProperties: false } } } })
  const admitted = check(t, { ...STARTER, 'conexus/manifest.json': withString({ type: 'string', enum: ['open', 'closed'] }), 'conexus/handlers/notes.ts': HANDLER })
  assert.equal(stepsOf(admitted.report)[0].join(), 'generate,passed', JSON.stringify(admitted.report.steps))
  assert.match(readFileSync(join(admitted.root, 'conexus/types.gen.ts'), 'utf8'), /input: \{ status: "open" \| "closed" \}/)
  const pattern = check(t, { ...STARTER, 'conexus/manifest.json': withString({ type: 'string', pattern: '^a+$' }), 'conexus/handlers/notes.ts': HANDLER })
  assert.deepEqual(failedStep(pattern.report, 'generate').problems, [{ file: 'conexus/manifest.json', code: 'MANIFEST_REFUSED', message: 'operations.countNotes.input.properties.status: unknown key "pattern"' }])
})

test('generate never writes through a symlink the candidate planted at a generated path', (t) => {
  const victim = join(tmpdir(), `conexus-victim-${process.pid}-${Date.now()}`)
  t.after(() => rmSync(victim, { force: true }))
  writeFileSync(victim, 'untouched')
  const { report } = check(t, { ...STARTER, 'conexus/manifest.json': MANIFEST, 'conexus/handlers/notes.ts': HANDLER, 'conexus/types.gen.ts': 'placeholder' }, { before: (root) => { rmSync(join(root, 'conexus/types.gen.ts')); symlinkSync(victim, join(root, 'conexus/types.gen.ts')) } })
  assert.equal(report.ok, true, JSON.stringify(report.steps))
  assert.equal(readFileSync(victim, 'utf8'), 'untouched')
})

test('boot writes the thumbnail only to the path the Hub names, outside the candidate tree', (t) => {
  const { report, root, scratch } = check(t, STARTER, { thumbnail: (dir) => join(dir, 'thumbnail.png') })
  assert.equal(report.ok, true)
  assert.deepEqual([...readFileSync(join(scratch, 'thumbnail.png')).subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47])
  assert.equal(existsSync(join(root, 'conexus-thumbnail.png')), false)
  assert.equal(existsSync(join(scratch, 'conexus-thumbnail.png')), false)
})

test('the thumbnail replaces a symlink at its path and never writes through it', (t) => {
  const victim = join(tmpdir(), `conexus-victim-${process.pid}-${Date.now()}`)
  t.after(() => rmSync(victim, { force: true }))
  writeFileSync(victim, 'untouched')
  const { report, scratch } = check(t, STARTER, { thumbnail: (dir) => join(dir, 'thumbnail.png'), before: (root) => symlinkSync(victim, join(dirname(root), 'thumbnail.png')) })
  assert.equal(report.ok, true)
  assert.equal(readFileSync(victim, 'utf8'), 'untouched')
  assert.equal(lstatSync(join(scratch, 'thumbnail.png')).isSymbolicLink(), false)
})

test('a symlink or PNG the candidate commits as conexus-thumbnail.png is neither written through nor published', (t) => {
  const victim = join(tmpdir(), `conexus-victim-${process.pid}-${Date.now()}`)
  t.after(() => rmSync(victim, { force: true }))
  writeFileSync(victim, 'untouched')
  const { report, root, scratch } = check(t, STARTER, { thumbnail: (dir) => join(dir, 'thumbnail.png'), before: (dir) => symlinkSync(victim, join(dir, 'conexus-thumbnail.png')) })
  assert.equal(report.ok, true)
  assert.equal(readFileSync(victim, 'utf8'), 'untouched')
  assert.equal(lstatSync(join(root, 'conexus-thumbnail.png')).isSymbolicLink(), true)
  assert.equal(existsSync(join(scratch, 'thumbnail.png')), true)
})

test('a type error is refused with its file, line and code, and the steps after it are skipped', (t) => {
  const { report } = check(t, withMain(`const answer: number = 'six'\nexport { answer }\n`))
  assert.equal(report.ok, false)
  assert.deepEqual(stepsOf(report), [['generate', 'passed'], ['typecheck', 'failed'], ['build', 'skipped'], ['server', 'skipped'], ['boot', 'skipped']])
  assert.deepEqual(failedStep(report, 'typecheck').problems, [
    { file: 'app/src/main.tsx', line: 1, column: 7, code: 'TS2322', message: "Type 'string' is not assignable to type 'number'." },
  ])
  assert.deepEqual(report.steps.filter((step) => step.status === 'skipped'), ['build', 'server', 'boot'].map((step) => ({ step, status: 'skipped', code: 'AFTER_BLOCKING_FAILURE', reason: 'after failed typecheck' })))
  assert.equal(failedStep(report, 'typecheck').code, 'TYPECHECK_ERRORS')
  assert.equal(report.artifact, null)
})

test('a conexus/check.sh that exits 0 changes nothing: the type error still refuses the source', (t) => {
  const { report } = check(t, { ...withMain(`const answer: number = 'six'\nexport { answer }\n`), 'conexus/check.sh': '#!/bin/sh\nexit 0\n', 'conexus.json': { shape: 'REACT_VITE_V1', check: 'true' } })
  assert.equal(report.ok, false)
  assert.equal(failedStep(report, 'typecheck').problems[0].code, 'TS2322')
})

test('a build failure names the file the compiler blames', (t) => {
  const { report } = check(t, { ...STARTER, 'app/index.html': STARTER['app/index.html'].replace('/src/main.tsx', '/src/missing.tsx') })
  assert.equal(report.ok, false)
  assert.deepEqual(stepsOf(report), [['generate', 'passed'], ['typecheck', 'passed'], ['build', 'failed'], ['server', 'skipped'], ['boot', 'skipped']])
  assert.match(failedStep(report, 'build').problems[0].message, /missing\.tsx/)
  assert.equal(failedStep(report, 'build').code, 'BUILD_FAILED')
})

// A handler may not import from outside conexus/, which passes the type check and is refused by the
// server step with a message that names the whole path it imported.
const importing = (directories) => {
  const path = directories.join('/')
  return {
    ...STARTER, 'conexus/manifest.json': MANIFEST,
    [`app/src/${path}.ts`]: 'export const nothing = 1\n',
    'conexus/handlers/notes.ts': `import { nothing } from '../../app/src/${path}'\n${HANDLER}export { nothing }\n`,
  }
}

test('a server error longer than 400 characters reaches the report whole', (t) => {
  const name = 'a'.repeat(200)
  const { report } = check(t, importing([name, name]))
  assert.equal(report.ok, false)
  const problem = failedStep(report, 'server').problems[0]
  assert.ok(problem.message.length > 500 && problem.message.length < 2_000, `length ${problem.message.length}`)
  assert.ok(problem.message.includes(name), 'the whole specifier is in the message')
  assert.ok(!problem.message.includes('…'))
  assert.ok(failedStepEvidence(failedStep(report, 'server')).includes(name))
  assert.equal(failedStep(report, 'server').code, 'SERVER_BUNDLE_REFUSED')
})

test('a message past 2000 characters is cut there', (t) => {
  const { report } = check(t, importing(Array.from({ length: 12 }, () => 'c'.repeat(200))))
  const problem = failedStep(report, 'server').problems[0]
  assert.equal(problem.message.length, 2_000)
  assert.ok(problem.message.endsWith('…'))
})

test('a token in a message is redacted before the report leaves the sandbox', (t) => {
  const { report } = check(t, importing([`ghp_${'d'.repeat(40)}`]))
  const problem = failedStep(report, 'server').problems[0]
  assert.ok(
    problem.message.includes('conexus/handlers/notes.ts imports "../../app/src/[redacted]": a handler may import only'),
    problem.message,
  )
})

test('at most 50 problems per step reach the report, with the count that was dropped', (t) => {
  const lines = Array.from({ length: 60 }, (_, index) => `export const v${index}: number = 'x'`).join('\n')
  const { report } = check(t, withMain(`${lines}\n`))
  const typecheck = failedStep(report, 'typecheck')
  assert.equal(typecheck.problems.length, 50)
  assert.equal(typecheck.dropped, 10)
  assert.equal(typecheck.problems[49].line, 50)
  assert.match(failedStepEvidence(typecheck), /\(10 more problems not shown\)$/)
})

test('a component that throws on mount is a boot problem with the thrown text, and the source is still admitted', (t) => {
  const { report } = check(t, withMain(`import { createRoot } from 'react-dom/client'
function Broken(): never { throw new Error('boom on mount') }
createRoot(document.getElementById('root')!).render(<Broken />)
`))
  assert.equal(report.ok, true)
  assert.deepEqual(stepsOf(report), [['generate', 'passed'], ['typecheck', 'passed'], ['build', 'passed'], ['server', 'passed'], ['boot', 'failed']])
  const problems = failedStep(report, 'boot').problems
  const thrown = problems.find((problem) => problem.code === 'BOOT_UNCAUGHT_ERROR')
  assert.match(thrown.message, /^Error: boom on mount/)
  assert.ok(problems.some((problem) => problem.code === 'BOOT_NO_ROOT_CHILD'))
  assert.equal(failedStep(report, 'boot').code, 'BOOT_UNCAUGHT_ERROR')
})

test('a blank page fails boot with BOOT_NO_ROOT_CHILD and the source is still admitted', (t) => {
  const { report } = check(t, withMain('export {}\n'))
  assert.equal(report.ok, true)
  assert.deepEqual(report.steps.at(-1), { step: 'boot', status: 'failed', code: 'BOOT_NO_ROOT_CHILD', durationMs: report.steps.at(-1).durationMs, problems: [{ code: 'BOOT_NO_ROOT_CHILD', message: 'The page loaded but #root has no children: nothing was rendered.' }] })
  assert.notEqual(report.artifact, null)
})

test('boot reports console.error calls and same origin requests that fail', (t) => {
  const { report } = check(t, withMain(`console.error('the table is empty')
fetch('/__conexus/api/missingOperation', { method: 'POST' })
document.getElementById('root')!.append(document.createElement('p'))
`))
  assert.equal(report.ok, true)
  assert.deepEqual(failedStep(report, 'boot').problems.map(({ code, message }) => ({ code, message })), [
    { code: 'BOOT_CONSOLE_ERROR', message: 'the table is empty' },
    { code: 'BOOT_REQUEST_FAILED', message: 'POST /__conexus/api/missingOperation answered 404' },
  ])
})

test('boot serves the production policy, so an inline style element is a CSP violation', (t) => {
  const { report } = check(t, {
    ...STARTER,
    'app/index.html': STARTER['app/index.html'].replace('</head>', '<style>body { color: red }</style></head>'),
  })
  const problems = failedStep(report, 'boot').problems
  assert.equal(problems.length, 1)
  assert.equal(problems[0].code, 'BOOT_CSP_VIOLATION')
  assert.match(problems[0].message, /style-src/)
})

test('boot records a page that probes eval inside a try, as a script-src CSP violation', (t) => {
  const { report } = check(t, withMain(`const probe = Function
try { new probe('') } catch {}
document.getElementById('root')!.append(document.createElement('p'))
`))
  assert.equal(report.ok, true)
  const problems = failedStep(report, 'boot').problems
  assert.deepEqual(problems.map((problem) => problem.code), ['BOOT_CSP_VIOLATION'])
  assert.match(problems[0].message, /script-src/)
})

test('boot serves index.html for a deep link and answers 404 for a missing file and for the server tree (AC-7, AC-10)', (t) => {
  const { report } = check(t, withMain(`export {}
const root = document.getElementById('root')!
const deep = await fetch('/notas/123/editar')
const page = await deep.text()
if (deep.status !== 200 || !page.includes('id="root"')) throw new Error('deep link answered ' + deep.status)
root.append(document.createElement('p'))
await fetch('/missing.png')
await fetch('/conexus-server/manifest.json')
`))
  assert.equal(report.ok, true)
  assert.deepEqual(failedStep(report, 'boot').problems.map(({ code, message }) => ({ code, message })), [
    { code: 'BOOT_REQUEST_FAILED', message: 'GET /missing.png answered 404' },
    { code: 'BOOT_REQUEST_FAILED', message: 'GET /conexus-server/manifest.json answered 404' },
  ])
})

test('a page that draws more than 300 ms after the load event still passes boot', (t) => {
  const { report } = check(t, withMain(`setTimeout(() => document.getElementById('root')!.append(document.createElement('p')), 1200)
`))
  assert.equal(report.ok, true, JSON.stringify(report.steps))
  assert.deepEqual(stepsOf(report).at(-1), ['boot', 'passed'])
})

test('boot answers a declared operation with the lower bound of its output schema', (t) => {
  const { report } = check(t, {
    ...STARTER,
    'conexus/manifest.json': MANIFEST,
    'conexus/handlers/notes.ts': HANDLER,
    'app/src/main.tsx': `export {}
const root = document.getElementById('root')!
const response = await fetch('/__conexus/api/countNotes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
const { total } = await response.json()
if (total !== 3) throw new Error('stub answered ' + JSON.stringify(total))
root.append(document.createElement('p'))
`,
  })
  assert.equal(report.ok, true, JSON.stringify(report.steps))
  assert.deepEqual(stepsOf(report).at(-1), ['boot', 'passed'])
})

test('a step that hangs ends as STEP_TIMEOUT and leaves no process behind', (t) => {
  const pidFile = join(tmpdir(), `conexus-hang-${process.pid}-${Date.now()}.pid`)
  t.after(() => rmSync(pidFile, { force: true }))
  const hang = `import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
writeFileSync(${JSON.stringify(pidFile)}, String(spawn('sleep', ['300'], { stdio: 'ignore' }).pid))
await new Promise(() => {})
`
  const started = Date.now()
  const { report } = check(t, STARTER, { limits: ['build=1500'], compilerFiles: { 'vite.config.mjs': hang } })
  assert.ok(Date.now() - started < 60_000)
  assert.equal(report.ok, false)
  assert.deepEqual(stepsOf(report), [['generate', 'passed'], ['typecheck', 'passed'], ['build', 'failed'], ['server', 'skipped'], ['boot', 'skipped']])
  assert.deepEqual([failedStep(report, 'build').code, failedStep(report, 'build').problems], ['STEP_TIMEOUT', [{ code: 'STEP_TIMEOUT', message: 'build exceeded 1.5 s and was stopped' }]])
  const sleeper = Number(readFileSync(pidFile, 'utf8'))
  assert.throws(() => process.kill(sleeper, 0), { code: 'ESRCH' }, 'the grandchild of the hung step is gone')
})

test('conexus_check hands the model the steps of the run check, a type error as a typecheck problem with file and line, and nothing of the bundle', async (t) => {
  const { createCheckTool } = await import(hubModuleUrl('builder/harness/tools.js'))
  const { agentReportOf } = await import(hubModuleUrl('builder/check/report.js'))
  const { RequestContext } = await import('@mastra/core/request-context')
  const requestContext = new RequestContext()
  requestContext.set('controller', { session: { modeId: 'build' } })
  const tool = createCheckTool(async () => agentReportOf(check(t, withMain('const answer: number = "six"\nexport { answer }\n')).report))
  const report = await tool.execute({}, { requestContext })
  assert.deepEqual(Object.keys(report).sort(), ['ok', 'steps'])
  assert.deepEqual(report.steps.map((step) => step.step), ['generate', 'typecheck', 'build', 'server', 'boot'])
  const typecheck = failedStep(report, 'typecheck')
  assert.deepEqual([report.ok, typecheck.problems[0].file, typecheck.problems[0].line, typecheck.problems[0].code], [false, 'app/src/main.tsx', 1, 'TS2322'])
})

test('the tool check keeps an incremental cache per project, and it never hides a type error nor a fix', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'conexus-check-cache-test-'))
  t.after(() => rmSync(scratch, { recursive: true, force: true }))
  const info = (project) => join(scratch, '.conexus-check-cache', BUNDLE_SHA256, 'tool', project, 'tsbuildinfo')
  const withServer = (main) => ({ ...withMain(main), 'conexus/manifest.json': MANIFEST, 'conexus/handlers/notes.ts': HANDLER })
  const first = check(t, withServer(`${STARTER['app/src/main.tsx']}export const answer: number = 6\n`), { scratch })
  assert.deepEqual(stepsOf(first.report), [['generate', 'passed'], ['typecheck', 'passed'], ['build', 'passed'], ['server', 'passed'], ['boot', 'passed']])
  assert.ok(existsSync(info('app')) && existsSync(info('server')), 'one build info per project, keyed by bundle, caller and project')
  assert.equal(existsSync(`${info('app')}.lock`), false, 'the lock is released')
  const broken = check(t, withServer(`${STARTER['app/src/main.tsx']}export const answer: number = 'six'\n`), { scratch })
  assert.deepEqual(failedStep(broken.report, 'typecheck').problems.map((problem) => [problem.file, problem.line, problem.code]), [['app/src/main.tsx', 9, 'TS2322']])
  const fixed = check(t, withServer(`${STARTER['app/src/main.tsx']}export const answer: number = 6\n`), { scratch })
  const typecheckMs = ({ report }) => report.steps.find((step) => step.step === 'typecheck').durationMs
  t.diagnostic(`typecheck ms: first ${typecheckMs(first)}, with type error ${typecheckMs(broken)}, fixed ${typecheckMs(fixed)}`)
  assert.deepEqual(stepsOf(fixed.report).map(([, status]) => status), ['passed', 'passed', 'passed', 'passed', 'passed'])
})

test('a build info copied from another tree or plain noise cannot make a type error pass', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'conexus-check-forged-test-'))
  t.after(() => rmSync(scratch, { recursive: true, force: true }))
  const clean = check(t, withMain(`${STARTER['app/src/main.tsx']}export const answer: number = 6\n`), { scratch })
  assert.equal(clean.report.ok, true)
  const info = join(scratch, '.conexus-check-cache', BUNDLE_SHA256, 'tool/app/tsbuildinfo')
  // The agent's tool cache is the agent's to write: a forged copy of the clean run, or plain noise.
  for (const forged of [readFileSync(info, 'utf8'), '{"version":"0","program":{}}', 'not json']) {
    writeFileSync(info, forged)
    const { report } = check(t, withMain(`${STARTER['app/src/main.tsx']}export const answer: number = 'six'\n`), { scratch })
    assert.deepEqual(failedStep(report, 'typecheck')?.problems.map((problem) => problem.code), ['TS2322'])
  }
})

test('tsc reads the tool cache: a second check of an unchanged tree leaves the build info alone, and an edit rewrites it', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'conexus-check-read-test-'))
  t.after(() => rmSync(scratch, { recursive: true, force: true }))
  const info = join(scratch, '.conexus-check-cache', BUNDLE_SHA256, 'tool/app/tsbuildinfo')
  const tree = (value) => withMain(`${STARTER['app/src/main.tsx']}export const answer: number = ${value}\n`)
  assert.equal(check(t, tree(6), { scratch }).report.ok, true)
  const marked = new Date('2020-01-01T00:00:00Z')
  utimesSync(info, marked, marked)
  assert.equal(check(t, tree(6), { scratch }).report.ok, true)
  assert.equal(statSync(info).mtimeMs, marked.getTime(), 'tsc read the build info and found nothing to write')
  assert.equal(check(t, tree(7), { scratch }).report.ok, true)
  assert.notEqual(statSync(info).mtimeMs, marked.getTime(), 'an edit is written back')
})
