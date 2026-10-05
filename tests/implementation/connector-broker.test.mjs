import assert from 'node:assert/strict'
import test from 'node:test'
import { Mastra } from '@mastra/core/mastra'
import { SpanType } from '@mastra/core/observability'
import { InMemoryStore } from '@mastra/core/storage'
import { MastraStorageExporter } from '@mastra/observability'
import { EXPECTED_NATIVE_ORDER, FAKE_CREDENTIAL, NATIVE_ORDER_DATASET, SECRET_MARKER, startFakeGateway } from './connector-fake-gateway.mjs'
import { connectorRecord, recordText } from './connector-record.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { invalidConfig } from './failure-matchers.mjs'

const { createBroker, registryOf } = await import(hubModuleUrl('connectors/broker.js'))
const { createBuilderObservability } = await import(hubModuleUrl('builder/observability.js'))
const { endSpan, requestTrace } = await import(hubModuleUrl('connectors/record.js'))
const { createTokenCache } = await import(hubModuleUrl('connectors/token-cache.js'))
const { createSankhyaGateway } = await import(hubModuleUrl('connectors/sankhya/gateway.js'))
const { sankhyaDefinition } = await import(hubModuleUrl('connectors/sankhya/definition.js'))
const { scopeFromArtifactSource } = await import(hubModuleUrl('connectors/scope.js'))
const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))

// The executor's shared machinery, driven through broker.fetch: custody of the credential, the token
// cache, the one-request-per-token lane, the deadline and the record. connector-fetch.test.mjs owns the
// read rule, the origin checks and the binding refusals.

const PROJECT = '22222222-2222-4222-8222-222222222222'
const CONNECTION = '33333333-3333-4333-8333-333333333333'
const LOAD = 'CRUDServiceProvider.loadRecords'
const ROUTE = '/gateway/v1/mge/service.sbr'
const envelope = createSecretEnvelope('cd'.repeat(32))
const sealed = await envelope.seal(JSON.stringify(FAKE_CREDENTIAL))
const consumer = Object.freeze({ kind: 'handler', invocationId: 'invocation-1', scope: scopeFromArtifactSource({ via: 'PREVIEW', accountId: '55555555-5555-4555-8555-555555555555', projectId: PROJECT }) })

const binding = (name, connectionId = CONNECTION, connectorId = 'sankhya') => ({ bindingId: `binding-${name}`, name, connectionId, connectorId })

const memoryStore = ({ bound = [binding('erp')], credential = sealed } = {}) => {
  const bindings = [...bound]
  const calls = []
  return {
    bindings,
    calls,
    listBindings: async (input) => {
      calls.push(['listBindings', input])
      return input.projectId === PROJECT ? [...bindings] : []
    },
    readConnectionCredential: async (_scope, connectionId) => { calls.push(['readConnectionCredential', connectionId]); return connectionId === CONNECTION ? credential : null },
  }
}

const limitsFor = (deadlineMs) => ({ deadlineMs, responseBytes: 256 * 1024, requestBytes: 64 * 1024 })

const setup = async (t, { store = memoryStore(), deadlineMs, tokens, adapter = true, expiresInSeconds } = {}) => {
  const fake = await startFakeGateway({ ...(expiresInSeconds ? { expiresInSeconds } : {}) })
  t.after(() => fake.close())
  const record = connectorRecord()
  const gateway = createSankhyaGateway({ origin: fake.origin })
  const broker = createBroker({
    connectors: registryOf([{ definition: sankhyaDefinition, adapter: adapter ? gateway : null }]),
    store, envelope, observability: record.observability,
    ...(deadlineMs ? { deadlineMs, nativeLimits: limitsFor(deadlineMs) } : {}), ...(tokens ? { tokens } : {}),
  })
  return { fake, broker, store, gateway, ...record }
}

const read = (overrides = {}) => ({
  connection: 'erp', method: 'POST', path: ROUTE,
  query: { serviceName: LOAD, outputType: 'json' },
  body: { serviceName: LOAD, requestBody: { dataSet: NATIVE_ORDER_DATASET } },
  ...overrides,
})
const ORDER_BYTES = Buffer.byteLength(JSON.stringify(EXPECTED_NATIVE_ORDER))
const ORDER_READ = Object.freeze({ ok: true, status: 200, bytes: ORDER_BYTES, body: EXPECTED_NATIVE_ORDER })
const errorBytes = (status, statusMessage) => Buffer.byteLength(JSON.stringify({ serviceName: LOAD, status, statusMessage, pendingPrinting: 'false' }))

const FETCH = Object.freeze({ consumer: 'handler', projectId: PROJECT, connection: 'erp', connector: 'sankhya' })
const serviceAuthorizations = (fake) => fake.requests.filter((request) => request.path === ROUTE).map((request) => request.authorization)

test('the Connection\'s sealed credential authenticates at the vendor, and only its bearer reaches the service request', async (t) => {
  const { fake, facts, broker } = await setup(t)
  assert.deepEqual(await broker.fetch(consumer, read()), ORDER_READ)
  const [authenticate, service] = fake.requests
  assert.deepEqual([authenticate.method, authenticate.path, authenticate.contentType], ['POST', '/authenticate', 'application/x-www-form-urlencoded'])
  assert.deepEqual(authenticate.form, { client_id: 'fake-client-id', client_secret: 'fake-client-secret-5d1e', grant_type: 'client_credentials' })
  assert.equal(authenticate.xToken, 'fake-x-token-88b2')
  assert.deepEqual([service.path, service.authorization, service.xToken, service.form], [ROUTE, 'Bearer fake-token-1', null, null])
  assert.deepEqual(await facts(), [
    { name: 'connector.fetch', root: true, error: false, ...FETCH, result: 'OK' },
    { name: 'authenticate', root: false, error: false, ...FETCH, step: 1, attempt: 1, httpStatus: 200, result: 'OK' },
    { name: LOAD, root: false, error: false, ...FETCH, step: 2, attempt: 1, httpStatus: 200, envelopeStatus: '1', bytes: ORDER_BYTES, result: 'OK' },
  ])
})

test('P10: ten concurrent fetches on one Connection authenticate once and share its token', async (t) => {
  const { fake, broker } = await setup(t)
  const results = await Promise.all(Array.from({ length: 10 }, () => broker.fetch(consumer, read())))
  assert.deepEqual(results, Array(10).fill(ORDER_READ))
  assert.equal(fake.issued(), 1)
  assert.deepEqual(serviceAuthorizations(fake), Array(10).fill('Bearer fake-token-1'))
})

test('P10: a short-lived token is reused, then refreshed before it expires', async (t) => {
  let now = 0
  const { fake, broker } = await setup(t, { expiresInSeconds: 90, tokens: createTokenCache({ now: () => now }) })
  assert.deepEqual(await broker.fetch(consumer, read()), ORDER_READ)
  now = 29_999
  assert.deepEqual(await broker.fetch(consumer, read()), ORDER_READ)
  assert.equal(fake.issued(), 1)
  now = 30_000
  assert.deepEqual(await broker.fetch(consumer, read()), ORDER_READ)
  assert.equal(fake.issued(), 2)
  assert.deepEqual(serviceAuthorizations(fake), ['Bearer fake-token-1', 'Bearer fake-token-1', 'Bearer fake-token-2'])
})

test('concurrent fetches on one Connection send one service request at a time on its token, so the vendor cancels none', async (t) => {
  const { fake, broker } = await setup(t)
  fake.mode.service = 'cancel-concurrent'
  assert.deepEqual(await Promise.all([1, 2].map(() => broker.fetch(consumer, read()))), [ORDER_READ, ORDER_READ])
  assert.deepEqual(serviceAuthorizations(fake), Array(2).fill('Bearer fake-token-1'))
  assert.equal(fake.sameBearerOverlaps(), 0, 'no service request arrived while another on its bearer was unanswered')
})

test('a request whose deadline passes while it waits on its token is never sent, and the token then serves the next fetch', async (t) => {
  const tokens = createTokenCache()
  const { fake, broker, gateway } = await setup(t, { tokens, deadlineMs: 1000 })
  const short = createBroker({
    connectors: registryOf([{ definition: sankhyaDefinition, adapter: gateway }]),
    store: memoryStore(), envelope, observability: connectorRecord().observability,
    tokens, nativeLimits: limitsFor(300),
  })
  assert.deepEqual(await broker.fetch(consumer, read()), ORDER_READ)
  const before = fake.requests.length
  fake.mode.service = 'stall'
  assert.deepEqual(await Promise.all([broker, short].map((b) => b.fetch(consumer, read()))), [
    { ok: false, code: 'PROVIDER_TIMEOUT' },
    { ok: false, code: 'PROVIDER_TIMEOUT' },
  ])
  fake.mode.service = 'ok'
  assert.deepEqual(await short.fetch(consumer, read()), ORDER_READ)
  assert.deepEqual(fake.requests.slice(before).map((request) => request.authorization), Array(2).fill('Bearer fake-token-1'), 'the stalled request and the next one; the queued one was never sent')
  assert.equal(fake.issued(), 1)
})

test('a request stalled on one token does not hold back a request on another token', async (t) => {
  const { fake, broker, gateway } = await setup(t, { deadlineMs: 1000 })
  assert.deepEqual(await broker.fetch(consumer, read()), ORDER_READ)
  const other = createBroker({
    connectors: registryOf([{ definition: sankhyaDefinition, adapter: gateway }]),
    store: memoryStore(), envelope, observability: connectorRecord().observability,
    nativeLimits: limitsFor(300),
  })
  fake.mode.service = 'stall-first-token'
  assert.deepEqual(await Promise.all([broker.fetch(consumer, read()), other.fetch(consumer, read())]), [
    { ok: false, code: 'PROVIDER_TIMEOUT' },
    ORDER_READ,
  ])
  assert.deepEqual(serviceAuthorizations(fake), ['Bearer fake-token-1', 'Bearer fake-token-1', 'Bearer fake-token-2'], 'the other token was served while the first one stalled')
})

test('P9 and P2: each vendor failure maps to its literal result and its spans, and no credential or token reaches a result or a record', async (t) => {
  const auth = (fields) => ({ name: 'authenticate', root: false, ...FETCH, step: 1, attempt: 1, ...fields })
  const load = (fields) => ({ name: LOAD, root: false, ...FETCH, step: 2, attempt: 1, ...fields })
  const authenticated = auth({ error: false, httpStatus: 200, result: 'OK' })
  const failedMessage = `[CORE_E01234] Falha ${SECRET_MARKER}`
  const cases = [
    [{ authenticate: 401 }, { ok: false, code: 'CREDENTIAL_REFUSED' }, [auth({ error: true, httpStatus: 401, result: 'AUTHENTICATION_REFUSED' })]],
    [{ authenticate: 500 }, { ok: false, code: 'PROVIDER_UNAVAILABLE' }, [auth({ error: true, httpStatus: 500, result: 'UNAVAILABLE' })]],
    [{ authenticate: 'stall' }, { ok: false, code: 'PROVIDER_TIMEOUT' }, [auth({ error: true, result: 'TIMEOUT' })]],
    [{ service: 500 }, { ok: false, code: 'PROVIDER_UNAVAILABLE', status: 500 }, [authenticated, load({ error: true, httpStatus: 500, result: 'PROVIDER_UNAVAILABLE' })]],
    [{ service: 401 }, { ok: false, code: 'CREDENTIAL_REFUSED', status: 401 }, [
      authenticated,
      load({ error: true, httpStatus: 401, result: 'TOKEN_REFUSED' }),
      auth({ error: false, step: 3, attempt: 2, httpStatus: 200, result: 'OK' }),
      load({ error: true, step: 4, attempt: 2, httpStatus: 401, result: 'TOKEN_REFUSED' }),
    ]],
    [{ service: 'envelope-error' }, { ok: false, code: 'PROVIDER_ERROR', status: 200, vendorStatus: '0', body: { serviceName: LOAD, status: '0', statusMessage: failedMessage, pendingPrinting: 'false' } }, [
      authenticated,
      load({ error: true, httpStatus: 200, envelopeStatus: '0', bytes: errorBytes('0', failedMessage), result: 'PROVIDER_ERROR' }),
    ]],
    [{ service: 'oversized' }, { ok: false, code: 'RESPONSE_TOO_LARGE', status: 200 }, [authenticated, load({ error: true, httpStatus: 200, result: 'RESPONSE_TOO_LARGE' })]],
  ]
  for (const [mode, expected, requests] of cases) {
    const { fake, broker, facts, exporter, lines } = await setup(t, { deadlineMs: 300 })
    Object.assign(fake.mode, mode)
    const result = await broker.fetch(consumer, read())
    assert.deepEqual(result, expected, JSON.stringify(mode))
    const spans = await facts()
    assert.deepEqual(spans, [{ name: 'connector.fetch', root: true, error: true, ...FETCH, result: expected.code }, ...requests], JSON.stringify(mode))
    const custody = [FAKE_CREDENTIAL.clientSecret, FAKE_CREDENTIAL.xToken, FAKE_CREDENTIAL.clientId, 'fake-token-']
    for (const secret of custody) assert.equal(JSON.stringify(result).includes(secret), false, `${secret} reached the result for ${JSON.stringify(mode)}`)
    const recorded = recordText({ exporter, lines })
    for (const secret of [...custody, SECRET_MARKER]) assert.equal(recorded.includes(secret), false, `${secret} reached the record for ${JSON.stringify(mode)}`)
  }
})

test('a failing vendor request is recorded with its HTTP status, envelope status, step and attempt, as a child of the fetch', async (t) => {
  const cases = [
    [{ service: 400 }, { httpStatus: 400 }],
    [{ service: 'stalled-400' }, { httpStatus: 400 }],
    [{ service: 'envelope-error' }, { httpStatus: 200, envelopeStatus: '0', bytes: errorBytes('0', `[CORE_E01234] Falha ${SECRET_MARKER}`) }],
    [{ service: 'envelope-status-47' }, { httpStatus: 200, envelopeStatus: 'other', bytes: errorBytes('47', `Falha ${SECRET_MARKER}`) }],
  ]
  for (const [mode, answered] of cases) {
    const { fake, broker, facts, exporter } = await setup(t, { deadlineMs: 200 })
    Object.assign(fake.mode, mode)
    assert.equal((await broker.fetch(consumer, read())).code, 'PROVIDER_ERROR', JSON.stringify(mode))
    assert.deepEqual(await facts(), [
      { name: 'connector.fetch', root: true, error: true, ...FETCH, result: 'PROVIDER_ERROR' },
      { name: 'authenticate', root: false, error: false, ...FETCH, step: 1, attempt: 1, httpStatus: 200, result: 'OK' },
      { name: LOAD, root: false, error: true, ...FETCH, step: 2, attempt: 1, ...answered, result: 'PROVIDER_ERROR' },
    ], JSON.stringify(mode))
    const spans = exporter.getCompletedSpans()
    const [root] = spans
    for (const span of spans) {
      assert.ok(span.startTime instanceof Date && span.endTime instanceof Date && span.endTime >= span.startTime, `${span.name} has a start and an end`)
      assert.equal(span.traceId, root.traceId, `${span.name} belongs to the fetch's trace`)
    }
    assert.deepEqual(spans.map((span) => span.parentSpanId ?? null), [null, root.id, root.id], 'each request is a child of the fetch')
    assert.deepEqual(spans.map((span) => (span.errorInfo ? JSON.parse(JSON.stringify(span.errorInfo)) : null)), [{ message: 'PROVIDER_ERROR', name: 'Error' }, null, { message: 'PROVIDER_ERROR', name: 'Error' }], 'a stored error is its closed code, with no stack')
  }
})

test('fetches that share one authentication each record it: the issuer its request, a joiner the shared failure', async (t) => {
  const byTrace = (exporter) => Object.values(Object.groupBy(exporter.getCompletedSpans(), (span) => span.traceId))
    .map((spans) => spans.map((span) => ({ name: span.name, ...span.metadata })))
  const ordered = (traces) => traces.sort((a, b) => a.length - b.length || JSON.stringify(a).localeCompare(JSON.stringify(b)))
  const refused = await setup(t)
  refused.fake.mode.authenticate = 401
  const results = await Promise.all([1, 2].map(() => refused.broker.fetch(consumer, read())))
  assert.deepEqual(results, [{ ok: false, code: 'CREDENTIAL_REFUSED' }, { ok: false, code: 'CREDENTIAL_REFUSED' }])
  assert.equal(refused.fake.requests.length, 1, 'one authentication was sent')
  await refused.settled()
  const failed = { name: 'connector.fetch', ...FETCH, result: 'CREDENTIAL_REFUSED' }
  assert.deepEqual(ordered(byTrace(refused.exporter)), ordered([
    [failed, { name: 'authenticate', ...FETCH, step: 1, attempt: 1, httpStatus: 401, result: 'AUTHENTICATION_REFUSED' }],
    [failed, { name: 'authenticate', ...FETCH, step: 1, attempt: 1, shared: true, result: 'AUTHENTICATION_REFUSED' }],
  ]))

  const served = await setup(t)
  await Promise.all(Array.from({ length: 10 }, () => served.broker.fetch(consumer, read())))
  await served.settled()
  const names = served.exporter.getCompletedSpans().map((span) => [span.name, span.metadata.shared ?? false])
  assert.deepEqual([names.filter(([name]) => name === 'authenticate'), names.filter(([name]) => name === LOAD).length], [[['authenticate', false]], 10], 'a shared success records one authentication and no shared failure')
})

test('a credential shaped like a provider code, even a documented one, echoed in an error body reaches no span or line', async (t) => {
  const shaped = Object.freeze({ clientId: 'GTW2468', clientSecret: 'CORE_E13579', xToken: 'GTW3501' })
  const { fake, broker, facts, exporter, lines } = await setup(t, { store: memoryStore({ credential: await envelope.seal(JSON.stringify(shaped)) }) })
  fake.mode.authenticate = 'echo-401'
  assert.deepEqual(await broker.fetch(consumer, read()), { ok: false, code: 'CREDENTIAL_REFUSED' })
  assert.deepEqual(await facts(), [
    { name: 'connector.fetch', root: true, error: true, ...FETCH, result: 'CREDENTIAL_REFUSED' },
    { name: 'authenticate', root: false, error: true, ...FETCH, step: 1, attempt: 1, httpStatus: 401, result: 'AUTHENTICATION_REFUSED' },
  ], 'the failure records its status only')
  const seen = recordText({ exporter, lines })
  for (const value of [...Object.values(shaped), SECRET_MARKER]) assert.equal(seen.includes(value), false, `${value} reached the record`)
})

test('an input refusal names schema paths only: a caller\'s own key never comes back, and the record keeps the code', async (t) => {
  const { fake, broker, facts, exporter, lines } = await setup(t)
  const result = await broker.fetch(consumer, { ...read(), [`note-${SECRET_MARKER}`]: 1, [`other-${SECRET_MARKER}`]: 2 })
  assert.deepEqual(result, { ok: false, code: 'INPUT_REFUSED', issues: ['/<unrecognized>'] })
  assert.equal(JSON.stringify(result).includes(SECRET_MARKER), false, 'no caller key comes back')
  assert.equal(fake.requests.length, 0)
  assert.deepEqual(await facts(), [{ name: 'connector.fetch', root: true, error: true, consumer: 'handler', projectId: PROJECT, connection: null, connector: null, result: 'INPUT_REFUSED' }])
  assert.equal(recordText({ exporter, lines }).includes(SECRET_MARKER), false, 'no input key reaches the record')
})

test('a refused first token is recorded as its attempt, and the retry as the next one', async (t) => {
  const { fake, broker, facts } = await setup(t)
  fake.mode.service = 'refuse-first-token'
  assert.deepEqual(await broker.fetch(consumer, read()), ORDER_READ)
  assert.equal(fake.issued(), 2)
  assert.deepEqual(await facts(), [
    { name: 'connector.fetch', root: true, error: false, ...FETCH, result: 'OK' },
    { name: 'authenticate', root: false, error: false, ...FETCH, step: 1, attempt: 1, httpStatus: 200, result: 'OK' },
    { name: LOAD, root: false, error: true, ...FETCH, step: 2, attempt: 1, httpStatus: 403, result: 'TOKEN_REFUSED' },
    { name: 'authenticate', root: false, error: false, ...FETCH, step: 3, attempt: 2, httpStatus: 200, result: 'OK' },
    { name: LOAD, root: false, error: false, ...FETCH, step: 4, attempt: 2, httpStatus: 200, envelopeStatus: '1', bytes: ORDER_BYTES, result: 'OK' },
  ])
})

test('a request reached after the deadline is never sent and never recorded', async () => {
  const { observability, facts } = connectorRecord()
  const root = observability.startSpan({ type: SpanType.GENERIC, name: 'connector.fetch' })
  let sent = false
  await assert.rejects(requestTrace(root, () => 1, AbortSignal.abort()).request(LOAD, async () => { sent = true }), { message: 'TIMEOUT' })
  endSpan(root, 'PROVIDER_TIMEOUT')
  assert.equal(sent, false)
  assert.deepEqual(await facts(), [{ name: 'connector.fetch', root: true, error: true, result: 'PROVIDER_TIMEOUT' }])
})

test('no credential, token, request or vendor text reaches a tracing event or a log line, in any mode', async (t) => {
  const modes = [
    {}, { authenticate: 401 }, { authenticate: 500 }, { authenticate: 'stall' },
    { service: 400 }, { service: 'stalled-400' }, { service: 401 }, { service: 500 }, { service: 'envelope-error' }, { service: 'envelope-status-47' }, { service: 'oversized' },
    { service: 'echo-bearer' }, { service: 'refuse-first-token' }, { service: 'stall' },
  ]
  const forbidden = [SECRET_MARKER, ...Object.values(FAKE_CREDENTIAL), 'fake-token-', ROUTE, 'outputType', 'CabecalhoNota', 'NUMNOTA', '22790', '9001', '1520.50', 'CORE_E01234']
  for (const mode of modes) {
    const { fake, broker, settled, exporter, lines } = await setup(t, { deadlineMs: 300 })
    Object.assign(fake.mode, mode)
    await broker.fetch(consumer, read())
    await broker.checkCredential('sankhya', sealed)
    await settled()
    assert.ok(exporter.events.length > 0, `${JSON.stringify(mode)} recorded events`)
    const seen = recordText({ exporter, lines })
    for (const value of forbidden) assert.equal(seen.includes(value), false, `${value} leaked for ${JSON.stringify(mode)}`)
    const statuses = [...exporter.events.map((event) => event.exportedSpan.metadata), ...lines.map((line) => JSON.parse(line))].flatMap((fields) => ('envelopeStatus' in fields ? [fields.envelopeStatus] : []))
    for (const status of statuses) assert.ok(['0', '1', '2', '3', '4', 'other'].includes(status), `${status} is not a closed envelope status, for ${JSON.stringify(mode)}`)
  }
})

test('a credential or token field a span carries by mistake is redacted by the Connector filter', async () => {
  const { observability, exporter, lines } = connectorRecord()
  const secrets = { clientId: FAKE_CREDENTIAL.clientId, clientSecret: FAKE_CREDENTIAL.clientSecret, xToken: FAKE_CREDENTIAL.xToken, access_token: 'fake-token-1' }
  observability.startSpan({ type: SpanType.GENERIC, name: 'connector.fetch', metadata: secrets }).end()
  await observability.flush()
  const redacted = { clientId: '[REDACTED]', clientSecret: '[REDACTED]', xToken: '[REDACTED]', access_token: '[REDACTED]' }
  assert.deepEqual(exporter.events.map((event) => [event.type, event.exportedSpan.metadata]), [['span_started', redacted], ['span_ended', redacted]])
  assert.deepEqual(lines.map((line) => JSON.parse(line)).map(({ clientId, clientSecret, xToken, access_token }) => ({ clientId, clientSecret, xToken, access_token })), [redacted])
  const seen = recordText({ exporter, lines })
  for (const value of Object.values(secrets)) assert.equal(seen.includes(value), false, `${value} reached the record`)
})

test('the log line of each ended span carries the stored span\'s own facts: one record, not two', async (t) => {
  const { broker, settled, exporter, lines } = await setup(t)
  assert.deepEqual(await broker.fetch(consumer, read()), ORDER_READ)
  await settled()
  const logged = lines.map((line) => JSON.parse(line))
  assert.equal(lines.every((line) => line.endsWith('\n') && !line.slice(0, -1).includes('\n')), true, 'one line per span')
  assert.deepEqual(logged.map((line) => line.span), ['authenticate', LOAD, 'connector.fetch'], 'one line per ended span, in end order')
  const bySpan = (entries) => [...entries].sort((a, b) => a.spanId.localeCompare(b.spanId))
  const stored = exporter.getCompletedSpans().map((span) => ({
    span: span.name, traceId: span.traceId, spanId: span.id, parentSpanId: span.parentSpanId ?? '',
    startedAt: span.startTime.toISOString(), ms: span.endTime - span.startTime, ...span.metadata,
  }))
  assert.deepEqual(bySpan(logged), bySpan(stored))
  const root = logged.find((line) => line.span === 'connector.fetch')
  assert.deepEqual(logged.map((line) => [line.span, line.traceId === root.traceId, line.parentSpanId]), [
    ['authenticate', true, root.spanId], [LOAD, true, root.spanId], ['connector.fetch', true, ''],
  ])
})

test('the Hub\'s Mastra keeps the Connector record in its own storage, and the Builder stays its default instance', async (t) => {
  const fake = await startFakeGateway()
  t.after(() => fake.close())
  const record = connectorRecord({ store: new MastraStorageExporter() })
  const observability = createBuilderObservability('conexus-builder-factory', record.observability)
  const mastra = new Mastra({ storage: new InMemoryStore(), observability, logger: false })
  t.after(() => observability.shutdown())
  const broker = createBroker({ connectors: registryOf([{ definition: sankhyaDefinition, adapter: createSankhyaGateway({ origin: fake.origin }) }]), store: memoryStore(), envelope, observability: record.observability })
  assert.deepEqual(await broker.fetch(consumer, read()), ORDER_READ)
  await observability.flush()
  const { traceId } = record.lines.map((line) => JSON.parse(line)).find((line) => line.span === 'connector.fetch')
  const trace = await (await mastra.getStorage().getStore('observability')).getTrace({ traceId })
  const stored = trace.spans.map((span) => ({ name: span.name, root: !span.parentSpanId, ...span.metadata })).sort((a, b) => (a.step ?? 0) - (b.step ?? 0))
  assert.deepEqual(stored, [
    { name: 'connector.fetch', root: true, ...FETCH, result: 'OK' },
    { name: 'authenticate', root: false, ...FETCH, step: 1, attempt: 1, httpStatus: 200, result: 'OK' },
    { name: LOAD, root: false, ...FETCH, step: 2, attempt: 1, httpStatus: 200, envelopeStatus: '1', bytes: ORDER_BYTES, result: 'OK' },
  ])
  assert.equal(observability.getDefaultInstance().getConfig().serviceName, 'conexus-builder-factory')
})

test('no pinned destination answers CONNECTOR_UNCONFIGURED with zero requests, for a fetch and for a credential check', async (t) => {
  const { fake, broker, store } = await setup(t, { adapter: false })
  assert.deepEqual(await broker.fetch(consumer, read()), { ok: false, code: 'CONNECTOR_UNCONFIGURED' })
  assert.deepEqual(await broker.checkCredential('sankhya', sealed), { ok: false, code: 'CONNECTOR_UNCONFIGURED' })
  assert.equal(fake.requests.length, 0)
  assert.deepEqual(store.calls.map(([name]) => name), ['listBindings'])
})

test('a store or envelope fault is CONNECTOR_PLATFORM_FAILED, and only a credential the Conexus read and refused is CREDENTIAL_REFUSED', async (t) => {
  const unreadable = await setup(t)
  assert.deepEqual(await unreadable.broker.checkCredential('sankhya', 'not-a-sealed-credential'), { ok: false, code: 'CONNECTOR_PLATFORM_FAILED' })
  const refused = await setup(t)
  assert.deepEqual(await refused.broker.checkCredential('sankhya', await envelope.seal('{"unexpected":true}')), { ok: false, code: 'CREDENTIAL_REFUSED' })
  const failing = await setup(t, { store: { ...memoryStore(), readConnectionCredential: async () => { throw new Error('connection refused') } } })
  assert.deepEqual(await failing.broker.fetch(consumer, read()), { ok: false, code: 'CONNECTOR_PLATFORM_FAILED' })
})

test('a credential check runs the allow-listed authentication alone and caches nothing', async (t) => {
  const { fake, broker, facts } = await setup(t)
  assert.deepEqual(await broker.checkCredential('sankhya', sealed), { ok: true, value: null })
  fake.mode.authenticate = 401
  assert.deepEqual(await broker.checkCredential('sankhya', sealed), { ok: false, code: 'CREDENTIAL_REFUSED' })
  assert.deepEqual(fake.requests.map((request) => request.path), ['/authenticate', '/authenticate'])
  const check = { name: 'connector.check', root: true, connector: 'sankhya' }
  const auth = { name: 'authenticate', root: false, connector: 'sankhya', step: 1, attempt: 1 }
  assert.deepEqual(await facts(), [
    { ...check, error: false, result: 'OK' },
    { ...auth, error: false, httpStatus: 200, result: 'OK' },
    { ...check, error: true, result: 'CREDENTIAL_REFUSED' },
    { ...auth, error: true, httpStatus: 401, result: 'AUTHENTICATION_REFUSED' },
  ])
})

test('connector spans record the connector id only when registered', async (t) => {
  const { broker, facts, exporter, lines, settled } = await setup(t)
  const rawConnector = 'unregistered-connector'
  await broker.checkCredential(rawConnector, CONNECTION)
  await settled()

  const recorded = await facts()
  assert.equal(recorded.find((span) => span.name === 'connector.check' && span.result === 'CONNECTOR_UNCONFIGURED').connector, 'unknown', 'an unregistered connector is recorded as unknown')
  const ended = (name) => exporter.events.filter((event) => event.type === 'span_ended' && event.exportedSpan.name === name).map((event) => event.exportedSpan.metadata)
  for (const meta of ended('connector.check')) assert.equal(meta.connector, 'unknown')
  const logged = lines.map((line) => JSON.parse(line))
  assert.equal(logged.find((entry) => entry.span === 'connector.check').connector, 'unknown')
  assert.equal(recordText({ exporter, lines }).includes(rawConnector), false, `${rawConnector} reached the record`)
})

test('the Hub pins only a published gateway origin, and refuses any other at startup', async () => {
  const { pinnedGatewayOrigin } = await import(hubModuleUrl('connectors/sankhya/gateway.js'))
  const SANKHYA_GATEWAY_ORIGINS = ['https://api.sankhya.com.br', 'https://api.sandbox.sankhya.com.br']
  for (const origin of SANKHYA_GATEWAY_ORIGINS) {
    assert.equal(origin.startsWith('https://'), true)
    assert.equal(pinnedGatewayOrigin(origin), origin)
  }
  for (const refusedOrigin of [`${SANKHYA_GATEWAY_ORIGINS[0]}/`, `${SANKHYA_GATEWAY_ORIGINS[0]}.example.test`, SANKHYA_GATEWAY_ORIGINS[0].replace('https:', 'http:'), 'http://127.0.0.1:8080', '']) {
    assert.throws(() => pinnedGatewayOrigin(refusedOrigin), invalidConfig('CONEXUS_SANKHYA_GATEWAY_ORIGIN'), refusedOrigin)
  }

  const { readHubConfig } = await import(hubModuleUrl('platform/config.js'))
  const base = {
    NODE_ENV: 'test', CONEXUS_ORIGIN: 'https://hub.test', CONEXUS_PORT: '3000', CONEXUS_BOOTSTRAP_SUBJECT: 'subject', CONEXUS_DB_HOST: '127.0.0.1', CONEXUS_DB_PORT: '5432',
    CONEXUS_DB_NAME: 'conexus', CONEXUS_DB_USER: 'hub_runtime', CONEXUS_DB_PASSWORD_FILE: '/run/hub-password', CONEXUS_OIDC_ISSUER: 'https://issuer.test',
    CONEXUS_OIDC_CLIENT_ID: 'hub', CONEXUS_OIDC_CLIENT_SECRET_FILE: '/run/oidc-secret', CONEXUS_FACTORY_SECRET_KEY_FILE: '/run/secret-key',
  }
  assert.deepEqual(readHubConfig(base).connectors, { gatewayOrigin: undefined, socketDirectory: undefined })
  assert.throws(() => readHubConfig({ ...base, CONEXUS_SANKHYA_GATEWAY_ORIGIN: 'http://127.0.0.1:8080' }), invalidConfig('CONEXUS_SANKHYA_GATEWAY_ORIGIN'))
  assert.throws(() => readHubConfig({ ...base, CONEXUS_SANKHYA_GATEWAY_ORIGIN: SANKHYA_GATEWAY_ORIGINS[0] }), invalidConfig('CONNECTOR_GATEWAY_FACTORY_RUNTIME_REQUIRED'), 'no gateway without the Mastra storage that records its calls')
  assert.throws(() => readHubConfig({ ...base, CONEXUS_CONNECTOR_SOCKET_DIR: 'relative/dir' }), invalidConfig('CONEXUS_CONNECTOR_SOCKET_DIR'))
  assert.deepEqual(readHubConfig({ ...base, CONEXUS_CONNECTOR_SOCKET_DIR: '/run/conexus-connectors' }).connectors, { gatewayOrigin: undefined, socketDirectory: '/run/conexus-connectors' })
})
