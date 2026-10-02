import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'

const gate = resolve(import.meta.dirname, '../../scripts/check-wire-ratchet.mjs')

const hubFile = ({ routes, named = [] }) => `const SESSIONS_PATH = '/agent-controller/:controllerId/sessions'
const SESSION_BASE = \`\${SESSIONS_PATH}/:resourceId\`
${named.map(({ name, path }) => `const ${name} = mastraRoute('POST', '${path}')`).join('\n')}
const BROWSER_ROUTES: ReadonlySet<string> = new Set([
${named.map(({ name }) => `  ${name},`).join('\n')}
  sessionRoute('GET'),
  sessionRoute('POST', '/abort'),
])
export const register = (app) => {
${routes.map((route) => `  app.get<{ Params: { id: string } }>('${route}', async () => ({}))`).join('\n')}
}
`

const BASE = {
  routes: ['/a', '/b'],
  named: [{ name: 'CREATE_ROUTE', path: '/agent-controller/:controllerId/sessions' }],
  webLines: ["const x = 'urn:conexus:problem:one'"],
  recorded: {
    builderRoutes: [
      'mastra GET /agent-controller/:controllerId/sessions/:resourceId',
      'mastra POST /agent-controller/:controllerId/sessions',
      'mastra POST /agent-controller/:controllerId/sessions/:resourceId/abort',
      'routes.ts GET /a',
      'routes.ts GET /b',
    ],
    problemTypes: ['urn:conexus:problem:one'],
  },
}

const fixture = (t, overrides = {}) => {
  const { routes, named, webLines, recorded } = { ...BASE, ...overrides }
  const root = mkdtempSync(resolve(tmpdir(), 'conexus-wire-ratchet-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const directory of ['apps/hub/src/builder', 'apps/web/src/features', 'contracts/technical']) mkdirSync(resolve(root, directory), { recursive: true })
  writeFileSync(resolve(root, 'apps/hub/src/builder/routes.ts'), hubFile({ routes, named }))
  writeFileSync(resolve(root, 'apps/hub/src/builder/mastra-session-routes.ts'), '')
  writeFileSync(resolve(root, 'apps/web/src/features/problems.ts'), webLines.join('\n'))
  writeFileSync(resolve(root, 'apps/web/src/features/problems.test.ts'), "'urn:conexus:problem:ignored'")
  writeFileSync(resolve(root, 'contracts/technical/wire-ratchet.json'), JSON.stringify(recorded))
  return root
}
const errorLines = (result) => result.stderr.split('\n').filter((line) => line.startsWith('Error: ') || /^(builderRoutes|problemTypes):/.test(line)).join('\n')
const run = (root) => spawnSync(process.execPath, [gate], { encoding: 'utf8', env: { ...process.env, CONEXUS_WIRE_RATCHET_ROOT: root } })

test('passes when the list matches the code, named constants included', (t) => {
  const result = run(fixture(t))
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), 'Wire ratchet OK: 5 Builder routes off the table, 1 problem types compared by hand')
})

test('fails when a new off-table Builder route appears', (t) => {
  const result = run(fixture(t, { routes: ['/a', '/b', '/c'] }))
  assert.equal(errorLines(result), 'Error: builderRoutes: new gap routes.ts GET /c; put it on the generated contract instead of adding it to contracts/technical/wire-ratchet.json')
})

test('fails when a route is added through a named constant', (t) => {
  const named = [...BASE.named, { name: 'EXTRA_ROUTE', path: '/agent-controller/:controllerId/extra' }]
  const result = run(fixture(t, { named }))
  assert.equal(errorLines(result), 'Error: builderRoutes: new gap mastra POST /agent-controller/:controllerId/extra; put it on the generated contract instead of adding it to contracts/technical/wire-ratchet.json')
})

test('fails on a swap: one route fixed and another added keeps the count and still fails', (t) => {
  const result = run(fixture(t, { routes: ['/a', '/c'] }))
  assert.equal(errorLines(result), [
    'Error: builderRoutes: new gap routes.ts GET /c; put it on the generated contract instead of adding it to contracts/technical/wire-ratchet.json',
    'builderRoutes: routes.ts GET /b is no longer in the code; delete its line from contracts/technical/wire-ratchet.json',
  ].join('\n'))
})

test('fails and names the line to delete when a gap is fixed', (t) => {
  const result = run(fixture(t, { routes: ['/a'] }))
  assert.equal(errorLines(result), 'Error: builderRoutes: routes.ts GET /b is no longer in the code; delete its line from contracts/technical/wire-ratchet.json')
})

test('fails when the web compares a new problem type by hand', (t) => {
  const result = run(fixture(t, { webLines: ["'urn:conexus:problem:one'", "'urn:conexus:problem:two'"] }))
  assert.equal(errorLines(result), 'Error: problemTypes: new gap urn:conexus:problem:two; put it on the generated contract instead of adding it to contracts/technical/wire-ratchet.json')
})

test('counts a problem type once however many times the web writes it', (t) => {
  const result = run(fixture(t, { webLines: ["'urn:conexus:problem:one'", "'urn:conexus:problem:one'"] }))
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), 'Wire ratchet OK: 5 Builder routes off the table, 1 problem types compared by hand')
})

test('fails when the record lacks a list', (t) => {
  const result = run(fixture(t, { recorded: { builderRoutes: BASE.recorded.builderRoutes } }))
  assert.equal(errorLines(result), 'Error: contracts/technical/wire-ratchet.json has no list problemTypes')
})

test('records the real repository state', () => {
  const result = spawnSync(process.execPath, [gate], { encoding: 'utf8', cwd: resolve(import.meta.dirname, '../..') })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), 'Wire ratchet OK: 29 Builder routes off the table, 4 problem types compared by hand')
})
