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

test('F09 preserves the Connection current-configuration finding and Global-Maximum decision history', () => {
  const findingPath = 'docs/evidence/4c/w02b-connection-current-configuration-finding.md'
  const gmPath = 'docs/evidence/4c/w02b-connection-current-configuration-global-maximum.md'
  const selectedPath = 'docs/evidence/4c/w02b-connection-current-configuration-selected-realization.md'
  for (const p of [findingPath, gmPath, selectedPath]) {
    if (!existsSync(path(p))) throw new Error(`F09 evidence missing: ${p}`)
  }

  const finding = read(findingPath)
  const gm = read(gmPath)
  const selected = read(selectedPath)

  for (const law of [
    'F09 = OPEN / MATERIAL W-02B P7 FINDING',
    'currentRevisionId',
    'current non-secret configuration',
    'Credential material is never part of this read',
    'configured != qualified != bound != healthy != caller-authorized',
  ]) requireText(finding, law, `F09 finding missing law: ${law}`)

  for (const alternative of [
    'A — reopen revise form blank',
    'B — retain current configuration in browser state after create/revise',
    'C — return configuration only from CON-05/CON-06 success',
    'D — add GetConnectionRevision + revision history now',
    'E — add GetConnectionConfiguration operation',
    'F — enrich CON-04 GetConnection with current non-secret configuration',
  ]) requireText(gm, alternative, `F09 assessment missing alternative: ${alternative}`)

  requireText(gm, 'LEADING GLOBAL-MAXIMUM CANDIDATE / OPERATOR ACCEPTED', 'F09 must preserve operator acceptance of candidate F')
  requireText(selected, 'OPERATOR ACCEPTED / SELECTED REALIZATION / RED REQUIRED', 'F09 selected realization must preserve accepted RED state')
  requireText(selected, '`CON-04` alone returns `ConnectionDetail`', 'F09 selected realization must keep detail enrichment bounded to CON-04')
})

test('selected F09 realization exposes current non-secret configuration only on exact Connection detail', () => {
  const wire = read('contracts/api/product/connection-paths.yaml')
  const ledger = read('docs/product/operation-ledger.md')
  const checker = read('scripts/check-wire-connections.mjs')
  const preflight = read('docs/evidence/4c/w02-authority-feasibility-preflight.md')

  const con04 = sliceBetween(wire, 'summary: GetConnection', '\n  /api/control/connections/{connectionId}/revisions:')
  requireText(con04, "$ref: '#/components/schemas/ConnectionDetail'", 'F09 RED: CON-04 must return ConnectionDetail')

  const detail = sliceBetween(wire, '    ConnectionDetail:\n', '    ConnectionRevision:\n')
  for (const field of [
    'connectionId:',
    'name:',
    'ownerScopeKind:',
    'ownerId:',
    'connectorDefinitionId:',
    'connectorVersion:',
    'currentRevisionId:',
    'credentialConfigured:',
    'configuration:',
  ]) requireText(detail, field, `F09 ConnectionDetail missing ${field}`)
  requireText(detail, 'x-conexus-schema-source: CONNECTOR_DEFINITION_CONFIGURATION_SCHEMA', 'F09 detail configuration must stay exact ConnectorDefinition-schema-bound')
  requireText(detail, 'non-secret', 'F09 detail configuration must be explicitly non-secret')
  requireText(detail, 'currentRevisionId', 'F09 detail configuration must remain current-revision-bound')

  const connection = sliceBetween(wire, '    Connection:\n', '    ConnectionDetail:\n')
  if (connection.includes('configuration:')) throw new Error('F09 must not inflate lightweight Connection list/create projection with configuration')

  for (const forbidden of ['credential:', 'secret:', 'password:', 'accessToken:', 'refreshToken:']) {
    if (detail.includes(forbidden)) throw new Error(`F09 ConnectionDetail must not expose secret field ${forbidden}`)
  }

  requireText(ledger, '4C-F09', 'F09 4A authority must record current non-secret configuration inspectability')
  requireText(ledger, 'CON-04 GetConnection', 'F09 4A authority must keep CON-04 as detail read owner')
  requireText(checker, 'ConnectionDetail', 'Connections checker must protect F09 detail shape')
  requireText(checker, 'configuration', 'Connections checker must protect F09 configuration projection')
  requireText(preflight, 'F09 Connection current non-secret configuration = OPERATOR ACCEPTED / GREEN', 'W-02 P7 preflight must recompile F09 as GREEN')
  requireText(preflight, 'F09 Connection current non-secret configuration = OPERATOR ACCEPTED / GREEN', 'W-02 preflight must own F09 accepted GREEN state')

  const operationIds = [...wire.matchAll(/x-conexus-4a-id: (CON-\d+)/g)].map(match => match[1])
  if (operationIds.length !== 9 || new Set(operationIds).size !== 9) {
    throw new Error(`F09 must preserve the 9-operation Connections topology; got ${operationIds.length}`)
  }
})
