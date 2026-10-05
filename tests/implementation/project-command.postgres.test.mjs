import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { refuseProtectedCluster } from './protected-cluster.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { hubJsonWrite, hubSessionCookie, opaque, testListener } from './access/test-listener.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const identityPath = resolve(repositoryRoot, 'apps/hub/src/project/identity.ts')

test('S3-P5 centralizes one Project identity law for UUID versions 1 through 8', async () => {
  await refuseProtectedCluster()
  assert.equal(existsSync(identityPath), true)

  const { isProjectIdentity } = await import(hubModuleUrl('project/identity.js'))
  for (let version = 1; version <= 8; version += 1) {
    assert.equal(isProjectIdentity(`30000000-0000-${version}000-8000-000000000051`), true)
  }
  assert.equal(isProjectIdentity('30000000-0000-9000-8000-000000000051'), false)
  assert.equal(isProjectIdentity('../project'), false)
})

test('S3-P5 store prepares the repository after the reservation and creates the Project with it in one transaction', async () => {
  const { createProjectStore } = await import(hubModuleUrl('project/store.js'))
  const projectId = '30000000-0000-8000-8000-000000000061'
  const projectRevision = '50000000-0000-8000-8000-000000000061'
  const reservationState = 'RESERVED'
  const settlementFailure = null
  const statements = []
  const client = {
    async query(statement, values = []) {
      statements.push({ statement, values })
      if (statement.includes('reserve_or_replay_create_project')) {
        return { rows: [{ state: reservationState, project_id: projectId, response_status: null, response_body: null }] }
      }
      if (statement.includes('lock_create_project_receipt')) return { rows: [{ outcome: 'RESERVED', project_id: projectId }] }
      if (settlementFailure && statement.includes('create_project_with_repository')) throw settlementFailure
      return { rows: [] }
    },
    release() {},
  }
  const prepared = []
  const identities = [projectId, projectRevision]
  const store = createProjectStore({
    commandPool: { connect: async () => client },
    repository: { prepare: async (input) => { prepared.push({ input, statementsBefore: statements.length }); return '1'.repeat(40) } },
    mintIdentity: () => identities.shift(),
  })
  assert.deepEqual(await store.createProject({
    accountId: '10000000-0000-4000-8000-000000000061',
    workspaceId: '20000000-0000-4000-8000-000000000061',
    idempotencyKey: 'p5-key',
    body: { name: 'Project P5', sourceBootstrap: { mode: 'NEW' } },
  }), {
    projectId,
    workspaceId: '20000000-0000-4000-8000-000000000061',
    name: 'Project P5',
    projectRevision,
    archived: false,
    replayed: false,
  })
  assert.deepEqual(prepared.map(({ input }) => input), [projectId])
  assert.deepEqual(statements.slice(0, prepared[0].statementsBefore).map(({ statement }) => statement.trim().split('(')[0]), [
    'BEGIN', 'SELECT * FROM project.reserve_or_replay_create_project', 'COMMIT',
  ])
  const created = statements.find(({ statement }) => statement.includes('create_project_with_repository'))
  assert.deepEqual(created.values, [
    '10000000-0000-4000-8000-000000000061', '20000000-0000-4000-8000-000000000061', created.values[2], created.values[3], projectId,
    'Project P5', projectRevision, '1'.repeat(40),
  ])
  // Creating a Project no longer manufactures a grant: membership in the Workspace is the whole
  // of the creator's access.
  assert.equal(statements.some(({ statement }) => statement.includes('iam.')), false)
  assert.equal(statements.some(({ statement }) => statement.includes('complete_create_project_receipt')), true)
  assert.equal(statements.filter(({ statement }) => statement === 'COMMIT').length, 2)
})

test('S3-P5 command failure matrix never reaches a false terminal receipt', async () => {
  const { createProjectStore } = await import(hubModuleUrl('project/store.js'))
  const projectId = '30000000-0000-8000-8000-000000000065'
  const projectRevision = '50000000-0000-8000-8000-000000000065'
  const input = {
    accountId: '10000000-0000-4000-8000-000000000065',
    workspaceId: '20000000-0000-4000-8000-000000000065',
    idempotencyKey: 'failure-key',
    body: { name: 'Failure Matrix', sourceBootstrap: { mode: 'NEW' } },
  }
  const scenario = async ({ reservationState = 'RESERVED', prepare = async () => '1'.repeat(40), settlementFailure = null, body = input.body }, expected) => {
    const statements = []
    const client = {
      async query(statement, values = []) {
        statements.push({ statement, values })
        if (statement.includes('reserve_or_replay_create_project')) {
          return { rows: [{ state: reservationState, project_id: projectId, response_status: null, response_body: null }] }
        }
        if (statement.includes('lock_create_project_receipt')) return { rows: [{ outcome: 'RESERVED', project_id: projectId }] }
        if (settlementFailure && statement.includes('create_project_with_repository')) throw settlementFailure
        return { rows: [] }
      },
      release() {},
    }
    const identities = [projectId, projectRevision]
    const store = createProjectStore({
      commandPool: { connect: async () => client },
      repository: { prepare },
      mintIdentity: () => identities.shift(),
    })
    await assert.rejects(store.createProject({ ...input, body }), expected)
    assert.equal(statements.some(({ statement }) => statement.includes('complete_create_project_receipt')), false)
    return statements.map(({ statement }) => statement)
  }

  await scenario({ reservationState: 'CONFLICT' }, { id: 'IDEMPOTENCY_CONFLICT' })
  const imported = await scenario({ body: { name: 'Imported', sourceBootstrap: { mode: 'EXISTING_GIT', repositoryLocator: 'https://example.test/app.git' } } }, { id: 'PROJECT_SOURCE_REFUSED' })
  assert.deepEqual(imported, [])
  await scenario({ prepare: async () => { throw new Error('CONEXUS_GIT_MAIN_MISSING') } }, { id: 'PROJECT_REPOSITORY_UNAVAILABLE', details: { reason: 'CONEXUS_GIT_MAIN_MISSING' } })
  await scenario({ prepare: async () => { throw new Error('spawn git ENOENT /var/lib/conexus/git/secret') } }, { id: 'PROJECT_REPOSITORY_UNAVAILABLE', details: { reason: 'CONEXUS_GIT_FAILED' } })
  const settlement = await scenario({ settlementFailure: new Error('SYNTHETIC_SETTLEMENT_FAILURE') }, /SYNTHETIC_SETTLEMENT_FAILURE/)
  assert.equal(settlement.includes('ROLLBACK'), true)
})

test('S3-P5 generated HTTP route enforces authenticity/session and returns only terminal representation', async (t) => {
  const { registerProjectRoutes } = await import(hubModuleUrl('project/routes.js'))
  const { Failure } = await import(hubModuleUrl('platform/failure.js'))
  const { logger } = await import(hubModuleUrl('platform/logger.js'))

  const pinoStreamSym = Object.getOwnPropertySymbols(logger).find((s) => s.description === 'pino.stream')
  const stream = logger[pinoStreamSym]
  const logs = []
  const originalWrite = stream.write.bind(stream)
  stream.write = (chunk) => {
    try { logs.push(JSON.parse(chunk)) } catch {}
  }
  t.after(() => { stream.write = originalWrite })
  const response = {
    projectId: '30000000-0000-8000-8000-000000000063',
    workspaceId: '20000000-0000-4000-8000-000000000063',
    name: 'HTTP Project',
    projectRevision: '50000000-0000-8000-8000-000000000063',
    archived: false,
    replayed: false,
  }
  let authenticated = true
  let refusal = null
  const token = opaque('project-author')
  const { app } = await testListener({
    sessions: { [token]: () => authenticated ? { account: { accountId: 'account-63' } } : null },
    registerRoutes: (server) => registerProjectRoutes(server, {
      store: { createProject: async () => { if (refusal) throw refusal; return response } },
    }),
  })
  t.after(() => app.close())
  const request = (overrides = {}) => app.inject({
    method: 'POST',
    url: '/api/control/workspaces/20000000-0000-4000-8000-000000000063/projects',
    headers: {
      ...hubJsonWrite,
      cookie: hubSessionCookie(token),
      'idempotency-key': 'http-key',
      ...overrides.headers,
    },
    payload: overrides.payload ?? { name: 'HTTP Project', sourceBootstrap: { mode: 'NEW' } },
  })
  const success = await request()
  assert.equal(success.statusCode, 201)
  assert.deepEqual(success.json(), Object.fromEntries(Object.entries(response).filter(([key]) => key !== 'replayed')))
  const forged = await request({ headers: { origin: 'https://forged.test' } })
  assert.equal(forged.statusCode, 403)
  const crossSite = await request({ headers: { 'sec-fetch-site': 'cross-site' } })
  assert.equal(crossSite.statusCode, 403)
  authenticated = false
  const anonymous = await request()
  assert.equal(anonymous.statusCode, 401)
  authenticated = true
  const malformed = await request({ payload: { name: 'Missing source' } })
  assert.equal(malformed.statusCode, 400)
  refusal = new Failure('PROJECT_REPOSITORY_UNAVAILABLE', { details: { reason: 'FACTORY_INSTALLATION_ORGANIZATION_REQUIRED' } })
  const refused = await request()
  assert.deepEqual([refused.statusCode, refused.json()], [503, {
    type: 'urn:conexus:problem:PROJECT_REPOSITORY_UNAVAILABLE', title: 'PROJECT_REPOSITORY_UNAVAILABLE', status: 503, code: 'PROJECT_REPOSITORY_UNAVAILABLE',
  }])
  const repoRefusedLog = logs.find((r) => r.msg === 'PROJECT_REPOSITORY_UNAVAILABLE')
  assert.ok(repoRefusedLog, 'PROJECT_REPOSITORY_UNAVAILABLE was logged')
  assert.equal(repoRefusedLog.level, 50)
  assert.equal(repoRefusedLog['failure.details.reason'], 'FACTORY_INSTALLATION_ORGANIZATION_REQUIRED')

  refusal = new Error('UNEXPECTED_STORE_BLOWUP')
  const failed = await request()
  assert.equal(failed.statusCode, 500)
  const routeFailedLog = logs.find((r) => r.msg === 'INTERNAL_UNEXPECTED')
  assert.ok(routeFailedLog, 'INTERNAL_UNEXPECTED was logged')
  assert.equal(routeFailedLog.level, 50)
  assert.equal(routeFailedLog['exception.type'], 'Error')
})

