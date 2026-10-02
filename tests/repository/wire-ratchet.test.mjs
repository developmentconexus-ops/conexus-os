import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'

const gate = resolve(import.meta.dirname, '../../scripts/check-wire-ratchet.mjs')

const hubFile = (routes) => `const BROWSER_ROUTES: ReadonlySet<string> = new Set([
  sessionRoute('GET'),
  sessionRoute('POST', '/abort'),
])
export const register = (app) => {
${routes.map((route) => `  app.get('${route}', async () => ({}))`).join('\n')}
}
`

const fixture = (t, { routes = ['/a', '/b'], webLines = ["const x = 'urn:conexus:problem:one'"], recorded = { offTableBuilderRoutes: 4, handComparedProblemTypes: 1 } } = {}) => {
  const root = mkdtempSync(resolve(tmpdir(), 'conexus-wire-ratchet-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const directory of ['apps/hub/src/builder', 'apps/web/src/features', 'contracts/technical']) mkdirSync(resolve(root, directory), { recursive: true })
  writeFileSync(resolve(root, 'apps/hub/src/builder/routes.ts'), hubFile(routes))
  writeFileSync(resolve(root, 'apps/web/src/features/problems.ts'), webLines.join('\n'))
  writeFileSync(resolve(root, 'apps/web/src/features/problems.test.ts'), "'urn:conexus:problem:ignored'")
  writeFileSync(resolve(root, 'contracts/technical/wire-ratchet.json'), JSON.stringify(recorded))
  return root
}
const errorLine = (result) => result.stderr.split('\n').find((line) => line.startsWith('Error: '))
const run = (root) => spawnSync(process.execPath, [gate], { encoding: 'utf8', env: { ...process.env, CONEXUS_WIRE_RATCHET_ROOT: root } })

test('passes when the measured gaps equal the recorded ones', (t) => {
  const result = run(fixture(t))
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), 'Wire ratchet OK: 4 Builder routes off the table, 1 problem types compared by hand')
})

test('fails when a new off-table Builder route appears', (t) => {
  const result = run(fixture(t, { routes: ['/a', '/b', '/c'] }))
  assert.equal(errorLine(result), 'Error: offTableBuilderRoutes rose from 4 to 5: move the new route or problem type onto the generated contract instead of adding to the gap')
})

test('fails when the web compares a new problem type by hand', (t) => {
  const result = run(fixture(t, { webLines: ["'urn:conexus:problem:one'", "'urn:conexus:problem:two'"] }))
  assert.equal(errorLine(result), 'Error: handComparedProblemTypes rose from 1 to 2: move the new route or problem type onto the generated contract instead of adding to the gap')
})

test('fails and says to lower the record when a gap is fixed', (t) => {
  const result = run(fixture(t, { routes: ['/a'] }))
  assert.equal(errorLine(result), 'Error: offTableBuilderRoutes fell from 4 to 3: lower it to 3 in contracts/technical/wire-ratchet.json so the gain cannot be spent again')
})

test('fails when the record lacks a count', (t) => {
  const result = run(fixture(t, { recorded: { offTableBuilderRoutes: 4 } }))
  assert.equal(errorLine(result), 'Error: contracts/technical/wire-ratchet.json has no integer handComparedProblemTypes')
})

test('records the real repository state', () => {
  const result = spawnSync(process.execPath, [gate], { encoding: 'utf8', cwd: resolve(import.meta.dirname, '../..') })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), 'Wire ratchet OK: 28 Builder routes off the table, 4 problem types compared by hand')
})
