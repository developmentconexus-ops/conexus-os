import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

test('S3-P6 store composes read-only current admission before Project disclosure', async () => {
  const { createProjectStore } = await import(hubModuleUrl('project/store.js'))
  const statements = []
  const readClient = {
    async query(statement, values = []) {
      statements.push({ statement, values })
      if (statement.includes('list_project_summaries')) return { rows: [{
        project_id: '30000000-0000-4000-8000-000000000071',
        workspace_id: '20000000-0000-4000-8000-000000000071',
        name: 'Visible Project',
        archived: false,
      }] }
      if (statement.includes('project.get_project(')) return { rows: [{
        project_id: '30000000-0000-4000-8000-000000000071',
        workspace_id: '20000000-0000-4000-8000-000000000071',
        name: 'Visible Project',
        project_revision: '50000000-0000-4000-8000-000000000071',
        archived: false,
      }] }
      return { rows: [] }
    },
    release() {},
  }
  const store = createProjectStore({
    commandPool: { connect: async () => { throw new Error('COMMAND_POOL_NOT_ADMITTED_FOR_READ') } },
    readPool: { connect: async () => readClient },
    repository: {},
  })
  assert.deepEqual(await store.listProjects({
    accountId: '10000000-0000-4000-8000-000000000071',
    workspaceId: '20000000-0000-4000-8000-000000000071',
  }), [{
    projectId: '30000000-0000-4000-8000-000000000071',
    workspaceId: '20000000-0000-4000-8000-000000000071',
    name: 'Visible Project',
    archived: false,
  }])
  assert.equal((await store.getProject({
    accountId: '10000000-0000-4000-8000-000000000071',
    projectId: '30000000-0000-4000-8000-000000000071',
  }))?.projectRevision, '50000000-0000-4000-8000-000000000071')
  assert.equal(statements.filter(({ statement }) => statement === 'BEGIN READ ONLY').length, 2)
  assert.equal(statements.filter(({ statement }) => statement === 'COMMIT').length, 2)
  // The gate moved inside the data function, so the store must no longer compose admission of
  // its own: both reads are a single call carrying the account id.
  assert.equal(statements.some(({ statement }) => statement.includes('iam.')), false)
  assert.deepEqual(
    statements.filter(({ statement }) => statement.includes('project.')).map(({ values }) => values),
    [
      ['10000000-0000-4000-8000-000000000071', '20000000-0000-4000-8000-000000000071'],
      ['10000000-0000-4000-8000-000000000071', '30000000-0000-4000-8000-000000000071'],
    ])
})

test('S3-P6 HTTP reads separate authentication, empty list, exact detail and non-disclosure', async (t) => {
  const { createHttpApp } = await import(hubModuleUrl('http/app.js'))
  const { registerProjectRoutes } = await import(hubModuleUrl('project/routes.js'))
  const { logger } = await import(hubModuleUrl('platform/logger.js'))

  const pinoStreamSym = Object.getOwnPropertySymbols(logger).find((s) => s.description === 'pino.stream')
  const stream = logger[pinoStreamSym]
  const logs = []
  const originalWrite = stream.write.bind(stream)
  stream.write = (chunk) => {
    try { logs.push(JSON.parse(chunk)) } catch {}
  }
  t.after(() => { stream.write = originalWrite })
  const summary = {
    projectId: '30000000-0000-4000-8000-000000000072',
    workspaceId: '20000000-0000-4000-8000-000000000072',
    name: 'Disclosed Project',
    archived: false,
  }
  let authenticated = true
  let disclose = true
  const app = await createHttpApp({
    staticRoot: null,
    registerRoutes: (server) => registerProjectRoutes(server, {
      origin: 'https://conexus.test',
      resolveCurrentSession: async () => authenticated ? { account: { accountId: 'account-72' } } : null,
      store: {
        listProjects: async () => disclose ? [summary] : [],
        getProject: async () => disclose ? { ...summary, projectRevision: 'revision-72', deleting: false } : null,
        createProject: async () => { throw new Error('COMMAND_NOT_IN_READ_PROOF') },
      },
    }),
  })
  t.after(() => app.close())

  const list = () => app.inject({ method: 'GET', url: `/api/control/workspaces/${summary.workspaceId}/projects` })
  const detail = () => app.inject({ method: 'GET', url: `/api/control/projects/${summary.projectId}` })
  assert.deepEqual((await list()).json(), [summary])
  assert.deepEqual((await detail()).json(), { ...summary, projectRevision: 'revision-72', deleting: false })
  disclose = false
  assert.deepEqual((await list()).json(), [])
  assert.equal((await detail()).statusCode, 404)
  authenticated = false
  assert.equal((await list()).statusCode, 401)
  assert.equal((await detail()).statusCode, 401)

  authenticated = true
  let failReads = false
  const errorApp = await createHttpApp({
    staticRoot: null,
    registerRoutes: (server) => registerProjectRoutes(server, {
      origin: 'https://conexus.test',
      resolveCurrentSession: async () => ({ account: { accountId: 'account-72' } }),
      store: {
        listProjects: async () => { if (failReads) throw new Error('STORE_DOWN'); return [] },
        getProject: async () => { if (failReads) throw new Error('STORE_DOWN'); return null },
        createProject: async () => { throw new Error('NOT_IMPLEMENTED') },
      },
    }),
  })
  t.after(() => errorApp.close())

  failReads = true
  const listErr = await errorApp.inject({ method: 'GET', url: `/api/control/workspaces/${summary.workspaceId}/projects` })
  assert.equal(listErr.statusCode, 500)
  const listLog = logs.find((r) => r.msg === 'PROJECT_ROUTE_FAILED' && r['conexus.workspace_id'] === summary.workspaceId)
  assert.ok(listLog, 'PROJECT_ROUTE_FAILED logged for list')
  assert.equal(listLog.level, 50)
  assert.equal(listLog['exception.message'], 'STORE_DOWN')

  const getErr = await errorApp.inject({ method: 'GET', url: `/api/control/projects/${summary.projectId}` })
  assert.equal(getErr.statusCode, 500)
  const getLog = logs.find((r) => r.msg === 'PROJECT_ROUTE_FAILED' && r['conexus.project_id'] === summary.projectId)
  assert.ok(getLog, 'PROJECT_ROUTE_FAILED logged for get')
  assert.equal(getLog.level, 50)
  assert.equal(getLog['exception.message'], 'STORE_DOWN')
})
