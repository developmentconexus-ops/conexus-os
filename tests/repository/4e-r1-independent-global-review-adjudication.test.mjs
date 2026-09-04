import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')

test('independent 4E review converges after correcting GitInfra and first-authority gaps', () => {
  const review = read('docs/evidence/4e/4e-r1-independent-global-review-adjudication.md')
  const correction = read('docs/evidence/4e/4e-r1-gitinfra-and-bootstrap-correction.md')
  const permissions = read('docs/product/permission-contract.md')
  const ledger = read('docs/product/operation-ledger.md')
  const security = read('docs/reference/security-and-authority.md')
  const applicability = read('docs/evidence/4d/4d-04-runtime-family-applicability.md')
  const roadmap = read('docs/roadmap.md')
  const index = read('docs/index.md')

  for (const token of [
    'CONVERGED CLEAR / 4E(R1) OPERATOR APPROVED / 4F NEXT',
    'Claude Code Opus',
    'Claude Code Fable',
    'AGY Gemini Pro',
    'CONVERGENCE=ACCEPT / 4E=APPROVE / NEXT=4F',
    'MATERIAL_UNCORRECTED_FINDINGS = 0',
    'PRODUCT_IMPLEMENTATION_AUTHORITY = 0',
  ]) assert.ok(review.includes(token), `review adjudication missing ${token}`)

  for (const token of [
    'Hub-controlled owner-isolated bare repository per Project',
    'atomic expected-old ref update',
    'R1C-13 PROJECT_COGNITION',
    'R1C-14 GIT_SOURCE_CUSTODY',
    'Git `2.55.0` is the current reference candidate',
    'Implementation/probe authority:** `0`',
  ]) assert.ok(correction.includes(token), `bounded correction missing ${token}`)

  assert.match(permissions, /exact server-preconfigured bootstrap.*derives the trusted `platform_operator` condition/s)
  assert.match(permissions, /WS-01 success[\s\S]*project\.create[\s\S]*PRJ-03 success[\s\S]*project\.read[\s\S]*project\.manage/)
  assert.match(ledger, /WS-01 establishes current creator Workspace membership\/access \+ project\.create/)
  assert.match(ledger, /PRJ-03 establishes exact creator account_project_grant \+ project\.read \+ project\.manage/)
  assert.match(security, /sole F1 `platform_operator` source/)
  assert.match(applicability, /R1 GitInfra is an owner-local foundation mechanism/)
  assert.match(applicability, /keeps the `24`-family census unchanged/)
  assert.match(index, /4E\(R1\) independent whole\/global review/)
  assert.match(index, /4E-R1 GitInfra \+ first-authority correction/)
  assert.match(roadmap, /4E — Whole-System Coherence & Golden Flows \| CLOSED\(R1\) \/ OPERATOR APPROVED/)
})
