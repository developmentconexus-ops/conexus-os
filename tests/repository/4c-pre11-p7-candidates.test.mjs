import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')
const t01 = read('docs/evidence/4c/t01-trusted-setup-structural-hypotheses.md')
const gf = read('docs/evidence/4c/gf01-account-session-delta-structural-hypothesis.md')
const agent = read('docs/evidence/4c/p01-p03-reference-delta-structural-hypothesis.md')
const roadmap = read('docs/roadmap.md')

test('T-01 P7 keeps bootstrap and normal authority transitions explicit', () => {
  for (const token of ['Account-first explicit re-entry', 'TRUSTED_BOOTSTRAP_CONTEXT', 'IAM-03', 'WS-01', 'initialAccessEstablished=true', 'later trusted Account provisioning', 'P8 = LOCKED / OPERATOR APPROVED']) {
    assert.ok(t01.includes(token), `T-01 missing ${token}`)
  }
  assert.match(t01, /REJECTED[\s\S]*no default\/shared password/)
  assert.match(t01, /never[\s\S]*becomes public signup/)
})

test('GF-01 delta is Account/session-only', () => {
  for (const token of ['IAM-01 AccountSummary', 'Sign out of Conexus', 'IAM-02 DELETE /api/session', 'Escape', 'P8 delta = LOCKED / OPERATOR APPROVED']) assert.ok(gf.includes(token), `GF delta missing ${token}`)
  assert.doesNotMatch(gf, /Account profile editor|global Keycloak logout/i)
})

test('P-01/P-03 delta uses owner reads and protects optional refs', () => {
  for (const token of ['PRJ-29', 'PRJ-16/17', 'BRN-14', 'authoringRef', 'detailDisclosed=false', 'NEW', 'EXISTING', 'P8 deltas = LOCKED / OPERATOR APPROVED']) assert.ok(agent.includes(token), `Agent delta missing ${token}`)
  for (const token of ['universal catalog', 'frontend registry', 'free-form governed ref input']) assert.ok(agent.includes(token), `Agent delta must reject ${token}`)
})

test('roadmap locks P11 only after the mounted W-03 block is re-locked and walkthrough completes', () => {
  assert.match(roadmap, /P11 = LOCKED \/ OPERATOR APPROVED \/ blob 536052096dd10dec2f604ccef49aa64ba52e4dac/)
})
