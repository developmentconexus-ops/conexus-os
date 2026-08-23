import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(message)
}

test('W-02B has Product authority for stable human-readable Connection identity', () => {
  const humanIdentity = read('docs/product/human-context-identity-contract.md')
  const finding = read('docs/evidence/4c/w02-connection-human-identity-finding.md')

  requireText(finding, 'Connection.name', 'F04 finding must name the smallest leading property')
  requireText(humanIdentity, 'Connection.name', 'F04-A missing Connection.name Product human-identity authority')
  requireText(humanIdentity, 'immutable after creation in F1', 'Connection name must not imply generic rename authority')
  for (const forbidden of ['RenameConnection', 'UpdateConnectionMetadata']) {
    if (humanIdentity.includes(`${forbidden}\n→`) || humanIdentity.includes(`| ${forbidden} |`)) {
      throw new Error(`F04 must not admit ${forbidden}`)
    }
  }
})

test('W-02B exact Connection wire requires and projects human-readable name without changing operation count', () => {
  const wire = read('contracts/api/product/connection-paths.yaml')
  const ledger = read('docs/product/operation-ledger.md')

  requireText(wire, 'summary: CreateConnection', 'F04-B precondition lost CON-05')
  const createStart = wire.indexOf('summary: CreateConnection')
  const nextRoute = wire.indexOf('\n  /api/control/connections/{connectionId}:', createStart)
  const createSlice = wire.slice(createStart, nextRoute)
  requireText(createSlice, 'required: [name, connectorDefinitionId, connectorVersion, configuration]', 'F04-B CON-05 must require explicit Connection name')
  requireText(createSlice, 'name:', 'F04-B CON-05 missing name property')

  const connectionStart = wire.indexOf('    Connection:\n')
  const revisionStart = wire.indexOf('    ConnectionRevision:\n', connectionStart)
  const connectionSchema = wire.slice(connectionStart, revisionStart)
  requireText(connectionSchema, 'required: [connectionId, name, ownerScopeKind, ownerId, connectorDefinitionId, connectorVersion, currentRevisionId, credentialConfigured]', 'F04-B canonical Connection projection must require name')
  requireText(connectionSchema, 'name:', 'F04-B Connection schema missing human-readable name')

  requireText(ledger, '## 5.6 Connections — 9', 'F04 must not change Connections operation count')
  requireText(ledger, '`CON-05` | `CreateConnection`', 'F04 must preserve CON-05 identity')
})
