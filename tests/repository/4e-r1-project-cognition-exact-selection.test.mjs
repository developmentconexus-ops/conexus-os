import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')

test('OpenAI-only Project cognition selection is retained only as rejected Evidence', () => {
  const rejected = read('docs/evidence/4e/4e-r1-f01-project-cognition-exact-selection-candidate.md')
  const decision = read('docs/evidence/4e/4e-r1-f01-project-cognition-global-maximum.md')
  const roadmap = read('docs/roadmap.md')
  const index = read('docs/index.md')

  assert.match(rejected, /REJECTED \/ OPERATOR REVISE \/ NEGATIVE DECISION EVIDENCE/)
  assert.match(rejected, /operator rejected this OpenAI-only\s+> candidate/)
  assert.match(rejected, /ProjectModelPolicy/)
  assert.match(rejected, /Rejected historical outcome candidate/)
  assert.match(decision, /There is no\s+OpenAI hardcoding/)
  assert.match(index, /Rejected R1 OpenAI-only Project cognition candidate/)
  assert.doesNotMatch(roadmap, /candidate selects `openai@7\.8\.0`/)
})
