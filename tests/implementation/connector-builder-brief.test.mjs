import assert from 'node:assert/strict'
import test from 'node:test'
import { z } from 'zod'
import { connectorRecord } from './connector-record.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const { CONNECTOR_BRIEF_UNAVAILABLE, CONNECTOR_BRIEF_UNBOUND, createConnectorBrief } = await import(hubModuleUrl('connectors/builder-brief.js'))
const { sankhyaDefinition } = await import(hubModuleUrl('connectors/sankhya/definition.js'))
const { SANKHYA_DESTINATION_ORIGINS } = await import(hubModuleUrl('connectors/sankhya/gateway.js'))
const { scopeFromArtifactSource } = await import(hubModuleUrl('connectors/scope.js'))

const PROJECT = '22222222-2222-4222-8222-222222222222'
const READ = 'sankhya.purchase-order.read'
const scope = scopeFromArtifactSource({ via: 'PREVIEW', projectId: PROJECT })

const bound = (name, connectorId = 'sankhya', connectionId = '33333333-3333-4333-8333-333333333333') =>
  ({ bindingId: '44444444-4444-4444-8444-444444444444', name, connectionId, connectorId, destination: 'production' })
const storeOf = (bindings) => ({ listBindings: async () => bindings })

const connectors = Object.freeze([{ definition: sankhyaDefinition, adapters: {} }])
const briefOf = (store, record = connectorRecord()) => createConnectorBrief({ connectors, store, observability: record.observability })

// What P11 keeps from the Builder: credential material and the pinned gateway origins. Service,
// entity and field names are the native request format the integrator's Skill teaches (C-030).
const FORBIDDEN = ['clientSecret', 'xToken', 'client_secret', 'X-Token', 'x-token', 'Bearer', ...Object.values(SANKHYA_DESTINATION_ORIGINS)]

const BINDING_LINE = (names) => `Connections bound to this Project, each named by the Project-local name a request passes as \`connection\`: ${names}.`

test('a Project with no binding is told to change nothing and ask for a Conexão; every binding a Project has is named with its integrator', async () => {
  assert.equal(await briefOf(storeOf([]))(scope), CONNECTOR_BRIEF_UNBOUND)
  assert.equal(CONNECTOR_BRIEF_UNBOUND, 'This Project has no Connection bound to it, so it reads no external system. When a request needs data from one, '
    + 'change no files: reply naming the system, tell the person to bind a Conexão for it to this Project in Integrações, and stop.')
  const other = await briefOf(storeOf([bound('crm', 'synthetic-rest')]))(scope)
  assert.ok(other.startsWith(BINDING_LINE('`crm` (integrator synthetic-rest)')), other)
  assert.equal(other.includes(READ) || other.includes(sankhyaDefinition.builderSkill), false, 'an unregistered integrator reaches no operation and no Skill')

  const two = await briefOf(storeOf([bound('erp'), bound('filial', 'sankhya', '55555555-5555-4555-8555-555555555555')]))(scope)
  assert.ok(two.startsWith(BINDING_LINE('`erp` (integrator sankhya), `filial` (integrator sankhya)')), two)
  assert.ok(two.includes('connector_fetch') && two.includes(sankhyaDefinition.builderSkill), 'two Sankhya bindings get the tool and the Skill')
  assert.equal(two.includes(READ), false, 'the operation path needs exactly one Sankhya binding')

  const mixed = await briefOf(storeOf([bound('erp'), bound('crm', 'synthetic-rest')]))(scope)
  assert.ok(mixed.startsWith(BINDING_LINE('`erp` (integrator sankhya), `crm` (integrator synthetic-rest)')), mixed)
  assert.ok(mixed.includes(READ), 'one Sankhya binding beside another integrator reaches the operation')
})

test('a Project with a binding is never told it has none, and is told to ask for a Conexão only for a system none of its bindings reaches', async () => {
  const text = await briefOf(storeOf([bound('erp')]))(scope)
  assert.equal(text.includes(CONNECTOR_BRIEF_UNBOUND) || text.includes('has no Connection'), false)
  assert.ok(text.includes('When a request needs a system none of these Connections reaches, change no files: reply naming the system, tell the person to bind a Conexão for it to this Project in Integrações, and stop.'))
})

test('the brief tells the Builder to narrow a read that answers RESPONSE_TOO_LARGE', async () => {
  const text = await briefOf(storeOf([bound('erp')]))(scope)
  assert.ok(text.includes('When a read answers RESPONSE_TOO_LARGE, narrow it before you read again: ask for fewer fields, filter it further, or read one page at a time.'))
  assert.ok(sankhyaDefinition.builderSkill.includes('Se a leitura responder `RESPONSE_TOO_LARGE`'))
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

test('an unbound Connection leaves the Project told it has none', async () => {
  const bindings = [bound('erp')]
  const brief = briefOf({ listBindings: async () => bindings })
  assert.ok((await brief(scope)).includes('`erp` (integrator sankhya)'))
  bindings.pop()
  assert.equal(await brief(scope), CONNECTOR_BRIEF_UNBOUND)
})

test('an unreadable store answers the fixed notice, records a code with no store detail, and names no operation', async () => {
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

test('a scope this module did not mint is told connector data is unavailable, whatever the store would answer', async () => {
  const brief = briefOf(storeOf([bound('erp')]))
  assert.equal(await brief({ projectId: PROJECT, environment: 'preview' }), CONNECTOR_BRIEF_UNAVAILABLE)
})

test('the brief and the Skill carry no credential material and no gateway origin', async () => {
  const brief = briefOf(storeOf([bound('erp')]))
  const text = await brief(scope)
  for (const term of FORBIDDEN) {
    assert.equal(text.includes(term), false, `brief must not contain ${term}`)
    assert.equal(sankhyaDefinition.builderSkill.includes(term), false, `Skill must not contain ${term}`)
  }
})

test('the module opens no Builder run, and reads no binding, for a Project id it cannot mint a scope for', async () => {
  const { createConnectorModule } = await import(hubModuleUrl('connectors/module.js'))
  const module = createConnectorModule({
    pool: { query: async () => { throw new Error('the store must not be reached') } },
    envelope: { seal: async () => '', open: async () => '', fingerprints: () => [''] },
    origin: 'https://conexus.test',
    resolveCurrentSession: async () => null,
    isInstallationAdministrator: async () => false,
    sankhyaDestinations: [],
    log: () => {},
  })
  await assert.rejects(module.openBuilderRun({ projectId: 'not-a-uuid', builderRunId: '11111111-1111-4111-8111-111111111111' }), /^Error: CONNECTOR_SCOPE_REFUSED$/)
})
