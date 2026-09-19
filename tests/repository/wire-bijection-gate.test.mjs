import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'

// The gate passed at 21 of 21 while an operation sat in a leaf contract file with no $ref in
// openapi.yaml, and while a census row whose id had a letter suffix was skipped without a word.
// Each test here plants one of those faults in a controlled copy and requires the gate to fail,
// because a gate is only worth its runtime if it can be shown to catch what it missed.
const gate = resolve(import.meta.dirname, '../../scripts/check-wire-bijection.mjs')

const censusRow = (id, operationId) => `| \`${id}\` | \`${operationId}\` | Model Connection | exact authority | command |`

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

const buildFixture = (t, { rows, leafOperations, bundledOperations }) => {
  const root = mkdtempSync(resolve(tmpdir(), 'conexus-wire-gate-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(resolve(root, 'docs/product'), { recursive: true })
  mkdirSync(resolve(root, 'contracts/api/product'), { recursive: true })

  writeFileSync(resolve(root, 'docs/product/operation-ledger.md'), `# Ledger

# 5. Current fixed Product census

| ID | Operation | Owner | Consumer / authority root | Class |
| --- | --- | --- | --- | --- |
${rows.join('\n')}

# 5A. Broader retained historical/platform ledger
`)

  writeFileSync(resolve(root, 'contracts/api/product/model-connection-paths.yaml'), `paths:
${leafOperations.join('')}components:
  schemas: {}
`)

  const paths = {}
  for (const { path, operationId, fourAId } of bundledOperations) {
    paths[path] = { post: {
      operationId,
      'x-conexus-4a-id': fourAId,
      'x-conexus-contract-state': 'SCHEMA_CLOSED',
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

test('the gate passes on a census, leaf file and bundle that agree', (t) => {
  const result = runGate(buildFixture(t, {
    rows: [censusRow('CLA-01', 'ShareThing')],
    leafOperations: [leafOperation('/api/thing', 'ShareThing', 'CLA-01')],
    bundledOperations: [{ path: '/api/thing', operationId: 'ShareThing', fourAId: 'CLA-01' }],
  }))
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /bijection passed \(1 fixed Product operations/)
})

test('the gate fails when a current operation is defined in a leaf file but never bundled', (t) => {
  // Exactly the shape CLA-07 had before openapi.yaml gained its $ref.
  const result = runGate(buildFixture(t, {
    rows: [censusRow('CLA-01', 'ShareThing'), censusRow('CLA-07', 'UnshareThing')],
    leafOperations: [
      leafOperation('/api/thing', 'ShareThing', 'CLA-01'),
      leafOperation('/api/thing/unshare', 'UnshareThing', 'CLA-07'),
    ],
    bundledOperations: [{ path: '/api/thing', operationId: 'ShareThing', fourAId: 'CLA-01' }],
  }))
  assert.equal(result.status, 1)
  assert.match(result.stderr, /CLA-07 POST \/api\/thing\/unshare \(model-connection-paths\.yaml\)/)
  assert.match(result.stderr, /add a \$ref in openapi\.yaml/)
})

test('a leaf path retained for a surface the census does not admit fails the gate', (t) => {
  // The bijection is unconditional: there is no longer a retained-for-later category that may
  // stay unbundled, so a leaf path outside the census must fail rather than pass silently.
  const result = runGate(buildFixture(t, {
    rows: [censusRow('CLA-01', 'ShareThing')],
    leafOperations: [
      leafOperation('/api/thing', 'ShareThing', 'CLA-01'),
      leafOperation('/api/control/workspaces/{workspaceId}/areas', 'ListAreas', 'IAM-09'),
    ],
    bundledOperations: [{ path: '/api/thing', operationId: 'ShareThing', fourAId: 'CLA-01' }],
  }))
  assert.equal(result.status, 1)
  assert.match(result.stderr, /IAM-09 POST \/api\/control\/workspaces\/\{workspaceId\}\/areas \(claude-account-paths\.yaml\)/)
  assert.match(result.stderr, /add a \$ref in openapi\.yaml/)
})

test('a new leaf path whose 4A id the census does not list cannot pass unbundled', (t) => {
  // The hole the previous gate had: matching by 4A id let a leaf path with an id absent from the
  // census skip the unbundled check entirely. Planting exactly that (a ZZZ-99 id, no census row)
  // must now fail because the bijection no longer looks at the id to decide whether to check.
  const result = runGate(buildFixture(t, {
    rows: [censusRow('CLA-01', 'ShareThing')],
    leafOperations: [
      leafOperation('/api/thing', 'ShareThing', 'CLA-01'),
      leafOperation('/api/control/projects/{projectId}/never-wired', 'NeverWired', 'ZZZ-99'),
    ],
    bundledOperations: [{ path: '/api/thing', operationId: 'ShareThing', fourAId: 'CLA-01' }],
  }))
  assert.equal(result.status, 1)
  assert.match(result.stderr, /ZZZ-99 POST \/api\/control\/projects\/\{projectId\}\/never-wired \(claude-account-paths\.yaml\)/)
})

test('a bundled operation with no leaf contract source fails the gate', (t) => {
  // The reverse direction of the same absolute bijection: openapi.yaml cannot $ref a path that no
  // leaf *-paths.yaml file defines.
  const result = runGate(buildFixture(t, {
    rows: [censusRow('CLA-01', 'ShareThing')],
    leafOperations: [leafOperation('/api/thing', 'ShareThing', 'CLA-01')],
    bundledOperations: [
      { path: '/api/thing', operationId: 'ShareThing', fourAId: 'CLA-01' },
      { path: '/api/ghost', operationId: 'GhostThing', fourAId: 'CLA-02' },
    ],
  }))
  assert.equal(result.status, 1)
  assert.match(result.stderr, /bundled Product OAS operations with no leaf contract source: POST \/api\/ghost/)
})

test('a census id with a letter suffix is counted, not silently skipped', (t) => {
  // The old row pattern required a purely numeric suffix, so this row vanished and the two sides
  // agreed one lower. Now it is counted, and the bundle missing it is a mismatch.
  const result = runGate(buildFixture(t, {
    rows: [censusRow('CLA-01', 'ShareThing'), censusRow('CLA-05B', 'UnshareThing')],
    leafOperations: [leafOperation('/api/thing', 'ShareThing', 'CLA-01')],
    bundledOperations: [{ path: '/api/thing', operationId: 'ShareThing', fourAId: 'CLA-01' }],
  }))
  assert.equal(result.status, 1)
  assert.match(result.stderr, /ledger has 2 fixed operations, wire has 1/)
})

test('a census row the gate cannot parse fails instead of being dropped', (t) => {
  const result = runGate(buildFixture(t, {
    rows: [censusRow('CLA-01', 'ShareThing'), '| `CLA-X` | `Malformed` | Model Connection | exact | command |'],
    leafOperations: [leafOperation('/api/thing', 'ShareThing', 'CLA-01')],
    bundledOperations: [{ path: '/api/thing', operationId: 'ShareThing', fourAId: 'CLA-01' }],
  }))
  assert.equal(result.status, 1)
  assert.match(result.stderr, /unparsable 4A census row in operation ledger: \| `CLA-X`/)
})

test('a leaf contract file the scanner cannot read fails instead of reporting nothing', (t) => {
  const fixture = buildFixture(t, {
    rows: [censusRow('CLA-01', 'ShareThing')],
    leafOperations: [leafOperation('/api/thing', 'ShareThing', 'CLA-01')],
    bundledOperations: [{ path: '/api/thing', operationId: 'ShareThing', fourAId: 'CLA-01' }],
  })
  writeFileSync(resolve(fixture.root, 'contracts/api/product/model-connection-paths.yaml'), 'components:\n  schemas: {}\n')
  const result = runGate(fixture)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /leaf contract file has no top-level paths block: model-connection-paths\.yaml/)
})
