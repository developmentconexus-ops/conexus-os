import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

test('fresh-session routing uses selective local methods instead of speculative whole-repository loading', () => {
  assert.equal(existsSync(path('docs/development/repository-method.md')), true, 'repository method must exist')

  const agents = read('AGENTS.md')
  const index = read('docs/index.md')
  const rules = read('docs/development/engineering-rules.md')

  for (const text of [agents, index, rules]) {
    assert.match(text, /repository-method\.md/u, 'repository method must be routed by current governance')
  }

  assert.match(agents, /Global coverage does not require global context\./u)
  assert.match(agents, /Do not recursively read the repository by default\./u)
  assert.doesNotMatch(agents, /Whole-repository review is explicitly allowed|There is no fixed file count, owner count, or context budget/iu)

  assert.match(index, /Read first/u)
  assert.match(index, /Add(?: only)? when needed/u)
  assert.match(index, /Do not read by default/u)
  assert.match(index, /coverage[^\n]*routing/iu)
  assert.doesNotMatch(index, /There is no fixed file count or owner count/iu)

  assert.doesNotMatch(rules, /There is no external methodology router, Repository Standard dependency, file-count limit, owner-count limit, or context budget/iu)
})

test('accepted Phase 4 refinements are discoverable without reconstructing review chronology', () => {
  const decisions = read('docs/decisions/index.md')

  assert.match(decisions, /Phase 4 accepted refinements/u)
  assert.match(decisions, /4C-F22[^\n]*Project Data Explorer/u)
  assert.match(decisions, /4C-F23[^\n]*Project Brain Context/u)
  assert.match(decisions, /server-resolved/iu)
  assert.match(decisions, /read-only/iu)
})
