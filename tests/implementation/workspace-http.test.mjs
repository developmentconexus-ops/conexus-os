import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import { invalidConfig } from './failure-matchers.mjs'
import { hubJsonWrite, hubSessionCookie, opaque, testListener } from './access/test-listener.mjs'

const built = hubModuleUrl
const { readHubConfig } = await import(built('platform/config.js'))
const { registerWorkspaceRoutes } = await import(built('workspace/routes.js'))
const { Failure } = await import(built('platform/failure.js'))
const { createWorkspaceStore } = await import(built('workspace/store.js'))

const missing = (name) => (error) => error.id === 'CONFIG_MISSING' && error.details?.name === name

const ORIGIN = 'https://conexus.test'
const OPERATOR = Object.freeze({ account: { accountId: '11111111-1111-4111-8111-111111111111' }, issuer: 'https://issuer.test', subject: 'bootstrap' })
const MEMBER = Object.freeze({ account: { accountId: '22222222-2222-4222-8222-222222222222' }, issuer: 'https://issuer.test', subject: 'member' })
const TOKEN = opaque('operator')
const signedIn = { cookie: hubSessionCookie(TOKEN) }
const authenticHeaders = {
  ...hubJsonWrite,
  origin: ORIGIN,
  ...signedIn,
  'idempotency-key': 'workspace-key',
}

const baseEnvironment = {
  CONEXUS_ORIGIN: ORIGIN,
  CONEXUS_PORT: '3000',
  CONEXUS_BOOTSTRAP_SUBJECT: OPERATOR.subject,
  CONEXUS_DB_HOST: '127.0.0.1',
  CONEXUS_DB_PORT: '5432',
  CONEXUS_DB_NAME: 'conexus',
  CONEXUS_DB_USER: 'hub_iam',
  CONEXUS_DB_PASSWORD_FILE: '/secrets/iam',
  CONEXUS_FACTORY_SECRET_KEY_FILE: '/secrets/installation-secret-key',
  CONEXUS_OIDC_ISSUER: OPERATOR.issuer,
  CONEXUS_OIDC_CLIENT_ID: 'hub',
  CONEXUS_OIDC_CLIENT_SECRET_FILE: '/secrets/oidc',
}

test('local Preview config requires complete TLS, exact Hub origin and a separate port', () => {
  const environment = {
    ...baseEnvironment, NODE_ENV: 'test', CONEXUS_ORIGIN: 'https://hub.conexus.localhost:8080', CONEXUS_PORT: '8080',
    CONEXUS_PREVIEW_PORT: '8081', CONEXUS_PREVIEW_CERT_FILE: '/secrets/local-cert', CONEXUS_PREVIEW_KEY_FILE: '/secrets/local-key',
  }
  assert.deepEqual(readHubConfig(environment).preview, { port: 8081, certFile: '/secrets/local-cert', keyFile: '/secrets/local-key' })
  for (const [field, code] of [
    ['CONEXUS_PREVIEW_PORT', 'CONEXUS_PREVIEW_PORT'],
    ['CONEXUS_PREVIEW_CERT_FILE', 'CONEXUS_PREVIEW_CERT_FILE'],
    ['CONEXUS_PREVIEW_KEY_FILE', 'CONEXUS_PREVIEW_KEY_FILE'],
  ]) assert.throws(() => readHubConfig({ ...environment, [field]: undefined }), missing(code))
  assert.throws(() => readHubConfig({ ...environment, CONEXUS_PREVIEW_PORT: '8080' }), invalidConfig('CONEXUS_PREVIEW_PORT'))
  for (const origin of ['http://hub.conexus.localhost:8080', 'https://preview.conexus.localhost:8080', 'https://hub.conexus.localhost:9090', 'https://hub.conexus.localhost:8080/path', 'https://user@hub.conexus.localhost:8080']) {
    assert.throws(() => readHubConfig({ ...environment, CONEXUS_ORIGIN: origin }), invalidConfig('CONEXUS_ORIGIN_FOR_PREVIEW'))
  }
})

test('S2 database capabilities are mandatory in production and preserve the pinned S1 test boot', () => {
  const s1Test = readHubConfig({ ...baseEnvironment, NODE_ENV: 'test' })
  assert.equal(s1Test.database.workspace, undefined)
  assert.throws(
    () => readHubConfig(baseEnvironment),
    missing('CONEXUS_DB_WORKSPACE_COMMAND_PASSWORD_FILE'),
  )
  assert.throws(
    () => readHubConfig({
      ...baseEnvironment,
      NODE_ENV: 'test',
      CONEXUS_DB_WORKSPACE_COMMAND_PASSWORD_FILE: '/secrets/command',
    }),
    missing('CONEXUS_DB_WORKSPACE_READ_PASSWORD_FILE'),
  )
  assert.deepEqual(readHubConfig({
    ...baseEnvironment,
    NODE_ENV: 'test',
    CONEXUS_DB_WORKSPACE_COMMAND_PASSWORD_FILE: '/secrets/command',
    CONEXUS_DB_WORKSPACE_READ_PASSWORD_FILE: '/secrets/read',
  }).database.workspace, {
    commandPasswordFile: '/secrets/command',
    readPasswordFile: '/secrets/read',
  })
})

const buildRoutes = async ({ current = OPERATOR, storeOverrides = {} } = {}) => {
  const calls = []
  const store = {
    async createWorkspace(input) {
      calls.push(['createWorkspace', input])
      return {
        workspaceId: '33333333-3333-4333-8333-333333333333',
        name: input.name,
        creatorAccountId: input.accountId,
        initialAccessEstablished: true,
        replayed: false,
      }
    },
    ...storeOverrides,
  }
  const { app } = await testListener({
    hubOrigin: ORIGIN,
    sessions: { [TOKEN]: current },
    registerRoutes: (server) => registerWorkspaceRoutes(server, { store }),
  })
  return { app, calls }
}

test('WS-01 declares and checks workspace creation', async (t) => {
  const { app, calls } = await buildRoutes()
  t.after(() => app.close())
  assert.deepEqual(app.routeCensus(), ['WS-01'])

  const created = await app.inject({ method: 'POST', url: '/api/control/workspaces', headers: authenticHeaders, payload: { name: 'Operations' } })
  assert.equal(created.statusCode, 201)
  assert.deepEqual(created.json(), {
    workspaceId: '33333333-3333-4333-8333-333333333333',
    name: 'Operations',
    creatorAccountId: OPERATOR.account.accountId,
    initialAccessEstablished: true,
  })
  assert.deepEqual(calls[0], ['createWorkspace', {
    accountId: OPERATOR.account.accountId,
    idempotencyKey: 'workspace-key',
    name: 'Operations',
  }])


})

test('WS-01 refuses unauthenticated, authenticity failures and caller-selected authority', async (t) => {
  const unauthenticated = await buildRoutes({ current: null })
  t.after(() => unauthenticated.app.close())
  const noSession = await unauthenticated.app.inject({ method: 'POST', url: '/api/control/workspaces', headers: authenticHeaders, payload: { name: 'Operations' } })
  assert.equal(noSession.statusCode, 401)

  const operator = await buildRoutes()
  t.after(() => operator.app.close())
  const wrongOrigin = await operator.app.inject({ method: 'POST', url: '/api/control/workspaces', headers: { ...authenticHeaders, origin: 'https://attacker.test' }, payload: { name: 'Operations' } })
  assert.equal(wrongOrigin.statusCode, 403)
  const callerSelectedCreator = await operator.app.inject({ method: 'POST', url: '/api/control/workspaces', headers: authenticHeaders, payload: { name: 'Operations', creatorAccountId: MEMBER.account.accountId } })
  assert.equal(callerSelectedCreator.statusCode, 400)
  assert.equal(operator.calls.length, 0)
})

test('WS-01 names a missing or empty idempotency key', async (t) => {
  const { app, calls } = await buildRoutes()
  t.after(() => app.close())
  for (const headers of [
    { ...hubJsonWrite, origin: ORIGIN, ...signedIn },
    { ...hubJsonWrite, origin: ORIGIN, ...signedIn, 'idempotency-key': '' },
  ]) {
    const response = await app.inject({ method: 'POST', url: '/api/control/workspaces', headers, payload: { name: 'Operations' } })
    assert.equal(response.statusCode, 400)
    assert.equal(response.json().code, 'IDEMPOTENCY_KEY_REQUIRED')
  }
  assert.deepEqual(calls, [])
})

test('WS-01 admits any authenticated Account, who becomes the Workspace owner', async (t) => {
  const member = await buildRoutes({ current: MEMBER })
  t.after(() => member.app.close())
  const created = await member.app.inject({ method: 'POST', url: '/api/control/workspaces', headers: authenticHeaders, payload: { name: 'Operations' } })
  assert.equal(created.statusCode, 201)
  assert.equal(member.calls[0][1].accountId, MEMBER.account.accountId)
})

test('WS-01 maps changed-request/outcome conflicts to 409 without leaking internals', async (t) => {
  for (const code of ['IDEMPOTENCY_CONFLICT', 'OUTCOME_UNKNOWN']) {
    const { app } = await buildRoutes({ storeOverrides: { createWorkspace: async () => { throw new Failure(code) } } })
    t.after(() => app.close())
    const response = await app.inject({ method: 'POST', url: '/api/control/workspaces', headers: authenticHeaders, payload: { name: 'Operations' } })
    assert.equal(response.statusCode, 409)
    assert.equal(response.json().status, 409)
  }
})

test('WS-01 hides unexpected store failures', async (t) => {
  const unexpectedCreate = await buildRoutes({
    storeOverrides: { createWorkspace: async () => { throw new Error('create-driver-secret') } },
  })
  t.after(() => unexpectedCreate.app.close())
  const createFailure = await unexpectedCreate.app.inject({ method: 'POST', url: '/api/control/workspaces', headers: authenticHeaders, payload: { name: 'Operations' } })
  assert.equal(createFailure.statusCode, 500)
  assert.equal(createFailure.headers['content-type'].startsWith('application/problem+json'), true)
  assert.deepEqual(createFailure.json(), {
    type: 'urn:conexus:problem:INTERNAL_UNEXPECTED',
    title: 'INTERNAL_UNEXPECTED',
    status: 500,
    code: 'INTERNAL_UNEXPECTED',
  })
  assert.equal(createFailure.body.includes('create-driver-secret'), false)
})

const fakePool = (respond) => {
  const calls = []
  const client = {
    async query(text, values) {
      calls.push({ text: String(text).trim(), values })
      return respond(String(text), values, calls.length)
    },
    release() { calls.push({ text: 'RELEASE' }) },
  }
  return { calls, pool: { connect: async () => client } }
}

test('workspace store composes exact WS-01 functions atomically and short-circuits replay', async () => {
  const command = fakePool((sql, values) => {
    if (sql.includes('reserve_or_replay_create_workspace')) return { rows: [{ state: 'RESERVED', workspace_id: values[3], response_status: null, response_body: null }] }
    return { rows: [], rowCount: 1 }
  })
  const read = fakePool(() => ({ rows: [] }))
  const store = createWorkspaceStore({ commandPool: command.pool, readPool: read.pool })
  const result = await store.createWorkspace({ accountId: OPERATOR.account.accountId, idempotencyKey: 'key', name: 'Operations' })
  assert.equal(result.initialAccessEstablished, true)
  const sql = command.calls.map(({ text }) => text)
  assert.equal(sql[0], 'BEGIN')
  assert.match(sql[1], /reserve_or_replay_create_workspace/)
  // Creating the Workspace and establishing its owner is one call now: the Hub no longer reaches
  // into iam to finish a workspace it just created.
  assert.match(sql[2], /workspace\.create_workspace/)
  assert.equal(sql.some((text) => /iam\./.test(text)), false)
  assert.match(sql[3], /complete_create_workspace_receipt/)
  assert.equal(sql[4], 'COMMIT')
  assert.equal(sql[5], 'RELEASE')

  const replayCommand = fakePool((_sql, _values, index) => index === 2
    ? { rows: [{ state: 'REPLAY', workspace_id: result.workspaceId, response_status: 201, response_body: {
      workspaceId: result.workspaceId,
      name: result.name,
      creatorAccountId: result.creatorAccountId,
      initialAccessEstablished: true,
    } }] }
    : { rows: [] })
  const replayStore = createWorkspaceStore({ commandPool: replayCommand.pool, readPool: read.pool })
  await replayStore.createWorkspace({ accountId: OPERATOR.account.accountId, idempotencyKey: 'key', name: 'Operations' })
  assert.equal(replayCommand.calls.filter(({ text }) => /create_workspace|complete_create/.test(text)).length, 1)
})

test('workspace store rolls back every failed boundary', async () => {
  for (const failingFunction of ['reserve_or_replay_create_workspace', 'workspace.create_workspace', 'complete_create_workspace_receipt']) {
    const command = fakePool((sql, values) => {
      if (sql.includes(failingFunction)) throw new Error('boundary failure')
      if (sql.includes('reserve_or_replay_create_workspace')) return { rows: [{ state: 'RESERVED', workspace_id: values[3] }] }
      return { rows: [] }
    })
    const read = fakePool(() => ({ rows: [] }))
    const store = createWorkspaceStore({ commandPool: command.pool, readPool: read.pool })
    await assert.rejects(store.createWorkspace({ accountId: OPERATOR.account.accountId, idempotencyKey: 'key', name: 'Operations' }), /boundary failure/)
    assert.ok(command.calls.some(({ text }) => text === 'ROLLBACK'))
    assert.equal(command.calls.at(-1).text, 'RELEASE')
  }


})
