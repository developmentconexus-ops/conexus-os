import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'

// The gate passed while an operation sat in a leaf contract file with no $ref in openapi.yaml.
// Each test here plants one of those faults in a controlled copy and requires the gate to fail,
// because a gate is only worth its runtime if it can be shown to catch what it missed.
const gate = resolve(import.meta.dirname, '../../scripts/check-wire-bijection.mjs')

const leafOperation = (path, operationId, fourAId) => `  ${path}:
    post:
      operationId: ${operationId}
      summary: Planted.
      x-conexus-4a-id: ${fourAId}
      x-conexus-ingress: [CONTROL_PLANE]
      x-conexus-contract-state: SCHEMA_CLOSED
      responses:
        '204': { description: Done. }
`

const buildFixture = (t, { leafOperations, bundledOperations }) => {
  const root = mkdtempSync(resolve(tmpdir(), 'conexus-wire-gate-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(resolve(root, 'contracts/api/product'), { recursive: true })

  writeFileSync(resolve(root, 'contracts/api/product/thing-paths.yaml'), `paths:
${leafOperations.join('')}components:
  schemas: {}
`)

  const paths = {}
  for (const { path, operationId, fourAId, contractState = 'SCHEMA_CLOSED', schemas = {} } of bundledOperations) {
    paths[path] = { post: {
      operationId,
      'x-conexus-4a-id': fourAId,
      'x-conexus-contract-state': contractState,
      ...schemas,
    } }
  }
  const bundlePath = resolve(root, 'bundle.json')
  writeFileSync(bundlePath, JSON.stringify({ paths }))

  return { root, bundlePath }
}

const runGate = ({ root, bundlePath }) => spawnSync(process.execPath, [gate], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, CONEXUS_PRODUCT_OAS_BUNDLE: bundlePath },
})

test('the gate passes on a leaf file and a bundle that agree', (t) => {
  const result = runGate(buildFixture(t, {
    leafOperations: [leafOperation('/api/thing', 'ShareThing', 'thingOne')],
    bundledOperations: [{ path: '/api/thing', operationId: 'ShareThing', fourAId: 'thingOne' }],
  }))
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /wire bijection passed \(1 Product operations/)
})

test('the gate fails when a current operation is defined in a leaf file but never bundled', (t) => {
  // Exactly the shape a real operation once had, before openapi.yaml gained its $ref.
  const result = runGate(buildFixture(t, {
    leafOperations: [
      leafOperation('/api/thing', 'ShareThing', 'thingOne'),
      leafOperation('/api/thing/unshare', 'UnshareThing', 'thingSeven'),
    ],
    bundledOperations: [{ path: '/api/thing', operationId: 'ShareThing', fourAId: 'thingOne' }],
  }))
  assert.equal(result.status, 1)
  assert.match(result.stderr, /thingSeven POST \/api\/thing\/unshare \(thing-paths\.yaml\)/)
  assert.match(result.stderr, /add a \$ref in openapi\.yaml/)
})

test('a leaf path that no bundle lists fails the gate, whatever surface it serves', (t) => {
  const result = runGate(buildFixture(t, {
    leafOperations: [
      leafOperation('/api/thing', 'ShareThing', 'thingOne'),
      leafOperation('/api/control/workspaces/{workspaceId}/areas', 'ListAreas', 'listAreas'),
    ],
    bundledOperations: [{ path: '/api/thing', operationId: 'ShareThing', fourAId: 'thingOne' }],
  }))
  assert.equal(result.status, 1)
  assert.match(result.stderr, /listAreas POST \/api\/control\/workspaces\/\{workspaceId\}\/areas \(thing-paths\.yaml\)/)
  assert.match(result.stderr, /add a \$ref in openapi\.yaml/)
})

test('a new leaf path with an unknown 4A id cannot pass unbundled', (t) => {
  // Matching by 4A id once let a leaf path with an unlisted id skip the unbundled check entirely.
  const result = runGate(buildFixture(t, {
    leafOperations: [
      leafOperation('/api/thing', 'ShareThing', 'thingOne'),
      leafOperation('/api/control/projects/{projectId}/never-wired', 'NeverWired', 'neverWired'),
    ],
    bundledOperations: [{ path: '/api/thing', operationId: 'ShareThing', fourAId: 'thingOne' }],
  }))
  assert.equal(result.status, 1)
  assert.match(result.stderr, /neverWired POST \/api\/control\/projects\/\{projectId\}\/never-wired \(thing-paths\.yaml\)/)
})

test('a bundled operation with no leaf contract source fails the gate', (t) => {
  // The reverse direction of the same absolute bijection: openapi.yaml cannot $ref a path that no
  // leaf *-paths.yaml file defines.
  const result = runGate(buildFixture(t, {
    leafOperations: [leafOperation('/api/thing', 'ShareThing', 'thingOne')],
    bundledOperations: [
      { path: '/api/thing', operationId: 'ShareThing', fourAId: 'thingOne' },
      { path: '/api/ghost', operationId: 'GhostThing', fourAId: 'thingTwo' },
    ],
  }))
  assert.equal(result.status, 1)
  assert.match(result.stderr, /bundled Product OAS operations with no leaf contract source: POST \/api\/ghost/)
})

test('a leaf contract file the scanner cannot read fails instead of reporting nothing', (t) => {
  const fixture = buildFixture(t, {
    leafOperations: [leafOperation('/api/thing', 'ShareThing', 'thingOne')],
    bundledOperations: [{ path: '/api/thing', operationId: 'ShareThing', fourAId: 'thingOne' }],
  })
  writeFileSync(resolve(fixture.root, 'contracts/api/product/thing-paths.yaml'), 'components:\n  schemas: {}\n')
  const result = runGate(fixture)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /leaf contract file has no top-level paths block: thing-paths\.yaml/)
})

const connectorFixture = (t, { contractState, schemas }) => buildFixture(t, {
  leafOperations: [leafOperation('/api/connections', 'CreateConnection', 'createWorkspaceConnection')],
  bundledOperations: [{ path: '/api/connections', operationId: 'CreateConnection', fourAId: 'createWorkspaceConnection', contractState, schemas }],
})

const request = (properties) => ({ requestBody: { content: { 'application/json': { schema: { properties } } } } })
const response = (properties) => ({ responses: { 201: { content: { 'application/json': { schema: { properties } } } } } })

test('a Connector operation that accepts a credential only as writeOnly and never returns it passes', (t) => {
  const result = runGate(connectorFixture(t, { schemas: {
    ...request({ clientSecret: { type: 'string', writeOnly: true }, name: { type: 'string' } }),
    ...response({ id: { type: 'string' } }),
  } }))
  assert.equal(result.status, 0, result.stderr)
})

test('a credential field in a request that is not writeOnly fails the gate', (t) => {
  const result = runGate(connectorFixture(t, { schemas: request({ clientSecret: { type: 'string' } }) }))
  assert.equal(result.status, 1)
  assert.match(result.stderr, /credential field clientSecret of CreateConnection is not writeOnly/)
})

test('a credential field in a success response fails the gate, however deep', (t) => {
  const result = runGate(connectorFixture(t, { schemas: response({ items: { items: { properties: { xToken: { type: 'string' } } } } }) }))
  assert.equal(result.status, 1)
  assert.match(result.stderr, /successful response schema of CreateConnection carries the credential field xToken/)
})

test('two bundled operations that share an operationId fail the gate', (t) => {
  const result = runGate(buildFixture(t, {
    leafOperations: [leafOperation('/api/thing', 'ShareThing', 'thingOne'), leafOperation('/api/other', 'ShareThing', 'thingTwo')],
    bundledOperations: [
      { path: '/api/thing', operationId: 'ShareThing', fourAId: 'thingOne' },
      { path: '/api/other', operationId: 'ShareThing', fourAId: 'thingTwo' },
    ],
  }))
  assert.equal(result.status, 1)
  assert.match(result.stderr, /duplicate operationId: ShareThing/)
})

test('a generic executor-shaped path fails the gate', (t) => {
  const result = runGate(buildFixture(t, {
    leafOperations: [leafOperation('/api/execute', 'RunAnything', 'thingOne')],
    bundledOperations: [{ path: '/api/execute', operationId: 'RunAnything', fourAId: 'thingOne' }],
  }))
  assert.equal(result.status, 1)
  assert.match(result.stderr, /forbidden generic executor-shaped Product path: \/api\/execute/)
})
