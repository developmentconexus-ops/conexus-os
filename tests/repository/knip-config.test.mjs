import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const config = JSON.parse(
  readFileSync(resolve(root, 'knip.jsonc'), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n'),
)

// A glob entry under tests/ makes every matching helper a root, so an orphaned helper would never be
// reported as unused. Only test suites may be matched by glob; any other root must be named.
test('knip names every non-suite test root instead of globbing test-support directories', () => {
  const testEntries = config.entry.filter((entry) => entry.startsWith('tests/'))
  assert.ok(testEntries.includes('tests/**/*.test.mjs'))
  for (const entry of testEntries) {
    if (entry === 'tests/**/*.test.mjs') continue
    assert.doesNotMatch(entry, /[*?[{]/, `${entry} must name one file, not a glob`)
    assert.ok(existsSync(resolve(root, entry)), `${entry} does not exist`)
  }
})
