import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')

test('R1 foundation selection preserves exact pins and bounded Pack A admission', () => {
  const candidate = read('docs/evidence/4d/4d-r1-foundation-selection-candidate.md')
  const batch = read('docs/evidence/4d/4d-r1-foundation-batch.md')
  const roadmap = read('docs/roadmap.md')
  const index = read('docs/index.md')

  for (const token of [
    'CLOSED / OPERATOR APPROVED / R1F-A01+R1F-E01 CORRECTED / P01..P12 EVIDENCE OPERATOR APPROVED',
    'R1F-01..07 / ONE PACKAGE / SEVEN INDEPENDENT OUTCOMES',
    'Node `24.20.0`', 'npm `12.0.2`', '`Ajv 8.20.0`',
    '`canonicalize 4.0.0`', 'Fastify `5.12.1`',
    '`openid-client 6.8.7`', 'Keycloak `26.7.2`',
    'React `19.2.8`', 'Vite `8.2.2`',
    'PostgreSQL `17.10`', '`pg 8.23.0`',
    'Atlas Community `1.3.0`', 'TypeScript `6.0.2`',
    'Biome `2.5.11`', 'Playwright `1.62.1`',
    '`@fastify/cookie`', '`@fastify/helmet`', '`@fastify/static`',
    '`@tanstack/react-router`', '`@tanstack/react-query`',
    '`jsonc-parser`', '`@redocly/cli 2.47.0`',
    'coerceTypes = false', 'useDefaults = false', 'removeAdditional = false',
    'mutation retries remain `0`', 'no ORM', 'Vitest is `DEFER`',
    'fatal UTF-8 decode / BOM refusal', 'iam.session',
    'CR-1 PRESERVE_SEAM TO R6', 'machine-checkable pin manifest',
    'Only isolated qualification dependencies', 'bounded operator-approved grant',
  ]) assert.ok(candidate.includes(token), `R1 foundation candidate missing ${token}`)

  const proofIds = [...candidate.matchAll(/`R1F-P(\d{2})`/g)].map(match => match[1])
  assert.deepEqual(proofIds, Array.from({ length: 12 }, (_value, index) => String(index + 1).padStart(2, '0')))

  for (const row of Array.from({ length: 7 }, (_value, index) => `R1F-0${index + 1}`)) {
    assert.ok(candidate.includes(row), `candidate missing ${row}`)
  }

  assert.match(batch, /SELECTION CLOSED \/ INDEPENDENT REVIEW CONVERGED \/ OPERATOR APPROVED \/ 2026-08-30/)
  assert.match(roadmap, /R1 FOUNDATION SELECTION CLOSED \+ OPERATOR APPROVED \/ R1 PROBE GRANT OPERATOR APPROVED/)
  assert.match(index, /Approved R1 Foundation selection/)

  const pinManifest = JSON.parse(read('docs/evidence/4d/4d-r1-foundation-pin-manifest.json'))
  assert.equal(pinManifest.kind, 'conexus.r1-foundation-pin-manifest/v1')
  assert.equal(pinManifest.status, 'P01_P12_GREEN_OPERATOR_APPROVED')
  assert.equal(pinManifest.decidingPlatform.nodeVersion, '24.20.0')
  assert.equal(pinManifest.npmPackages.length, 25)
  assert.equal(new Set(pinManifest.npmPackages.map(entry => entry.name)).size, 25)
  assert.equal(pinManifest.npmPackages.some(entry => entry.name === 'ajv-cli'), false)
  assert.equal(pinManifest.packAAdmission.verdict, 'PASS')
  assert.equal(pinManifest.packBAdmission.verdict, 'PASS')
  assert.equal(pinManifest.packCAdmission.verdict, 'PASS')
  assert.equal(pinManifest.packDAdmission.verdict, 'PASS')
  assert.equal(pinManifest.packEAdmission.verdict, 'PASS')
  assert.equal(pinManifest.packFAdmission.verdict, 'PASS')
  assert.equal(pinManifest.foundationProbeBatch.verdict, 'ALL_GREEN_PENDING_OPERATOR_ADJUDICATION')
  assert.match(pinManifest.substratePins.keycloak.linuxAmd64ManifestDigest, /^sha256:[a-f0-9]{64}$/)
  assert.match(pinManifest.substratePins.atlasCommunity.sha256, /^[a-f0-9]{64}$/)
  assert.equal(pinManifest.substratePins.playwright.archives.length, 5)
  for (const archive of pinManifest.substratePins.playwright.archives) {
    assert.match(archive.sha256, /^[a-f0-9]{64}$/)
  }
  for (const entry of pinManifest.npmPackages) {
    assert.match(entry.version, /^\d+\.\d+\.\d+$/)
    assert.match(entry.integrity, /^sha512-/)
  }
})
