import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')

test('operator-approved R1 probe grant remains isolated and cannot authorize Product implementation', () => {
  const request = read('docs/evidence/4d/4d-r1-foundation-probe-grant-request.md')
  const roadmap = read('docs/roadmap.md')
  const index = read('docs/index.md')
  const phase = read('docs/phases/4d-project-paved-road-and-runtime-realization.md')

  for (const token of [
    'APPROVED / OPERATOR APPROVED / 2026-08-30 / PROBE EXECUTION AUTHORIZED / PRODUCT IMPLEMENTATION BLOCKED',
    'APPROVE R1 FOUNDATION PROBE GRANT / 2026-08-30',
    'qualification/4d/r1-foundation/',
    'zero root/Product runtime dependency',
    'never a retained workspace `node_modules`',
    'exact Keycloak runtime image',
    'Playwright Chromium/Firefox/WebKit builds',
    'real Keycloak',
    'real PostgreSQL',
    'No model, Mastra, E2B, Sankhya',
    'PASS | FAIL | INCONCLUSIVE | NOT_PROVEN',
    'R1 creates no CR-1 function',
    'at most `10 GiB` additional',
    'no monetary spend',
    'evidence/cleanup.json',
    'Product implementation = 0',
    'push / PR / merge = 0',
  ]) assert.ok(request.includes(token), `probe grant request missing ${token}`)

  const proofIds = [...request.matchAll(/`R1F-P(\d{2})`/g)].map(match => match[1])
  assert.deepEqual(
    [...new Set(proofIds)],
    Array.from({ length: 12 }, (_value, index) => String(index + 1).padStart(2, '0')),
  )

  assert.match(roadmap, /R1 PROBE GRANT OPERATOR APPROVED \/ R1F-A01\+R1F-E01 CORRECTED \/ P01\.\.P12 EVIDENCE OPERATOR APPROVED/)
  assert.match(index, /Operator-approved R1 Foundation Probe Grant/)
  assert.match(phase, /`4E-R1-F01`/)
})
