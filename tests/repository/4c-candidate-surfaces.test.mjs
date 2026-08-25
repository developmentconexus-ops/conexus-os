import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = path => readFileSync(resolve(root, path), 'utf8')

const operationId = /`((?:IAM|WS|PRJ|BLD|BRN|CON|REL|PAR|GW|MAR|OBS|BUD)-\d+)`/g

function fixedOperationIds(ledger) {
  const start = ledger.indexOf('# 5. Fixed Conexus platform census')
  const end = ledger.indexOf('\n---\n\n## 6. Product-visible Published Application boundary', start)
  assert.ok(start >= 0 && end > start, 'fixed Product census must remain discoverable')
  return new Set([...ledger.slice(start, end).matchAll(/^\| `([A-Z]+-\d+)` \| `[^`]+` \|/gm)].map(match => match[1]))
}

test('4C-5 candidate surface inventory maps only valid browser-facing Product operations', () => {
  const inventoryPath = 'docs/evidence/4c/candidate-screen-surface-inventory.md'
  assert.equal(existsSync(resolve(root, inventoryPath)), true, '4C-5 candidate surface inventory must exist')

  const ledger = read('docs/product/operation-ledger.md')
  const inventory = read(inventoryPath)

  assert.match(inventory, /> \*\*Status:\*\* CANDIDATE \/ 4C-5/)
  assert.match(inventory, /4C-4 remains CANDIDATE and is not `LOCKED`/)
  assert.match(inventory, /screen-shaped Product operations\s*=\s*0/)
  assert.match(inventory, /4C-8 rendered structural wireframes\s*=\s*NOT STARTED/)
  assert.doesNotMatch(inventory, /universal Approval Center\s*=\s*CANDIDATE/)

  const valid = fixedOperationIds(ledger)
  assert.equal(valid.delete('PAR-05'), true, 'PAR-05 must remain the one no-direct-browser fixed operation')
  valid.add('BUD-01')
  valid.add('BUD-02')

  const coverageStart = inventory.indexOf('## 7. Concrete operation-to-surface coverage')
  const coverageEnd = inventory.indexOf('\n---\n\n## 8.', coverageStart)
  assert.ok(coverageStart >= 0 && coverageEnd > coverageStart, 'operation-to-surface coverage section must be bounded')

  const mapped = new Set([...inventory.slice(coverageStart, coverageEnd).matchAll(operationId)].map(match => match[1]))
  assert.equal(mapped.has('PAR-05'), false, 'PAR-05 must not gain a browser surface')
  assert.equal(mapped.has('BUD-01'), true, 'Budget Analyzer BUD-01 must remain mapped')
  assert.equal(mapped.has('BUD-02'), true, 'Budget Analyzer BUD-02 must remain mapped')

  const extra = [...mapped].filter(id => !valid.has(id))
  assert.deepEqual(extra, [], `surface inventory invented/non-browser operation mappings: ${extra.join(', ')}`)
})
