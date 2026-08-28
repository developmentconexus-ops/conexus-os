import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')

const gateway = read('contracts/api/product/gateway-paths.yaml')
const checker = read('scripts/check-wire-gateway.mjs')
const ledger = read('docs/product/operation-ledger.md')
const permission = read('docs/product/permission-contract.md')
const p03 = read('docs/evidence/4c/p03-product-agent-screen-contract.md')
const p04 = read('docs/evidence/4c/p04-release-operations-screen-contract.md')

test('GW-01 admits only one exact originatingRun filter beside opaque pagination', () => {
  for (const token of [
    'name: originatingRun',
    'style: deepObject',
    'explode: true',
    "$ref: '#/components/schemas/OriginatingRunRef'",
    "'422':",
    'filter is applied server-side before pagination',
    'attemptedAt DESC',
    'effectAttemptId DESC',
  ]) assert.ok(gateway.includes(token), `Gateway wire missing ${token}`)

  assert.doesNotMatch(gateway, /name: originatingRunKind|name: originatingRunRef/)
})
test('Gateway closure proves filter shape without widening effect authority', () => {
  for (const token of [
    "new Set(['pageToken', 'originatingRun'])",
    "parameter('GW-01', 'query', 'originatingRun')",
    "originatingRun.style !== 'deepObject'",
    'originatingRun.explode !== true',
    "op('GW-01').responses?.['422']",
    'status',
    'provider',
    'originatingOperationId',
  ]) assert.ok(checker.includes(token), `Gateway checker missing ${token}`)
})

test('Product, Permission and Screen Contracts preserve the exact owner boundary', () => {
  for (const token of [
    '4C-PRE11-F04',
    'originatingRun',
    'server-side before pagination',
    'GW-01',
    'no new Product operation',
  ]) assert.ok((ledger + permission).includes(token), `Product authority missing ${token}`)

  for (const token of [
    'originatingRun.kind',
    'originatingRun.ref',
    'Activity → Effects',
    'loaded browser page',
  ]) assert.ok((p03 + p04).includes(token), `P-03/P-04 trace missing ${token}`)
})
