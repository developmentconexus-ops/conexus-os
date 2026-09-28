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
// consumes only `listBindings`, and that function's own PostgreSQL-backed behaviour (a binding that
// opens and closes, P7, P8) is already proved against real PostgreSQL by
// connector-broker-postgres.test.mjs and connector-postgres.test.mjs. This file is a unit test of the
// brief's own construction from whatever the store answers.
const bound = (name, connectorId = 'sankhya', connectionId = '33333333-3333-4333-8333-333333333333') =>
  ({ bindingId: '44444444-4444-4444-8444-444444444444', name, connectionId, connectorId })
const storeOf = (bindings) => ({ listBindings: async () => bindings })

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

test('a Project with no binding, a binding of another integrator, or two Sankhya bindings gets an empty brief', async () => {
  for (const bindings of [[], [bound('crm', 'synthetic-rest')], [bound('erp'), bound('filial', 'sankhya', '55555555-5555-4555-8555-555555555555')]]) {
    assert.equal(await briefOf(storeOf(bindings))(scope), '', JSON.stringify(bindings))
  }
  assert.ok((await briefOf(storeOf([bound('erp'), bound('crm', 'synthetic-rest')]))(scope)).includes(READ), 'one Sankhya binding beside another integrator reaches the operation')
})

test('a Project with one Sankhya binding gets a brief naming the operation and both its JSON Schemas', async () => {
  const brief = briefOf(storeOf([bound('erp')]))
  const text = await brief(scope)
  assert.ok(text.includes(READ))
  assert.ok(text.includes(sankhyaDefinition.operations[0].summary))
  assert.ok(text.includes(JSON.stringify(z.toJSONSchema(sankhyaDefinition.operations[0].input))))
  assert.ok(text.includes(JSON.stringify(z.toJSONSchema(sankhyaDefinition.operations[0].output))))
  assert.ok(text.includes(`connectors.call('${READ}'`))
  assert.ok(text.includes(sankhyaDefinition.builderSkill))
})

test('an unbound Connection gets an empty brief again', async () => {
  const bindings = [bound('erp')]
  const brief = briefOf({ listBindings: async () => bindings })
  assert.ok((await brief(scope)).includes(READ))
  bindings.pop()
  assert.equal(await brief(scope), '')
})

test('an unreadable store answers the fixed notice, records a code with no store detail, and names no operation', async () => {
  const { CONNECTOR_BRIEF_UNAVAILABLE } = await import(hubModuleUrl('connectors/builder-brief.js'))
  const record = connectorRecord()
  const brief = briefOf({ listBindings: async () => { throw new Error('permission denied for function list_bound_connections STORE_DETAIL_MARKER') } }, record)
  const text = await brief(scope)
  assert.equal(text, CONNECTOR_BRIEF_UNAVAILABLE)
  assert.deepEqual(await record.facts(), [{ name: 'connector.brief', root: true, error: true, projectId: PROJECT, result: 'STORE_UNAVAILABLE' }])
  assert.equal(JSON.stringify(record.exporter.events).includes('STORE_DETAIL_MARKER') || record.lines.join('').includes('STORE_DETAIL_MARKER'), false, 'no store detail is recorded')
  for (const term of [READ, 'STORE_DETAIL_MARKER', sankhyaDefinition.builderSkill, ...FORBIDDEN]) assert.equal(text.includes(term), false, term)

  const sinkFails = briefOf({ listBindings: async () => { throw new Error('down') } }, connectorRecord({ log: () => { throw new Error('sink down') } }))
  assert.equal(await sinkFails(scope), CONNECTOR_BRIEF_UNAVAILABLE)
})

test('a scope this module did not mint gets an empty brief, whatever the store would answer', async () => {
  const brief = briefOf(storeOf([bound('erp')]))
  assert.equal(await brief({ projectId: PROJECT, environment: 'preview' }), '')
})

test('the brief and the Skill carry none of the forbidden wire vocabulary', async () => {
  const brief = briefOf(storeOf([bound('erp')]))
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
