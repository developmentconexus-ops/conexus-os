import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name)
  if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(path)
  return /\.(mjs|ts)$/.test(entry.name) ? [path] : []
})

// The three keys a run's turn carries are written by one owner (`bindRunContext`) from branded ids, and read by one reader.
const WRITES_KEY = /setRaw\(\s*['"`]conexusBuilder(?:Run|Account|Conversation)Id['"`]/
const EXEMPT = new Set(['apps/hub/src/builder/run-context.ts', 'tests/implementation/builder-run-context.test.mjs', 'tests/repository/builder-run-context.test.mjs'])

test('no source or test writes the run-context keys by hand: tests bind through bindRunContext with contract ids', () => {
  const offenders = ['apps/hub/src', 'tests'].flatMap((directory) => walk(join(root, directory))).flatMap((file) => {
    // The owner, and the two tests of the invariant, which write a broken context on purpose.
    if (EXEMPT.has(relative(root, file))) return []
    return readFileSync(file, 'utf8').split('\n').flatMap((line, index) => (WRITES_KEY.test(line) ? [`${relative(root, file)}:${index + 1}`] : []))
  })
  assert.deepEqual(offenders, [])
  assert.equal(WRITES_KEY.test("requestContext.setRaw('conexusBuilderRunId', 'run-1')"), true, 'the scan finds a hand-written key')
})
