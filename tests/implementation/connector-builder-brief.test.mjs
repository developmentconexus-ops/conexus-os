import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { connectorRecord, recordText } from './connector-record.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { invariant } from './failure-matchers.mjs'

const { createConnectorBrief } = await import(hubModuleUrl('connectors/builder-brief.js'))
const { sankhyaDefinition } = await import(hubModuleUrl('connectors/sankhya/definition.js'))
const { scopeFromArtifactSource } = await import(hubModuleUrl('connectors/scope.js'))

const CONNECTOR_BRIEF_UNBOUND = 'No Conexão is bound to this Project, so it reads no external system. When a request needs data from one, '
  + 'change no files: name the system, tell the person a Conexão for it can be added in Integrações, and stop.'
const CONNECTOR_BRIEF_UNAVAILABLE = 'The Conexões bound to this Project could not be read in this run. Do not call `connector_fetch` or `connectors.fetch`; '
  + 'when the request needs data from an external system, change no files, tell the person it is unavailable right now and that they can ask again later, and stop.'
const SANKHYA_GATEWAY_ORIGINS = ['https://api.sankhya.com.br', 'https://api.sandbox.sankhya.com.br']

const PROJECT = '22222222-2222-4222-8222-222222222222'
const scope = scopeFromArtifactSource({ via: 'PREVIEW', projectId: PROJECT })

const bound = (name, connectorId = 'sankhya', connectionId = '33333333-3333-4333-8333-333333333333') =>
  ({ bindingId: '44444444-4444-4444-8444-444444444444', name, connectionId, connectorId })
const storeOf = (bindings) => ({ listBindings: async () => bindings })

const connectors = Object.freeze([{ definition: sankhyaDefinition, adapter: null }])
const briefOf = (store, record = connectorRecord()) => createConnectorBrief({ connectors, store, observability: record.observability })

// What P11 keeps from the Builder: credential material and the pinned gateway origins. Service,
// entity and field names are the native request format the integrator's Skill teaches (C-030).
const FORBIDDEN = ['clientSecret', 'xToken', 'client_secret', 'X-Token', 'x-token', 'Bearer', ...SANKHYA_GATEWAY_ORIGINS]

const line = (name, connectorId) => `- \`${name}\`: ${connectorId} (skill \`conexus-${connectorId}\`)`
const readSkill = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const sankhyaSkill = readSkill('../../builder-skills/conexus-sankhya/SKILL.md')
const sankhyaReferences = ['topics.md', 'traps.md'].map((name) => [name, readSkill(`../../builder-skills/conexus-sankhya/references/${name}`)])

test('a Project with no binding is told to change nothing and say a Conexão can be added; every binding is listed with its integrator skill', async () => {
  assert.equal(await briefOf(storeOf([]))(scope), CONNECTOR_BRIEF_UNBOUND)
  const other = await briefOf(storeOf([bound('crm', 'synthetic-rest')]))(scope)
  assert.ok(other.startsWith(line('crm', 'synthetic-rest')), other)
  assert.equal(other.includes('conexus-sankhya'), false, 'a Project bound only to another integrator is not pointed at the Sankhya skill')

  const mixed = await briefOf(storeOf([bound('erp'), bound('crm', 'synthetic-rest')]))(scope)
  assert.ok(mixed.startsWith(`${line('erp', 'sankhya')}\n${line('crm', 'synthetic-rest')}\n`), mixed)
})

test('the brief carries the runtime cases in one place: too large, call limit, a vendor refusal, any other code, and a system no Conexão reaches', async () => {
  const text = await briefOf(storeOf([bound('erp')]))(scope)
  for (const part of ['RESPONSE_TOO_LARGE, narrow it', 'CALL_LIMIT', 'PROVIDER_ERROR with a vendorStatus', 'without the code unless they ask', 'none of these Conexões reaches', 'can be added in Integrações']) {
    assert.ok(text.includes(part), part)
  }
  assert.equal(text.includes(CONNECTOR_BRIEF_UNBOUND), false)
  assert.equal(text.includes('connectors.call'), false)
  assert.equal(sankhyaSkill.includes('RESPONSE_TOO_LARGE'), false)
})

test('the Builder guidance never teaches connectors.call: the server skill, the prompt and the Sankhya skill teach fetch', () => {
  const serverSkill = readSkill('../../builder-skills/conexus-server/SKILL.md')
  const prompt = readSkill('../../apps/hub/src/builder/harness/prompt/builder.md')
  for (const text of [serverSkill, prompt, sankhyaSkill]) {
    assert.equal(text.includes('connectors.call'), false)
    assert.equal(text.includes('purchase-order'), false)
  }
  assert.ok(serverSkill.includes('connectors.fetch'))
  assert.ok(sankhyaSkill.includes('connectors.fetch'))
})

test('an unbound Connection leaves the Project told it has none', async () => {
  const bindings = [bound('erp')]
  const brief = briefOf({ listBindings: async () => bindings })
  assert.ok((await brief(scope)).includes(line('erp', 'sankhya')))
  bindings.pop()
  assert.equal(await brief(scope), CONNECTOR_BRIEF_UNBOUND)
})

test('an unreadable store answers the fixed notice, and records a code with no store detail', async () => {
  const record = connectorRecord()
  const brief = briefOf({ listBindings: async () => { throw new Error('permission denied for function list_bound_connections STORE_DETAIL_MARKER') } }, record)
  const text = await brief(scope)
  assert.equal(text, CONNECTOR_BRIEF_UNAVAILABLE)
  assert.deepEqual(await record.facts(), [{ name: 'connector.brief', root: true, error: true, projectId: PROJECT, result: 'STORE_UNAVAILABLE' }])
  assert.equal(recordText(record).includes('STORE_DETAIL_MARKER'), false, 'no store detail is recorded')
  for (const term of ['STORE_DETAIL_MARKER', ...FORBIDDEN]) assert.equal(text.includes(term), false, term)

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
    for (const [path, text] of [['SKILL.md', sankhyaSkill], ...sankhyaReferences]) assert.equal(text.includes(term), false, `Skill ${path} must not contain ${term}`)
  }
})

test('the module opens no Builder run, and reads no binding, for a Project id it cannot mint a scope for', async () => {
  const { createConnectorModule } = await import(hubModuleUrl('connectors/module.js'))
  const module = createConnectorModule({
    pool: { query: async () => { throw new Error('the store must not be reached') } },
    envelope: { seal: async () => '', open: async () => '', fingerprints: () => [''] },
    isInstallationAdministrator: async () => false,
    log: () => {},
  })
  await assert.rejects(module.openBuilderRun({ projectId: 'not-a-uuid', builderRunId: '11111111-1111-4111-8111-111111111111' }), invariant('CONNECTOR_SCOPE_REFUSED'))
})

test('the Sankhya guide teaches how to find any data, and carries no one-app recipe or real value', () => {
  const guide = sankhyaSkill
  for (const method of ['TDDCAM', 'TDDOPC', 'USER_TAB_COLUMNS', 'hasMoreResult', 'DHALTER', '.conexus/memory/', 'https://developer.sankhya.com.br/reference']) assert.ok(guide.includes(method), method)
  assert.equal(guide.includes('`total` counts the rows of this page, not of the whole list'), true, 'total is the page count')
  for (const [path, text] of [['SKILL.md', guide], ...sankhyaReferences]) {
    for (const recipe of ['pedidos de compra', 'acompanhamento']) assert.equal(text.includes(recipe), false, `${path}: ${recipe}`)
    assert.equal(/TIPMOV\s*(=|IN\b)/i.test(text), false, `${path}: a kind of movement is discovered per company, never stated`)
    assert.equal(/(=|\$:) ?'?\d/.test(text), false, `${path}: no example value is a real number`)
  }
})
