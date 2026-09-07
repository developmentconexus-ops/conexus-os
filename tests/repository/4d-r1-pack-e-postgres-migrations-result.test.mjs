import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')

test('Pack E proves PostgreSQL owner isolation and Atlas migration admission without early CR-1', () => {
  const result = read('docs/evidence/4d/4d-r1-pack-e-postgres-migrations-result.md')
  const roadmap = read('docs/roadmap.md')
  const results = JSON.parse(read('qualification/4d/r1-foundation/evidence/pack-e-results.json'))
  const negatives = JSON.parse(read('qualification/4d/r1-foundation/evidence/pack-e-negative-controls.json'))
  const cleanup = JSON.parse(read('qualification/4d/r1-foundation/evidence/pack-e-cleanup.json'))
  const admission = read('qualification/4d/r1-foundation/postgres-migrations/migration-admission.mjs')
  const migration = read('qualification/4d/r1-foundation/postgres-migrations/migrations/202608300001_init.sql')
  const atlasSum = read('qualification/4d/r1-foundation/postgres-migrations/migrations/atlas.sum')

  for (const token of [
    'CLOSED / PACK E PASS / `R1F-P09/P10` GREEN / `R1F-E01` CORRECTED',
    'PostgreSQL 42501', 'atlas.sum', 'temporal order',
    'does not create a second migration engine', 'does not implement production schemas',
  ]) assert.ok(result.includes(token), `Pack E result missing ${token}`)

  for (const id of ['R1F-P09', 'R1F-P10']) {
    assert.equal(results.results.find(row => row.id === id).verdict, 'PASS')
  }
  assert.equal(results.finding.id, 'R1F-E01')
  assert.equal(results.finding.verdict, 'CORRECTED_GREEN')
  assert.equal(negatives.controls.length, 13)
  assert.equal(negatives.controls.every(control => control.verdict === 'PASS'), true)
  assert.equal(cleanup.verdict, 'PASS')
  assert.equal(cleanup.container, 'ABSENT')

  assert.match(admission, /atlas_schema_revisions\.atlas_schema_revisions/)
  assert.match(admission, /OUT_OF_ORDER_MIGRATION/)
  assert.match(migration, /OWNER TO migration_owner/)
  assert.match(migration, /REVOKE ALL ON SCHEMA app FROM PUBLIC/)
  assert.match(atlasSum, /^h1:/)

  assert.match(roadmap, /R1F-A01\+R1F-E01 CORRECTED \/ P01\.\.P12 EVIDENCE OPERATOR APPROVED/)
  assert.match(result, /Product implementation, push, PR and merge\s+remain unauthorized\./)
  assert.match(roadmap, /Product implementation = R1 INTEGRATED \/ R2 INTEGRATED \/ RB NEXT PLANNED BUT NOT OPEN \/ R3\+ BLOCKED/)
})
