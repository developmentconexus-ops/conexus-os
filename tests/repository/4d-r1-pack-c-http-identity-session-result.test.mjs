import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')

test('Pack C proves HTTP, real Keycloak OIDC and PostgreSQL session boundaries without Product authority', () => {
  const result = read('docs/evidence/4d/4d-r1-pack-c-http-identity-session-result.md')
  const roadmap = read('docs/roadmap.md')
  const results = JSON.parse(read('qualification/4d/r1-foundation/evidence/pack-c-results.json'))
  const negatives = JSON.parse(read('qualification/4d/r1-foundation/evidence/pack-c-negative-controls.json'))
  const substrates = JSON.parse(read('qualification/4d/r1-foundation/evidence/pack-c-substrates.json'))
  const cleanup = JSON.parse(read('qualification/4d/r1-foundation/evidence/pack-c-cleanup.json'))
  const oidc = read('qualification/4d/r1-foundation/http-identity-session/oidc-probe.test.mjs')
  const session = read('qualification/4d/r1-foundation/http-identity-session/session-store.mjs')
  const http = read('qualification/4d/r1-foundation/http-identity-session/http-harness.mjs')

  for (const token of [
    'CLOSED / PACK C PASS / `R1F-P05/P06/P07` GREEN',
    'enableNonRepudiationChecks', 'real realm JWKS',
    'Keycloak role = admin', 'SHA-256 digest only',
    'does not implement the Product Hub',
  ]) assert.ok(result.includes(token), `Pack C result missing ${token}`)

  for (const id of ['R1F-P05', 'R1F-P06', 'R1F-P07']) {
    assert.equal(results.results.find(row => row.id === id).verdict, 'PASS')
  }
  assert.equal(results.packVerdict, 'PASS')
  assert.equal(negatives.controls.length, 26)
  assert.equal(negatives.controls.every(control => control.verdict === 'PASS'), true)
  assert.equal(substrates.verdict, 'PASS')
  assert.match(substrates.keycloak.parentReference, /@sha256:[a-f0-9]{64}$/)
  assert.match(substrates.postgresql.reference, /@sha256:[a-f0-9]{64}$/)
  assert.equal(cleanup.verdict, 'PASS')
  assert.equal(cleanup.containers, 'ABSENT')
  assert.equal(cleanup.temporarySecretFiles, 'ABSENT')

  for (const token of ['enableNonRepudiationChecks', 'randomPKCECodeVerifier', 'expectedNonce', 'mutateSignature']) {
    assert.ok(oidc.includes(token), `OIDC harness missing ${token}`)
  }
  for (const token of ['token_digest bytea PRIMARY KEY', 'IDLE_EXPIRED', 'ABSOLUTE_EXPIRED', 'BOOTSTRAP_SUBJECT_MISMATCH']) {
    assert.ok(session.includes(token), `session harness missing ${token}`)
  }
  for (const token of ['coerceTypes: false', 'useDefaults: false', 'removeAdditional: false', 'UNGENERATED_ROUTE']) {
    assert.ok(http.includes(token), `HTTP harness missing ${token}`)
  }

  assert.match(roadmap, /R1F-A01\+R1F-E01 CORRECTED \/ P01\.\.P12 EVIDENCE OPERATOR APPROVED \/ 4D-D\(R1\) FOUNDATION CLAIMS PRESERVED/)
  assert.match(result, /Product implementation, push, PR and merge\s+remain unauthorized\./)
  assert.match(roadmap, /Product implementation = R1 INTEGRATED \/ R2 INTEGRATED \/ RB NEXT PLANNED BUT NOT OPEN \/ R3\+ BLOCKED/)
})
