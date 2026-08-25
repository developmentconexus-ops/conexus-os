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

test('root verification protects repository and wire invariants while P-02 remains targeted proof', () => {
  const pkg = JSON.parse(read('package.json'))

  assert.equal(pkg.scripts.test, 'npm run test:repository')
  assert.equal(pkg.scripts.verify, 'npm run repository:check && npm run wire:verify')
  assert.equal(
    pkg.scripts['test:4c:p02'],
    'node --test --test-concurrency=1 tests/repository/4c-p02-functional-wireframe.test.mjs tests/repository/4c-p02-walkthrough-script-parse.test.mjs',
  )
  assert.equal(Object.hasOwn(pkg.scripts, 'test:required'), false, 'task-specific P-02 proof must not remain a permanent root gate')
  assert.match(pkg.scripts['verify:extended'], /repository:check:extended/u)
  assert.match(pkg.scripts['verify:extended'], /test:repository/u)
  assert.match(pkg.scripts['verify:extended'], /wire:verify/u)
})

test('current-state checker treats repository method as identity and rejects write-capable planning workflows', () => {
  const checker = read('scripts/check-current-state.mjs')

  assert.match(checker, /docs\/development\/repository-method\.md/u)
  assert.doesNotMatch(checker, /tests\/repository\/4c-p02-walkthrough-script-parse\.test\.mjs/u)
  assert.match(checker, /implementationBlocked[^\n]*contents[^\n]*write|contents[^\n]*write[^\n]*implementationBlocked/isu)
})
