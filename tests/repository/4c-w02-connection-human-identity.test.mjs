import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(message)
}

test('operator-accepted F04 makes logical Connection own stable human presentation identity without widening its lifecycle', () => {
  const identity = read('docs/product/human-context-identity-contract.md')
  const assessment = read('docs/evidence/4c/w02-connection-human-identity-global-maximum.md')

  requireText(assessment, 'OPERATOR ACCEPTED', 'F04 selected realization must record operator acceptance before Product authority changes')
  requireText(assessment, 'Connection.name', 'F04 accepted realization must identify the selected spelling')

  for (const law of [
    'Connection.name',
    'CON-05 CreateConnection',
    'CON-03 ListConnections',
    'CON-04 GetConnection',
    'stable across ConnectionRevision changes',
    'immutable after creation in F1',
  ]) requireText(identity, law, `F04-A human-identity authority missing law: ${law}`)

  for (const forbidden of [
    'RenameConnection',
    'UpdateConnectionMetadata',
    'name-derived routing',
    'name-derived authorization',
  ]) requireText(identity, forbidden, `F04-A must explicitly preserve non-authority: ${forbidden}`)
})

test('selected Connection.name realization recompiles CON-05 and canonical Connection reads without operation or revision-owner drift', () => {
  const wire = read('contracts/api/product/connection-paths.yaml')
  const ledger = read('docs/product/operation-ledger.md')

  const createStart = wire.indexOf('summary: CreateConnection')
  const connectionRouteStart = wire.indexOf('\n  /api/control/connections/{connectionId}:', createStart)
  const createSlice = wire.slice(createStart, connectionRouteStart)
  requireText(createSlice, 'required: [name, connectorDefinitionId, connectorVersion, configuration]', 'F04-B CON-05 must require explicit human Connection name')
  requireText(createSlice, 'name:', 'F04-B CON-05 missing name property')
  requireText(createSlice, 'minLength: 1', 'F04-B Connection name must be non-blank-capable schema input')

  const connectionStart = wire.indexOf('    Connection:\n')
  const revisionStart = wire.indexOf('    ConnectionRevision:\n', connectionStart)
  const connectionSchema = wire.slice(connectionStart, revisionStart)
  requireText(connectionSchema, 'required: [connectionId, name, ownerScopeKind, ownerId, connectorDefinitionId, connectorVersion, currentRevisionId, credentialConfigured]', 'F04-B canonical Connection projection must require human name')
  requireText(connectionSchema, 'name:', 'F04-B canonical Connection projection missing name')

  const reviseStart = wire.indexOf('summary: ReviseConnection')
  const credentialRouteStart = wire.indexOf('\n  /api/control/connections/{connectionId}/credential:', reviseStart)
  const reviseSlice = wire.slice(reviseStart, credentialRouteStart)
  if (/\n\s+name:/.test(reviseSlice)) throw new Error('F04-B CON-06 must remain configuration-revision authority, not hidden rename authority')

  const qualificationSchemaStart = wire.indexOf('    ConnectionQualification:\n', revisionStart)
  const revisionSchema = wire.slice(revisionStart, qualificationSchemaStart)
  if (/\n\s+name:/.test(revisionSchema)) throw new Error('F04-B ConnectionRevision must not re-own logical Connection human identity')

  requireText(ledger, '## 5.6 Connections — 9', 'F04 must not change Connections operation count')
  requireText(ledger, '`CON-05` | `CreateConnection`', 'F04 must preserve CON-05 operation identity')
})
