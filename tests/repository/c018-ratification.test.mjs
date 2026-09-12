import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = path => readFileSync(resolve(root, path), 'utf8')

test('documentation router keeps the C-018 continuity record discoverable for explicit historical audit', () => {
  assert.match(read('docs/index.md'), /phases\/c-018-final-architecture-ratification\.md/)
  assert.match(read('docs/phases/c-018-final-architecture-ratification.md'), /^# C-018/)
})
