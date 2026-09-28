import assert from 'node:assert/strict'
import test from 'node:test'
import { Mastra } from '@mastra/core/mastra'
import { SpanType } from '@mastra/core/observability'
import { InMemoryStore } from '@mastra/core/storage'
import { MastraStorageExporter } from '@mastra/observability'
import { z } from 'zod'
import { EXPECTED_ORDER_22790, FAKE_CREDENTIAL, HEADER_FIELDS, ITEM_FIELDS, SECRET_MARKER, startFakeGateway } from './connector-fake-gateway.mjs'
import { connectorRecord } from './connector-record.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const { createBroker } = await import(hubModuleUrl('connectors/broker.js'))
const { createBuilderObservability } = await import(hubModuleUrl('builder/module.js'))
const { endSpan, requestTrace } = await import(hubModuleUrl('connectors/record.js'))
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

const OTHER_CONNECTION = '55555555-5555-4555-8555-555555555555'
const binding = (name, connectionId = CONNECTION, connectorId = 'sankhya') => ({ bindingId: `binding-${name}`, name, connectionId, connectorId })

const memoryStore = ({ bound = [binding('erp')], credential = sealed } = {}) => {
  const bindings = [...bound]
  const calls = []
  return {
    bindings,
    calls,
    listBindings: async (input) => {
      calls.push(['listBindings', input])
      return input.projectId === PROJECT && input.environment === 'preview' ? [...bindings] : []
    },
    readConnectionCredential: async (connectionId) => { calls.push(['readConnectionCredential', connectionId]); return connectionId === CONNECTION ? credential : null },
  }
}

const setup = async (t, { extra = [], store = memoryStore(), deadlineMs, tokens, adapter = true, expiresInSeconds } = {}) => {
  const fake = await startFakeGateway({ ...(expiresInSeconds ? { expiresInSeconds } : {}) })
  t.after(() => fake.close())
  const record = connectorRecord()
  const gateway = createSankhyaGateway({ origin: fake.origin })
  const broker = createBroker({
    connectors: [{ definition: sankhyaDefinition, adapter: adapter ? gateway : null }, ...extra.map((definition) => ({ definition, adapter: gateway }))],
    store, envelope, observability: record.observability,
    ...(deadlineMs ? { deadlineMs } : {}), ...(tokens ? { tokens } : {}),
  })
  return { fake, broker, store, gateway, ...record }
}

const CALL = Object.freeze({ consumer: 'handler', projectId: PROJECT, operation: READ })
const LOAD = 'CRUDServiceProvider.loadRecords'
const withoutRandomHexIds = (value) => JSON.stringify(value, (key, field) => (['traceId', 'id', 'spanId', 'parentSpanId'].includes(key) ? undefined : field))

test('a handler call reads the order; the fake saw exactly authenticate and loadRecords with the fixed field lists', async (t) => {
  const { fake, facts, broker } = await setup(t)
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
  assert.deepEqual(await facts(), [
    { name: 'connector.call', root: true, error: false, ...CALL, result: 'OK' },
    { name: 'authenticate', root: false, error: false, ...CALL, step: 1, attempt: 1, httpStatus: 200, result: 'OK' },
    { name: LOAD, root: false, error: false, ...CALL, step: 2, attempt: 1, httpStatus: 200, envelopeStatus: '1', result: 'OK' },
    { name: LOAD, root: false, error: false, ...CALL, step: 3, attempt: 1, httpStatus: 200, envelopeStatus: '1', result: 'OK' },
  ])
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

test('concurrent calls on one Connection send one service request at a time on its token, so the provider cancels none', async (t) => {
  const { fake, broker } = await setup(t)
  fake.mode.service = 'cancel-concurrent'
  const results = await Promise.all([1, 2].map(() => broker.call(consumer, READ, { documentNumber: 22790 })))
  assert.deepEqual(results, [{ ok: true, value: EXPECTED_ORDER_22790 }, { ok: true, value: EXPECTED_ORDER_22790 }])
  assert.deepEqual(fake.requests.filter((request) => request.authorization).map((request) => request.authorization), Array(4).fill('Bearer fake-token-1'))
  assert.equal(fake.sameBearerOverlaps(), 0, 'no service request arrived while another on its bearer was unanswered')
})

test('a request whose deadline passes while it waits on its token is never sent, and the token then serves the next call', async (t) => {
  const tokens = createTokenCache()
  const { fake, broker, gateway } = await setup(t, { tokens, deadlineMs: 1000 })
  const short = createBroker({
    connectors: [{ definition: sankhyaDefinition, adapter: gateway }],
    store: memoryStore(), envelope, observability: connectorRecord().observability,
    tokens, deadlineMs: 300,
  })
  assert.equal((await broker.call(consumer, READ, { documentNumber: 22790 })).ok, true)
  const before = fake.requests.length
  fake.mode.service = 'stall'
  assert.deepEqual(await Promise.all([broker, short].map((b) => b.call(consumer, READ, { documentNumber: 22790 }))), [
    { ok: false, code: 'PROVIDER_TIMEOUT' },
    { ok: false, code: 'PROVIDER_TIMEOUT' },
  ])
  fake.mode.service = 'ok'
  assert.deepEqual(await short.call(consumer, READ, { documentNumber: 22790 }), { ok: true, value: EXPECTED_ORDER_22790 })
  assert.deepEqual(fake.requests.slice(before).map((request) => request.authorization), Array(3).fill('Bearer fake-token-1'))
  assert.equal(fake.issued(), 1)
})

test('a request stalled on one token does not hold back a request on another token', async (t) => {
  const { fake, broker, gateway } = await setup(t, { deadlineMs: 1000 })
  assert.equal((await broker.call(consumer, READ, { documentNumber: 22790 })).ok, true)
  const other = createBroker({
    connectors: [{ definition: sankhyaDefinition, adapter: gateway }],
    store: memoryStore(), envelope, observability: connectorRecord().observability,
    deadlineMs: 300,
  })
  fake.mode.service = 'stall-first-token'
  assert.deepEqual(await Promise.all([broker.call(consumer, READ, { documentNumber: 22790 }), other.call(consumer, READ, { documentNumber: 22790 })]), [
    { ok: false, code: 'PROVIDER_TIMEOUT' },
    { ok: true, value: EXPECTED_ORDER_22790 },
  ])
})

test('P3: an input naming a service, entity, expression, URL, header or token is refused with zero fake requests', async (t) => {
  const { fake, broker, store } = await setup(t)
  const cases = [
    [{ documentNumber: 22790, service: 'CRUDServiceProvider.saveRecord' }, ['/<unrecognized>']],
    [{ documentNumber: 22790, entity: 'Parceiro' }, ['/<unrecognized>']],
    [{ documentNumber: 22790, expression: '1 = 1' }, ['/<unrecognized>']],
    [{ documentNumber: 22790, url: 'http://127.0.0.1/' }, ['/<unrecognized>']],
    [{ documentNumber: 22790, headers: { authorization: 'Bearer x' } }, ['/<unrecognized>']],
    [{ documentNumber: 22790, token: 'fake-token-1' }, ['/<unrecognized>']],
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
  const store = memoryStore()
  const { fake, broker, facts } = await setup(t, { extra: [writer], store })
  assert.deepEqual(await broker.call(consumer, 'test.order.write', {}), { ok: false, code: 'EFFECT_REFUSED' })
  assert.deepEqual(store.calls, [], 'refused before the database')
  assert.deepEqual(await broker.call(consumer, 'test.order.other-service', {}), { ok: false, code: 'SERVICE_REFUSED' })
  assert.deepEqual(fake.requests, [], 'refused before the network, authentication included')
  assert.deepEqual(await facts(), [
    { name: 'connector.call', root: true, error: true, ...CALL, operation: 'test.order.write', result: 'EFFECT_REFUSED' },
    { name: 'connector.call', root: true, error: true, ...CALL, operation: 'test.order.other-service', result: 'SERVICE_REFUSED' },
  ], 'a refused service records no provider request')
})

test('an unknown operation, no binding of the integrator, two bindings of it and an unminted scope refuse before the network', async (t) => {
  const store = memoryStore({ bound: [] })
  const { fake, broker, facts } = await setup(t, { store })
  const input = { documentNumber: 22790 }
  const notGranted = { ok: false, code: 'NOT_GRANTED' }
  assert.deepEqual(await broker.call(consumer, 'sankhya.everything.read', {}), { ok: false, code: 'OPERATION_UNKNOWN' })
  assert.deepEqual(await broker.call(consumer, READ, input), notGranted, 'no binding')
  store.bindings.push(binding('crm', OTHER_CONNECTION, 'synthetic-rest'))
  assert.deepEqual(await broker.call(consumer, READ, input), notGranted, "only another integrator's binding")
  store.bindings.push(binding('erp'), binding('filial', OTHER_CONNECTION))
  assert.deepEqual(await broker.call(consumer, READ, input), notGranted, 'two bindings of the integrator: the broker never picks one')
  store.bindings.pop()
  const forged = { kind: 'handler', invocationId: 'x', scope: { projectId: PROJECT, environment: 'preview' } }
  assert.deepEqual(await broker.call(forged, READ, input), notGranted, 'a scope this module did not mint')
  assert.equal(fake.requests.length, 0)
  assert.deepEqual(await facts(), [
    { name: 'connector.call', root: true, error: true, ...CALL, operation: null, result: 'OPERATION_UNKNOWN' },
    { name: 'connector.call', root: true, error: true, ...CALL, result: 'NOT_GRANTED' },
    { name: 'connector.call', root: true, error: true, ...CALL, result: 'NOT_GRANTED' },
    { name: 'connector.call', root: true, error: true, ...CALL, result: 'NOT_GRANTED' },
    { name: 'connector.call', root: true, error: true, ...CALL, projectId: null, result: 'NOT_GRANTED' },
  ], 'an unknown id is never recorded, and an unminted scope records no Project')
  assert.deepEqual(await broker.call(consumer, READ, input), { ok: true, value: EXPECTED_ORDER_22790 }, "one Sankhya binding beside another integrator's reads")
  assert.deepEqual(store.calls.filter(([name]) => name === 'readConnectionCredential'), [['readConnectionCredential', CONNECTION]])
})

test('P5: an extra provider field is dropped, an oversized body is RESPONSE_REFUSED and a stalled gateway is PROVIDER_TIMEOUT', async (t) => {
  const extra = await setup(t)
  extra.fake.mode.service = 'extra-field'
  assert.deepEqual(await extra.broker.call(consumer, READ, { documentNumber: 22790 }), { ok: true, value: EXPECTED_ORDER_22790 })

  const stripping = {
    id: 'sankhya', credential: sankhyaDefinition.credential, events: [], builderSkill: '',
    operations: [{ id: 'test.order.extra', effect: 'read', summary: 'extra key', input: z.object({}), output: z.object({ kept: z.string() }), run: async () => ({ kept: 'yes', password: SECRET_MARKER }) }],
  }
  const strip = await setup(t, { extra: [stripping] })
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

test('P9 and P2: each gateway failure maps to its literal code and its span, and no provider value reaches a result or a record', async (t) => {
  const auth = (fields) => ({ name: 'authenticate', root: false, ...CALL, step: 1, attempt: 1, ...fields })
  const load = (fields) => ({ name: LOAD, root: false, ...CALL, step: 2, attempt: 1, ...fields })
  const cases = [
    [{ authenticate: 401 }, 'CREDENTIAL_REFUSED', [auth({ error: true, httpStatus: 401, result: 'AUTHENTICATION_REFUSED' })]],
    [{ authenticate: 500 }, 'PROVIDER_UNAVAILABLE', [auth({ error: true, httpStatus: 500, result: 'UNAVAILABLE' })]],
    [{ authenticate: 'stall' }, 'PROVIDER_TIMEOUT', [auth({ error: true, result: 'TIMEOUT' })]],
    [{ service: 500 }, 'PROVIDER_UNAVAILABLE', [auth({ error: false, httpStatus: 200, result: 'OK' }), load({ error: true, httpStatus: 500, result: 'UNAVAILABLE' })]],
    [{ service: 401 }, 'CREDENTIAL_REFUSED', [
      auth({ error: false, httpStatus: 200, result: 'OK' }),
      load({ error: true, httpStatus: 401, result: 'TOKEN_REFUSED' }),
      auth({ error: false, step: 3, attempt: 2, httpStatus: 200, result: 'OK' }),
      load({ error: true, step: 4, attempt: 2, httpStatus: 401, result: 'TOKEN_REFUSED' }),
    ]],
    [{ service: 'envelope-error' }, 'PROVIDER_ERROR', [
      auth({ error: false, httpStatus: 200, result: 'OK' }),
      load({ error: true, httpStatus: 200, envelopeStatus: '0', result: 'PROVIDER_ERROR' }),
    ]],
    [{ service: 'oversized' }, 'RESPONSE_REFUSED', [auth({ error: false, httpStatus: 200, result: 'OK' }), load({ error: true, httpStatus: 200, result: 'RESPONSE_REFUSED' })]],
  ]
  for (const [mode, code, requests] of cases) {
    const { fake, broker, facts, lines } = await setup(t, { deadlineMs: 300 })
    Object.assign(fake.mode, mode)
    const result = await broker.call(consumer, READ, { documentNumber: 22790 })
    assert.deepEqual(result, { ok: false, code }, JSON.stringify(mode))
    const spans = await facts()
    assert.deepEqual(spans, [{ name: 'connector.call', root: true, error: true, ...CALL, result: code }, ...requests], JSON.stringify(mode))
    const seen = JSON.stringify(result) + JSON.stringify(spans) + lines.join('')
    for (const secret of [SECRET_MARKER, FAKE_CREDENTIAL.clientSecret, FAKE_CREDENTIAL.xToken, FAKE_CREDENTIAL.clientId, 'fake-token-']) {
      assert.equal(seen.includes(secret), false, `${secret} leaked for ${JSON.stringify(mode)}`)
    }
  }

  const unreachable = createBroker({
    connectors: [{ definition: sankhyaDefinition, adapter: createSankhyaGateway({ origin: 'http://127.0.0.1:9' }) }],
    store: memoryStore(), envelope, observability: connectorRecord().observability,
  })
  assert.deepEqual(await unreachable.call(consumer, READ, { documentNumber: 22790 }), { ok: false, code: 'PROVIDER_UNAVAILABLE' })
})

test('a failing provider request is recorded with its HTTP status, envelope status, step and attempt', async (t) => {
  const cases = [
    [{ service: 400 }, { httpStatus: 400 }],
    [{ service: 'stalled-400' }, { httpStatus: 400 }],
    [{ service: 'envelope-error' }, { httpStatus: 200, envelopeStatus: '0' }],
    [{ service: 'envelope-status-47' }, { httpStatus: 200, envelopeStatus: 'other' }],
  ]
  for (const [mode, answered] of cases) {
    const { fake, broker, facts, exporter } = await setup(t, { deadlineMs: 200 })
    Object.assign(fake.mode, mode)
    assert.deepEqual(await broker.call(consumer, READ, { documentNumber: 22790 }), { ok: false, code: 'PROVIDER_ERROR' }, JSON.stringify(mode))
    assert.deepEqual(await facts(), [
      { name: 'connector.call', root: true, error: true, ...CALL, result: 'PROVIDER_ERROR' },
      { name: 'authenticate', root: false, error: false, ...CALL, step: 1, attempt: 1, httpStatus: 200, result: 'OK' },
      { name: LOAD, root: false, error: true, ...CALL, step: 2, attempt: 1, ...answered, result: 'PROVIDER_ERROR' },
    ], JSON.stringify(mode))
    const spans = exporter.getCompletedSpans()
    const [root] = spans
    for (const span of spans) {
      assert.ok(span.startTime instanceof Date && span.endTime instanceof Date && span.endTime >= span.startTime, `${span.name} has a start and an end`)
      assert.equal(span.traceId, root.traceId, `${span.name} belongs to the call's trace`)
    }
    assert.deepEqual(spans.map((span) => span.parentSpanId ?? null), [null, root.id, root.id], 'each request is a child of the call')
    assert.deepEqual(spans.map((span) => (span.errorInfo ? JSON.parse(JSON.stringify(span.errorInfo)) : null)), [{ message: 'PROVIDER_ERROR', name: 'Error' }, null, { message: 'PROVIDER_ERROR', name: 'Error' }], 'a stored error is its closed code, with no stack')
  }
})

test('calls that share one authentication each record it: the issuer its request, a joiner the shared failure', async (t) => {
  const byTrace = (exporter) => Object.values(Object.groupBy(exporter.getCompletedSpans(), (span) => span.traceId))
    .map((spans) => spans.map((span) => ({ name: span.name, ...span.metadata })))
  const refused = await setup(t)
  refused.fake.mode.authenticate = 401
  const results = await Promise.all([1, 2].map(() => refused.broker.call(consumer, READ, { documentNumber: 22790 })))
  assert.deepEqual(results, [{ ok: false, code: 'CREDENTIAL_REFUSED' }, { ok: false, code: 'CREDENTIAL_REFUSED' }])
  assert.equal(refused.fake.requests.length, 1, 'one authentication was sent')
  await refused.settled()
  const failed = { name: 'connector.call', ...CALL, result: 'CREDENTIAL_REFUSED' }
  assert.deepEqual(byTrace(refused.exporter).sort((a, b) => a.length - b.length || JSON.stringify(a).localeCompare(JSON.stringify(b))), [
    [failed, { name: 'authenticate', ...CALL, step: 1, attempt: 1, httpStatus: 401, result: 'AUTHENTICATION_REFUSED' }],
    [failed, { name: 'authenticate', ...CALL, step: 1, attempt: 1, shared: true, result: 'AUTHENTICATION_REFUSED' }],
  ].sort((a, b) => a.length - b.length || JSON.stringify(a).localeCompare(JSON.stringify(b))))

  const served = await setup(t)
  await Promise.all(Array.from({ length: 10 }, () => served.broker.call(consumer, READ, { documentNumber: 22790 })))
  await served.settled()
  const names = served.exporter.getCompletedSpans().map((span) => [span.name, span.metadata.shared ?? false])
  assert.deepEqual([names.filter(([name]) => name === 'authenticate'), names.filter(([name]) => name === LOAD).length], [[['authenticate', false]], 20], 'a shared success records one authentication and no shared failure')
})

test('a credential shaped like a provider code, even a documented one, echoed in an error body reaches no span or line', async (t) => {
  const shaped = Object.freeze({ clientId: 'GTW2468', clientSecret: 'CORE_E13579', xToken: 'GTW3501' })
  const { fake, broker, facts, exporter, lines } = await setup(t, { store: memoryStore({ credential: await envelope.seal(JSON.stringify(shaped)) }) })
  fake.mode.authenticate = 'echo-401'
  assert.deepEqual(await broker.call(consumer, READ, { documentNumber: 22790 }), { ok: false, code: 'CREDENTIAL_REFUSED' })
  assert.deepEqual(await facts(), [
    { name: 'connector.call', root: true, error: true, ...CALL, result: 'CREDENTIAL_REFUSED' },
    { name: 'authenticate', root: false, error: true, ...CALL, step: 1, attempt: 1, httpStatus: 401, result: 'AUTHENTICATION_REFUSED' },
  ], 'the failure records its status only')
  const seen = withoutRandomHexIds(exporter.events) + withoutRandomHexIds(lines.map((line) => JSON.parse(line)))
  for (const value of [...Object.values(shaped), SECRET_MARKER]) assert.equal(seen.includes(value), false, `${value} reached the record`)
})

test('an input refusal names schema paths only: a caller\'s own key never comes back, and the record keeps the code', async (t) => {
  const { fake, broker, facts, exporter, lines } = await setup(t)
  const result = await broker.call(consumer, READ, { documentNumber: 22790, [`note-${SECRET_MARKER}`]: 1, [`other-${SECRET_MARKER}`]: 2 })
  assert.deepEqual(result, { ok: false, code: 'INPUT_REFUSED', issues: ['/<unrecognized>'] })
  assert.equal(JSON.stringify(result).includes(SECRET_MARKER), false, 'no caller key comes back')
  assert.equal(fake.requests.length, 0)
  assert.deepEqual(await facts(), [{ name: 'connector.call', root: true, error: true, ...CALL, result: 'INPUT_REFUSED' }])
  assert.equal(JSON.stringify(exporter.events).includes(SECRET_MARKER) || lines.join('').includes(SECRET_MARKER), false, 'no input key reaches the record')
})

test('a refused first token is recorded as its attempt, and the retry as the next one', async (t) => {
  const { fake, broker, facts } = await setup(t)
  fake.mode.service = 'refuse-first-token'
  assert.deepEqual(await broker.call(consumer, READ, { documentNumber: 22790 }), { ok: true, value: EXPECTED_ORDER_22790 })
  assert.equal(fake.issued(), 2)
  const loaded = { httpStatus: 200, envelopeStatus: '1', result: 'OK' }
  assert.deepEqual(await facts(), [
    { name: 'connector.call', root: true, error: false, ...CALL, result: 'OK' },
    { name: 'authenticate', root: false, error: false, ...CALL, step: 1, attempt: 1, httpStatus: 200, result: 'OK' },
    { name: LOAD, root: false, error: true, ...CALL, step: 2, attempt: 1, httpStatus: 403, result: 'TOKEN_REFUSED' },
    { name: 'authenticate', root: false, error: false, ...CALL, step: 3, attempt: 2, httpStatus: 200, result: 'OK' },
    { name: LOAD, root: false, error: false, ...CALL, step: 4, attempt: 2, ...loaded },
    { name: LOAD, root: false, error: false, ...CALL, step: 5, attempt: 2, ...loaded },
  ])
})

test('a request reached after the deadline is never sent and never recorded', async () => {
  const { observability, facts } = connectorRecord()
  const root = observability.startSpan({ type: SpanType.GENERIC, name: 'connector.call' })
  let sent = false
  await assert.rejects(requestTrace(root, () => 1, AbortSignal.abort()).request(LOAD, async () => { sent = true }), { message: 'TIMEOUT' })
  endSpan(root, 'PROVIDER_TIMEOUT')
  assert.equal(sent, false)
  assert.deepEqual(await facts(), [{ name: 'connector.call', root: true, error: true, result: 'PROVIDER_TIMEOUT' }])
})


test('no credential, token, input, output or provider text reaches a tracing event or a log line, in any mode', async (t) => {
  const modes = [
    {}, { authenticate: 401 }, { authenticate: 500 }, { authenticate: 'stall' },
    { service: 400 }, { service: 'stalled-400' }, { service: 401 }, { service: 500 }, { service: 'envelope-error' }, { service: 'envelope-status-47' }, { service: 'oversized' },
    { service: 'extra-field' }, { service: 'refuse-first-token' }, { service: 'stall' },
  ]
  const forbidden = [SECRET_MARKER, ...Object.values(FAKE_CREDENTIAL), 'fake-token-', '22790', 'Fornecedor Exemplo Ltda', 'Parafuso', '1520.50', '9001']
  for (const mode of modes) {
    const { fake, broker, settled, exporter, lines } = await setup(t, { deadlineMs: 300 })
    Object.assign(fake.mode, mode)
    await broker.call(consumer, READ, { documentNumber: 22790 })
    await broker.checkCredential('sankhya', CONNECTION)
    await settled()
    assert.ok(exporter.events.length > 0, `${JSON.stringify(mode)} recorded events`)
    const seen = withoutRandomHexIds(exporter.events) + withoutRandomHexIds(lines.map((line) => JSON.parse(line)))
    for (const value of forbidden) assert.equal(seen.includes(value), false, `${value} leaked for ${JSON.stringify(mode)}`)
    const statuses = [...exporter.events.map((event) => event.exportedSpan.metadata), ...lines.map((line) => JSON.parse(line))].flatMap((fields) => ('envelopeStatus' in fields ? [fields.envelopeStatus] : []))
    for (const status of statuses) assert.ok(['0', '1', '2', '3', '4', 'other'].includes(status), `${status} is not a closed envelope status, for ${JSON.stringify(mode)}`)
  }
})

test('a credential or token field a span carries by mistake is redacted by the Connector filter', async () => {
  const { observability, exporter, lines } = connectorRecord()
  const secrets = { clientId: FAKE_CREDENTIAL.clientId, clientSecret: FAKE_CREDENTIAL.clientSecret, xToken: FAKE_CREDENTIAL.xToken, access_token: 'fake-token-1' }
  observability.startSpan({ type: SpanType.GENERIC, name: 'connector.call', metadata: secrets }).end()
  await observability.flush()
  const redacted = { clientId: '[REDACTED]', clientSecret: '[REDACTED]', xToken: '[REDACTED]', access_token: '[REDACTED]' }
  assert.deepEqual(exporter.events.map((event) => [event.type, event.exportedSpan.metadata]), [['span_started', redacted], ['span_ended', redacted]])
  assert.deepEqual(lines.map((line) => JSON.parse(line)).map(({ clientId, clientSecret, xToken, access_token }) => ({ clientId, clientSecret, xToken, access_token })), [redacted])
  const seen = JSON.stringify(exporter.events) + lines.join('')
  for (const value of Object.values(secrets)) assert.equal(seen.includes(value), false, `${value} reached the record`)
})

test('the log line of each ended span carries the stored span\'s own facts: one record, not two', async (t) => {
  const { broker, settled, exporter, lines } = await setup(t)
  assert.deepEqual(await broker.call(consumer, READ, { documentNumber: 22790 }), { ok: true, value: EXPECTED_ORDER_22790 })
  await settled()
  const logged = lines.map((line) => JSON.parse(line))
  assert.equal(lines.every((line) => line.endsWith('\n') && !line.slice(0, -1).includes('\n')), true, 'one line per span')
  assert.deepEqual(logged.map((line) => line.span), ['authenticate', LOAD, LOAD, 'connector.call'], 'one line per ended span, in end order')
  const bySpan = (entries) => [...entries].sort((a, b) => a.spanId.localeCompare(b.spanId))
  const stored = exporter.getCompletedSpans().map((span) => ({
    span: span.name, traceId: span.traceId, spanId: span.id, parentSpanId: span.parentSpanId ?? null,
    startedAt: span.startTime.toISOString(), ms: span.endTime - span.startTime, ...span.metadata,
  }))
  assert.deepEqual(bySpan(logged), bySpan(stored))
  const root = logged.find((line) => line.span === 'connector.call')
  assert.deepEqual(logged.map((line) => [line.span, line.traceId === root.traceId, line.parentSpanId]), [
    ['authenticate', true, root.spanId], [LOAD, true, root.spanId], [LOAD, true, root.spanId], ['connector.call', true, null],
  ])
})

test('the Hub\'s Mastra keeps the Connector record in its own storage, and the Builder stays its default instance', async (t) => {
  const fake = await startFakeGateway()
  t.after(() => fake.close())
  const record = connectorRecord({ store: new MastraStorageExporter() })
  const observability = createBuilderObservability('conexus-builder-factory', record.observability)
  const mastra = new Mastra({ storage: new InMemoryStore(), observability, logger: false })
  t.after(() => observability.shutdown())
  const broker = createBroker({ connectors: [{ definition: sankhyaDefinition, adapter: createSankhyaGateway({ origin: fake.origin }) }], store: memoryStore(), envelope, observability: record.observability })
  assert.deepEqual(await broker.call(consumer, READ, { documentNumber: 22790 }), { ok: true, value: EXPECTED_ORDER_22790 })
  await observability.flush()
  const { traceId } = record.lines.map((line) => JSON.parse(line)).find((line) => line.span === 'connector.call')
  const trace = await (await mastra.getStorage().getStore('observability')).getTrace({ traceId })
  const stored = trace.spans.map((span) => ({ name: span.name, root: !span.parentSpanId, ...span.metadata })).sort((a, b) => (a.step ?? 0) - (b.step ?? 0))
  assert.deepEqual(stored, [
    { name: 'connector.call', root: true, ...CALL, result: 'OK' },
    { name: 'authenticate', root: false, ...CALL, step: 1, attempt: 1, httpStatus: 200, result: 'OK' },
    { name: LOAD, root: false, ...CALL, step: 2, attempt: 1, httpStatus: 200, envelopeStatus: '1', result: 'OK' },
    { name: LOAD, root: false, ...CALL, step: 3, attempt: 1, httpStatus: 200, envelopeStatus: '1', result: 'OK' },
  ])
  assert.equal(observability.getDefaultInstance().getConfig().serviceName, 'conexus-builder-factory')
})

test('no pinned destination answers CONNECTOR_UNCONFIGURED with zero requests, for a call and for a credential check', async (t) => {
  const { fake, broker, store } = await setup(t, { adapter: false })
  assert.deepEqual(await broker.call(consumer, READ, { documentNumber: 22790 }), { ok: false, code: 'CONNECTOR_UNCONFIGURED' })
  assert.deepEqual(await broker.checkCredential('sankhya', CONNECTION), { ok: false, code: 'CONNECTOR_UNCONFIGURED' })
  assert.equal(fake.requests.length, 0)
  assert.deepEqual(store.calls.map(([name]) => name), ['listBindings'])
})

test('a credential check runs the allow-listed authentication alone and caches nothing', async (t) => {
  const { fake, broker, facts } = await setup(t)
  assert.deepEqual(await broker.checkCredential('sankhya', CONNECTION), { ok: true, value: null })
  fake.mode.authenticate = 401
  assert.deepEqual(await broker.checkCredential('sankhya', CONNECTION), { ok: false, code: 'CREDENTIAL_REFUSED' })
  assert.deepEqual(fake.requests.map((request) => request.path), ['/authenticate', '/authenticate'])
  assert.deepEqual(await broker.checkCredential('sankhya', '44444444-4444-4444-8444-444444444444'), { ok: false, code: 'NOT_GRANTED' })
  const check = { name: 'connector.check', root: true, connector: 'sankhya' }
  const auth = { name: 'authenticate', root: false, connector: 'sankhya', step: 1, attempt: 1 }
  assert.deepEqual(await facts(), [
    { ...check, error: false, result: 'OK' },
    { ...auth, error: false, httpStatus: 200, result: 'OK' },
    { ...check, error: true, result: 'CREDENTIAL_REFUSED' },
    { ...auth, error: true, httpStatus: 401, result: 'AUTHENTICATION_REFUSED' },
    { ...check, error: true, result: 'NOT_GRANTED' },
  ])
})

test('connector spans record consumer kind only when in the closed set, and connector id only when registered', async (t) => {
  const { broker, facts, exporter, lines, settled } = await setup(t)
  const rawKind = 'arbitrary-consumer'
  const rawConnector = 'unregistered-connector'

  // Consumer kind validation: unrecognised or invalid kinds become 'other' in the span
  const invalidConsumer = Object.freeze({ kind: rawKind, scope: consumer.scope })
  await broker.call(invalidConsumer, READ, { documentNumber: 22790 })

  // Connector id validation: unregistered connector id becomes 'unknown' in the span
  await broker.checkCredential(rawConnector, CONNECTION)
  await settled()

  const recorded = await facts()
  const callSpan = recorded.find((span) => span.name === 'connector.call')
  assert.equal(callSpan.consumer, 'other', 'unrecognised consumer kind must be recorded as other')

  const checkSpan = recorded.find((span) => span.name === 'connector.check' && span.result === 'CONNECTOR_UNCONFIGURED')
  assert.equal(checkSpan.connector, 'unknown', 'unregistered connector must be recorded as unknown')

  // Check child spans and all exported span metadata
  const callMetadata = exporter.events
    .filter((event) => event.type === 'span_ended' && event.exportedSpan.name === 'connector.call')
    .map((event) => event.exportedSpan.metadata)
  for (const meta of callMetadata) {
    assert.equal(meta.consumer, 'other', 'every call span consumer metadata must be other')
  }

  const checkMetadata = exporter.events
    .filter((event) => event.type === 'span_ended' && event.exportedSpan.name === 'connector.check')
    .map((event) => event.exportedSpan.metadata)
  for (const meta of checkMetadata) {
    assert.equal(meta.connector, 'unknown', 'every check span connector metadata must be unknown')
  }

  // Ensure log lines record normalized values
  const logged = lines.map((line) => JSON.parse(line))
  const loggedCall = logged.find((entry) => entry.span === 'connector.call')
  assert.equal(loggedCall.consumer, 'other', 'logged call span consumer must be other')
  const loggedCheck = logged.find((entry) => entry.span === 'connector.check')
  assert.equal(loggedCheck.connector, 'unknown', 'logged check span connector must be unknown')

  // Raw unvalidated inputs must never appear in any exported events or log lines
  const seen = withoutRandomHexIds(exporter.events) + withoutRandomHexIds(logged)
  assert.equal(seen.includes(rawKind), false, `${rawKind} reached the record`)
  assert.equal(seen.includes(rawConnector), false, `${rawConnector} reached the record`)
})

test('the Hub pins only a published gateway origin, and refuses any other at startup', async () => {
  const { SANKHYA_GATEWAY_ORIGINS, pinnedGatewayOrigin } = await import(hubModuleUrl('connectors/sankhya/gateway.js'))
  assert.equal(SANKHYA_GATEWAY_ORIGINS.length, 2)
  for (const origin of SANKHYA_GATEWAY_ORIGINS) {
    assert.equal(origin.startsWith('https://'), true)
    assert.equal(pinnedGatewayOrigin(origin), origin)
  }
  for (const refusedOrigin of [`${SANKHYA_GATEWAY_ORIGINS[0]}/`, `${SANKHYA_GATEWAY_ORIGINS[0]}.example.test`, SANKHYA_GATEWAY_ORIGINS[0].replace('https:', 'http:'), 'http://127.0.0.1:8080', '']) {
    assert.throws(() => pinnedGatewayOrigin(refusedOrigin), { message: 'INVALID_CONFIG_CONEXUS_SANKHYA_GATEWAY_ORIGIN' }, refusedOrigin)
  }

  const { readHubConfig } = await import(hubModuleUrl('platform/config.js'))
  const base = {
    NODE_ENV: 'test', CONEXUS_ORIGIN: 'https://hub.test', CONEXUS_BOOTSTRAP_SUBJECT: 'subject', CONEXUS_DB_HOST: '127.0.0.1', CONEXUS_DB_PORT: '5432',
    CONEXUS_DB_NAME: 'conexus', CONEXUS_DB_USER: 'hub', CONEXUS_DB_PASSWORD_FILE: '/run/hub-password', CONEXUS_OIDC_ISSUER: 'https://issuer.test',
    CONEXUS_OIDC_CLIENT_ID: 'hub', CONEXUS_OIDC_CLIENT_SECRET_FILE: '/run/oidc-secret', CONEXUS_FACTORY_SECRET_KEY_FILE: '/run/secret-key',
  }
  assert.deepEqual(readHubConfig(base).connectors, { gatewayOrigin: undefined, socketDirectory: undefined })
  assert.throws(() => readHubConfig({ ...base, CONEXUS_SANKHYA_GATEWAY_ORIGIN: 'http://127.0.0.1:8080' }), { message: 'INVALID_CONFIG_CONEXUS_SANKHYA_GATEWAY_ORIGIN' })
  assert.throws(() => readHubConfig({ ...base, CONEXUS_SANKHYA_GATEWAY_ORIGIN: SANKHYA_GATEWAY_ORIGINS[0] }), { message: 'CONNECTOR_GATEWAY_FACTORY_RUNTIME_REQUIRED' }, 'no gateway without the Mastra storage that records its calls')
  assert.throws(() => readHubConfig({ ...base, CONEXUS_CONNECTOR_SOCKET_DIR: 'relative/dir' }), { message: 'INVALID_CONFIG_CONEXUS_CONNECTOR_SOCKET_DIR' })
  assert.deepEqual(readHubConfig({ ...base, CONEXUS_CONNECTOR_SOCKET_DIR: '/run/conexus-connectors' }).connectors, { gatewayOrigin: undefined, socketDirectory: '/run/conexus-connectors' })
})

test('every document number the input admits reads back, up to 2,147,483,647; a larger one in the response is refused', async () => {
  const { purchaseOrderRead } = await import(hubModuleUrl('connectors/sankhya/purchase-order.js'))
  // What the broker does with an operation: run it on the session, then parse its output contract.
  const read = async (documentNumber, answeredNumber = String(documentNumber)) => {
    const queries = []
    const session = {
      loadRecords: async (query) => {
        queries.push(query.parameters.map((parameter) => parameter.value))
        return queries.length === 1
          ? [{ NUNOTA: '9001', NUMNOTA: answeredNumber, DTNEG: '24/09/2026', STATUSNOTA: 'L', VLRNOTA: '10.00', Parceiro_NOMEPARC: 'Fornecedor Exemplo Ltda' }]
          : [{ NUNOTA: '9001', SEQUENCIA: '1', CODPROD: '501', QTDNEG: '1', CODVOL: 'UN', VLRUNIT: '10.00', VLRTOT: '10.00', Produto_DESCRPROD: 'Parafuso' }]
      },
    }
    const input = purchaseOrderRead.input.parse({ documentNumber })
    const output = purchaseOrderRead.output.safeParse(await purchaseOrderRead.run(input, session))
    return { queries, parsed: output.success ? output.data.orders.map((order) => order.number) : 'RESPONSE_REFUSED' }
  }
  for (const documentNumber of [1_000_000_000, 2_147_483_647]) {
    assert.deepEqual(await read(documentNumber), { queries: [[String(documentNumber)], ['9001']], parsed: [documentNumber] }, String(documentNumber))
  }
  assert.equal(purchaseOrderRead.input.safeParse({ documentNumber: 2_147_483_648 }).success, false)
  assert.equal((await read(2_147_483_647, '2147483648')).parsed, 'RESPONSE_REFUSED', 'a number the input could never admit is not a matching order')
})
