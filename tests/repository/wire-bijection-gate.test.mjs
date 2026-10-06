import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'

// Each test plants one fault in a controlled copy of the emitted document and requires the gate to
// fail, because a gate is only worth its runtime if it can be shown to catch what it guards.
const gate = resolve(import.meta.dirname, '../../scripts/check-wire-bijection.mjs')

const createWorkspace = { path: '/api/control/workspaces', method: 'post', operationId: 'createWorkspace' }
const createConnection = { path: '/api/control/workspaces/{workspaceId}/connections', method: 'post', operationId: 'createWorkspaceConnection' }

const runGate = (t, operations) => {
  const root = mkdtempSync(resolve(tmpdir(), 'conexus-wire-gate-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const paths = {}
  for (const { path, method, operationId, schemas = {} } of operations) {
    paths[path] ??= {}
    paths[path][method] = { operationId, ...schemas }
  }
  const bundlePath = resolve(root, 'bundle.json')
  writeFileSync(bundlePath, JSON.stringify({ paths }))
  return spawnSync(process.execPath, [gate], { encoding: 'utf8', env: { ...process.env, CONEXUS_PRODUCT_OAS_BUNDLE: bundlePath } })
}

test('the gate passes on a document whose operations are declared', (t) => {
  const result = runGate(t, [createWorkspace])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /wire bijection passed \(1 Product operations/)
})

test('an operation the contract package does not declare fails the gate', (t) => {
  const result = runGate(t, [createWorkspace, { path: '/api/ghost', method: 'post', operationId: 'ghostThing' }])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /no declared operation in @conexus\/contract: POST \/api\/ghost/)
})

test('a declared path under another operation id fails the gate', (t) => {
  const result = runGate(t, [{ ...createWorkspace, operationId: 'makeWorkspace' }])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /no declared operation in @conexus\/contract: POST \/api\/control\/workspaces/)
})

test('two operations that share an operationId fail the gate', (t) => {
  const result = runGate(t, [createWorkspace, { ...createConnection, operationId: 'createWorkspace' }])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /duplicate operationId: createWorkspace/)
})

test('a generic executor-shaped path fails the gate', (t) => {
  const result = runGate(t, [{ path: '/api/execute', method: 'post', operationId: 'runAnything' }])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /forbidden generic executor-shaped Product path: \/api\/execute/)
})

const request = (properties) => ({ requestBody: { content: { 'application/json': { schema: { properties } } } } })
const response = (properties) => ({ responses: { 201: { content: { 'application/json': { schema: { properties } } } } } })

test('a Connector operation that accepts a credential only as writeOnly and never returns it passes', (t) => {
  const result = runGate(t, [{ ...createConnection, schemas: {
    ...request({ clientSecret: { type: 'string', writeOnly: true }, name: { type: 'string' } }),
    ...response({ id: { type: 'string' } }),
  } }])
  assert.equal(result.status, 0, result.stderr)
})

test('a credential field in a request that is not writeOnly fails the gate', (t) => {
  const result = runGate(t, [{ ...createConnection, schemas: request({ clientSecret: { type: 'string' } }) }])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /credential field clientSecret of createWorkspaceConnection is not writeOnly/)
})

test('a credential field in a success response fails the gate, however deep', (t) => {
  const result = runGate(t, [{ ...createConnection, schemas: response({ items: { items: { properties: { xToken: { type: 'string' } } } } }) }])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /successful response schema of createWorkspaceConnection carries the credential field xToken/)
})
