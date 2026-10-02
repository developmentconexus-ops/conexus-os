import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'

const gate = resolve(import.meta.dirname, '../../scripts/check-wire-ratchet.mjs')

const hubFile = ({ routes, named = [], browserExtra = '', top = '' }) => `const SESSIONS_PATH = '/agent-controller/:controllerId/sessions'
const SESSION_BASE = \`\${SESSIONS_PATH}/:resourceId\`
${named.map(({ name, path }) => `const ${name} = mastraRoute('POST', '${path}')`).join('\n')}
${top}
const BROWSER_ROUTES: ReadonlySet<string> = new Set([
${named.map(({ name }) => `  ${name},`).join('\n')}
  sessionRoute('GET'),
  sessionRoute('POST', '/abort'),
${browserExtra}])
export const register = (app: FastifyInstance) => {
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
      'apps/hub/src/builder/routes.ts GET /a',
      'apps/hub/src/builder/routes.ts GET /b',
    ],
    problemTypes: ['urn:conexus:problem:one'],
  },
}

const fixture = (t, overrides = {}) => {
  const { routes, named, webLines, recorded, browserExtra, top } = { ...BASE, ...overrides }
  const root = mkdtempSync(resolve(tmpdir(), 'conexus-wire-ratchet-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const directory of ['apps/hub/src/builder', 'apps/web/src/features', 'contracts/technical']) mkdirSync(resolve(root, directory), { recursive: true })
  writeFileSync(resolve(root, 'apps/hub/src/builder/routes.ts'), hubFile({ routes, named, browserExtra, top }))
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
  assert.equal(errorLines(result), 'Error: builderRoutes: new gap apps/hub/src/builder/routes.ts GET /c; put it on the generated contract instead of adding it to contracts/technical/wire-ratchet.json')
})

test('fails when a route is added through a named constant', (t) => {
  const named = [...BASE.named, { name: 'EXTRA_ROUTE', path: '/agent-controller/:controllerId/extra' }]
  const result = run(fixture(t, { named }))
  assert.equal(errorLines(result), 'Error: builderRoutes: new gap mastra POST /agent-controller/:controllerId/extra; put it on the generated contract instead of adding it to contracts/technical/wire-ratchet.json')
})

test('reads a browser route followed by a comment', (t) => {
  const result = run(fixture(t, { browserExtra: "  sessionRoute('POST', '/probe'), // probe\n" }))
  assert.equal(errorLines(result), 'Error: builderRoutes: new gap mastra POST /agent-controller/:controllerId/sessions/:resourceId/probe; put it on the generated contract instead of adding it to contracts/technical/wire-ratchet.json')
})

test('reads a browser route split over two lines', (t) => {
  const result = run(fixture(t, { browserExtra: "  sessionRoute(\n    'POST', '/probe'),\n" }))
  assert.equal(errorLines(result), 'Error: builderRoutes: new gap mastra POST /agent-controller/:controllerId/sessions/:resourceId/probe; put it on the generated contract instead of adding it to contracts/technical/wire-ratchet.json')
})

test('reads a registration whose path is a local constant', (t) => {
  const result = run(fixture(t, { top: "const PROBE_PATH = '/api/control/probe'\nexport const more = (app: FastifyInstance) => app.post(PROBE_PATH, async () => ({}))" }))
  assert.equal(errorLines(result), 'Error: builderRoutes: new gap apps/hub/src/builder/routes.ts POST /api/control/probe; put it on the generated contract instead of adding it to contracts/technical/wire-ratchet.json')
})

test('reads a route registered on a plugin scope inside app.register', (t) => {
  const result = run(fixture(t, { top: "export const more = (app: FastifyInstance) => app.register(async (scope) => { scope.post('/api/control/probe', async () => ({})) })" }))
  assert.equal(errorLines(result), 'Error: builderRoutes: new gap apps/hub/src/builder/routes.ts POST /api/control/probe; put it on the generated contract instead of adding it to contracts/technical/wire-ratchet.json')
})

test('reads a route registered with app.route', (t) => {
  const result = run(fixture(t, { top: "export const more = (app: FastifyInstance) => app.route({ method: ['GET', 'POST'], url: '/api/control/probe', handler: async () => ({}) })" }))
  assert.equal(errorLines(result), `Error: builderRoutes: new gap apps/hub/src/builder/routes.ts GET /api/control/probe; put it on the generated contract instead of adding it to contracts/technical/wire-ratchet.json
builderRoutes: new gap apps/hub/src/builder/routes.ts POST /api/control/probe; put it on the generated contract instead of adding it to contracts/technical/wire-ratchet.json`)
})

test('stops on a route registered on a receiver it cannot tie to Fastify', (t) => {
  const result = run(fixture(t, { top: "export const more = (server) => server.post('/api/control/probe', async () => ({}))" }))
  assert.equal(errorLines(result), "Error: apps/hub/src/builder/routes.ts: cannot read a route on a receiver that is not a Fastify instance `server.post('/api/control/probe', async () => ({}))`; the ratchet does not understand its shape")
})

test('stops on a registration whose path cannot be resolved', (t) => {
  const result = run(fixture(t, { top: 'export const more = (app: FastifyInstance) => app.post(importedPath, async () => ({}))' }))
  assert.equal(errorLines(result), 'Error: apps/hub/src/builder/routes.ts: cannot read a path `importedPath`; the ratchet does not understand its shape')
})

test('stops on a BROWSER_ROUTES entry it cannot read', (t) => {
  const result = run(fixture(t, { browserExtra: '  ...more,\n' }))
  assert.equal(errorLines(result), 'Error: apps/hub/src/builder/routes.ts: cannot read a BROWSER_ROUTES entry `...more`; the ratchet does not understand its shape')
})

test('keys routes by repository path so same-named files do not collide', (t) => {
  const root = fixture(t)
  mkdirSync(resolve(root, 'apps/hub/src/builder/other'), { recursive: true })
  writeFileSync(resolve(root, 'apps/hub/src/builder/other/routes.ts'), "export const r = (app: FastifyInstance) => app.get('/a', async () => ({}))")
  assert.equal(errorLines(run(root)), 'Error: builderRoutes: new gap apps/hub/src/builder/other/routes.ts GET /a; put it on the generated contract instead of adding it to contracts/technical/wire-ratchet.json')
})

test('fails on a swap: one route fixed and another added keeps the count and still fails', (t) => {
  const result = run(fixture(t, { routes: ['/a', '/c'] }))
  assert.equal(errorLines(result), `Error: builderRoutes: new gap apps/hub/src/builder/routes.ts GET /c; put it on the generated contract instead of adding it to contracts/technical/wire-ratchet.json
builderRoutes: apps/hub/src/builder/routes.ts GET /b is no longer in the code; delete its line from contracts/technical/wire-ratchet.json`)
})

test('fails and names the line to delete when a gap is fixed', (t) => {
  const result = run(fixture(t, { routes: ['/a'] }))
  assert.equal(errorLines(result), 'Error: builderRoutes: apps/hub/src/builder/routes.ts GET /b is no longer in the code; delete its line from contracts/technical/wire-ratchet.json')
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
