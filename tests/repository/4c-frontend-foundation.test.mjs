import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = path => readFileSync(resolve(root, path), 'utf8')

test('4C foundation preserves its bounded F02-F12 human-flow and coverage evidence', () => {
  const evidencePath = 'docs/evidence/4c/foundation-and-coverage.md'
  assert.equal(existsSync(resolve(root, evidencePath)), true, '4C foundation evidence must exist before 4C-3 can close')

  const product = read('docs/product/contract.md')
  const evidence = read(evidencePath)

  const actorStart = product.indexOf('# 4. Primary users and actors')
  const actorEnd = product.indexOf('\n# 5. Core Product concepts', actorStart)
  assert.ok(actorStart >= 0 && actorEnd > actorStart, 'unable to locate accepted human actor section')
  const actorCount = [...product.slice(actorStart, actorEnd).matchAll(/^## 4\.\d+ /gm)].length
  assert.equal(actorCount, 7, '4C-1 must recover the seven accepted human actor contexts without inventing personas')

  const journeyMatches = [...product.matchAll(/^# \d+\. Journey ([A-O]) — /gm)]
  assert.equal(journeyMatches.length, 15, '4C-2 must recover all accepted Journey A-O human/product flows')
  assert.deepEqual(journeyMatches.map(match => match[1]), 'ABCDEFGHIJKLMNO'.split(''), 'accepted Journey A-O sequence must remain complete and ordered')

  for (const required of [
    '4C-F11 113 → 116 by adding IAM-18 / IAM-19 / IAM-20',
    '4C-F12 = bounded OBS-04/05 read-shape correction; count remains 116',
    'fixed_not_human_facing = 1 (PAR-05 RunProductAgentHeadless)',
    'budget_frontend_reachable = 2',
    'invented_frontend_product_operations = 0'
  ]) {
    assert.match(evidence, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `4C foundation evidence missing bounded closure assertion: ${required}`)
  }
})
