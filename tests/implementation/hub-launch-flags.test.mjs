import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const { buildHubLocal, hubNodeArguments } = await import(pathToFileURL(resolve(repositoryRoot, 'scripts/build-hub-local.mjs')).href)

test('the Hub child gets the heap cap, the snapshot flag, the diagnostic directories and the telemetry import, in that order', () => {
  assert.deepEqual(hubNodeArguments({ buildRoot: '/build', diagnosticDir: '/diag' }), [
    '--max-old-space-size=512',
    '--heapsnapshot-near-heap-limit=1',
    '--diagnostic-dir=/diag',
    '--report-on-fatalerror',
    '--report-directory=/diag',
    '--import', 'file:///build/telemetry/register.js',
    '/build/server.js',
  ])
})

test('a forced OOM on a throwaway child with those flags writes a heap snapshot and a diagnostic report', () => {
  const directory = mkdtempSync(join(tmpdir(), 'conexus-oom-'))
  try {
    const flags = hubNodeArguments({ buildRoot: '/missing', diagnosticDir: directory }).filter((flag) => !flag.startsWith('--import') && !flag.startsWith('file://') && !flag.endsWith('server.js'))
    const result = spawnSync(process.execPath, [...flags.map((flag) => (flag === '--max-old-space-size=512' ? '--max-old-space-size=48' : flag)), '-e', 'const keep = []; for (;;) keep.push(new Array(1e5).fill(Math.random()))'], { encoding: 'utf8', timeout: 90_000 })
    assert.notEqual(result.status, 0)
    assert.ok(existsSync(directory))
    const files = readdirSync(directory)
    assert.ok(files.some((name) => name.endsWith('.heapsnapshot')), `heap snapshot in ${files}`)
    assert.ok(files.some((name) => name.startsWith('report.') && name.endsWith('.json')), `diagnostic report in ${files}`)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

 test('a suite clones the shared Hub without compiling or deleting the original artifact', async t => {
  const source = mkdtempSync(join(tmpdir(), 'hub-artifact-source-'))
  t.after(() => rmSync(source, { recursive: true, force: true }))
  writeFileSync(join(source, 'server.js'), 'shared server fixture')
  await assert.rejects(buildHubLocal({ sharedBuild: source, web: false }), /HUB_BUILD_MISSING:app-check/)
  mkdirSync(join(source, 'app-check'))
  writeFileSync(join(source, 'app-check/main.mjs'), 'shared check fixture')
  await assert.rejects(buildHubLocal({ sharedBuild: source }), /HUB_BUILD_MISSING:..\/public/)
  const built = await buildHubLocal({ sharedBuild: source, web: false })
  assert.notEqual(built, source)
  assert.equal(readFileSync(join(built, 'server.js'), 'utf8'), 'shared server fixture')
  rmSync(built, { recursive: true, force: true })
  assert.equal(readFileSync(join(source, 'server.js'), 'utf8'), 'shared server fixture')
})
