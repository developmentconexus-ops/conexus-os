import assert from 'node:assert/strict'
import test from 'node:test'
import { EXPECTED_NATIVE_CONSULT, EXPECTED_NATIVE_ORDER, FAKE_CREDENTIAL, NATIVE_ORDER_DATASET, SECRET_MARKER, startFakeGateway } from './connector-fake-gateway.mjs'
import { createRestAdapter, REST_ACCOUNTS, REST_CONNECTOR_ID, restDefinition, startFakeRest } from './connector-fake-rest.mjs'
import { connectorRecord } from './connector-record.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const { createBroker } = await import(hubModuleUrl('connectors/broker.js'))
const { createSankhyaGateway } = await import(hubModuleUrl('connectors/sankhya/gateway.js'))
const { sankhyaDefinition } = await import(hubModuleUrl('connectors/sankhya/definition.js'))
const { revokeScope, scopeForBuilderRun, scopeFromArtifactSource } = await import(hubModuleUrl('connectors/scope.js'))
const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))

const PROJECT = '22222222-2222-4222-8222-222222222222'
const OTHER_PROJECT = '66666666-6666-4666-8666-666666666666'
const CONNECTION = '33333333-3333-4333-8333-333333333333'
const CONNECTION_A = '44444444-4444-4444-8444-444444444444'
const CONNECTION_B = '55555555-5555-4555-8555-555555555555'
const LOAD = 'CRUDServiceProvider.loadRecords'
const QUERY = 'DbExplorerSP.executeQuery'
const WRITE = 'CRUDServiceProvider.saveRecord'
const ROUTE = '/gateway/v1/mge/service.sbr'

const envelope = createSecretEnvelope('ef'.repeat(32))
const sealed = await envelope.seal(JSON.stringify(FAKE_CREDENTIAL))
const sealedRest = async (account) => envelope.seal(JSON.stringify({ clientId: REST_ACCOUNTS[account].clientId, clientSecret: REST_ACCOUNTS[account].clientSecret }))

const bound = (name, connectionId, connectorId = 'sankhya') => Object.freeze({ bindingId: `binding-${name}`, name, connectionId, connectorId })

// The broker's reads, in memory. `bindings` is keyed by Project, as connector.list_bound_connections answers them.
const memoryStore = ({ bindings = { [PROJECT]: [bound('erp', CONNECTION)] }, credentials = { [CONNECTION]: sealed } } = {}) => {
  const calls = []
  return {
    bindings,
    calls,
    listBindings: async ({ projectId, environment }) => {
      calls.push('listBindings')
      return environment === 'preview' ? [...(bindings[projectId] ?? [])] : []
    },
    readConnectionCredential: async (connectionId) => {
      calls.push('readConnectionCredential')
      return credentials[connectionId] ?? null
    },
  }
}

const setup = async (t, { store = memoryStore(), nativeLimits, now, tokenPrefix, extra = [] } = {}) => {
  const fake = await startFakeGateway(tokenPrefix ? { tokenPrefix } : {})
  const other = await startFakeGateway()
  t.after(() => Promise.all([fake.close(), other.close()]))
  const record = connectorRecord()
  const broker = createBroker({
    connectors: [{ definition: sankhyaDefinition, adapter: createSankhyaGateway({ origin: fake.origin }) }, ...extra],
    store, envelope, observability: record.observability,
    ...(nativeLimits ? { nativeLimits } : {}), ...(now ? { now } : {}),
  })
  return { fake, other, store, broker, ...record }
}

const handler = (projectId = PROJECT) => Object.freeze({ kind: 'handler', invocationId: 'invocation-1', scope: scopeFromArtifactSource({ via: 'PREVIEW', projectId }) })
const agent = (scope) => Object.freeze({ kind: 'agent', sessionId: 'run-1', scope })

const read = (overrides = {}) => ({
  connection: 'erp',
  method: 'POST',
  path: ROUTE,
  query: { serviceName: LOAD, outputType: 'json' },
  body: { serviceName: LOAD, requestBody: { dataSet: NATIVE_ORDER_DATASET } },
  ...overrides,
})

const consult = (sql) => read({ query: { serviceName: QUERY, outputType: 'json' }, body: { serviceName: QUERY, requestBody: { sql } } })

// The fakes answer `JSON.stringify(body)`, so that is the size the executor read.
const answered = (body) => Object.freeze({ ok: true, status: 200, bytes: Buffer.byteLength(JSON.stringify(body)), body })
const ORDER_READ = answered(EXPECTED_NATIVE_ORDER)

// What undici sends with every request; the executor adds only accept, authorization and content-type.
const TRANSPORT_HEADERS = ['accept-encoding', 'accept-language', 'connection', 'content-length', 'host', 'sec-fetch-mode', 'user-agent']

test('the control read: the vendor body passes through, and the fake saw authenticate and one service request at the pinned origin with only the Hub\'s headers', async (t) => {
  const { fake, other, broker } = await setup(t)
  assert.deepEqual(await broker.fetch(handler(), read()), ORDER_READ)
  assert.deepEqual(fake.requests.map(({ method, path, origin }) => [method, path, origin]), [
    ['POST', '/authenticate', fake.origin],
    ['POST', ROUTE, fake.origin],
  ])
  const { query, authorization, xToken, accept, contentType, headers, body } = fake.requests[1]
  assert.deepEqual({ query, authorization, xToken, accept, contentType, headers, body }, {
    query: { serviceName: LOAD, outputType: 'json' },
    authorization: 'Bearer fake-token-1',
    xToken: null,
    accept: 'application/json',
    contentType: 'application/json',
    headers: [...TRANSPORT_HEADERS, 'accept', 'authorization', 'content-type'].sort(),
    body: { serviceName: LOAD, requestBody: { dataSet: NATIVE_ORDER_DATASET } },
  })
  assert.equal(fake.nonReads(), 0)
  assert.deepEqual(other.requests, [])
})

test('P4: a write service and a mismatched or absent body serviceName are SERVICE_REFUSED before the network; the read is sent', async (t) => {
  const { fake, other, broker, store } = await setup(t)
  const withBody = (querySevice, body) => read({ query: { serviceName: querySevice, outputType: 'json' }, body })
  const cases = [
    [withBody(WRITE, { serviceName: WRITE, requestBody: { dataSet: NATIVE_ORDER_DATASET } }), { ok: false, code: 'SERVICE_REFUSED' }],
    [withBody(LOAD, { serviceName: WRITE, requestBody: { dataSet: NATIVE_ORDER_DATASET } }), { ok: false, code: 'SERVICE_REFUSED' }],
    [withBody(LOAD, { requestBody: { dataSet: NATIVE_ORDER_DATASET } }), { ok: false, code: 'SERVICE_REFUSED' }],
    [read({ method: 'GET' }), { ok: false, code: 'SERVICE_REFUSED' }],
    [read({ path: '/gateway/v1/mge/other.sbr' }), { ok: false, code: 'SERVICE_REFUSED' }],
    [read({ query: { serviceName: LOAD } }), { ok: false, code: 'INPUT_REFUSED', issues: ['/query/outputType'] }],
    [read({ body: [LOAD] }), { ok: false, code: 'INPUT_REFUSED', issues: ['/body'] }],
  ]
  for (const [request, refusal] of cases) assert.deepEqual(await broker.fetch(handler(), request), refusal, JSON.stringify(request))
  assert.deepEqual([fake.requests.length, fake.nonReads(), other.requests.length], [0, 0, 0], 'no request reached either host, authentication included')
  assert.equal(store.calls.includes('readConnectionCredential'), false, 'no refusal read the credential')
  assert.deepEqual(await broker.fetch(handler(), read()), ORDER_READ)
  assert.deepEqual(fake.requests.map(({ path, origin }) => [path, origin]), [['/authenticate', fake.origin], [ROUTE, fake.origin]])
})

test('a read-only consult passes, a SELECT and a WITH reach the vendor with the exact body, keywords in text and comments and a trailing ; included', async (t) => {
  const { fake, broker } = await setup(t)
  const taught = 'SELECT CAB.NUNOTA, CAB.DTNEG, PRO.CODPROD, PRO.DESCRPROD FROM TGFCAB CAB JOIN TGFITE ITE ON ITE.NUNOTA = CAB.NUNOTA JOIN TGFPRO PRO ON PRO.CODPROD = ITE.CODPROD WHERE CAB.NUMNOTA = 1234'
  const reads = [
    taught,
    'SELECT CODPROD, DESCRPROD FROM TGFPRO WHERE CODPROD IN (501, 502)',
    'WITH ITENS AS (SELECT NUNOTA, CODPROD FROM TGFITE) SELECT CAB.NUMNOTA, ITENS.CODPROD FROM TGFCAB CAB JOIN ITENS ON ITENS.NUNOTA = CAB.NUNOTA',
    "select CODPROD, DTALTER from TGFPRO where DESCRPROD = 'DELETE; DROP' -- nunca INSERT\n;",
    'SELECT /* sem UPDATE */ "INTO", [EXEC] FROM TGFPRO',
  ]
  for (const sql of reads) assert.deepEqual(await broker.fetch(handler(), consult(sql)), answered(EXPECTED_NATIVE_CONSULT), sql)
  assert.deepEqual(fake.requests.filter(({ path }) => path === ROUTE).map(({ query, body }) => ({ query, body })), reads.map((sql) => ({
    query: { serviceName: QUERY, outputType: 'json' },
    body: { serviceName: QUERY, requestBody: { sql } },
  })))
  assert.equal(fake.nonReads(), 0)
})

test('a consult that is not one read is INPUT_REFUSED at the SQL before the credential or the network', async (t) => {
  const { fake, other, broker, store } = await setup(t)
  const keywords = ['INSERT', 'UPDATE', 'DELETE', 'MERGE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'GRANT', 'REVOKE', 'EXEC', 'EXECUTE', 'CALL', 'INTO', 'BEGIN', 'COMMIT',
    'DENY', 'WRITETEXT', 'UPDATETEXT', 'BACKUP', 'RESTORE', 'DBCC', 'SHUTDOWN', 'KILL', 'RECONFIGURE', 'OPENROWSET', 'OPENDATASOURCE', 'OPENQUERY']
  const writes = [
    ...keywords.map((keyword) => `WITH P AS (SELECT CODPROD FROM TGFPRO) SELECT CODPROD FROM P ${keyword} TGFPRO`),
    ...keywords.map((keyword) => `select codprod from tgfpro ${keyword.toLowerCase()}(1)`),
    'INSERT INTO TGFPRO (CODPROD) VALUES (1)',
    'UPDATE TGFPRO SET DESCRPROD = NULL',
    'SELECT CODPROD FROM TGFPRO; SELECT NUNOTA FROM TGFCAB',
    'SELECT CODPROD FROM TGFPRO;;',
    'SELECT CODPROD FROM TGFPRO -- só leitura\nDELETE FROM TGFPRO',
    'SELECT CODPROD FROM TGFPRO -- só leitura\rDELETE FROM TGFPRO',
    '/* só leitura */ DELETE FROM TGFPRO',
    'SELECT CODPROD INTO COPIA FROM TGFPRO',
    'SELECT CODPROD FROM TGFPRO DELETE FROM TGFPRO',
    'SELECT "A\'B" FROM TGFPRO; DELETE FROM TGFPRO --\'',
    "SELECT q'[x']' FROM TGFPRO; DELETE FROM TGFPRO --'",
    "SELECT 'sem fim FROM TGFPRO",
    'SELECT CODPROD FROM TGFPRO /* sem fim',
    '(SELECT CODPROD FROM TGFPRO)',
    'LOCK TABLE TGFPRO IN EXCLUSIVE MODE',
    '',
  ]
  for (const sql of writes) assert.deepEqual(await broker.fetch(handler(), consult(sql)), { ok: false, code: 'INPUT_REFUSED', issues: ['/body/requestBody/sql'] }, sql)
  const shapes = [{ sql: 1 }, { sql: 'SELECT 1 FROM DUAL', parameters: [] }, { dataSet: NATIVE_ORDER_DATASET }, 'SELECT 1 FROM DUAL']
  for (const requestBody of shapes) {
    assert.deepEqual(await broker.fetch(handler(), read({ query: { serviceName: QUERY, outputType: 'json' }, body: { serviceName: QUERY, requestBody } })), { ok: false, code: 'INPUT_REFUSED', issues: ['/body/requestBody'] }, JSON.stringify(requestBody))
  }
  const mismatched = read({ query: { serviceName: QUERY, outputType: 'json' }, body: { serviceName: LOAD, requestBody: { sql: 'SELECT 1 FROM DUAL' } } })
  assert.deepEqual(await broker.fetch(handler(), mismatched), { ok: false, code: 'SERVICE_REFUSED' })
  const unknown = read({ query: { serviceName: 'DbExplorerSP.executeUpdate', outputType: 'json' }, body: { serviceName: 'DbExplorerSP.executeUpdate', requestBody: { sql: 'SELECT 1 FROM DUAL' } } })
  assert.deepEqual(await broker.fetch(handler(), unknown), { ok: false, code: 'SERVICE_REFUSED' })
  assert.deepEqual([fake.requests.length, other.requests.length], [0, 0], 'no refusal reached either host, authentication included')
  assert.equal(store.calls.includes('readConnectionCredential'), false, 'no refusal read the credential')
})

test('a consult answer over the size limit is RESPONSE_TOO_LARGE with no vendor byte', async (t) => {
  const { fake, broker } = await setup(t)
  fake.mode.service = 'oversized'
  assert.deepEqual(await broker.fetch(handler(), consult('SELECT CODPROD FROM TGFPRO')), { ok: false, code: 'RESPONSE_TOO_LARGE', status: 200 })
})

test('P3: an absolute URL, and a path that resolves to another host or carries userinfo, a query or a fragment, are INPUT_REFUSED before the network', async (t) => {
  const { fake, other, broker } = await setup(t)
  const otherHost = other.origin.slice('http://'.length)
  const pinnedHost = fake.origin.slice('http://'.length)
  const absolute = [`${other.origin}${ROUTE}`, `${fake.origin}${ROUTE}`]
  const resolvedElsewhere = [`//${otherHost}${ROUTE}`, `\\\\${otherHost}${ROUTE}`, `/\\${otherHost}${ROUTE}`, `\\/${otherHost}${ROUTE}`]
    .flatMap((path) => [path, ` ${path}`, `\t${path}`])
  const onlyTheResolvedUrlShows = [
    ...resolvedElsewhere,
    `/\t/${otherHost}${ROUTE}`,
    `//user@${pinnedHost}${ROUTE}`,
    `${ROUTE}?serviceName=${LOAD}&outputType=json`,
    `${ROUTE}#fragment`,
  ]
  for (const path of onlyTheResolvedUrlShows) assert.equal(URL.canParse(path), false, `${JSON.stringify(path)} is not an absolute URL on its own`)
  for (const path of [...absolute, ...onlyTheResolvedUrlShows]) {
    assert.deepEqual(await broker.fetch(handler(), read({ path })), { ok: false, code: 'INPUT_REFUSED', issues: ['/path'] }, JSON.stringify(path))
  }
  assert.deepEqual([fake.requests.length, other.requests.length], [0, 0], 'no request reached either host, authentication included')

  assert.deepEqual(await broker.fetch(handler(), read({ path: 'gateway/v1/mge/../mge/service.sbr' })), ORDER_READ)
  assert.deepEqual(fake.requests.map(({ path, origin }) => [path, origin]), [['/authenticate', fake.origin], [ROUTE, fake.origin]])
  assert.deepEqual(other.requests, [])
})

test('P3: a request carrying a header, a URL, a Project or any other key, or a body over the limit, is INPUT_REFUSED with schema paths only', async (t) => {
  const { fake, other, broker } = await setup(t, { nativeLimits: { deadlineMs: 2000, responseBytes: 256 * 1024, requestBytes: 512 } })
  const cases = [
    [read({ headers: { authorization: 'Bearer consumer-token', host: 'elsewhere.test' } }), ['/<unrecognized>']],
    [read({ url: `${other.origin}${ROUTE}` }), ['/<unrecognized>']],
    [read({ project: OTHER_PROJECT, run: 'run-2' }), ['/<unrecognized>']],
    [read({ body: { serviceName: LOAD, padding: 'x'.repeat(600) } }), ['/body']],
    [read({ body: 1n }), ['/body']],
    [read({ connection: 7 }), ['/connection']],
    [undefined, ['/']],
  ]
  for (const [request, issues] of cases) {
    assert.deepEqual(await broker.fetch(handler(), request), { ok: false, code: 'INPUT_REFUSED', issues }, String(request?.connection))
  }
  assert.deepEqual([fake.requests.length, other.requests.length], [0, 0])
  assert.deepEqual(await broker.fetch(handler(), read()), ORDER_READ)
})

test('P6 and P8: another Project, a missing binding, a forged scope and a binding removed between two calls are NOT_GRANTED before the network', async (t) => {
  const store = memoryStore()
  const { fake, other, broker } = await setup(t, { store })
  const forged = { kind: 'handler', invocationId: 'x', scope: { projectId: PROJECT, environment: 'preview' } }
  assert.deepEqual(await broker.fetch(handler(OTHER_PROJECT), read()), { ok: false, code: 'NOT_GRANTED' })
  assert.deepEqual(await broker.fetch(handler(), read({ connection: 'crm' })), { ok: false, code: 'NOT_GRANTED' })
  assert.deepEqual(await broker.fetch(handler(), read({ connection: 'sankhya' })), { ok: false, code: 'NOT_GRANTED' }, 'the integrator id is not a binding name')
  assert.deepEqual(await broker.fetch(forged, read()), { ok: false, code: 'NOT_GRANTED' })
  assert.deepEqual(await broker.fetch(undefined, read()), { ok: false, code: 'NOT_GRANTED' })
  assert.deepEqual([fake.requests.length, other.requests.length], [0, 0])

  assert.deepEqual(await broker.fetch(handler(), read()), ORDER_READ)
  store.bindings[PROJECT] = []
  assert.deepEqual(await broker.fetch(handler(), read()), { ok: false, code: 'NOT_GRANTED' })
  assert.deepEqual(fake.requests.map(({ path }) => path), ['/authenticate', ROUTE], 'the removed binding sent nothing')
})

test('a binding to an unregistered integrator, or to one with no pinned destination, is CONNECTOR_UNCONFIGURED, and a failing store is PROVIDER_UNAVAILABLE', async (t) => {
  const store = memoryStore({ bindings: { [PROJECT]: [bound('erp', CONNECTION), bound('legacy', CONNECTION_A, 'unknown-erp')] } })
  const { fake, broker } = await setup(t, { store })
  assert.deepEqual(await broker.fetch(handler(), read({ connection: 'legacy' })), { ok: false, code: 'CONNECTOR_UNCONFIGURED' })
  const unpinned = createBroker({ connectors: [{ definition: sankhyaDefinition, adapter: null }], store, envelope, observability: connectorRecord().observability })
  assert.deepEqual(await unpinned.fetch(handler(), read()), { ok: false, code: 'CONNECTOR_UNCONFIGURED' })
  const failing = createBroker({
    connectors: [{ definition: sankhyaDefinition, adapter: createSankhyaGateway({ origin: fake.origin }) }],
    store: { ...store, listBindings: async () => { throw new Error('connection refused') } }, envelope, observability: connectorRecord().observability,
  })
  assert.deepEqual(await failing.fetch(handler(), read()), { ok: false, code: 'PROVIDER_UNAVAILABLE' })
  assert.equal(fake.requests.length, 0)
  assert.deepEqual(await broker.fetch(handler(), read()), ORDER_READ)
})

test('P5: an expired or revoked run scope is NOT_GRANTED, and a spent budget is CALL_LIMIT, each before the network', async (t) => {
  let clock = 1_000
  const { fake, broker } = await setup(t, { now: () => clock })
  const run = scopeForBuilderRun(PROJECT, { ttlMs: 60_000, calls: 5 }, 1_000)
  assert.deepEqual(await broker.fetch(agent(run), read()), ORDER_READ)
  clock = 60_999
  assert.deepEqual(await broker.fetch(agent(run), read()), ORDER_READ)
  clock = 61_000
  assert.deepEqual(await broker.fetch(agent(run), read()), { ok: false, code: 'NOT_GRANTED' }, 'expired at its ttl')
  assert.equal(fake.requests.filter(({ path }) => path === ROUTE).length, 2)

  clock = 1_000
  const revoked = scopeForBuilderRun(PROJECT, { ttlMs: 60_000, calls: 5 }, 1_000)
  assert.deepEqual(await broker.fetch(agent(revoked), read()), ORDER_READ)
  revokeScope(revoked)
  revokeScope(revoked)
  assert.deepEqual(await broker.fetch(agent(revoked), read()), { ok: false, code: 'NOT_GRANTED' })

  const budget = scopeForBuilderRun(PROJECT, { ttlMs: 60_000, calls: 1 }, 1_000)
  assert.deepEqual(await broker.fetch(agent(budget), read({ query: { serviceName: WRITE, outputType: 'json' } })), { ok: false, code: 'SERVICE_REFUSED' })
  assert.deepEqual(await broker.fetch(agent(budget), read()), ORDER_READ, 'a refused request spent nothing')
  assert.deepEqual(await broker.fetch(agent(budget), read()), { ok: false, code: 'CALL_LIMIT' })
  assert.equal(fake.requests.filter(({ path }) => path === ROUTE).length, 4)
})

test('P4: a vendor redirect is never followed: PROVIDER_ERROR with its status, and the target host counts zero requests', async (t) => {
  const { fake, other, broker } = await setup(t)
  fake.mode.service = 'redirect'
  fake.mode.redirectTo = other.origin
  assert.deepEqual(await broker.fetch(handler(), read()), { ok: false, code: 'PROVIDER_ERROR', status: 302 })
  assert.deepEqual(other.requests, [])
  assert.deepEqual(fake.requests.map(({ path }) => path), ['/authenticate', ROUTE])
})

test('P5: an answer over the size limit is RESPONSE_TOO_LARGE with no vendor byte; one within it is parsed', async (t) => {
  const { fake, broker, facts } = await setup(t, { nativeLimits: { deadlineMs: 2000, responseBytes: 1024, requestBytes: 64 * 1024 } })
  fake.mode.service = 'oversized'
  assert.deepEqual(await broker.fetch(handler(), read()), { ok: false, code: 'RESPONSE_TOO_LARGE', status: 200 })
  fake.mode.service = 'ok'
  assert.deepEqual(await broker.fetch(handler(), read()), ORDER_READ)
  const services = (await facts()).filter(({ name }) => name === LOAD).map(({ bytes, result }) => ({ bytes, result }))
  assert.deepEqual(services, [
    { bytes: undefined, result: 'RESPONSE_TOO_LARGE' },
    { bytes: Buffer.byteLength(JSON.stringify(EXPECTED_NATIVE_ORDER)), result: 'OK' },
  ])
})

test('P9: a vendor error inside a 200 is PROVIDER_ERROR with its status and body, never an empty success; an unreadable 200 is RESPONSE_REFUSED', async (t) => {
  const { fake, broker } = await setup(t)
  fake.mode.service = 'envelope-error'
  assert.deepEqual(await broker.fetch(handler(), read()), {
    ok: false, code: 'PROVIDER_ERROR', status: 200, vendorStatus: '0',
    body: { serviceName: LOAD, status: '0', statusMessage: `[CORE_E01234] Falha ${SECRET_MARKER}`, pendingPrinting: 'false' },
  })
  fake.mode.service = 'envelope-status-47'
  assert.deepEqual(await broker.fetch(handler(), read()), {
    ok: false, code: 'PROVIDER_ERROR', status: 200, vendorStatus: '47',
    body: { serviceName: LOAD, status: '47', statusMessage: `Falha ${SECRET_MARKER}`, pendingPrinting: 'false' },
  })
  fake.mode.service = 'not-json'
  assert.deepEqual(await broker.fetch(handler(), read()), { ok: false, code: 'RESPONSE_REFUSED', status: 200 })
})

test('P9: a bearer the vendor echoes is redacted from a parsed body in any JSON escape; over the size limit the answer is RESPONSE_TOO_LARGE with no vendor byte', async (t) => {
  const { fake, broker } = await setup(t, { tokenPrefix: 'fake/token/' })
  fake.mode.service = 'echo-bearer'
  const complete = await broker.fetch(handler(), read())
  const echoed = [...'fake/token/1'].map((character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`).join('')
  assert.deepEqual(complete, {
    ok: true, status: 200,
    bytes: Buffer.byteLength(`{"serviceName":"${LOAD}","status":"1","echo":"fake/token/1","escaped":"fake\\/token\\/1","unicode":"${echoed}","${echoed}":"key"}`),
    body: { serviceName: LOAD, status: '1', echo: '[redacted]', escaped: '[redacted]', unicode: '[redacted]', '[redacted]': 'key' },
  })

  const beforeUnicode = `{"serviceName":"${LOAD}","status":"1","echo":"fake/token/2","escaped":"fake\\/token\\/2","unicode":"`
  const cutInsideUnicode = beforeUnicode.length + '\\u0066\\u0061\\u006b\\u0065'.length
  const cutBroker = createBroker({
    connectors: [{ definition: sankhyaDefinition, adapter: createSankhyaGateway({ origin: fake.origin }) }],
    store: memoryStore(), envelope, observability: connectorRecord().observability,
    nativeLimits: { deadlineMs: 2000, responseBytes: cutInsideUnicode, requestBytes: 64 * 1024 },
  })
  const cut = await cutBroker.fetch(handler(), read())
  assert.deepEqual(cut, { ok: false, code: 'RESPONSE_TOO_LARGE', status: 200 })
  assert.equal(fake.requests.at(-1).authorization, 'Bearer fake/token/2', 'the cut answer echoed a live bearer')
  for (const leaked of ['fake/token/', 'fake\\/token', '\\u0066', 'u0066']) assert.equal(JSON.stringify([complete, cut]).includes(leaked), false, leaked)
})

test('P10: a refused token is reissued once; refused again it is CREDENTIAL_REFUSED with the vendor status', async (t) => {
  const once = await setup(t)
  once.fake.mode.service = 'refuse-first-token'
  assert.deepEqual(await once.broker.fetch(handler(), read()), ORDER_READ)
  assert.deepEqual(once.fake.requests.map(({ path, authorization }) => [path, authorization]), [
    ['/authenticate', null], [ROUTE, 'Bearer fake-token-1'], ['/authenticate', null], [ROUTE, 'Bearer fake-token-2'],
  ])

  const always = await setup(t)
  always.fake.mode.service = 401
  assert.deepEqual(await always.broker.fetch(handler(), read()), { ok: false, code: 'CREDENTIAL_REFUSED', status: 401 })
  assert.equal(always.fake.issued(), 2)

  const authentication = await setup(t)
  authentication.fake.mode.authenticate = 401
  assert.deepEqual(await authentication.broker.fetch(handler(), read()), { ok: false, code: 'CREDENTIAL_REFUSED' })
  assert.deepEqual(authentication.fake.requests.map(({ path }) => path), ['/authenticate'])
})

test('P9: a 5xx or 429 is PROVIDER_UNAVAILABLE, another 4xx is PROVIDER_ERROR, each with its status and none with a vendor body', async (t) => {
  const cases = [[500, 'PROVIDER_UNAVAILABLE'], [429, 'PROVIDER_UNAVAILABLE'], [400, 'PROVIDER_ERROR']]
  for (const [status, code] of cases) {
    const { fake, broker } = await setup(t)
    fake.mode.service = status
    const result = await broker.fetch(handler(), read())
    assert.deepEqual(result, { ok: false, code, status }, String(status))
    assert.equal(JSON.stringify(result).includes(SECRET_MARKER), false)
  }
  const unreachable = createBroker({
    connectors: [{ definition: sankhyaDefinition, adapter: createSankhyaGateway({ origin: 'http://127.0.0.1:9' }) }],
    store: memoryStore(), envelope, observability: connectorRecord().observability,
  })
  assert.deepEqual(await unreachable.fetch(handler(), read()), { ok: false, code: 'PROVIDER_UNAVAILABLE' })
})

test('P5: a stalled vendor ends at the deadline as PROVIDER_TIMEOUT, for the service request and for authentication', async (t) => {
  for (const mode of [{ service: 'stall' }, { authenticate: 'stall' }]) {
    const { fake, broker } = await setup(t, { nativeLimits: { deadlineMs: 300, responseBytes: 256 * 1024, requestBytes: 64 * 1024 } })
    Object.assign(fake.mode, mode)
    const started = Date.now()
    assert.deepEqual(await broker.fetch(handler(), read()), { ok: false, code: 'PROVIDER_TIMEOUT' }, JSON.stringify(mode))
    assert.ok(Date.now() - started < 2000, JSON.stringify(mode))
  }
})

test('P2: the records carry the binding name, the integrator and closed facts, never a path, query, body, value or token', async (t) => {
  const { fake, broker, facts, exporter, lines } = await setup(t)
  const scope = scopeForBuilderRun(PROJECT, { ttlMs: 60_000, calls: 5 })
  const marked = read({ body: { serviceName: LOAD, requestBody: { dataSet: { ...NATIVE_ORDER_DATASET, criteria: { expression: { $: 'this.CODPARC = ?' }, parameter: [{ $: 'MARKER-VALUE-5e1', type: 'S' }] } } } } })
  assert.deepEqual(await broker.fetch(agent(scope), read()), ORDER_READ)
  fake.mode.service = 'envelope-error'
  assert.equal((await broker.fetch(agent(scope), marked)).code, 'PROVIDER_ERROR')
  assert.deepEqual((await broker.fetch(agent(scope), read({ connection: 'crm-marker' }))).code, 'NOT_GRANTED')
  const call = { consumer: 'agent', projectId: PROJECT, connection: 'erp', connector: 'sankhya' }
  const errorAnswer = JSON.stringify({ serviceName: LOAD, status: '0', statusMessage: `[CORE_E01234] Falha ${SECRET_MARKER}`, pendingPrinting: 'false' })
  assert.deepEqual(await facts(), [
    { name: 'connector.fetch', root: true, error: false, ...call, result: 'OK' },
    { name: 'authenticate', root: false, error: false, ...call, step: 1, attempt: 1, httpStatus: 200, result: 'OK' },
    { name: LOAD, root: false, error: false, ...call, step: 2, attempt: 1, httpStatus: 200, bytes: Buffer.byteLength(JSON.stringify(EXPECTED_NATIVE_ORDER)), result: 'OK' },
    { name: 'connector.fetch', root: true, error: true, ...call, result: 'PROVIDER_ERROR' },
    { name: LOAD, root: false, error: true, ...call, step: 1, attempt: 1, httpStatus: 200, bytes: Buffer.byteLength(errorAnswer), result: 'PROVIDER_ERROR' },
    { name: 'connector.fetch', root: true, error: true, ...call, connection: null, connector: null, result: 'NOT_GRANTED' },
  ])
  const seen = JSON.stringify(exporter.events) + lines.join('')
  const forbidden = [ROUTE, 'service.sbr', 'outputType', 'CabecalhoNota', 'NUMNOTA', '22790', '9001', '1520.50', 'MARKER-VALUE-5e1', 'crm-marker', SECRET_MARKER, 'CORE_E01234', 'fake-token-', ...Object.values(FAKE_CREDENTIAL)]
  for (const value of forbidden) assert.equal(seen.includes(value), false, `${value} reached the record`)
})

test('the generic seam: a synthetic REST integrator\'s two Connections, bound as crm-a and crm-b, each reach only their own account', async (t) => {
  const rest = await startFakeRest()
  t.after(() => rest.close())
  const store = memoryStore({
    bindings: {
      [PROJECT]: [bound('crm-a', CONNECTION_A, REST_CONNECTOR_ID), bound('crm-b', CONNECTION_B, REST_CONNECTOR_ID)],
      [OTHER_PROJECT]: [bound('crm-a', CONNECTION_A, REST_CONNECTOR_ID)],
    },
    credentials: { [CONNECTION_A]: await sealedRest('account-a'), [CONNECTION_B]: await sealedRest('account-b') },
  })
  const { fake, broker } = await setup(t, { store, extra: [{ definition: restDefinition, adapter: createRestAdapter({ origin: rest.origin }) }] })
  const records = (connection) => ({ connection, method: 'GET', path: '/v1/records' })

  assert.deepEqual(await broker.fetch(handler(OTHER_PROJECT), records('crm-b')), { ok: false, code: 'NOT_GRANTED' })
  assert.deepEqual(await broker.fetch(handler(), { ...records('crm-a'), method: 'POST', body: { name: 'novo' } }), { ok: false, code: 'SERVICE_REFUSED' })
  assert.deepEqual(rest.requests, [], 'refused before the network')

  assert.deepEqual(await broker.fetch(handler(), records('crm-a')), answered({ account: 'account-a', records: [{ id: 'a-1', name: 'Registro A1' }] }))
  assert.deepEqual(await broker.fetch(handler(), records('crm-b')), answered({ account: 'account-b', records: [{ id: 'b-1', name: 'Registro B1' }, { id: 'b-2', name: 'Registro B2' }] }))
  assert.deepEqual(await broker.fetch(handler(OTHER_PROJECT), records('crm-a')), answered({ account: 'account-a', records: [{ id: 'a-1', name: 'Registro A1' }] }))
  assert.deepEqual(rest.requests.map(({ origin, method, path, account }) => [origin === rest.origin, method, path, account]), [
    [true, 'POST', '/oauth/token', null],
    [true, 'GET', '/v1/records', 'account-a'],
    [true, 'POST', '/oauth/token', null],
    [true, 'GET', '/v1/records', 'account-b'],
    [true, 'GET', '/v1/records', 'account-a'],
  ])
  assert.deepEqual(await broker.fetch(handler(OTHER_PROJECT), records('crm-b')), { ok: false, code: 'NOT_GRANTED' })
  assert.equal(rest.requests.length, 5)
  assert.deepEqual(fake.requests, [])
})
