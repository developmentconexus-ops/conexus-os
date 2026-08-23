import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = path => readFileSync(resolve(root, path), 'utf8')

function expandOperationCell(cell) {
  const ids = new Set()
  let remaining = cell

  for (const match of cell.matchAll(/([A-Z]+)-(\d+)\.\.(\d+)/g)) {
    const [, prefix, startText, endText] = match
    const start = Number(startText)
    const end = Number(endText)
    for (let value = start; value <= end; value += 1) {
      ids.add(`${prefix}-${String(value).padStart(startText.length, '0')}`)
    }
    remaining = remaining.replace(match[0], '')
  }

  for (const match of remaining.matchAll(/([A-Z]+-\d+)/g)) ids.add(match[1])
  return ids
}

test('4C foundation closes human flows and frontend reachability from current Product authority', () => {
  const evidencePath = 'docs/evidence/4c/foundation-and-coverage.md'
  assert.equal(existsSync(resolve(root, evidencePath)), true, '4C foundation evidence must exist before 4C-3 can close')

  const ledger = read('docs/product/operation-ledger.md')
  const product = read('docs/product/contract.md')
  const evidence = read(evidencePath)

  const fixedStart = ledger.indexOf('# 5. Fixed Conexus platform census')
  const fixedEnd = ledger.indexOf('\n---\n\n## 6. Product-visible Published Application boundary', fixedStart)
  assert.ok(fixedStart >= 0 && fixedEnd > fixedStart, 'unable to locate fixed-platform census')
  const fixedSection = ledger.slice(fixedStart, fixedEnd)
  const fixedIds = new Set([...fixedSection.matchAll(/^\| `([A-Z]+-\d+)` \|/gm)].map(match => match[1]))
  assert.equal(fixedIds.size, 113, '4C must derive from the exact 113-operation current fixed census after 4C-F03')

  const matrixStart = ledger.indexOf('### 8.3 Complete fixed-platform authority matrix')
  const matrixEnd = ledger.indexOf('\n### 8.4 Budget Analyzer authority matrix', matrixStart)
  assert.ok(matrixStart >= 0 && matrixEnd > matrixStart, 'unable to locate fixed-platform authority matrix')
  const matrix = ledger.slice(matrixStart, matrixEnd)

  const matrixIds = new Set()
  const browserReachable = new Set()
  for (const match of matrix.matchAll(/^\| (.+?) \| (.+?) \|/gm)) {
    const [, operationCell, principalCell] = match
    for (const id of expandOperationCell(operationCell)) {
      matrixIds.add(id)
      if (principalCell.includes('/ CP') || principalCell.includes('/ PA')) browserReachable.add(id)
    }
  }

  assert.deepEqual([...matrixIds].sort(), [...fixedIds].sort(), '4C reachability must classify every fixed Product operation exactly once or by an explicit multi-route union')
  assert.equal(browserReachable.size, 112, 'exactly 112 fixed Product operations currently have a browser-human CP or PA route after PRJ-24')
  const notBrowserReachable = [...fixedIds].filter(id => !browserReachable.has(id)).sort()
  assert.deepEqual(notBrowserReachable, ['PAR-05'], 'PAR-05 RunProductAgentHeadless must remain the sole fixed headless-only Product operation')

  const budgetStart = ledger.indexOf('### 8.4 Budget Analyzer authority matrix')
  const budgetEnd = ledger.indexOf('\n---\n\n# 9. Subtractive decisions', budgetStart)
  assert.ok(budgetStart >= 0 && budgetEnd > budgetStart, 'unable to locate Budget Analyzer authority matrix')
  const budget = ledger.slice(budgetStart, budgetEnd)
  const budgetRows = [...budget.matchAll(/^\| `BUD-(0[12])[^`]*` \| `PUBLISHED_APP_HUMAN \/ PA` \|/gm)]
  assert.equal(budgetRows.length, 2, 'both Budget Analyzer operations must remain Published-App human frontend consumers')

  const actorStart = product.indexOf('# 4. Primary users and actors')
  const actorEnd = product.indexOf('\n# 5. Core Product concepts', actorStart)
  assert.ok(actorStart >= 0 && actorEnd > actorStart, 'unable to locate accepted human actor section')
  const actorCount = [...product.slice(actorStart, actorEnd).matchAll(/^## 4\.\d+ /gm)].length
  assert.equal(actorCount, 7, '4C-1 must recover the seven accepted human actor contexts without inventing personas')

  const journeyMatches = [...product.matchAll(/^# \d+\. Journey ([A-O]) — /gm)]
  assert.equal(journeyMatches.length, 15, '4C-2 must recover all accepted Journey A-O human/product flows')
  assert.deepEqual(journeyMatches.map(match => match[1]), 'ABCDEFGHIJKLMNO'.split(''), 'accepted Journey A-O sequence must remain complete and ordered')

  for (const required of [
    'human_actor_contexts = 7',
    'accepted_human_product_flows = 15',
    'fixed_platform_operations = 113',
    'fixed_frontend_reachable = 112',
    'fixed_not_human_facing = 1 (PAR-05 RunProductAgentHeadless)',
    'budget_frontend_reachable = 2',
    'total_frontend_reachable_concrete_operations = 114',
    'invented_frontend_product_operations = 0'
  ]) {
    assert.match(evidence, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `4C foundation evidence missing closure assertion: ${required}`)
  }
})
