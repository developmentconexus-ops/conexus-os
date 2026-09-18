import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

// The first version of this guard armed only the first test body in each file, so ten files
// still reached ALTER ROLE without it. Hand-wiring is what failed. This asserts the coverage
// instead, so a new altering body without a guard fails here rather than in production.

const IMPLEMENTATION = resolve(import.meta.dirname)
const ALTERS_SHARED_ROLE = /ALTER ROLE hub_/
const GUARD_CALL = 'refuseProtectedCluster()'

// Reaches the compose hostname `postgres` and never reads CONEXUS_TEST_DB_*, so it cannot
// resolve, let alone reach, an operator cluster.
const EXEMPT = new Set(['r1-s1-live-setup.mjs'])

const bodies = (source) => {
  const starts = [...source.matchAll(/^test\(/gm)].map(match => match.index)
  return starts.map((start, index) => source.slice(start, starts[index + 1] ?? source.length))
}

test('every test body that alters a shared role refuses a protected cluster first', () => {
  const unguarded = []

  for (const name of readdirSync(IMPLEMENTATION)) {
    if (!name.endsWith('.mjs') || EXEMPT.has(name)) continue
    const source = readFileSync(resolve(IMPLEMENTATION, name), 'utf8')
    if (!ALTERS_SHARED_ROLE.test(source)) continue

    const found = bodies(source)
    assert.notEqual(found.length, 0, `${name} alters a shared role outside any test body`)

    for (const body of found) {
      if (!ALTERS_SHARED_ROLE.test(body)) continue
      if (body.includes(GUARD_CALL)) continue
      const title = body.slice(0, body.indexOf('\n')).trim()
      unguarded.push(`${name}: ${title}`)
    }
  }

  assert.deepEqual(unguarded, [], `these bodies alter a cluster-global role without refusing a protected cluster first:\n${unguarded.join('\n')}`)
})
