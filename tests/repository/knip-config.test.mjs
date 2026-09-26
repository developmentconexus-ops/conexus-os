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

// A glob entry under scripts/ or tests/ makes every matching file a root, so an orphaned script or
// helper would never be reported as unused. Only test suites may be matched by glob; any other root
// in those directories must be named.
test('knip names every script and non-suite test root instead of globbing directories', () => {
  const entries = config.entry.filter((entry) => entry.startsWith('scripts/') || entry.startsWith('tests/'))
  assert.ok(entries.includes('tests/**/*.test.mjs'))
  for (const entry of entries) {
    if (entry === 'tests/**/*.test.mjs') continue
    assert.doesNotMatch(entry, /[*?[{]/, `${entry} must name one file, not a glob`)
    assert.ok(existsSync(resolve(root, entry)), `${entry} does not exist`)
  }
})
