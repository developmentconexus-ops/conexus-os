import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')
const familyPattern = /(?:SCF|WIR|AUT|FE|DAT|DPL|INT|REL|RUN|DXE|MEM|LRN|CMP|IOP|EVA|TEL|VER|CON)/
const propertyPattern = /(?:SCF|WIR|AUT|FE|DAT|DPL|INT|REL|RUN|DXE|MEM|LRN|CMP|IOP|EVA|TEL|VER|CON)-\d{2}/g

function expandedPropertyIds(text) {
  const expanded = text.replace(
    new RegExp(`\\b(${familyPattern.source.slice(3, -1)})-(\\d{2})\\.\\.(?:\\1-)?(\\d{2})`, 'g'),
    (_, family, start, end) => Array.from(
      { length: Number(end) - Number(start) + 1 },
      (_value, index) => `${family}-${String(Number(start) + index).padStart(2, '0')}`,
    ).join(', '),
  )
  return [...new Set(expanded.match(propertyPattern) ?? [])].sort()
}

test('4D-04 classifies exhaustive runtime families without selecting technology', () => {
  const ledger = read('docs/evidence/4d/4d-01-protected-property-ledger.md')
  const applicability = read('docs/evidence/4d/4d-04-runtime-family-applicability.md')
  const phase = read('docs/phases/4d-project-paved-road-and-runtime-realization.md')
  const roadmap = read('docs/roadmap.md')
  const index = read('docs/index.md')

  const ledgerIds = expandedPropertyIds(ledger)
  const applicabilityIds = expandedPropertyIds(applicability)
  assert.equal(ledgerIds.length, 117)
  assert.deepEqual(applicabilityIds, ledgerIds)

  const runtimeFamilies = [...applicability.matchAll(/^### `RF-(\d{2})`/gm)].map(match => match[1])
  assert.deepEqual(runtimeFamilies, Array.from({ length: 24 }, (_value, index) => String(index + 1).padStart(2, '0')))

  for (const token of [
    'CLOSED / OPERATOR APPROVED / 4E-R1-F01 NON-RUNTIME CLASSIFICATION APPROVED / 2026-08-30',
    'Exact dependency/version/topology selection:** `0`',
    'CURRENT STRUCTURE CONFIRMED / 24 CONSUMER-GATED FAMILIES',
    'R1 Project cognition is an owner-local adapter, not a runtime family',
    '14 REALIZE families',
    '12 FIRST_MANAGED_BUDGET_ANALYZER',
    '2 CURRENT_PLATFORM_LATER',
    '7 PRESERVE_SEAM families',
    '3 DEFER families',
    '0 STOP families',
    'Agent    = open-ended decision/tool work',
    'Workflow = defined multi-step process',
    '93 + 3 REALIZE profile split preserved',
    '4D-C selection-opening questions',
  ]) assert.ok(applicability.includes(token), `4D-04 missing ${token}`)

  assert.match(applicability, /Builder coding is open-ended and admits an Agent-runtime family/)
  assert.match(applicability, /structured nature does not itself require a Workflow runtime/)
  assert.match(applicability, /No current Mastra API, package or version claim is made here/)
  assert.match(applicability, /Product\s+implementation, push, PR and merge remain unauthorized/)
  assert.match(applicability, /ParMastra is not instantiated in the first slice/)
  assert.match(applicability, /previously qualified queue candidate is incumbent Evidence only/)
  assert.match(applicability, /`PRESERVE_SEAM` and `DEFER` families do not admit dependency selection/)

  assert.match(phase, /Mutable status and exact next action.*owned only by/s)
  assert.match(index, /4D-04 approved runtime-family applicability/)
})
