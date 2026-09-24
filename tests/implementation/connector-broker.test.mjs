import assert from 'node:assert/strict'
import test from 'node:test'
import { z } from 'zod'
import { EXPECTED_ORDER_22790, FAKE_CREDENTIAL, HEADER_FIELDS, ITEM_FIELDS, SECRET_MARKER, startFakeGateway } from './connector-fake-gateway.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const { createBroker } = await import(hubModuleUrl('connectors/broker.js'))
const { createTokenCache } = await import(hubModuleUrl('connectors/token-cache.js'))
const { createSankhyaGateway } = await import(hubModuleUrl('connectors/sankhya/gateway.js'))
const { sankhyaDefinition } = await import(hubModuleUrl('connectors/sankhya/definition.js'))
const { scopeFromArtifactSource } = await import(hubModuleUrl('connectors/scope.js'))
const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))

const PROJECT = '22222222-2222-4222-8222-222222222222'
const CONNECTION = '33333333-3333-4333-8333-333333333333'
const READ = 'sankhya.purchase-order.read'
const envelope = createSecretEnvelope('cd'.repeat(32))
const sealed = await envelope.seal(JSON.stringify(FAKE_CREDENTIAL))
const consumer = Object.freeze({ kind: 'handler', invocationId: 'invocation-1', scope: scopeFromArtifactSource({ via: 'PREVIEW', projectId: PROJECT }) })

// The broker's three reads, in memory: one open grant per granted operation id.
const memoryStore = ({ granted = [READ], credential = sealed } = {}) => {
  const grants = new Set(granted)
  const calls = []
  return {
    grants,
    calls,
    resolveGrant: async (input) => {
      calls.push(['resolveGrant', input])
      return input.projectId === PROJECT && input.environment === 'preview' && grants.has(input.capabilityId) ? { grantId: 'grant-1', connectionId: CONNECTION } : null
    },
    readConnectionCredential: async (connectionId) => { calls.push(['readConnectionCredential', connectionId]); return connectionId === CONNECTION ? credential : null },
    listGrantedCapabilities: async () => [...grants].map((capabilityId) => ({ capabilityKind: 'operation', capabilityId })),
  }
}

const setup = async (t, { extra = [], store = memoryStore(), deadlineMs, tokens, adapter = true, expiresInSeconds } = {}) => {
  const fake = await startFakeGateway({ ...(expiresInSeconds ? { expiresInSeconds } : {}) })
  t.after(() => fake.close())
  const audit = []
  const gateway = createSankhyaGateway({ origin: fake.origin })
  const broker = createBroker({
    connectors: [{ definition: sankhyaDefinition, adapter: adapter ? gateway : null }, ...extra.map((definition) => ({ definition, adapter: gateway }))],
    store, envelope, audit: (line) => audit.push(line), clock: () => 0,
    ...(deadlineMs ? { deadlineMs } : {}), ...(tokens ? { tokens } : {}),
  })
  return { fake, audit, broker, store, gateway }
}

const auditLine = (fields) => `${JSON.stringify({ event: 'connector.call', consumer: 'handler', projectId: PROJECT, operation: READ, services: [], result: 'OK', ms: 0, ...fields })}\n`

test('a handler call reads the order; the fake saw exactly authenticate and loadRecords with the fixed field lists', async (t) => {
  const { fake, audit, broker } = await setup(t)
  assert.deepEqual(await broker.call(consumer, READ, { documentNumber: 22790 }), { ok: true, value: EXPECTED_ORDER_22790 })
  assert.deepEqual(fake.requests.map((request) => [request.method, request.path, request.serviceName, request.outputType]), [
    ['POST', '/authenticate', null, null],
    ['POST', '/gateway/v1/mge/service.sbr', 'CRUDServiceProvider.loadRecords', 'json'],
    ['POST', '/gateway/v1/mge/service.sbr', 'CRUDServiceProvider.loadRecords', 'json'],
  ])
  const [authenticate, header, items] = fake.requests
  assert.deepEqual(authenticate.form, { client_id: 'fake-client-id', client_secret: 'fake-client-secret-5d1e', grant_type: 'client_credentials' })
  assert.equal(authenticate.xToken, 'fake-x-token-88b2')
  assert.equal(authenticate.contentType, 'application/x-www-form-urlencoded')
  assert.deepEqual([header.authorization, items.authorization], ['Bearer fake-token-1', 'Bearer fake-token-1'])
  assert.deepEqual(header.body, {
    serviceName: 'CRUDServiceProvider.loadRecords',
    requestBody: { dataSet: {
      rootEntity: 'CabecalhoNota', includePresentationFields: 'N', offsetPage: '0',
      criteria: { expression: { $: "this.NUMNOTA = ? AND this.TIPMOV = 'O'" }, parameter: [{ $: '22790', type: 'I' }] },
      entity: [{ path: '', fieldset: { list: HEADER_FIELDS } }, { path: 'Parceiro', fieldset: { list: 'NOMEPARC' } }],
    } },
  })
  assert.deepEqual(items.body.requestBody.dataSet, {
    rootEntity: 'ItemNota', includePresentationFields: 'N', offsetPage: '0',
    criteria: { expression: { $: 'this.NUNOTA IN (?)' }, parameter: [{ $: '9001', type: 'I' }] },
    entity: [{ path: '', fieldset: { list: ITEM_FIELDS } }, { path: 'Produto', fieldset: { list: 'DESCRPROD' } }],
  })
  assert.deepEqual(audit, [auditLine({ services: ['CRUDServiceProvider.loadRecords', 'CRUDServiceProvider.loadRecords'] })])
})

test('a document number with no order answers an empty list after one loadRecords', async (t) => {
  const { fake, broker } = await setup(t)
  assert.deepEqual(await broker.call(consumer, READ, { documentNumber: 1 }), { ok: true, value: { orders: [] } })
  assert.equal(fake.requests.length, 2)
})

test('P10: ten concurrent calls authenticate once; a refused token is refetched once; always refused is CREDENTIAL_REFUSED after two', async (t) => {
  const { fake, broker } = await setup(t)
  const results = await Promise.all(Array.from({ length: 10 }, () => broker.call(consumer, READ, { documentNumber: 22790 })))
  assert.deepEqual(results, Array(10).fill({ ok: true, value: EXPECTED_ORDER_22790 }))
  assert.equal(fake.issued(), 1)

  const refused = await setup(t)
  refused.fake.mode.service = 'refuse-first-token'
  assert.deepEqual(await refused.broker.call(consumer, READ, { documentNumber: 22790 }), { ok: true, value: EXPECTED_ORDER_22790 })
  assert.equal(refused.fake.issued(), 2)

  const always = await setup(t)
  always.fake.mode.service = 401
  assert.deepEqual(await always.broker.call(consumer, READ, { documentNumber: 22790 }), { ok: false, code: 'CREDENTIAL_REFUSED' })
  assert.equal(always.fake.issued(), 2)
})

test('P10: a short-lived token is reused, then refreshed before it expires', async (t) => {
  let now = 0
  const { fake, broker } = await setup(t, { expiresInSeconds: 90, tokens: createTokenCache({ now: () => now }) })
  const read = () => broker.call(consumer, READ, { documentNumber: 22790 })
  assert.equal((await read()).ok, true)
  now = 29_999
  assert.equal((await read()).ok, true)
  assert.equal(fake.issued(), 1)
  now = 30_000
  assert.equal((await read()).ok, true)
  assert.equal(fake.issued(), 2)
  assert.deepEqual(fake.requests.filter((request) => request.authorization).map((request) => request.authorization),
    ['Bearer fake-token-1', 'Bearer fake-token-1', 'Bearer fake-token-1', 'Bearer fake-token-1', 'Bearer fake-token-2', 'Bearer fake-token-2'])
})

test('P3: an input naming a service, entity, expression, URL, header or token is refused with zero fake requests', async (t) => {
  const { fake, broker, store } = await setup(t)
  const cases = [
    [{ documentNumber: 22790, service: 'CRUDServiceProvider.saveRecord' }, ['/service']],
    [{ documentNumber: 22790, entity: 'Parceiro' }, ['/entity']],
    [{ documentNumber: 22790, expression: '1 = 1' }, ['/expression']],
    [{ documentNumber: 22790, url: 'http://127.0.0.1/' }, ['/url']],
    [{ documentNumber: 22790, headers: { authorization: 'Bearer x' } }, ['/headers']],
    [{ documentNumber: 22790, token: 'fake-token-1' }, ['/token']],
    [{ documentNumber: '22790 OR 1 = 1' }, ['/documentNumber']],
    [{ documentNumber: -1 }, ['/documentNumber']],
    [null, ['/']],
  ]
  for (const [input, issues] of cases) {
    assert.deepEqual(await broker.call(consumer, READ, input), { ok: false, code: 'INPUT_REFUSED', issues }, JSON.stringify(input))
  }
  assert.equal(fake.requests.length, 0)
  assert.equal(store.calls.length, 0)
})

test('P4 (G0): a write operation is EFFECT_REFUSED and a service outside the allow-list is SERVICE_REFUSED, each with zero fake requests', async (t) => {
  const writer = {
    id: 'sankhya', credential: sankhyaDefinition.credential, events: [], builderSkill: '',
    operations: [
      { id: 'test.order.write', effect: 'write', summary: 'writes', input: z.object({}), output: z.object({}), run: async (_input, session) => session.loadRecords({}) },
      { id: 'test.order.other-service', effect: 'read', summary: 'asks another service', input: z.object({}), output: z.object({}), run: async (_input, session) => session.callService('CRUDServiceProvider.saveRecord', {}) },
    ],
  }
  const store = memoryStore({ granted: [READ, 'test.order.write', 'test.order.other-service'] })
  const { fake, broker, audit } = await setup(t, { extra: [writer], store })
  assert.deepEqual(await broker.call(consumer, 'test.order.write', {}), { ok: false, code: 'EFFECT_REFUSED' })
  assert.deepEqual(store.calls, [], 'refused before the database')
  assert.deepEqual(await broker.call(consumer, 'test.order.other-service', {}), { ok: false, code: 'SERVICE_REFUSED' })
  assert.deepEqual(fake.requests, [], 'refused before the network, authentication included')
  assert.deepEqual(audit, [
    auditLine({ operation: 'test.order.write', result: 'EFFECT_REFUSED' }),
    auditLine({ operation: 'test.order.other-service', result: 'SERVICE_REFUSED' }),
  ])
})

test('an unknown operation, an ungranted one and an unminted scope refuse before the network', async (t) => {
  const store = memoryStore({ granted: [] })
  const { fake, broker, audit } = await setup(t, { store })
  assert.deepEqual(await broker.call(consumer, 'sankhya.everything.read', {}), { ok: false, code: 'OPERATION_UNKNOWN' })
  assert.deepEqual(await broker.call(consumer, READ, { documentNumber: 22790 }), { ok: false, code: 'NOT_GRANTED' })
  store.grants.add(READ)
  const forged = { kind: 'handler', invocationId: 'x', scope: { projectId: PROJECT, environment: 'preview' } }
  assert.deepEqual(await broker.call(forged, READ, { documentNumber: 22790 }), { ok: false, code: 'NOT_GRANTED' })
  assert.equal(fake.requests.length, 0)
  assert.equal(audit[0], auditLine({ operation: null, result: 'OPERATION_UNKNOWN' }))
})

test('P5: an extra provider field is dropped, an oversized body is RESPONSE_REFUSED and a stalled gateway is PROVIDER_TIMEOUT', async (t) => {
  const extra = await setup(t)
  extra.fake.mode.service = 'extra-field'
  assert.deepEqual(await extra.broker.call(consumer, READ, { documentNumber: 22790 }), { ok: true, value: EXPECTED_ORDER_22790 })

  const stripping = {
    id: 'sankhya', credential: sankhyaDefinition.credential, events: [], builderSkill: '',
    operations: [{ id: 'test.order.extra', effect: 'read', summary: 'extra key', input: z.object({}), output: z.object({ kept: z.string() }), run: async () => ({ kept: 'yes', password: SECRET_MARKER }) }],
  }
  const strip = await setup(t, { extra: [stripping], store: memoryStore({ granted: ['test.order.extra'] }) })
  assert.deepEqual(await strip.broker.call(consumer, 'test.order.extra', {}), { ok: true, value: { kept: 'yes' } })

  const oversized = await setup(t)
  oversized.fake.mode.service = 'oversized'
  assert.deepEqual(await oversized.broker.call(consumer, READ, { documentNumber: 22790 }), { ok: false, code: 'RESPONSE_REFUSED' })

  const stalled = await setup(t, { deadlineMs: 300 })
  stalled.fake.mode.service = 'stall'
  const started = Date.now()
  assert.deepEqual(await stalled.broker.call(consumer, READ, { documentNumber: 22790 }), { ok: false, code: 'PROVIDER_TIMEOUT' })
  assert.ok(Date.now() - started < 2000)
})

test('P9 and P2: each gateway failure maps to its literal code, and no provider value reaches a result or an audit line', async (t) => {
  const cases = [
    [{ authenticate: 401 }, 'CREDENTIAL_REFUSED'],
    [{ authenticate: 500 }, 'PROVIDER_UNAVAILABLE'],
    [{ authenticate: 'stall' }, 'PROVIDER_TIMEOUT'],
    [{ service: 500 }, 'PROVIDER_UNAVAILABLE'],
    [{ service: 401 }, 'CREDENTIAL_REFUSED'],
    [{ service: 'envelope-error' }, 'PROVIDER_ERROR'],
    [{ service: 'oversized' }, 'RESPONSE_REFUSED'],
  ]
  for (const [mode, code] of cases) {
    const { fake, broker, audit } = await setup(t, { deadlineMs: 300 })
    Object.assign(fake.mode, mode)
    const result = await broker.call(consumer, READ, { documentNumber: 22790 })
    assert.deepEqual(result, { ok: false, code }, JSON.stringify(mode))
    const seen = JSON.stringify(result) + audit.join('')
    for (const secret of [SECRET_MARKER, FAKE_CREDENTIAL.clientSecret, FAKE_CREDENTIAL.xToken, FAKE_CREDENTIAL.clientId, 'fake-token-']) {
      assert.equal(seen.includes(secret), false, `${secret} leaked for ${JSON.stringify(mode)}`)
    }
  }

  const unreachable = createBroker({
    connectors: [{ definition: sankhyaDefinition, adapter: createSankhyaGateway({ origin: 'http://127.0.0.1:9' }) }],
    store: memoryStore(), envelope, audit: () => undefined,
  })
  assert.deepEqual(await unreachable.call(consumer, READ, { documentNumber: 22790 }), { ok: false, code: 'PROVIDER_UNAVAILABLE' })
})

test('no pinned destination answers CONNECTOR_UNCONFIGURED with zero requests, for a call and for a credential check', async (t) => {
  const { fake, broker, store } = await setup(t, { adapter: false })
  assert.deepEqual(await broker.call(consumer, READ, { documentNumber: 22790 }), { ok: false, code: 'CONNECTOR_UNCONFIGURED' })
  assert.deepEqual(await broker.checkCredential('sankhya', CONNECTION), { ok: false, code: 'CONNECTOR_UNCONFIGURED' })
  assert.equal(fake.requests.length, 0)
  assert.deepEqual(store.calls.map(([name]) => name), ['resolveGrant'])
})

test('a credential check runs the allow-listed authentication alone and caches nothing', async (t) => {
  const { fake, broker } = await setup(t)
  assert.deepEqual(await broker.checkCredential('sankhya', CONNECTION), { ok: true, value: null })
  fake.mode.authenticate = 401
  assert.deepEqual(await broker.checkCredential('sankhya', CONNECTION), { ok: false, code: 'CREDENTIAL_REFUSED' })
  assert.deepEqual(fake.requests.map((request) => request.path), ['/authenticate', '/authenticate'])
  assert.deepEqual(await broker.checkCredential('sankhya', '44444444-4444-4444-8444-444444444444'), { ok: false, code: 'NOT_GRANTED' })
})

test('the broker lists only the granted operations of a minted scope', async (t) => {
  const { broker } = await setup(t)
  assert.deepEqual((await broker.granted(consumer.scope)).map((operation) => operation.id), [READ])
  assert.deepEqual(await broker.granted({ projectId: PROJECT, environment: 'preview' }), [])
})
