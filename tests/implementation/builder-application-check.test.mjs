import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { chromium } from '@playwright/test'
import { ensureCompilerRoot } from './compiler-root.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const { checkScriptSource, parseCheckReport, failedStepEvidence } = await import(hubModuleUrl('builder/application-check.js'))
const { serverBuildScriptSource } = await import(hubModuleUrl('builder/application-server-build.js'))
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

// Runs the real script against a real install of the template's compiler (its lockfile, its allowlist
// view of node_modules) and the Playwright Chromium, in a folder laid out like the sandbox:
// /opt/conexus is `tools`.
const check = (t, files, { limits = [], compilerFiles = {}, before } = {}) => {
  const scratch = mkdtempSync(join(tmpdir(), 'conexus-check-test-'))
  t.after(() => rmSync(scratch, { recursive: true, force: true }))
  const root = join(scratch, 'repo')
  const tools = join(scratch, 'opt')
  const out = join(scratch, 'dist')
  for (const [path, content] of Object.entries({ ...files })) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), typeof content === 'string' ? content : JSON.stringify(content))
  }
  mkdirSync(join(tools, 'compiler'), { recursive: true })
  for (const name of ['node_modules', 'full']) symlinkSync(join(compilerRoot, name), join(tools, 'compiler', name))
  for (const name of ['allowlist.mjs', 'generate-client.mjs', 'tsconfig.mjs', 'package.json']) copyFileSync(join(compilerRoot, name), join(tools, 'compiler', name))
  writeFileSync(join(tools, 'compiler/vite.config.mjs'), templateConfig.replace("'/workspace/.vite'", JSON.stringify(join(scratch, 'vite-cache'))))
  writeFileSync(join(tools, 'server-build.mjs'), serverBuildScriptSource().replaceAll('/opt/conexus/compiler', join(tools, 'compiler')))
  for (const [path, content] of Object.entries(compilerFiles)) {
    mkdirSync(dirname(join(tools, path)), { recursive: true })
    writeFileSync(join(tools, path), content)
  }
  before?.(root)
  const script = join(scratch, 'check.mjs')
  writeFileSync(script, checkScriptSource())
  const ran = spawnSync(process.execPath, [
    script, '--root', root, '--out', out, '--tools', tools, '--home', scratch, '--chromium', chromium.executablePath(),
    ...limits.flatMap((limit) => ['--limit', limit]),
  ], { encoding: 'utf8', timeout: 120_000 })
  assert.equal(ran.status, 0, ran.stderr)
  return { report: parseCheckReport(ran.stdout), raw: JSON.parse(ran.stdout.trim().split('\n').pop()), root, out, scratch }
}

const stepsOf = (report) => report.steps.map((step) => [step.step, step.status])
const failedStep = (report, id) => report.steps.find((step) => step.step === id && step.status === 'failed')

test('a starter with no server half passes all five steps and reports what it built', (t) => {
  const { report } = check(t, STARTER)
  assert.equal(report.ok, true)
  assert.deepEqual(stepsOf(report), [['generate', 'passed'], ['typecheck', 'passed'], ['build', 'passed'], ['server', 'passed'], ['boot', 'passed']])
  assert.deepEqual({ operations: report.facts.operations, migrations: report.facts.migrations }, { operations: 0, migrations: 0 })
  assert.ok(report.facts.jsGzipBytes > 10_000, `gzip size ${report.facts.jsGzipBytes}`)
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

test('the facts count operations and migrations from the source', (t) => {
  const { report } = check(t, {
    ...STARTER,
    'conexus/manifest.json': MANIFEST,
    'conexus/handlers/notes.ts': HANDLER,
    'conexus/migrations/001_notes.sql': 'CREATE TABLE note (id integer PRIMARY KEY)',
  })
  assert.equal(report.ok, true)
  assert.deepEqual({ operations: report.facts.operations, migrations: report.facts.migrations }, { operations: 1, migrations: 1 })
})

test('a type error is refused with its file, line and code, and the steps after it are skipped', (t) => {
  const { report } = check(t, withMain(`const answer: number = 'six'\nexport { answer }\n`))
  assert.equal(report.ok, false)
  assert.deepEqual(stepsOf(report), [['generate', 'passed'], ['typecheck', 'failed'], ['build', 'skipped'], ['server', 'skipped'], ['boot', 'skipped']])
  assert.deepEqual(failedStep(report, 'typecheck').problems, [
    { file: 'app/src/main.tsx', line: 1, column: 7, code: 'TS2322', message: "Type 'string' is not assignable to type 'number'." },
  ])
  assert.deepEqual(report.steps.filter((step) => step.status === 'skipped').map((step) => step.reason), ['after failed typecheck', 'after failed typecheck', 'after failed typecheck'])
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
  assert.ok(problem.message.includes('[redacted]'))
  assert.ok(!problem.message.includes('ghp_'))
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
setTimeout(() => {}, 300_000)
`
  const started = Date.now()
  const { report } = check(t, { ...STARTER, 'conexus/manifest.json': MANIFEST, 'conexus/handlers/notes.ts': HANDLER }, { limits: ['server=1500'], compilerFiles: { 'server-build.mjs': hang } })
  assert.ok(Date.now() - started < 60_000)
  assert.equal(report.ok, false)
  assert.deepEqual(stepsOf(report), [['generate', 'passed'], ['typecheck', 'passed'], ['build', 'passed'], ['server', 'failed'], ['boot', 'skipped']])
  assert.deepEqual(failedStep(report, 'server').problems, [{ code: 'STEP_TIMEOUT', message: 'server exceeded 1.5 s and was stopped' }])
  const sleeper = Number(readFileSync(pidFile, 'utf8'))
  assert.throws(() => process.kill(sleeper, 0), { code: 'ESRCH' }, 'the grandchild of the hung step is gone')
})

test('conexus_check hands the model the report of the run check, a type error as a typecheck problem with file and line', async (t) => {
  const { createCheckTool } = await import(hubModuleUrl('builder/harness/tools.js'))
  const { RequestContext } = await import('@mastra/core/request-context')
  const requestContext = new RequestContext()
  requestContext.set('controller', { session: { modeId: 'build' } })
  const tool = createCheckTool(async () => check(t, withMain('const answer: number = "six"\nexport { answer }\n')).report)
  const report = await tool.execute({}, { requestContext })
  assert.deepEqual(report.steps.map((step) => step.step), ['generate', 'typecheck', 'build', 'server', 'boot'])
  const typecheck = failedStep(report, 'typecheck')
  assert.deepEqual([report.ok, typecheck.problems[0].file, typecheck.problems[0].line, typecheck.problems[0].code], [false, 'app/src/main.tsx', 1, 'TS2322'])
})
