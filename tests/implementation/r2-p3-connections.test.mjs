import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import pg from 'pg'
import { runHubMigrations, runR2HubMigrations } from '../../scripts/run-hub-migrations.mjs'
import { canonicalBytes, sha256 as canonicalSha256 } from '../../packages/canonical-json/src/index.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r2-p3-build-'))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', buildRoot,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`R2_P3_HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
process.once('exit', () => rmSync(buildRoot, { recursive: true, force: true }))

const built = (path) => pathToFileURL(resolve(buildRoot, path)).href
const { createConnectionModule } = await import(built('connections/module.js'))
const { createConnectionStore } = await import(built('connections/store.js'))
const { qualifySankhyaOm } = await import(built('connections/qualification.js'))
const { createHttpApp } = await import(built('http/app.js'))
const { readHubConfig } = await import(built('platform/config.js'))
const { createEncryptedFileCredentialBackend } = await import(built('platform/credential-backend.js'))

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222'
const WORKSPACE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CONNECTION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const REVISION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const QUALIFICATION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const ORIGIN = 'https://conexus.test'
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

const createCredentialFixture = () => {
  const fixture = mkdtempSync(resolve(tmpdir(), 'conexus-r2-p3-credentials-'))
  const root = resolve(fixture, 'ciphertext')
  const keyFile = resolve(fixture, 'root-key')
  mkdirSync(root, { mode: 0o700 })
  writeFileSync(keyFile, `${randomBytes(32).toString('base64')}\n`, { mode: 0o600 })
  return { fixture, root, keyFile }
}

const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())

const standInAdmission = Object.freeze({
  schemaId: 'local-transport-stand-in/v1',
  decodeBearer(value) {
    return exactKeys(value, ['standInBearer']) && typeof value.standInBearer === 'string'
      ? value.standInBearer
      : null
  },
  decodeCompany(value, expectedCompanyCode) {
    return exactKeys(value, ['standInCompanyCode']) && Number.isInteger(value.standInCompanyCode)
      ? value.standInCompanyCode === expectedCompanyCode ? 'MATCH' : 'MISMATCH'
      : null
  },
})

test('R2-P3 production files and migration declare only the exact Connection tranche', () => {
  const migration = readFileSync(resolve(repositoryRoot, 'apps/hub/migrations/011_r2_brain_connections.sql'), 'utf8')
  for (const permission of ['can_read_connection', 'can_manage_connection', 'can_qualify_connection']) {
    assert.match(migration, new RegExp(`${permission} boolean NOT NULL DEFAULT false`))
  }
  // P4 stores its independent specialist facts; P3 still grants no use ingress.
  assert.doesNotMatch(migration, /admit_connection_use/)
  assert.match(migration, /CREATE ROLE hub_r2_connections LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS/)
  assert.match(migration, /credential_generation_high_watermark/)
  assert.match(migration, /settlement_state IN \('RESERVED', 'SETTLED', 'ABANDONED'\)/)
  assert.match(migration, /CREATE TABLE con\.operation_receipt/)
  for (const operation of ['CON-05', 'CON-07', 'CON-08']) assert.match(migration, new RegExp(`'${operation}'`))
  for (const name of [
    'list_connections', 'get_connection', 'create_or_replay_connection', 'revise_connection',
    'reserve_connection_credential', 'settle_connection_credential',
    'reserve_connection_qualification', 'settle_connection_qualification', 'get_connection_qualification',
  ]) assert.match(migration, new RegExp(`CREATE FUNCTION con\\.${name}\\(`))
  for (const path of ['connections/store.ts', 'connections/routes.ts', 'connections/module.ts', 'connections/qualification.ts']) {
    assert.doesNotThrow(() => readFileSync(resolve(repositoryRoot, 'apps/hub/src', path)))
  }
  const server = readFileSync(resolve(repositoryRoot, 'apps/hub/src/server.ts'), 'utf8')
  assert.match(server, /createConfiguredConnectionModule/)
  assert.match(server, /registerConnectionRoutes/)
  assert.doesNotMatch(server, /PRJ-1[0-5]|Gateway|Mastra.*Connection/)
})

test('R2-P3 configuration is all-or-nothing and selects the exact runtime capability', () => {
  const base = {
    NODE_ENV: 'test',
    CONEXUS_ORIGIN: ORIGIN,
    CONEXUS_BOOTSTRAP_SUBJECT: 'operator',
    CONEXUS_DB_HOST: '127.0.0.1',
    CONEXUS_DB_PORT: '5432',
    CONEXUS_DB_NAME: 'conexus',
    CONEXUS_DB_USER: 'hub_iam_runtime',
    CONEXUS_DB_PASSWORD_FILE: '/secrets/iam',
    CONEXUS_OIDC_ISSUER: 'https://issuer.test',
    CONEXUS_OIDC_CLIENT_ID: 'hub',
    CONEXUS_OIDC_CLIENT_SECRET_FILE: '/secrets/oidc',
  }
  assert.equal(readHubConfig(base).connections, undefined)
  assert.throws(() => readHubConfig({ ...base, CONEXUS_DB_R2_CONNECTIONS_PASSWORD_FILE: '/secrets/con' }),
    /MISSING_CONFIG_CONEXUS_CONNECTION_CREDENTIAL_ROOT/)
  assert.deepEqual(readHubConfig({
    ...base,
    CONEXUS_DB_R2_CONNECTIONS_PASSWORD_FILE: '/secrets/con',
    CONEXUS_CONNECTION_CREDENTIAL_ROOT: '/credentials',
    CONEXUS_CONNECTION_CREDENTIAL_KEY_FILE: '/keys/root',
    CONEXUS_CONNECTION_CREDENTIAL_KEY_GENERATION: 'key-1',
  }).connections, {
    passwordFile: '/secrets/con',
    credentialRoot: '/credentials',
    credentialKeyFile: '/keys/root',
    credentialKeyGeneration: 'key-1',
  })
})

test('R2-P3 credential idempotency uses keyed context and reconciles immutable ciphertext only', async (t) => {
  const fixture = createCredentialFixture()
  t.after(() => rmSync(fixture.fixture, { recursive: true, force: true }))
  const backend = createEncryptedFileCredentialBackend({
    root: fixture.root, keyFile: fixture.keyFile, keyGeneration: 'key-1',
  })
  const first = Buffer.from('{"clientId":"id","clientSecret":"secret","xToken":"token"}')
  const second = Buffer.from('{"clientId":"id","clientSecret":"other","xToken":"token"}')
  const firstDigest = backend.idempotencyDigest(CONNECTION_ID, first)
  assert.match(firstDigest, /^[a-f0-9]{64}$/)
  assert.equal(firstDigest, backend.idempotencyDigest(CONNECTION_ID, first))
  assert.notEqual(firstDigest, sha256(first))
  assert.notEqual(firstDigest, backend.idempotencyDigest(CONNECTION_ID, second))
  assert.equal(await backend.publishOrMatch({ connectionId: CONNECTION_ID, generation: '1' }, first), 'PUBLISHED')
  assert.equal(await backend.publishOrMatch({ connectionId: CONNECTION_ID, generation: '1' }, first), 'MATCHED_EXISTING')
  await assert.rejects(
    backend.publishOrMatch({ connectionId: CONNECTION_ID, generation: '1' }, second),
    /CREDENTIAL_GENERATION_CONFLICT/,
  )
  assert.deepEqual(await backend.materialize({ connectionId: CONNECTION_ID, generation: '1' }), first)

  const custodyFailureStore = createConnectionStore({
    pool: { connect: async () => { throw new Error('DATABASE_MUST_NOT_BE_REACHED') } },
    credentialBackend: {
      keyGeneration: 'key-1',
      idempotencyDigest: () => { throw new Error('CREDENTIAL_ROOT_REFUSED') },
      publishOrMatch: async () => { throw new Error('CREDENTIAL_WRITE_MUST_NOT_BE_REACHED') },
      write: async () => { throw new Error('CREDENTIAL_WRITE_MUST_NOT_BE_REACHED') },
      materialize: async () => { throw new Error('CREDENTIAL_READ_MUST_NOT_BE_REACHED') },
    },
  })
  await assert.rejects(custodyFailureStore.setConnectionCredential({
    accountId: ACCOUNT_ID,
    connectionId: CONNECTION_ID,
    idempotencyKey: 'custody-failure',
    body: { credential: { clientId: 'id', clientSecret: 'secret', xToken: 'token' } },
  }), /CREDENTIAL_ROOT_REFUSED/)
})

const startProviderStandIn = async (t) => {
  const attempts = []
  let mode = 'PASS'
  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    attempts.push({ method: request.method, url: request.url, headers: request.headers, body: Buffer.concat(chunks).toString('utf8') })
    response.setHeader('content-type', mode === 'MEDIA_TYPE' ? 'text/plain' : 'application/json; charset=utf-8')
    if (mode === 'REDIRECT' || mode === 'COMPANY_REDIRECT' && request.url !== '/authenticate') {
      response.statusCode = 302
      response.setHeader('location', 'https://attacker.invalid/')
      return response.end('{}')
    }
    if (mode === 'UNAVAILABLE') {
      response.statusCode = 503
      return response.end('{"unavailable":true}')
    }
    if (request.url === '/authenticate') {
      if (mode === 'TIMEOUT') {
        return setTimeout(() => {
          if (!response.destroyed) response.end('{"standInBearer":"late"}')
        }, 10_100)
      }
      if (mode === 'DECLARED_OVERSIZE') {
        response.setHeader('content-length', String(16 * 1024 + 1))
        return response.end()
      }
      if (mode === 'STREAM_OVERSIZE') {
        return response.end(JSON.stringify({ padding: 'x'.repeat(16 * 1024) }))
      }
      if (mode === 'DEPTH') {
        let value = 'leaf'
        for (let depth = 0; depth < 17; depth += 1) value = { nested: value }
        return response.end(JSON.stringify(value))
      }
      if (mode === 'NODES') return response.end(JSON.stringify(Array.from({ length: 4_097 }, () => null)))
      if (mode === 'INVALID_UTF8') return response.end(Buffer.from([0xff]))
      if (mode === 'BEARER_OVERSIZE') return response.end(JSON.stringify({ standInBearer: 'x'.repeat(8 * 1024 + 1) }))
      return response.end(mode === 'ALIASED' ? '{"access_token":"guessed"}' : '{"standInBearer":"stand-in-token"}')
    }
    return response.end(mode === 'MISMATCH'
      ? '{"standInCompanyCode":2}'
      : '{"standInCompanyCode":1}')
  })
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  t.after(() => new Promise((resolveClose) => server.close(resolveClose)))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('LOCAL_STAND_IN_ADDRESS_INVALID')
  const localOrigin = `http://127.0.0.1:${address.port}`
  const fetchImpl = async (input, init) => {
    const requested = new URL(String(input))
    assert.equal(requested.origin, 'https://api.sandbox.sankhya.com.br')
    return fetch(`${localOrigin}${requested.pathname}`, init)
  }
  return { attempts, fetchImpl, setMode: (value) => { mode = value } }
}

test('R2-P3 real local HTTP stand-in proves bounded transport mechanics, never live Sankhya', async (t) => {
  const fixture = createCredentialFixture()
  t.after(() => rmSync(fixture.fixture, { recursive: true, force: true }))
  const backend = createEncryptedFileCredentialBackend({
    root: fixture.root, keyFile: fixture.keyFile, keyGeneration: 'key-1',
  })
  const coordinate = { connectionId: CONNECTION_ID, generation: '1' }
  await backend.write(coordinate, Buffer.from(JSON.stringify({ clientId: 'id', clientSecret: 'secret', xToken: 'x-token' })))
  const standIn = await startProviderStandIn(t)
  const input = {
    configuration: { environment: 'SANDBOX', companyCode: 1 },
    credentialCoordinate: coordinate,
    credentialBackend: backend,
    responseAdmission: standInAdmission,
    fetchImpl: standIn.fetchImpl,
  }
  const passed = await qualifySankhyaOm(input)
  assert.equal(passed.outcome, 'PASSED')
  assert.equal(passed.qualificationState, 'PROVIDER_CONFIRMED')
  assert.equal(standIn.attempts.length, 2)
  assert.deepEqual(standIn.attempts.map(({ method, url }) => ({ method, url })), [
    { method: 'POST', url: '/authenticate' },
    { method: 'GET', url: '/v1/empresas/1' },
  ])
  assert.equal(standIn.attempts[0].headers['x-token'], 'x-token')
  assert.match(standIn.attempts[0].body, /grant_type=client_credentials/)
  assert.equal(standIn.attempts[1].headers.authorization, 'Bearer stand-in-token')
  assert.equal(JSON.stringify(passed).includes('secret'), false)
  assert.equal(JSON.stringify(passed).includes('stand-in-token'), false)

  standIn.attempts.length = 0
  const unadmitted = await qualifySankhyaOm({ ...input, responseAdmission: undefined })
  assert.equal(unadmitted.outcome, 'INDETERMINATE')
  assert.equal(unadmitted.qualificationState, 'PROVIDER_SCHEMA_UNPROVEN')
  assert.equal(standIn.attempts.length, 0)
  const productionNoEgress = await qualifySankhyaOm({
    configuration: { environment: 'PRODUCTION', companyCode: 1 },
    credentialCoordinate: coordinate,
    credentialBackend: {
      keyGeneration: 'key-1',
      idempotencyDigest: () => { throw new Error('CREDENTIAL_DIGEST_MUST_NOT_BE_REACHED') },
      publishOrMatch: async () => { throw new Error('CREDENTIAL_WRITE_MUST_NOT_BE_REACHED') },
      write: async () => { throw new Error('CREDENTIAL_WRITE_MUST_NOT_BE_REACHED') },
      materialize: async () => { throw new Error('CREDENTIAL_READ_MUST_NOT_BE_REACHED') },
    },
    fetchImpl: async () => { throw new Error('PRODUCTION_EGRESS_MUST_NOT_BE_REACHED') },
  })
  assert.equal(productionNoEgress.qualificationState, 'PROVIDER_SCHEMA_UNPROVEN')

  for (const [mode, expectedOutcome, expectedAttempts] of [
    ['ALIASED', 'INDETERMINATE', 1],
    ['MISMATCH', 'FAILED', 2],
    ['REDIRECT', 'INDETERMINATE', 1],
    ['COMPANY_REDIRECT', 'INDETERMINATE', 2],
    ['UNAVAILABLE', 'INDETERMINATE', 1],
    ['MEDIA_TYPE', 'INDETERMINATE', 1],
    ['DECLARED_OVERSIZE', 'INDETERMINATE', 1],
    ['STREAM_OVERSIZE', 'INDETERMINATE', 1],
    ['DEPTH', 'INDETERMINATE', 1],
    ['NODES', 'INDETERMINATE', 1],
    ['INVALID_UTF8', 'INDETERMINATE', 1],
    ['BEARER_OVERSIZE', 'INDETERMINATE', 1],
    ['TIMEOUT', 'INDETERMINATE', 1],
  ]) {
    standIn.attempts.length = 0
    standIn.setMode(mode)
    const result = await qualifySankhyaOm(input)
    assert.equal(result.outcome, expectedOutcome)
    assert.equal(standIn.attempts.length, expectedAttempts)
  }
})

const summary = Object.freeze({
  connectionId: CONNECTION_ID,
  name: 'Sankhya Finance',
  ownerScopeKind: 'WORKSPACE',
  ownerId: WORKSPACE_ID,
  connectorDefinitionId: 'sankhya-om',
  connectorVersion: '1.0.0',
  currentRevisionId: REVISION_ID,
  credentialConfigured: true,
  connectionTest: Object.freeze({
    state: 'PASSED', qualificationId: QUALIFICATION_ID, environment: 'SANDBOX', testedAt: '2026-09-04T00:00:00.000Z',
  }),
})
const qualificationDto = Object.freeze({
  qualificationId: QUALIFICATION_ID,
  connectionId: CONNECTION_ID,
  connectionRevisionId: REVISION_ID,
  credentialGeneration: '1',
  environment: 'SANDBOX',
  qualificationState: 'PROVIDER_CONFIRMED',
  outcome: 'PASSED',
  testedAt: '2026-09-04T00:00:00.000Z',
  diagnostic: Object.freeze({ title: 'Connection test passed', message: 'Exact stand-in basis passed.' }),
  evidenceRefs: Object.freeze(['local-transport-stand-in:v1']),
})
const connectorDto = Object.freeze({
  connectorDefinitionId: 'sankhya-om', connectorVersion: '1.0.0', provider: 'Sankhya API',
  configurationSchema: Object.freeze({ type: 'object' }),
  credentialInputSchema: Object.freeze({ type: 'object' }),
  operationIds: Object.freeze(['sankhya.company.read.v1']),
  environments: Object.freeze(['SANDBOX', 'PRODUCTION']),
})

const createRouteControl = (overrides = {}) => {
  const calls = []
  const found = (value) => ({ status: 'FOUND', value })
  const store = {
    async listConnectorDefinitions(input) { calls.push(['CON-01', input]); return found([{ connectorDefinitionId: 'sankhya-om', connectorVersion: '1.0.0', provider: 'Sankhya API' }]) },
    async getConnectorDefinition(input) { calls.push(['CON-02', input]); return found(connectorDto) },
    async listConnections(input) { calls.push(['CON-03', input]); return found([summary]) },
    async getConnection(input) { calls.push(['CON-04', input]); return found({ ...summary, configuration: { environment: 'SANDBOX', companyCode: 1 } }) },
    async createConnection(input) { calls.push(['CON-05', input]); return found(summary) },
    async reviseConnection(input) { calls.push(['CON-06', input]); return found({ connectionId: CONNECTION_ID, connectionRevisionId: REVISION_ID, connectorDefinitionId: 'sankhya-om', connectorVersion: '1.0.0' }) },
    async setConnectionCredential(input) { calls.push(['CON-07', input]); return found(undefined) },
    async qualifyConnection(input) { calls.push(['CON-08', input]); return found(qualificationDto) },
    async getConnectionQualification(input) { calls.push(['CON-09', input]); return found(qualificationDto) },
    ...overrides,
  }
  return { calls, store }
}

const createRouteApp = async (t, { control = createRouteControl(), session = { account: { accountId: ACCOUNT_ID } } } = {}) => {
  const module = createConnectionModule({
    store: control.store,
    origin: ORIGIN,
    resolveCurrentSession: async () => session,
  })
  const app = await createHttpApp({ staticRoot: null, registerRoutes: (server) => module.registerConnectionRoutes(server) })
  t.after(async () => { await app.close(); await module.close() })
  return { app, control }
}

const authenticHeaders = Object.freeze({
  origin: ORIGIN,
  'x-conexus-csrf': 'csrf-token',
  cookie: '__Host-conexus_csrf=csrf-token',
  'idempotency-key': 'request-key',
  'content-type': 'application/json',
})

test('R2-P3 local route control projects exact CON-01..09 HTTP contracts and no credential response', async (t) => {
  const { app, control } = await createRouteApp(t)
  assert.deepEqual(app.routeCensus(), ['CON-01', 'CON-02', 'CON-03', 'CON-04', 'CON-05', 'CON-06', 'CON-07', 'CON-08', 'CON-09'])
  const requests = [
    ['GET', '/api/control/connectors'],
    ['GET', '/api/control/connectors/sankhya-om'],
    ['GET', `/api/control/connection-scopes/WORKSPACE/${WORKSPACE_ID}/connections`],
    ['GET', `/api/control/connections/${CONNECTION_ID}`],
    ['POST', `/api/control/connection-scopes/WORKSPACE/${WORKSPACE_ID}/connections`, {
      name: 'Sankhya Finance', connectorDefinitionId: 'sankhya-om', connectorVersion: '1.0.0',
      configuration: { environment: 'SANDBOX', companyCode: 1 },
    }],
    ['POST', `/api/control/connections/${CONNECTION_ID}/revisions`, {
      expectedCurrentRevisionId: REVISION_ID, configuration: { environment: 'SANDBOX', companyCode: 2 },
    }],
    ['PUT', `/api/control/connections/${CONNECTION_ID}/credential`, {
      credential: { clientId: 'client', clientSecret: 'top-secret', xToken: 'x-token' },
    }],
    ['POST', `/api/control/connections/${CONNECTION_ID}/qualifications`, {
      connectionRevisionId: REVISION_ID, environment: 'SANDBOX',
    }],
    ['GET', `/api/control/connections/${CONNECTION_ID}/qualifications/${QUALIFICATION_ID}`],
    ['GET', `/api/control/connection-scopes/WORKSPACE/${WORKSPACE_ID}/connections?forProjectId=${REVISION_ID}`],
  ]
  const responses = []
  for (const [method, url, payload] of requests) {
    responses.push(await app.inject({
      method, url,
      ...(payload ? { headers: authenticHeaders, payload } : {}),
    }))
  }
  assert.deepEqual(responses.map(({ statusCode }) => statusCode), [200, 200, 200, 200, 201, 201, 204, 201, 200, 200])
  assert.equal(responses[6].body, '')
  for (const response of responses) {
    assert.equal(response.body.includes('top-secret'), false)
    assert.equal(response.body.includes('x-token'), false)
  }
  assert.deepEqual(control.calls.map(([owner]) => owner), [
    'CON-01', 'CON-02', 'CON-03', 'CON-04', 'CON-05', 'CON-06', 'CON-07', 'CON-08', 'CON-09', 'CON-03',
  ])
  assert.deepEqual(control.calls.at(-1), ['CON-03', {
    accountId: ACCOUNT_ID, ownerScopeKind: 'WORKSPACE', ownerId: WORKSPACE_ID, forProjectId: REVISION_ID,
  }])
})

test('R2-P3 routes fail closed on authentication, authenticity, purpose-bound P4 and exact status algebra', async (t) => {
  const unauthenticated = await createRouteApp(t, { session: null })
  assert.equal((await unauthenticated.app.inject({ method: 'GET', url: '/api/control/connectors' })).statusCode, 401)

  const normal = await createRouteApp(t)
  assert.equal((await normal.app.inject({
    method: 'POST', url: `/api/control/connection-scopes/WORKSPACE/${WORKSPACE_ID}/connections`,
    headers: { ...authenticHeaders, origin: 'https://attacker.invalid' },
    payload: { name: 'Denied', connectorDefinitionId: 'sankhya-om', connectorVersion: '1.0.0', configuration: { environment: 'SANDBOX', companyCode: 1 } },
  })).statusCode, 403)

  const purpose = createRouteControl({
    async listConnections() { return { status: 'DENIED' } },
  })
  const purposeApp = await createRouteApp(t, { control: purpose })
  assert.equal((await purposeApp.app.inject({
    method: 'GET',
    url: `/api/control/connection-scopes/WORKSPACE/${WORKSPACE_ID}/connections?forProjectId=${REVISION_ID}`,
  })).statusCode, 403)

  for (const [status, expected] of [
    ['DENIED', 403], ['NOT_FOUND', 404], ['CONFLICT', 409], ['STALE', 412], ['INVALID', 422], ['UNAVAILABLE', 503],
  ]) {
    const control = createRouteControl({ async qualifyConnection() { return { status } } })
    const candidate = await createRouteApp(t, { control })
    const response = await candidate.app.inject({
      method: 'POST', url: `/api/control/connections/${CONNECTION_ID}/qualifications`,
      headers: authenticHeaders,
      payload: { connectionRevisionId: REVISION_ID, environment: 'SANDBOX' },
    })
    assert.equal(response.statusCode, expected)
  }
})

const databaseConfigured = [
  'CONEXUS_TEST_DB_HOST', 'CONEXUS_TEST_DB_PORT', 'CONEXUS_TEST_DB_NAME',
  'CONEXUS_TEST_DB_USER', 'CONEXUS_TEST_DB_PASSWORD',
].every((name) => process.env[name])

const quoteIdentifier = (value) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('UNSAFE_TEST_IDENTIFIER')
  return `"${value}"`
}

test('R2-P3 real PostgreSQL + production backend prove lifecycle, scope grants and orphan recovery', {
  skip: databaseConfigured ? false : 'real PostgreSQL configuration not supplied',
}, async (t) => {
  const { Client, Pool } = pg
  const adminConfig = {
    host: process.env.CONEXUS_TEST_DB_HOST,
    port: Number(process.env.CONEXUS_TEST_DB_PORT),
    database: process.env.CONEXUS_TEST_DB_NAME,
    user: process.env.CONEXUS_TEST_DB_USER,
    password: process.env.CONEXUS_TEST_DB_PASSWORD,
  }
  const database = `conexus_r2_p3_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`
  const runtimePassword = randomBytes(24).toString('hex')
  const admin = new Client(adminConfig)
  await admin.connect()
  await admin.query(`CREATE DATABASE ${quoteIdentifier(database)}`)
  let fresh
  let runtimePool
  const fixture = createCredentialFixture()
  t.after(async () => {
    await runtimePool?.end().catch(() => undefined)
    await fresh?.end().catch(() => undefined)
    rmSync(fixture.fixture, { recursive: true, force: true })
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [database]).catch(() => undefined)
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)}`).catch(() => undefined)
    await admin.end()
  })
  const connectionString = `postgresql://${encodeURIComponent(adminConfig.user)}:${encodeURIComponent(adminConfig.password)}@${adminConfig.host}:${adminConfig.port}/${database}`
  await runHubMigrations({ connectionString })
  fresh = new Client({ ...adminConfig, database })
  await fresh.connect()

  const projectId = randomUUID()
  const foreignWorkspaceId = randomUUID()
  const foreignProjectId = randomUUID()
  const nonMemberAccountId = randomUUID()
  await fresh.query(`
    INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
    VALUES ($1, 'https://issuer.test', 'creator', 'Creator'),
      ($2, 'https://issuer.test', 'manager', 'Manager'),
      ($3, 'https://issuer.test', 'outsider', 'Outsider')
  `, [ACCOUNT_ID, OTHER_ACCOUNT_ID, nonMemberAccountId])
  await fresh.query(`
    INSERT INTO workspace.workspace(workspace_id, name)
    VALUES ($1, $2), ($3, $4)
  `, [WORKSPACE_ID, 'Finance', foreignWorkspaceId, 'Foreign Finance'])
  await fresh.query(`
    INSERT INTO iam.workspace_membership(account_id, workspace_id, can_create_project)
    VALUES ($1, $3, true), ($2, $3, false)
  `, [ACCOUNT_ID, OTHER_ACCOUNT_ID, WORKSPACE_ID])
  await fresh.query(`
    INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision)
    VALUES ($1, $2, 'Budget Analyzer', 'NEW', 'source-1', 'project-1'),
      ($3, $4, 'Foreign Analyzer', 'NEW', 'foreign-source-1', 'foreign-project-1')
  `, [projectId, WORKSPACE_ID, foreignProjectId, foreignWorkspaceId])
  await fresh.query(`
    INSERT INTO iam.account_project_grant(account_id, project_id, can_read, can_manage)
    VALUES ($1, $2, true, true)
  `, [ACCOUNT_ID, projectId])

  await runR2HubMigrations({ connectionString })
  const backfill = (await fresh.query(`
    SELECT account_id, can_read_connection, can_manage_connection, can_qualify_connection
    FROM iam.workspace_membership ORDER BY account_id
  `)).rows
  assert.deepEqual(backfill, [
    { account_id: ACCOUNT_ID, can_read_connection: true, can_manage_connection: true, can_qualify_connection: true },
    { account_id: OTHER_ACCOUNT_ID, can_read_connection: false, can_manage_connection: false, can_qualify_connection: false },
  ])
  assert.deepEqual((await fresh.query(`
    SELECT can_read_connection, can_manage_connection, can_qualify_connection
    FROM iam.account_project_grant WHERE account_id = $1 AND project_id = $2
  `, [ACCOUNT_ID, projectId])).rows, [{
    can_read_connection: true, can_manage_connection: true, can_qualify_connection: true,
  }])
  await fresh.query(`
    UPDATE iam.account_project_grant
    SET can_bind_brain = true, can_use_connection = true
    WHERE account_id = $1 AND project_id = $2
  `, [ACCOUNT_ID, projectId])
  await fresh.query(`
    INSERT INTO iam.account_project_grant (
      account_id, project_id, can_read, can_manage,
      can_read_connection, can_manage_connection, can_qualify_connection,
      can_bind_brain, can_use_connection
    ) VALUES ($1, $2, true, true, false, false, false, false, false)
  `, [OTHER_ACCOUNT_ID, projectId])
  await fresh.query(`ALTER ROLE hub_r2_connections PASSWORD '${runtimePassword}'`)

  runtimePool = new Pool({
    host: adminConfig.host, port: adminConfig.port, database,
    user: 'hub_r2_connections', password: runtimePassword,
    max: 3,
  })
  const backend = createEncryptedFileCredentialBackend({
    root: fixture.root, keyFile: fixture.keyFile, keyGeneration: 'key-1',
  })
  const standIn = await startProviderStandIn(t)
  let providerInvocations = 0
  const providerQualifier = async ({ configuration, connectionId, credentialGeneration, credentialBackend }) => {
    providerInvocations += 1
    return qualifySankhyaOm({
      configuration,
      credentialCoordinate: { connectionId, generation: credentialGeneration },
      credentialBackend,
      responseAdmission: standInAdmission,
      fetchImpl: standIn.fetchImpl,
    })
  }
  const store = createConnectionStore({ pool: runtimePool, credentialBackend: backend, qualifier: providerQualifier })

  assert.equal((await store.listConnectorDefinitions({ accountId: ACCOUNT_ID })).status, 'FOUND')
  assert.equal((await store.listConnectorDefinitions({ accountId: OTHER_ACCOUNT_ID })).status, 'DENIED')
  assert.equal((await store.listConnections({
    accountId: OTHER_ACCOUNT_ID, ownerScopeKind: 'WORKSPACE', ownerId: WORKSPACE_ID,
  })).status, 'DENIED')
  assert.equal((await store.listConnections({
    accountId: nonMemberAccountId, ownerScopeKind: 'WORKSPACE', ownerId: WORKSPACE_ID,
  })).status, 'NOT_FOUND')
  const createBody = {
    name: 'Sankhya Finance', connectorDefinitionId: 'sankhya-om', connectorVersion: '1.0.0',
    configuration: { environment: 'SANDBOX', companyCode: 1 },
  }
  const created = await store.createConnection({
    accountId: ACCOUNT_ID, ownerScopeKind: 'WORKSPACE', ownerId: WORKSPACE_ID,
    idempotencyKey: 'create-1', body: createBody,
  })
  assert.equal(created.status, 'FOUND')
  assert.equal(created.reentry, 'NEW')
  const connectionId = created.value.connectionId
  const revisionId = created.value.currentRevisionId
  const replayed = await store.createConnection({
    accountId: ACCOUNT_ID, ownerScopeKind: 'WORKSPACE', ownerId: WORKSPACE_ID,
    idempotencyKey: 'create-1', body: createBody,
  })
  assert.equal(replayed.status, 'FOUND')
  assert.equal(replayed.reentry, 'SETTLED')
  assert.equal(replayed.value.connectionId, connectionId)
  assert.equal((await store.createConnection({
    accountId: ACCOUNT_ID, ownerScopeKind: 'WORKSPACE', ownerId: WORKSPACE_ID,
    idempotencyKey: 'create-1', body: { ...createBody, name: 'Changed' },
  })).status, 'CONFLICT')

  const projectConnection = await store.createConnection({
    accountId: ACCOUNT_ID, ownerScopeKind: 'PROJECT', ownerId: projectId,
    idempotencyKey: 'project-create', body: { ...createBody, name: 'Project-private Sankhya' },
  })
  assert.equal(projectConnection.status, 'FOUND')
  assert.equal(projectConnection.value.ownerScopeKind, 'PROJECT')
  assert.equal(projectConnection.value.ownerId, projectId)

  // CON-03 purpose-bound selection is admitted by the exact Project grant and
  // specialist fact, not generic connection.read. Both owner scopes are
  // accepted for the same Project and return the existing lightweight DTO.
  await fresh.query(`
    UPDATE iam.workspace_membership
    SET can_read_connection = false
    WHERE account_id = $1 AND workspace_id = $2
  `, [ACCOUNT_ID, WORKSPACE_ID])
  await fresh.query(`
    UPDATE iam.account_project_grant
    SET can_read_connection = false
    WHERE account_id = $1 AND project_id = $2
  `, [ACCOUNT_ID, projectId])
  assert.equal((await store.listConnections({
    accountId: ACCOUNT_ID, ownerScopeKind: 'WORKSPACE', ownerId: WORKSPACE_ID,
  })).status, 'DENIED')
  assert.equal((await store.listConnections({
    accountId: ACCOUNT_ID, ownerScopeKind: 'PROJECT', ownerId: projectId,
  })).status, 'DENIED')
  const purposeWorkspace = await store.listConnections({
    accountId: ACCOUNT_ID, ownerScopeKind: 'WORKSPACE', ownerId: WORKSPACE_ID, forProjectId: projectId,
  })
  const purposeProject = await store.listConnections({
    accountId: ACCOUNT_ID, ownerScopeKind: 'PROJECT', ownerId: projectId, forProjectId: projectId,
  })
  assert.equal(purposeWorkspace.status, 'FOUND')
  assert.equal(purposeProject.status, 'FOUND')
  assert.equal(purposeWorkspace.value.length, 1)
  assert.equal(purposeProject.value.length, 1)
  for (const candidate of [purposeWorkspace.value[0], purposeProject.value[0]]) {
    assert.deepEqual(Object.keys(candidate).sort(), [
      'connectionId', 'name', 'ownerScopeKind', 'ownerId', 'connectorDefinitionId',
      'connectorVersion', 'currentRevisionId', 'credentialConfigured', 'connectionTest',
    ].sort())
    assert.equal('configuration' in candidate, false)
    assert.equal(JSON.stringify(candidate).includes('top-secret'), false)
  }
  await fresh.query(`
    UPDATE iam.account_project_grant
    SET can_use_connection = false
    WHERE account_id = $1 AND project_id = $2
  `, [ACCOUNT_ID, projectId])
  assert.equal((await store.listConnections({
    accountId: ACCOUNT_ID, ownerScopeKind: 'WORKSPACE', ownerId: WORKSPACE_ID, forProjectId: projectId,
  })).status, 'DENIED')
  await fresh.query(`
    UPDATE iam.account_project_grant
    SET can_use_connection = true
    WHERE account_id = $1 AND project_id = $2
  `, [ACCOUNT_ID, projectId])

  // Membership and Project-grant removal are distinct fail-closed paths. The
  // specialist use fact is enabled on the manager fixture so each removal is
  // observed as a scope denial, rather than being masked by use=false.
  await fresh.query(`
    UPDATE iam.account_project_grant
    SET can_use_connection = true
    WHERE account_id = $1 AND project_id = $2
  `, [OTHER_ACCOUNT_ID, projectId])
  await fresh.query('DELETE FROM iam.workspace_membership WHERE account_id = $1 AND workspace_id = $2', [OTHER_ACCOUNT_ID, WORKSPACE_ID])
  assert.equal((await store.listConnections({
    accountId: OTHER_ACCOUNT_ID, ownerScopeKind: 'WORKSPACE', ownerId: WORKSPACE_ID, forProjectId: projectId,
  })).status, 'NOT_FOUND')
  await fresh.query(`
    INSERT INTO iam.workspace_membership (
      account_id, workspace_id, can_create_project, can_read_brain,
      can_read_connection, can_manage_connection, can_qualify_connection
    ) VALUES ($1, $2, false, false, false, false, false)
  `, [OTHER_ACCOUNT_ID, WORKSPACE_ID])
  await fresh.query('DELETE FROM iam.account_project_grant WHERE account_id = $1 AND project_id = $2', [OTHER_ACCOUNT_ID, projectId])
  assert.equal((await store.listConnections({
    accountId: OTHER_ACCOUNT_ID, ownerScopeKind: 'PROJECT', ownerId: projectId, forProjectId: projectId,
  })).status, 'NOT_FOUND')
  await fresh.query(`
    INSERT INTO iam.account_project_grant (
      account_id, project_id, can_read, can_manage,
      can_read_connection, can_manage_connection, can_qualify_connection,
      can_bind_brain, can_use_connection
    ) VALUES ($1, $2, true, true, false, false, false, false, false)
  `, [OTHER_ACCOUNT_ID, projectId])
  assert.equal((await store.listConnections({
    accountId: nonMemberAccountId, ownerScopeKind: 'WORKSPACE', ownerId: WORKSPACE_ID, forProjectId: projectId,
  })).status, 'NOT_FOUND')
  assert.equal((await store.listConnections({
    accountId: ACCOUNT_ID, ownerScopeKind: 'PROJECT', ownerId: foreignProjectId, forProjectId: projectId,
  })).status, 'NOT_FOUND')
  assert.equal((await store.listConnections({
    accountId: ACCOUNT_ID, ownerScopeKind: 'WORKSPACE', ownerId: foreignWorkspaceId, forProjectId: projectId,
  })).status, 'NOT_FOUND')
  assert.equal((await store.listConnections({
    accountId: ACCOUNT_ID, ownerScopeKind: 'PROJECT', ownerId: foreignProjectId, forProjectId: foreignProjectId,
  })).status, 'NOT_FOUND')
  assert.equal((await store.listConnections({
    accountId: ACCOUNT_ID, ownerScopeKind: 'WORKSPACE', ownerId: WORKSPACE_ID, forProjectId: foreignProjectId,
  })).status, 'NOT_FOUND')
  assert.equal((await store.listConnections({
    accountId: OTHER_ACCOUNT_ID, ownerScopeKind: 'WORKSPACE', ownerId: WORKSPACE_ID, forProjectId: projectId,
  })).status, 'DENIED')

  await fresh.query(`
    UPDATE iam.workspace_membership
    SET can_read_connection = true, can_manage_connection = false, can_qualify_connection = false
    WHERE account_id = $1 AND workspace_id = $2
  `, [OTHER_ACCOUNT_ID, WORKSPACE_ID])
  assert.equal((await store.listConnections({
    accountId: OTHER_ACCOUNT_ID, ownerScopeKind: 'WORKSPACE', ownerId: WORKSPACE_ID,
  })).status, 'FOUND')
  assert.equal((await store.createConnection({
    accountId: OTHER_ACCOUNT_ID, ownerScopeKind: 'WORKSPACE', ownerId: WORKSPACE_ID,
    idempotencyKey: 'read-cannot-manage', body: createBody,
  })).status, 'DENIED')
  assert.equal((await store.qualifyConnection({
    accountId: OTHER_ACCOUNT_ID, connectionId, idempotencyKey: 'read-cannot-qualify',
    body: { connectionRevisionId: revisionId, environment: 'SANDBOX' },
  })).status, 'DENIED')

  await fresh.query(`
    UPDATE iam.workspace_membership
    SET can_read_connection = false, can_manage_connection = true, can_qualify_connection = false
    WHERE account_id = $1 AND workspace_id = $2
  `, [OTHER_ACCOUNT_ID, WORKSPACE_ID])
  assert.equal((await store.listConnections({
    accountId: OTHER_ACCOUNT_ID, ownerScopeKind: 'WORKSPACE', ownerId: WORKSPACE_ID,
  })).status, 'DENIED')
  assert.equal((await store.createConnection({
    accountId: OTHER_ACCOUNT_ID, ownerScopeKind: 'WORKSPACE', ownerId: WORKSPACE_ID,
    idempotencyKey: 'manage-without-read', body: { ...createBody, name: 'Manage-only Connection' },
  })).status, 'FOUND')

  await fresh.query(`
    UPDATE iam.workspace_membership
    SET can_read_connection = false, can_manage_connection = false, can_qualify_connection = true
    WHERE account_id = $1 AND workspace_id = $2
  `, [OTHER_ACCOUNT_ID, WORKSPACE_ID])
  assert.equal((await store.qualifyConnection({
    accountId: OTHER_ACCOUNT_ID, connectionId, idempotencyKey: 'qualify-without-read-manage',
    body: { connectionRevisionId: revisionId, environment: 'SANDBOX' },
  })).status, 'INVALID')
  assert.equal((await store.createConnection({
    accountId: OTHER_ACCOUNT_ID, ownerScopeKind: 'WORKSPACE', ownerId: WORKSPACE_ID,
    idempotencyKey: 'qualify-cannot-manage', body: createBody,
  })).status, 'DENIED')

  await fresh.query(`
    UPDATE iam.workspace_membership
    SET can_read_connection = false, can_manage_connection = false, can_qualify_connection = false
    WHERE account_id = $1 AND workspace_id = $2
  `, [OTHER_ACCOUNT_ID, WORKSPACE_ID])
  await fresh.query(`
    UPDATE iam.account_project_grant
    SET can_read_connection = true, can_manage_connection = false, can_qualify_connection = false
    WHERE account_id = $1 AND project_id = $2
  `, [OTHER_ACCOUNT_ID, projectId])
  assert.equal((await store.listConnections({
    accountId: OTHER_ACCOUNT_ID, ownerScopeKind: 'PROJECT', ownerId: projectId,
  })).status, 'FOUND')
  assert.equal((await store.listConnections({
    accountId: OTHER_ACCOUNT_ID, ownerScopeKind: 'WORKSPACE', ownerId: WORKSPACE_ID,
  })).status, 'DENIED')
  assert.equal((await store.setConnectionCredential({
    accountId: OTHER_ACCOUNT_ID,
    connectionId: projectConnection.value.connectionId,
    idempotencyKey: 'project-read-cannot-manage',
    body: { credential: { clientId: 'id', clientSecret: 'secret', xToken: 'token' } },
  })).status, 'DENIED')

  const credential1 = { clientId: 'client-1', clientSecret: 'secret-1', xToken: 'token-1' }
  const firstCredential = await store.setConnectionCredential({
    accountId: ACCOUNT_ID, connectionId, idempotencyKey: 'credential-1', body: { credential: credential1 },
  })
  assert.equal(firstCredential.status, 'FOUND')
  assert.equal(firstCredential.reentry, 'NEW')
  const firstReplay = await store.setConnectionCredential({
    accountId: ACCOUNT_ID, connectionId, idempotencyKey: 'credential-1', body: { credential: credential1 },
  })
  assert.equal(firstReplay.status, 'FOUND')
  assert.equal(firstReplay.reentry, 'SETTLED')
  assert.equal((await store.setConnectionCredential({
    accountId: ACCOUNT_ID, connectionId, idempotencyKey: 'credential-1',
    body: { credential: { ...credential1, clientSecret: 'different' } },
  })).status, 'CONFLICT')

  const reserveCredential = async (accountId, key, credential) => {
    const bytes = canonicalBytes(credential)
    try {
      const requestDigest = backend.idempotencyDigest(connectionId, bytes)
      const result = await runtimePool.query(
        'SELECT * FROM con.reserve_connection_credential($1, $2, $3, $4)',
        [accountId, connectionId, sha256(key), requestDigest],
      )
      const row = result.rows[0]
      await backend.publishOrMatch({ connectionId, generation: String(row.credential_generation) }, bytes)
      return { generation: String(row.credential_generation), requestDigest }
    } finally {
      bytes.fill(0)
    }
  }

  const credential2 = { clientId: 'client-2', clientSecret: 'secret-2', xToken: 'token-2' }
  const orphan2 = await reserveCredential(ACCOUNT_ID, 'orphan-2', credential2)
  assert.equal(orphan2.generation, '2')
  await fresh.query(
    'UPDATE iam.workspace_membership SET can_manage_connection = false WHERE account_id = $1 AND workspace_id = $2',
    [ACCOUNT_ID, WORKSPACE_ID],
  )
  await fresh.query(`
    UPDATE iam.workspace_membership
      SET can_read_connection = true, can_manage_connection = true, can_qualify_connection = true
      WHERE account_id = $1 AND workspace_id = $2
  `, [OTHER_ACCOUNT_ID, WORKSPACE_ID])
  const recovered = await store.setConnectionCredential({
    accountId: OTHER_ACCOUNT_ID, connectionId, idempotencyKey: 'recover-2', body: { credential: credential2 },
  })
  assert.equal(recovered.status, 'FOUND')
  assert.equal(recovered.reentry, 'RESERVED')

  const credential3 = { clientId: 'client-3', clientSecret: 'secret-3', xToken: 'token-3' }
  const orphan3 = await reserveCredential(OTHER_ACCOUNT_ID, 'orphan-3', credential3)
  assert.equal(orphan3.generation, '3')
  const credential4 = { clientId: 'client-4', clientSecret: 'secret-4', xToken: 'token-4' }
  const superseded = await store.setConnectionCredential({
    accountId: OTHER_ACCOUNT_ID, connectionId, idempotencyKey: 'supersede-4', body: { credential: credential4 },
  })
  assert.equal(superseded.status, 'FOUND')
  assert.equal(superseded.reentry, 'NEW')
  assert.deepEqual((await fresh.query(`
    SELECT credential_generation::text, credential_generation_high_watermark::text
    FROM con.connection WHERE connection_id = $1
  `, [connectionId])).rows, [{ credential_generation: '4', credential_generation_high_watermark: '4' }])
  assert.equal((await fresh.query(`
    SELECT settlement_state FROM con.operation_receipt
    WHERE operation_id = 'CON-07' AND reserved_generation = 3 AND subject_id = $1
  `, [connectionId])).rows[0].settlement_state, 'ABANDONED')
  assert.deepEqual(JSON.parse(Buffer.from(await backend.materialize({ connectionId, generation: '3' })).toString('utf8')), credential3)
  assert.deepEqual(JSON.parse(Buffer.from(await backend.materialize({ connectionId, generation: '4' })).toString('utf8')), credential4)

  let signalQualifierEntered
  let releaseQualifier
  const qualifierEntered = new Promise((resolveEntered) => { signalQualifierEntered = resolveEntered })
  const qualifierRelease = new Promise((resolveRelease) => { releaseQualifier = resolveRelease })
  let concurrentQualifierInvocations = 0
  const concurrentStore = createConnectionStore({
    pool: runtimePool,
    credentialBackend: backend,
    qualifier: async (input) => {
      concurrentQualifierInvocations += 1
      signalQualifierEntered()
      await qualifierRelease
      return providerQualifier(input)
    },
  })
  const concurrentBody = { connectionRevisionId: revisionId, environment: 'SANDBOX' }
  const firstConcurrent = concurrentStore.qualifyConnection({
    accountId: OTHER_ACCOUNT_ID,
    connectionId,
    idempotencyKey: 'qualify-concurrent',
    body: concurrentBody,
  })
  await qualifierEntered
  const overlappingConcurrent = await concurrentStore.qualifyConnection({
    accountId: OTHER_ACCOUNT_ID,
    connectionId,
    idempotencyKey: 'qualify-concurrent',
    body: concurrentBody,
  })
  assert.equal(overlappingConcurrent.status, 'CONFLICT')
  assert.equal(concurrentQualifierInvocations, 1)
  releaseQualifier()
  const firstConcurrentResult = await firstConcurrent
  assert.equal(firstConcurrentResult.status, 'FOUND')
  assert.equal(firstConcurrentResult.value.outcome, 'PASSED')
  const concurrentReplay = await concurrentStore.qualifyConnection({
    accountId: OTHER_ACCOUNT_ID,
    connectionId,
    idempotencyKey: 'qualify-concurrent',
    body: concurrentBody,
  })
  assert.equal(concurrentReplay.status, 'FOUND')
  assert.equal(concurrentReplay.reentry, 'SETTLED')
  assert.equal(concurrentQualifierInvocations, 1)

  const takeoverKey = 'qualify-lease-takeover'
  const takeoverRequestDigest = canonicalSha256(canonicalBytes({ connectionId, body: concurrentBody }))
  const takeoverQualificationId = randomUUID()
  const attemptA = randomUUID()
  const attemptB = randomUUID()
  await runtimePool.query('SELECT * FROM con.reserve_connection_qualification($1, $2, $3, $4, $5, $6, $7, $8)', [
    OTHER_ACCOUNT_ID, connectionId, revisionId, 'SANDBOX', sha256(takeoverKey),
    takeoverRequestDigest, takeoverQualificationId, attemptA,
  ])
  await fresh.query(`
    UPDATE con.operation_receipt SET lease_expires_at = clock_timestamp() - interval '1 second'
    WHERE operation_id = 'CON-08' AND reserved_qualification_id = $1
  `, [takeoverQualificationId])
  const takeover = (await runtimePool.query(
    'SELECT * FROM con.reserve_connection_qualification($1, $2, $3, $4, $5, $6, $7, $8)',
    [OTHER_ACCOUNT_ID, connectionId, revisionId, 'SANDBOX', sha256(takeoverKey),
      takeoverRequestDigest, randomUUID(), attemptB],
  )).rows[0]
  assert.equal(takeover.settlement_state, 'RESERVED')
  const takeoverSettlement = [
    OTHER_ACCOUNT_ID, connectionId, takeoverQualificationId, revisionId, takeover.credential_generation, 'SANDBOX',
    attemptA, 'ATTEMPT_INTERRUPTED', 'INDETERMINATE',
    { title: 'Lease takeover proof', message: 'The expired reservation was recovered by its single successor.' },
    ['qualification:test-lease-takeover'], new Date().toISOString(),
  ]
  const settleQualificationSql =
    'SELECT con.settle_connection_qualification($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)'
  await assert.rejects(runtimePool.query(settleQualificationSql, takeoverSettlement), /CONNECTION_QUALIFICATION_RECEIPT_CONFLICT/)
  assert.equal((await fresh.query(`
    SELECT qualification_state FROM con.connection_qualification WHERE qualification_id = $1
  `, [takeoverQualificationId])).rows[0].qualification_state, null)
  takeoverSettlement[6] = attemptB
  await runtimePool.query(settleQualificationSql, takeoverSettlement)
  takeoverSettlement[6] = attemptA
  await assert.rejects(runtimePool.query(settleQualificationSql, takeoverSettlement), /CONNECTION_QUALIFICATION_RECEIPT_CONFLICT/)
  assert.deepEqual((await fresh.query(`
    SELECT qualification_state, outcome FROM con.connection_qualification WHERE qualification_id = $1
  `, [takeoverQualificationId])).rows, [{ qualification_state: 'ATTEMPT_INTERRUPTED', outcome: 'INDETERMINATE' }])

  const qualified = await store.qualifyConnection({
    accountId: OTHER_ACCOUNT_ID, connectionId, idempotencyKey: 'qualify-1',
    body: { connectionRevisionId: revisionId, environment: 'SANDBOX' },
  })
  assert.equal(qualified.status, 'FOUND')
  assert.equal(qualified.value.outcome, 'PASSED')
  assert.equal(providerInvocations, 2)
  const qualifyReplay = await store.qualifyConnection({
    accountId: OTHER_ACCOUNT_ID, connectionId, idempotencyKey: 'qualify-1',
    body: { connectionRevisionId: revisionId, environment: 'SANDBOX' },
  })
  assert.equal(qualifyReplay.status, 'FOUND')
  assert.equal(qualifyReplay.reentry, 'SETTLED')
  assert.equal(providerInvocations, 2)

  const interruptedBody = { connectionRevisionId: revisionId, environment: 'SANDBOX' }
  const interruptedKey = 'qualify-interrupted'
  const interruptedId = randomUUID()
  await runtimePool.query('SELECT * FROM con.reserve_connection_qualification($1, $2, $3, $4, $5, $6, $7, $8)', [
    OTHER_ACCOUNT_ID, connectionId, revisionId, 'SANDBOX', sha256(interruptedKey),
    canonicalSha256(canonicalBytes({ connectionId, body: interruptedBody })), interruptedId, randomUUID(),
  ])
  await fresh.query(`
    UPDATE con.operation_receipt SET lease_expires_at = clock_timestamp() - interval '1 second'
    WHERE operation_id = 'CON-08' AND reserved_qualification_id = $1
  `, [interruptedId])
  const attemptsBeforeRecovery = standIn.attempts.length
  const recoveredQualificationResult = await store.qualifyConnection({
    accountId: OTHER_ACCOUNT_ID, connectionId, idempotencyKey: interruptedKey, body: interruptedBody,
  })
  assert.equal(recoveredQualificationResult.status, 'FOUND')
  assert.equal(recoveredQualificationResult.reentry, 'RESERVED')
  assert.equal(recoveredQualificationResult.value.outcome, 'INDETERMINATE')
  assert.equal(recoveredQualificationResult.value.qualificationState, 'ATTEMPT_INTERRUPTED')
  assert.equal(standIn.attempts.length, attemptsBeforeRecovery)

  const revised = await store.reviseConnection({
    accountId: OTHER_ACCOUNT_ID,
    connectionId,
    body: { expectedCurrentRevisionId: revisionId, configuration: { environment: 'SANDBOX', companyCode: 2 } },
  })
  assert.equal(revised.status, 'FOUND')
  const detail = await store.getConnection({ accountId: OTHER_ACCOUNT_ID, connectionId })
  assert.equal(detail.status, 'FOUND')
  assert.equal(detail.value.currentRevisionId, revised.value.connectionRevisionId)
  assert.equal(detail.value.connectionTest.state, 'NEEDS_RETEST')
  assert.equal((await store.getConnectionQualification({
    accountId: OTHER_ACCOUNT_ID, connectionId, qualificationId: qualified.value.qualificationId,
  })).status, 'FOUND')

  const conText = JSON.stringify((await fresh.query(`
    SELECT (SELECT jsonb_agg(to_jsonb(c)) FROM con.connection c) AS connections,
      (SELECT jsonb_agg(to_jsonb(r)) FROM con.connection_revision r) AS revisions,
      (SELECT jsonb_agg(to_jsonb(q)) FROM con.connection_qualification q) AS qualifications,
      (SELECT jsonb_agg(to_jsonb(o)) FROM con.operation_receipt o) AS receipts
  `)).rows[0])
  for (const secret of ['secret-1', 'secret-2', 'secret-3', 'secret-4', 'token-1', 'token-2', 'token-3', 'token-4']) {
    assert.equal(conText.includes(secret), false)
  }
  await assert.rejects(runtimePool.query('SELECT * FROM con.connection'), /permission denied/)
  await assert.rejects(runtimePool.query('SET ROLE connections_owner'), /permission denied/)
})
