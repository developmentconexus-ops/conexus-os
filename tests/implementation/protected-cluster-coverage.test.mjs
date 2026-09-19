import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

// The first version of this guard armed only the first test body in each file, so ten files
// still reached ALTER ROLE without it. Hand-wiring is what failed. This asserts the coverage
// instead, so a new altering body without a guard fails here rather than in production.

const IMPLEMENTATION = resolve(import.meta.dirname)
// The literal is not the only way to reach ALTER ROLE. provisionRoles issues it on behalf of
// its caller, so a body that calls it alters cluster-global roles without naming the statement
// and would otherwise escape this check.
const ALTERS_SHARED_ROLE = /ALTER ROLE hub_|provisionRoles\(/
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

// The text check above passed while two guarded files could not run at all. One had the import
// spliced into the middle of a multi-line import and failed to parse. The other had it spliced
// into a child-process script string, so the guard was never in scope. Neither file is in the
// candidate graph, so nothing else noticed. A guard that cannot execute guards nothing.
const IMPORT_HEADER_END = /^(test|const|let|function|describe)[ (]/m
const GUARD_IMPORT = /^import \{ refuseProtectedCluster \} from '\.\/protected-cluster\.mjs'$/m

test('every file that calls the guard parses and imports it in its header', () => {
  const broken = []
  for (const name of readdirSync(IMPLEMENTATION)) {
    if (!name.endsWith('.mjs') || name === 'protected-cluster.mjs' || name === 'protected-cluster-coverage.test.mjs') continue
    const path = resolve(IMPLEMENTATION, name)
    const source = readFileSync(path, 'utf8')
    if (!source.includes(GUARD_CALL)) continue
    if (spawnSync(process.execPath, ['--check', path]).status !== 0) broken.push(`${name}: does not parse`)
    const headerEnd = source.search(IMPORT_HEADER_END)
    const header = headerEnd < 0 ? source : source.slice(0, headerEnd)
    if (!GUARD_IMPORT.test(header)) broken.push(`${name}: calls the guard without importing it in its header`)
  }
  assert.deepEqual(broken, [])
})
