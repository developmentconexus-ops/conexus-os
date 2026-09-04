import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')

test('operator-approved Project cognition reuses Mastra without provider lock or new runtime family', () => {
  const decision = read('docs/evidence/4e/4e-r1-f01-project-cognition-global-maximum.md')
  const roadmap = read('docs/roadmap.md')
  const index = read('docs/index.md')
  const ledger = read('docs/evidence/4d/4d-01-protected-property-ledger.md')
  const pavedRoad = read('docs/evidence/4d/4d-03-paved-road-property-contract.md')
  const applicability = read('docs/evidence/4d/4d-04-runtime-family-applicability.md')

  for (const token of [
    'MASTRA PROJECT-LOCAL STRUCTURE OPERATOR APPROVED',
    'ProjectMastra',
    'ProjectInceptionAgent',
    'BaselineExplanationAgent',
    'ProjectModelPolicy',
    'dynamic provider/model',
    'RequestContext',
    'no automatic',
    'APPROVE 4E-R1-F01 MASTRA PROJECT-LOCAL STRUCTURE',
    'Implementation/install/probe/provider-call authority:** `0`',
  ]) assert.ok(decision.includes(token), `revised Global Maximum missing ${token}`)

  assert.match(decision, /direct OpenAI SDK \| `REJECTED`/)
  assert.match(decision, /direct AI SDK Core \| `REJECTED`/)
  assert.match(decision, /one Project-local Mastra with two internal stateless Agents \| `SELECTED \/ OPERATOR APPROVED`/)
  assert.match(decision, /PRJ-24 refuses tools, second steps and memory\/continuation/)
  assert.match(decision, /does not automatically admit the registry-observed `1\.63\.2`/)
  assert.doesNotMatch(decision, /RF-25|R1C-13/)

  assert.match(ledger, /`FE-08`.*R1 Project Baseline cognition through `PRJ-24`.*Project for `PRJ-24`, Builder for `BLD-16`/)
  assert.match(pavedRoad, /R1 `PRJ-24` Project cognition and later `BLD-16` Builder cognition/)
  assert.match(applicability, /R1 Project cognition is an owner-local adapter, not a runtime family/)
  assert.match(applicability, /CURRENT STRUCTURE CONFIRMED \/ 24 CONSUMER-GATED FAMILIES/)
  assert.match(index, /Operator-approved 4E-R1-F01 Mastra Project cognition Global Maximum/)
})
