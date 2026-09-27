import assert from 'node:assert/strict'
import test from 'node:test'
import { z } from 'zod'
import { connectorRecord } from './connector-record.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const { createConnectorBrief } = await import(hubModuleUrl('connectors/builder-brief.js'))
const { sankhyaDefinition } = await import(hubModuleUrl('connectors/sankhya/definition.js'))
const { SANKHYA_GATEWAY_ORIGINS } = await import(hubModuleUrl('connectors/sankhya/gateway.js'))
const { scopeFromArtifactSource } = await import(hubModuleUrl('connectors/scope.js'))

const PROJECT = '22222222-2222-4222-8222-222222222222'
const READ = 'sankhya.purchase-order.read'
const scope = scopeFromArtifactSource({ via: 'PREVIEW', projectId: PROJECT })

// This test builds the store dependency as a stub, not against real PostgreSQL: `createConnectorBrief`
// consumes only `listGrantedCapabilities`, and that function's own PostgreSQL-backed behaviour (a grant
// that opens and closes, P7, P8) is already proved against real PostgreSQL by
// connector-broker-postgres.test.mjs and connector-postgres.test.mjs. This file is a unit test of the
// brief's own construction from whatever the store answers.
const storeOf = (granted) => ({ listGrantedCapabilities: async () => granted.map((capabilityId) => ({ capabilityKind: 'operation', capabilityId })) })

const connectors = Object.freeze([{ definition: sankhyaDefinition, adapter: null }])
const briefOf = (store, record = connectorRecord()) => createConnectorBrief({ connectors, store, observability: record.observability })

// The wire vocabulary the brief and the Skill must never carry: Sankhya field, entity and service
// names, credential material, and the pinned gateway origins.
const FORBIDDEN = [
  'CRUDServiceProvider', 'loadRecords', 'CabecalhoNota', 'ItemNota', 'TGFCAB', 'TGFITE',
  'NUMNOTA', 'NUNOTA', 'TIPMOV', 'DTNEG', 'STATUSNOTA', 'VLRNOTA', 'Parceiro', 'NOMEPARC',
  'gateway', 'service.sbr', 'clientSecret', 'xToken', 'client_secret', 'X-Token',
  ...SANKHYA_GATEWAY_ORIGINS,
]

test('a Project with no open grant gets an empty brief', async () => {
  const brief = briefOf(storeOf([]))
  assert.equal(await brief(scope), '')
})

test('a Project with the grant gets a brief naming the operation and both its JSON Schemas', async () => {
  const brief = briefOf(storeOf([READ]))
  const text = await brief(scope)
  assert.ok(text.includes(READ))
  assert.ok(text.includes(sankhyaDefinition.operations[0].summary))
  assert.ok(text.includes(JSON.stringify(z.toJSONSchema(sankhyaDefinition.operations[0].input))))
  assert.ok(text.includes(JSON.stringify(z.toJSONSchema(sankhyaDefinition.operations[0].output))))
  assert.ok(text.includes(`connectors.call('${READ}'`))
  assert.ok(text.includes(sankhyaDefinition.builderSkill))
})

test('a revoked grant gets an empty brief again', async () => {
  const grants = new Set([READ])
  const store = { listGrantedCapabilities: async () => [...grants].map((capabilityId) => ({ capabilityKind: 'operation', capabilityId })) }
  const brief = briefOf(store)
  assert.ok((await brief(scope)).includes(READ))
  grants.delete(READ)
  assert.equal(await brief(scope), '')
})

test('an unreadable store answers the fixed notice, records a code with no store detail, and names no operation', async () => {
  const { CONNECTOR_BRIEF_UNAVAILABLE } = await import(hubModuleUrl('connectors/builder-brief.js'))
  const record = connectorRecord()
  const brief = briefOf({ listGrantedCapabilities: async () => { throw new Error('permission denied for function list_granted_capabilities STORE_DETAIL_MARKER') } }, record)
  const text = await brief(scope)
  assert.equal(text, CONNECTOR_BRIEF_UNAVAILABLE)
  assert.deepEqual(await record.facts(), [{ name: 'connector.brief', root: true, error: true, projectId: PROJECT, result: 'STORE_UNAVAILABLE' }])
  assert.equal(JSON.stringify(record.exporter.events).includes('STORE_DETAIL_MARKER') || record.lines.join('').includes('STORE_DETAIL_MARKER'), false, 'no store detail is recorded')
  for (const term of [READ, 'STORE_DETAIL_MARKER', sankhyaDefinition.builderSkill, ...FORBIDDEN]) assert.equal(text.includes(term), false, term)

  const sinkFails = briefOf({ listGrantedCapabilities: async () => { throw new Error('down') } }, connectorRecord({ log: () => { throw new Error('sink down') } }))
  assert.equal(await sinkFails(scope), CONNECTOR_BRIEF_UNAVAILABLE)
})

test('a scope this module did not mint gets an empty brief, whatever the store would answer', async () => {
  const brief = briefOf(storeOf([READ]))
  assert.equal(await brief({ projectId: PROJECT, environment: 'preview' }), '')
})

test('the brief and the Skill carry none of the forbidden wire vocabulary', async () => {
  const brief = briefOf(storeOf([READ]))
  const text = await brief(scope)
  for (const term of FORBIDDEN) {
    assert.equal(text.includes(term), false, `brief must not contain ${term}`)
    assert.equal(sankhyaDefinition.builderSkill.includes(term), false, `Skill must not contain ${term}`)
  }
})

test('the module answers an empty brief, never a throw, for a Project id it cannot mint a scope for', async () => {
  const { createConnectorModule } = await import(hubModuleUrl('connectors/module.js'))
  const module = createConnectorModule({
    pool: { query: async () => { throw new Error('the store must not be reached') } },
    envelope: { seal: async () => '', open: async () => '', fingerprints: () => [''] },
    origin: 'https://conexus.test',
    resolveCurrentSession: async () => null,
    isInstallationAdministrator: async () => false,
    log: () => {},
  })
  assert.equal(await module.builderBrief('not-a-uuid'), '')
})
