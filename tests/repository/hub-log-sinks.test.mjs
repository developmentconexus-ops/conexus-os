import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const source = join(root, 'apps/hub/src')

const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name)
  if (entry.isDirectory()) return entry.name === 'generated' ? [] : walk(path)
  return entry.name.endsWith('.ts') ? [path] : []
})

// The check scripts run as child processes whose stdout is their contract. The bundled check is the
// whole of builder/check/, and the two strings it replaces are the rest.
const CHILD_PROCESS_SCRIPTS = new Set(['builder/application-check.ts', 'builder/application-server-build.ts'])
const isCheckBundleSource = (name) => name.startsWith('builder/check/')
const SINK = /process\.(stderr|stdout)\b|\bconsole\./
const READY_LINE = "process.stderr.write(`${JSON.stringify({ event: 'ready', socketPath,"

test('runtime code under apps/hub/src writes through the shared logger, not to process.stderr, process.stdout or console', () => {
  const offenders = []
  for (const file of walk(source)) {
    const name = relative(source, file)
    if (CHILD_PROCESS_SCRIPTS.has(name) || isCheckBundleSource(name)) continue
    readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      if (!SINK.test(line)) return
      if (name === 'app-runner/main.ts' && line.includes(READY_LINE)) return
      offenders.push(`${name}:${index + 1}: ${line.trim()}`)
    })
  }
  assert.deepEqual(offenders, [])
})
