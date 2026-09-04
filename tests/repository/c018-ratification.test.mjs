import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = path => readFileSync(resolve(root, path), 'utf8')

test('C-018 durable contract records the opening review state without Product authorization', () => {
  const contract = read('docs/phases/c-018-final-architecture-ratification.md')
  assert.match(contract, /C-018 roadmap gate = OPEN \/ RATIFICATION REVIEW/)
  assert.match(contract, /C-018 Decision Register = NOT RATIFIED/)
  assert.match(contract, /Product implementation = BLOCKED/)
})

test('C-018 durable contract carries R1 through R7 and deny-only execution law', () => {
  const contract = read('docs/phases/c-018-final-architecture-ratification.md')
  for (const id of ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7']) assert.match(contract, new RegExp(`\\b${id}\\b`))
  assert.match(contract, /C-018 = RATIFIED[\s\S]*!=[\s\S]*Product implementation authorized/)
  assert.match(contract, /FIRST_BUILD/)
  assert.match(contract, /FIRST_PRODUCTION/)
  assert.match(contract, /explicit operator ratification/)
})

test('documentation router reaches the C-018 durable contract', () => {
  assert.match(read('docs/index.md'), /phases\/c-018-final-architecture-ratification\.md/)
})

test('ratified C-018 preserves its deny-only law after later bounded Product authorization', () => {
  const roadmap = read('docs/roadmap.md')
  const decisions = read('docs/decisions/index.md')
  assert.match(roadmap, /\| C-018 \| RATIFIED \/ OPERATOR RATIFIED \|/)
  assert.match(roadmap, /\| Product implementation \|[^\n]*\bR1\b[^\n]*\b(?:R2|RB)[^\n]*BLOCKED/)
  assert.match(read('docs/phases/c-018-final-architecture-ratification.md'), /C-018 = RATIFIED[\s\S]*!=[\s\S]*Product implementation authorized/)
  assert.match(decisions, /\| C-018 \| Final Product architecture ratification\. \| CURRENT \/ OPERATOR RATIFIED \|/)
})
