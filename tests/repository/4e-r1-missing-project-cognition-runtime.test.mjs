import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')

test('4E-R1-F01 closes for planning while production repin remains a later firing gate', () => {
  const finding = read('docs/evidence/4e/4e-r1-f01-missing-project-cognition-runtime.md')
  const applicability = read('docs/evidence/4d/4d-04-runtime-family-applicability.md')

  for (const token of [
    'CLOSED FOR PLANNING / MASTRA STRUCTURE + MECHANICS ACCEPTED / PRODUCTION REPIN GATE DEFERRED',
    'PRJ-07 RunInceptionInvestigation',
    'PRJ-24 AskConexusAboutBaselineCandidate',
    'ACCEPT 4E-R1-F01 / REOPEN AFFECTED 4D-04 + 4D-C + 4D-D(R1)',
    'Product/operation change:** `0`',
  ]) assert.ok(finding.includes(token), `4E-R1-F01 missing ${token}`)

  assert.match(applicability, /`RF-09` — Builder open-ended Agent runtime/)
})
