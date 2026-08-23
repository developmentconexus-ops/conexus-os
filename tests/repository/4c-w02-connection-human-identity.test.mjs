import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(message)
}

test('W-02B human-identity finding proves the current Connection representation cannot safely identify repeated same-provider instances', () => {
  const wire = read('contracts/api/product/connection-paths.yaml')
  const finding = read('docs/evidence/4c/w02-connection-human-identity-finding.md')

  for (const invariant of [
    'stable human recognition',
    'server-owned presentation identity',
    'must not be derived from provider-specific configuration',
    'must not become routing, containment or authorization authority',
  ]) requireText(finding, invariant, `F04 finding missing target invariant: ${invariant}`)

  const connectionStart = wire.indexOf('    Connection:\n')
  const revisionStart = wire.indexOf('    ConnectionRevision:\n', connectionStart)
  const connectionSchema = wire.slice(connectionStart, revisionStart)

  for (const existing of [
    'connectionId',
    'ownerScopeKind',
    'ownerId',
    'connectorDefinitionId',
    'connectorVersion',
    'currentRevisionId',
    'credentialConfigured',
  ]) requireText(connectionSchema, existing, `F04 falsifier precondition lost Connection field: ${existing}`)

  if (/\n\s+(name|displayName|label):/.test(connectionSchema)) {
    throw new Error('F04 current-state falsifier must be recompiled after a human-identity realization is operator-admitted')
  }
})

test('4C-F04 remains a Global-Maximum decision rather than a preselected schema patch', () => {
  const finding = read('docs/evidence/4c/w02-connection-human-identity-finding.md')
  const assessment = read('docs/evidence/4c/w02-connection-human-identity-global-maximum.md')
  const roadmap = read('docs/roadmap.md')

  for (const decisionCore of [
    'Root Cause',
    'Target Invariant',
    'Credible Alternatives',
    'Global Maximum',
    'Essential vs Accidental Complexity',
    'YAGNI / Future Cost',
    'Reopen Triggers',
  ]) requireText(assessment, decisionCore, `F04 Global-Maximum assessment missing ${decisionCore}`)

  for (const alternative of [
    'A — opaque ID / provider as human identity',
    'B — derive identity from provider configuration or external account data',
    'C — ConnectorDefinition-owned label derivation rule',
    'D — logical Connection owns explicit human presentation identity',
    'E — mutable Connection name + rename authority now',
    'F — new ConnectionProfile / presentation-owner domain',
  ]) requireText(assessment, alternative, `F04 assessment missing alternative: ${alternative}`)

  requireText(finding, 'solution is not admitted by finding existence', 'F04 finding must not convert Evidence into Product authority')
  requireText(roadmap, '4C-F04 GLOBAL-MAXIMUM OPERATOR GATE', 'roadmap must expose the current F04 decision gate')
})
