import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(message)
}

function sliceBetween(text, startNeedle, endNeedle) {
  const start = text.indexOf(startNeedle)
  if (start < 0) return ''
  const end = text.indexOf(endNeedle, start)
  return text.slice(start, end < 0 ? undefined : end)
}

test('F10 preserves the operator-accepted Connection test applicability and diagnostics decision', () => {
  const findingPath = 'docs/evidence/4c/w02b-connection-test-diagnostics-finding.md'
  const gmPath = 'docs/evidence/4c/w02b-connection-test-diagnostics-global-maximum.md'
  const selectedPath = 'docs/evidence/4c/w02b-connection-test-diagnostics-selected-realization.md'
  for (const p of [findingPath, gmPath, selectedPath]) {
    if (!existsSync(path(p))) throw new Error(`F10 Evidence missing: ${p}`)
  }

  const finding = read(findingPath)
  const gm = read(gmPath)
  const selected = read(selectedPath)

  for (const law of [
    'F10 = OPEN / MATERIAL W-02B P8 FINDING',
    'configured != qualified != bound != healthy != caller-authorized',
    'logical credential generation',
    'human-readable diagnostic/remediation',
  ]) requireText(finding, law, `F10 finding missing law: ${law}`)

  for (const alternative of [
    'A — UI-only status from browser-local qualification history',
    'B — Treat credentialConfigured as connection health',
    'C — Create a new `TestConnection` Product operation',
    'D — Create generic Connection health/Active lifecycle',
    'E — Add qualification history/list APIs now',
    'F — Keep CON-08/09; enrich qualification basis/result and derive a small current Connection test projection',
  ]) requireText(gm, alternative, `F10 Global Maximum missing alternative: ${alternative}`)

  requireText(gm, 'GLOBAL MAXIMUM / OPERATOR ACCEPTED', 'F10 must preserve operator acceptance')
  requireText(selected, 'OPERATOR ACCEPTED / SELECTED REALIZATION / RED REQUIRED', 'F10 selected realization must preserve accepted RED state')
  requireText(selected, 'NOT_TESTED | NEEDS_RETEST | PASSED | FAILED | INDETERMINATE', 'F10 selected realization must preserve the five-state test projection')
})

test('selected F10 realization exposes current test applicability and exact human diagnostics without widening Connections topology', () => {
  const wire = read('contracts/api/product/connection-paths.yaml')
  const ledger = read('docs/product/operation-ledger.md')
  const checker = read('scripts/check-wire-connections.mjs')
  const preflight = read('docs/evidence/4c/w02-authority-feasibility-preflight.md')

  const connection = sliceBetween(wire, '    Connection:\n', '    ConnectionDetail:\n')
  requireText(connection, 'connectionTest:', 'F10 RED: lightweight Connection must expose current connectionTest projection')
  requireText(connection, 'connectionTest', 'F10 Connection must require connectionTest')

  const detail = sliceBetween(wire, '    ConnectionDetail:\n', '    ConnectionRevision:\n')
  requireText(detail, 'connectionTest:', 'F10 ConnectionDetail must expose current connectionTest projection')

  const testSummary = sliceBetween(wire, '    ConnectionTestSummary:\n', '    ConnectionRevision:\n')
  for (const state of ['NOT_TESTED', 'NEEDS_RETEST', 'PASSED', 'FAILED', 'INDETERMINATE']) {
    requireText(testSummary, state, `F10 connectionTest missing state ${state}`)
  }
  for (const field of ['qualificationId:', 'environment:', 'testedAt:']) {
    requireText(testSummary, field, `F10 connectionTest missing ${field}`)
  }

  const qualification = sliceBetween(wire, '    ConnectionQualification:\n', undefined)
  for (const field of ['credentialGeneration:', 'outcome:', 'testedAt:', 'diagnostic:', 'qualificationState:', 'evidenceRefs:']) {
    requireText(qualification, field, `F10 ConnectionQualification missing ${field}`)
  }
  for (const outcome of ['PASSED', 'FAILED', 'INDETERMINATE']) {
    requireText(qualification, outcome, `F10 qualification outcome missing ${outcome}`)
  }
  for (const field of ['title:', 'message:', 'remediation:']) {
    requireText(qualification, field, `F10 diagnostic missing ${field}`)
  }

  const con08 = sliceBetween(wire, 'summary: QualifyConnection', '\n  /api/control/connections/{connectionId}/qualifications/{qualificationId}:')
  if (con08.includes('credentialGeneration:')) throw new Error('F10 must keep credentialGeneration server-resolved; CON-08 caller must not supply it')

  if (/\blatestQualification\s*:/.test(wire)) throw new Error('F10 must not add a latestQualification Product field')
  if (/\b(active|inactive|connected|ready|healthy|authorized)\s*:/i.test(testSummary)) {
    throw new Error('F10 connectionTest must not collapse test applicability into generic lifecycle/health/authorization fields')
  }

  requireText(ledger, '4C-F10', 'F10 4A authority must record test applicability and human diagnostics')
  requireText(checker, 'connectionTest', 'Connections checker must protect F10 current test projection')
  requireText(checker, 'credentialGeneration', 'Connections checker must protect F10 exact qualification basis')
  requireText(preflight, 'F10 Connection test applicability + diagnostics = OPERATOR ACCEPTED / GREEN', 'W-02 preflight must recompile F10 GREEN')
  requireText(preflight, 'F10 Connection test applicability + diagnostics = OPERATOR ACCEPTED / GREEN', 'W-02 preflight must own F10 accepted GREEN state')

  const operationIds = [...wire.matchAll(/x-conexus-4a-id: (CON-\d+)/g)].map(match => match[1])
  if (operationIds.length !== 9 || new Set(operationIds).size !== 9) {
    throw new Error(`F10 must preserve the 9-operation Connections topology; got ${operationIds.length}`)
  }
})
