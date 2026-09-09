import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')

test('4D-02 preserves the operator-approved mechanism-neutral scaffold/profile ownership contract', () => {
  const contract = read('docs/evidence/4d/4d-02-project-scaffold-profile-and-ownership-contract.md')
  const phase = read('docs/phases/4d-project-paved-road-and-runtime-realization.md')

  for (const token of [
    'CLOSED / OPERATOR APPROVED / 2026-08-29',
    'Dependency selection:** `0`',
    'conexus.project-scaffold-profile/v1',
    'conexus.project-scaffold-input-set/v1',
    'conexus.project-ownership-manifest/v1',
    'conexus.project-generation-receipt/v1',
    'conexus.project-generation-attempt/v1',
    'profileId',
    'profileVersion',
    'profileDigest',
    'generatorProtocolVersion',
    'canonicalInputSetDigest',
    'GENERATED | PLATFORM-CONTRACT | APP-OWNED',
    'Same-profile reproduction',
    'Profile upgrade',
    'Extension, eject and rejoin',
    'Project duplication',
    'SCF-01..11',
    'Product implementation, push, PR and merge remain',
  ]) assert.ok(contract.includes(token), `4D-02 contract missing ${token}`)

  for (const id of Array.from({ length: 11 }, (_, index) => `SCF-${String(index + 1).padStart(2, '0')}`)) {
    assert.match(contract, new RegExp('\\| `' + id + '` \\|'), `4D-02 property map missing ${id}`)
  }

  assert.match(contract, /Every materialized path is normalized and classified/)
  assert.match(contract, /first Builder-produced Budget\s+Analyzer consumer/)
  assert.match(contract, /the compiler never deletes `APP-OWNED` content/)
  assert.match(contract, /A failed attempt emits `conexus\.project-generation-attempt\/v1` Evidence/)
  assert.match(contract, /The first admitted consumer uses\s+`MANAGED`; `DEDICATED` is represented as `PRESERVE_SEAM`/)
  assert.match(contract, /No eject is admitted for canonical wire meaning, Conexus authorization/)
  assert.match(contract, /destination receives a fresh receipt bound to\s+its own exact inputs/)
  assert.match(contract, /The existing 4B Baseline representation is not changed in 4D-A/)
  assert.match(contract, /operator approved it on 2026-08-29; 4D-A is\s+closed and only 4D-B property-contract planning may now open/)

  assert.match(phase, /Mutable status and exact next action.*owned only by/s)
})
