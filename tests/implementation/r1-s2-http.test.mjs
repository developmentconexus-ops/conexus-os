import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const hubBuild = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r1-s2-http-build-'))
process.once('exit', () => rmSync(hubBuild, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', hubBuild,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`S2_HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
const built = (path) => pathToFileURL(resolve(hubBuild, path)).href
const { createHttpApp } = await import(built('http/app.js'))
const { readHubConfig } = await import(built('platform/config.js'))
const { registerWorkspaceRoutes } = await import(built('workspace/routes.js'))
const { workspaceError } = await import(built('workspace/errors.js'))
const { createWorkspaceStore } = await import(built('workspace/store.js'))

const ORIGIN = 'https://conexus.test'
const OPERATOR = Object.freeze({ account: { accountId: '11111111-1111-4111-8111-111111111111' }, issuer: 'https://issuer.test', subject: 'bootstrap' })
const MEMBER = Object.freeze({ account: { accountId: '22222222-2222-4222-8222-222222222222' }, issuer: 'https://issuer.test', subject: 'member' })
const authenticHeaders = {
  origin: ORIGIN,
  cookie: '__Host-conexus_csrf=csrf',
  'x-conexus-csrf': 'csrf',
  'idempotency-key': 'workspace-key',
  'content-type': 'application/json',
}

const baseEnvironment = {
  CONEXUS_ORIGIN: ORIGIN,
  CONEXUS_BOOTSTRAP_SUBJECT: OPERATOR.subject,
  CONEXUS_DB_HOST: '127.0.0.1',
  CONEXUS_DB_PORT: '5432',
  CONEXUS_DB_NAME: 'conexus',
  CONEXUS_DB_USER: 'hub_iam',
  CONEXUS_DB_PASSWORD_FILE: '/secrets/iam',
  CONEXUS_OIDC_ISSUER: OPERATOR.issuer,
  CONEXUS_OIDC_CLIENT_ID: 'hub',
  CONEXUS_OIDC_CLIENT_SECRET_FILE: '/secrets/oidc',
}

test('S2 database capabilities are mandatory in production and preserve the pinned S1 test boot', () => {
  const s1Test = readHubConfig({ ...baseEnvironment, NODE_ENV: 'test' })
  assert.equal(s1Test.database.workspace, undefined)
  assert.throws(
    () => readHubConfig(baseEnvironment),
    /MISSING_CONFIG_CONEXUS_DB_WS01_COMMAND_PASSWORD_FILE/,
  )
  assert.throws(
    () => readHubConfig({
      ...baseEnvironment,
      NODE_ENV: 'test',
      CONEXUS_DB_WS01_COMMAND_PASSWORD_FILE: '/secrets/command',
    }),
    /MISSING_CONFIG_CONEXUS_DB_S2_READ_PASSWORD_FILE/,
  )
  assert.deepEqual(readHubConfig({
    ...baseEnvironment,
    NODE_ENV: 'test',
    CONEXUS_DB_WS01_COMMAND_PASSWORD_FILE: '/secrets/command',
    CONEXUS_DB_S2_READ_PASSWORD_FILE: '/secrets/read',
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
    async getWorkspace(input) {
      calls.push(['getWorkspace', input])
      return input.workspaceId === '33333333-3333-4333-8333-333333333333'
        ? { workspaceId: input.workspaceId, name: 'Operations' }
        : null
    },
    ...storeOverrides,
  }
  const app = await createHttpApp({
    registerRoutes: (server) => registerWorkspaceRoutes(server, {
      store,
      resolveCurrentSession: async () => current,
      config: { origin: ORIGIN, operatorIssuer: OPERATOR.issuer, operatorSubject: OPERATOR.subject },
    }),
  })
  return { app, calls }
}

test('generated WS-01/02 routes enforce operator creation and membership-shaped disclosure', async (t) => {
  const { app, calls } = await buildRoutes()
  t.after(() => app.close())
  assert.deepEqual(app.routeCensus(), ['WS-01', 'WS-02'])

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

  const found = await app.inject({ method: 'GET', url: '/api/control/workspaces/33333333-3333-4333-8333-333333333333' })
  assert.equal(found.statusCode, 200)
  assert.deepEqual(found.json(), { workspaceId: '33333333-3333-4333-8333-333333333333', name: 'Operations' })
  assert.deepEqual(calls[1], ['getWorkspace', { accountId: OPERATOR.account.accountId, workspaceId: '33333333-3333-4333-8333-333333333333' }])

  const hidden = await app.inject({ method: 'GET', url: '/api/control/workspaces/44444444-4444-4444-8444-444444444444' })
  assert.equal(hidden.statusCode, 404)
})

test('WS-01 refuses unauthenticated, non-operator, authenticity failures and caller-selected authority', async (t) => {
  const unauthenticated = await buildRoutes({ current: null })
  t.after(() => unauthenticated.app.close())
  const noSession = await unauthenticated.app.inject({ method: 'POST', url: '/api/control/workspaces', headers: authenticHeaders, payload: { name: 'Operations' } })
  assert.equal(noSession.statusCode, 401)

  const member = await buildRoutes({ current: MEMBER })
  t.after(() => member.app.close())
  const notOperator = await member.app.inject({ method: 'POST', url: '/api/control/workspaces', headers: authenticHeaders, payload: { name: 'Operations' } })
  assert.equal(notOperator.statusCode, 403)

  const operator = await buildRoutes()
  t.after(() => operator.app.close())
  const wrongOrigin = await operator.app.inject({ method: 'POST', url: '/api/control/workspaces', headers: { ...authenticHeaders, origin: 'https://attacker.test' }, payload: { name: 'Operations' } })
  assert.equal(wrongOrigin.statusCode, 403)
  const callerSelectedCreator = await operator.app.inject({ method: 'POST', url: '/api/control/workspaces', headers: authenticHeaders, payload: { name: 'Operations', creatorAccountId: MEMBER.account.accountId } })
  assert.equal(callerSelectedCreator.statusCode, 400)
  assert.equal(operator.calls.length, 0)
})

test('WS-01 maps changed-request/outcome conflicts to 409 without leaking internals', async (t) => {
  for (const code of ['IDEMPOTENCY_CONFLICT', 'OUTCOME_UNKNOWN']) {
    const { app } = await buildRoutes({ storeOverrides: { createWorkspace: async () => { throw workspaceError(code) } } })
    t.after(() => app.close())
    const response = await app.inject({ method: 'POST', url: '/api/control/workspaces', headers: authenticHeaders, payload: { name: 'Operations' } })
    assert.equal(response.statusCode, 409)
    assert.equal(response.json().status, 409)
  }
})

test('WS-01/02 hide malformed identifiers and unexpected store/driver failures', async (t) => {
  const malformed = await buildRoutes({
    storeOverrides: {
      getWorkspace: async () => {
        const error = new Error('invalid input syntax for type uuid: secret-driver-detail')
        error.code = '22P02'
        throw error
      },
    },
  })
  t.after(() => malformed.app.close())
  const hidden = await malformed.app.inject({ method: 'GET', url: '/api/control/workspaces/not-a-uuid' })
  assert.equal(hidden.statusCode, 404)
  assert.equal(hidden.headers['content-type'].startsWith('application/problem+json'), true)
  assert.deepEqual(hidden.json(), {
    type: 'urn:conexus:problem:workspace-not-found',
    title: 'Workspace not found',
    status: 404,
  })
  assert.equal(hidden.body.includes('secret-driver-detail'), false)

  const unexpectedRead = await buildRoutes({
    storeOverrides: { getWorkspace: async () => { throw new Error('read-driver-secret') } },
  })
  t.after(() => unexpectedRead.app.close())
  const readFailure = await unexpectedRead.app.inject({ method: 'GET', url: '/api/control/workspaces/33333333-3333-4333-8333-333333333333' })
  assert.equal(readFailure.statusCode, 500)
  assert.equal(readFailure.headers['content-type'].startsWith('application/problem+json'), true)
  assert.deepEqual(readFailure.json(), {
    type: 'urn:conexus:problem:internal-error',
    title: 'Internal server error',
    status: 500,
  })
  assert.equal(readFailure.body.includes('read-driver-secret'), false)

  const unexpectedCreate = await buildRoutes({
    storeOverrides: { createWorkspace: async () => { throw new Error('create-driver-secret') } },
  })
  t.after(() => unexpectedCreate.app.close())
  const createFailure = await unexpectedCreate.app.inject({ method: 'POST', url: '/api/control/workspaces', headers: authenticHeaders, payload: { name: 'Operations' } })
  assert.equal(createFailure.statusCode, 500)
  assert.equal(createFailure.headers['content-type'].startsWith('application/problem+json'), true)
  assert.deepEqual(createFailure.json(), {
    type: 'urn:conexus:problem:internal-error',
    title: 'Internal server error',
    status: 500,
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
  assert.match(sql[2], /workspace\.create_workspace/)
  assert.match(sql[3], /iam\.establish_workspace_creator_access/)
  assert.match(sql[4], /complete_create_workspace_receipt/)
  assert.equal(sql[5], 'COMMIT')
  assert.equal(sql[6], 'RELEASE')

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
  assert.equal(replayCommand.calls.filter(({ text }) => /create_workspace|creator_access|complete_create/.test(text)).length, 1)
})

test('workspace store rolls back every failed boundary and WS-02 is one read-only statement', async () => {
  for (const failingFunction of ['reserve_or_replay_create_workspace', 'workspace.create_workspace', 'iam.establish_workspace_creator_access', 'complete_create_workspace_receipt']) {
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

  const command = fakePool(() => ({ rows: [] }))
  const read = fakePool((sql) => sql.includes('list_workspace_summaries')
    ? { rows: [{ workspace_id: '33333333-3333-4333-8333-333333333333', name: 'Operations' }] }
    : { rows: [] })
  const store = createWorkspaceStore({ commandPool: command.pool, readPool: read.pool })
  assert.deepEqual(await store.getWorkspace({ accountId: OPERATOR.account.accountId, workspaceId: '33333333-3333-4333-8333-333333333333' }), {
    workspaceId: '33333333-3333-4333-8333-333333333333', name: 'Operations',
  })
  const sql = read.calls.map(({ text }) => text)
  assert.deepEqual([sql[0], sql.at(-2), sql.at(-1)], ['BEGIN READ ONLY', 'COMMIT', 'RELEASE'])
  assert.equal(sql.filter((text) => text.startsWith('SELECT')).length, 1)
  assert.match(sql[1], /iam\.list_workspace_memberships\(\$1\)/)
  assert.match(sql[1], /WHERE m\.workspace_id = \$2/)
})
