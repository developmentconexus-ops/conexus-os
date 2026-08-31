import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')

test('R1 foundation review adjudicates findings and routes only material corrections', () => {
  const review = read('docs/evidence/4d/4d-r1-foundation-independent-review-adjudication.md')
  const candidate = read('docs/evidence/4d/4d-r1-foundation-selection-candidate.md')
  const batch = read('docs/evidence/4d/4d-r1-foundation-batch.md')
  const index = read('docs/index.md')

  for (const token of [
    'PASS 2 CONVERGED / OPERATOR APPROVED / 2026-08-30',
    'ACCEPT CONTRACT / DEFER EXECUTION',
    'REJECT / NEW REQUIREMENT',
    'REJECT BY REACHABILITY',
    'Hub and Project DB must share physical DB',
    'npm lacks per-package script allowlist',
    'Keycloak logout must immediately revoke Conexus session',
    'session/bootstrap/secrets are now exact',
    'terminal selection verdict = READY FOR OPERATOR ADJUDICATION',
    'PASS 2 MATERIAL FINDINGS = 0',
    'INDEPENDENT CONVERGENCE = CLEAR',
  ]) assert.ok(review.includes(token), `R1 review adjudication missing ${token}`)

  assert.match(candidate, /all future R1 gate tools are exact dev dependencies/)
  assert.match(candidate, /session truth is the existing PostgreSQL `iam\.session`/)
  assert.match(candidate, /TRUSTED_BOOTSTRAP_CONTEXT/)
  assert.match(candidate, /server-only secret-file provider/)
  assert.match(candidate, /CR-1 selected contract/)
  assert.match(candidate, /representative `PromoteRelease` first appears in R6/)
  assert.match(batch, /CR-1 concurrency remains selected.*first real\s+consumer is R6/s)
  assert.match(index, /R1 Foundation independent review/)
})
