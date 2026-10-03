import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const { hubNodeArguments } = await import(pathToFileURL(resolve(repositoryRoot, 'scripts/build-hub-local.mjs')).href)

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

test('the pilot scripts export the version on its own variable and leave OTEL_RESOURCE_ATTRIBUTES to the env file', () => {
  for (const name of ['hub.sh', 'runner.sh']) {
    const script = readFileSync(resolve(repositoryRoot, 'infra/pilot', name), 'utf8')
    assert.match(script, /^export CONEXUS_SERVICE_VERSION="\$\(git rev-parse --short HEAD\)"$/m, name)
    assert.doesNotMatch(script, /OTEL_RESOURCE_ATTRIBUTES/, name)
  }
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
