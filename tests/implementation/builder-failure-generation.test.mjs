import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import ts from 'typescript'
import { APP_FAILURE_CLIENT_SOURCE } from '@conexus/contract'
import { generateClient } from '../../apps/hub/compiler-template/generate-client.mjs'
import { placeBundle } from './check-bundle-vm.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const { generate } = await import(hubModuleUrl('builder/check/steps/generate.js'))

async function proveEmittedReader(root) {
  const source = readFileSync(join(root, 'app/src/conexus/failures.gen.ts'), 'utf8')
  assert.equal(source, APP_FAILURE_CLIENT_SOURCE)
  const compiled = ts.transpileModule(source.replace("'zod'", JSON.stringify(import.meta.resolve('zod'))), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  const reader = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
  const abort = new DOMException('Synthetic cancellation', 'AbortError')
  await assert.rejects(reader.readFailure(new Response(new ReadableStream({ start(controller) { controller.error(abort) } }), {
    status: 500, headers: { 'content-type': 'application/problem+json' },
  })), (error) => error === abort)
}

test('the compiled Hub generator and delivered check bundle emit the current abort-preserving client', async (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'cx-failure-gen-'))
  t.after(() => rmSync(scratch, { recursive: true, force: true }))
  const direct = join(scratch, 'direct')
  mkdirSync(direct)
  assert.deepEqual(await generate({ root: direct, drop: null }), { kind: 'ok' })
  await proveEmittedReader(direct)
  const bundled = join(scratch, 'bundled')
  mkdirSync(join(bundled, 'app'), { recursive: true })
  const main = placeBundle(join(scratch, 'tools'))
  const ran = spawnSync(process.execPath, [main, 'check', '--caller', 'tool', '--root', bundled, '--out', join(scratch, 'out'), '--template-ref', 'synthetic', '--as', `${process.getuid()}:${process.getgid()}`], { encoding: 'utf8', timeout: 30_000 })
  assert.equal(ran.status, 0, ran.stderr)
  const report = JSON.parse(ran.stdout)
  assert.equal(report.steps[0].step, 'generate')
  assert.equal(report.steps[0].status, 'passed')
  assert.equal(report.ok, false)
  assert.equal(report.steps[1].status, 'failed')
  await proveEmittedReader(bundled)
})

test('the emitted API and failure support typecheck and build with the pinned compiler dependencies', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'cx-client-build-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const dependencies = new URL('../../node_modules/', import.meta.url).pathname
  symlinkSync(dependencies, join(root, 'node_modules'))
  const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }
  const { apiGen } = generateClient({ operations: { listNotes: { input: schema, output: schema } } })
  mkdirSync(join(root, 'src/conexus'), { recursive: true })
  writeFileSync(join(root, 'src/conexus/api.gen.ts'), apiGen)
  writeFileSync(join(root, 'src/conexus/failures.gen.ts'), APP_FAILURE_CLIENT_SOURCE)
  writeFileSync(join(root, 'src/main.ts'), "import { api } from './conexus/api.gen'\ndocument.body.addEventListener('click', () => { void api.listNotes({ ok: true }) })\n")
  writeFileSync(join(root, 'index.html'), '<!doctype html><body><script type="module" src="/src/main.ts"></script></body>')
  const checked = spawnSync(process.execPath, [join(dependencies, 'typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'Bundler', join(root, 'src/main.ts')], { encoding: 'utf8', timeout: 30_000 })
  assert.equal(checked.status, 0, checked.stdout + checked.stderr)
  const built = spawnSync(process.execPath, [join(dependencies, 'vite/bin/vite.js'), 'build', root, '--outDir', join(root, 'dist')], { encoding: 'utf8', timeout: 30_000 })
  assert.equal(built.status, 0, built.stdout + built.stderr)
  assert.match(readFileSync(join(root, 'dist/index.html'), 'utf8'), /assets\/index-.*\.js/)
})
