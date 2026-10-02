import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

test('GET project-summaries authenticates, sorts by lastActivityAt, and answers the store as-is', async (t) => {
  const { createHttpApp } = await import(hubModuleUrl('http/app.js'))
  const { registerProjectSummaryRoutes } = await import(hubModuleUrl('project/summary-routes.js'))
  const { logger } = await import(hubModuleUrl('platform/logger.js'))

  const pinoStreamSym = Object.getOwnPropertySymbols(logger).find((s) => s.description === 'pino.stream')
  const stream = logger[pinoStreamSym]
  const logs = []
  const originalWrite = stream.write.bind(stream)
  stream.write = (chunk) => {
    try { logs.push(JSON.parse(chunk)) } catch {}
  }
  t.after(() => { stream.write = originalWrite })

  const workspaceId = '20000000-0000-4000-8000-000000000101'
  const summaries = [
    { projectId: 'p-1', name: 'Fresh', archived: false, lastActivityAt: '2026-02-03T00:00:00.000Z', latestRun: { state: 'SUCCEEDED', resultKind: 'SOURCE_CHANGED' }, hasPreview: true },
    { projectId: 'p-2', name: 'Stale', archived: false, lastActivityAt: '2026-01-01T00:00:00.000Z', latestRun: null, hasPreview: false },
  ]
  let authenticated = true
  let calledWith = null
  let failWith = null
  const app = await createHttpApp({
    staticRoot: null,
    registerRoutes: (server) => registerProjectSummaryRoutes(server, {
      resolveCurrentSession: async () => authenticated ? { account: { accountId: 'account-101' } } : null,
      store: {
        listProjectSummariesWithActivity: async (input) => {
          calledWith = input
          if (failWith) throw failWith
          return summaries
        },
      },
    }),
  })
  t.after(() => app.close())

  const list = () => app.inject({ method: 'GET', url: `/api/control/workspaces/${workspaceId}/project-summaries` })
  const response = await list()
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { projects: summaries })
  assert.deepEqual(calledWith, { accountId: 'account-101', workspaceId })

  authenticated = false
  assert.equal((await list()).statusCode, 401)
  authenticated = true

  failWith = Object.assign(new Error('invalid input syntax for type uuid'), { code: '22P02' })
  const malformed = await list()
  assert.equal(malformed.statusCode, 404)
  assert.equal(malformed.json().type.endsWith('workspace-not-found'), true)

  failWith = new Error('PROJECT_READ_POOL_NOT_CONFIGURED')
  const unavailable = await list()
  assert.equal(unavailable.statusCode, 503)
  assert.equal(unavailable.json().type.endsWith('project-summaries-unavailable'), true)
  const failure = logs.find((record) => record.msg === 'PROJECT_SUMMARIES_FAILED')
  assert.ok(failure, 'PROJECT_SUMMARIES_FAILED was logged')
  assert.equal(failure.level, 50)
  assert.equal(failure['exception.message'], 'PROJECT_READ_POOL_NOT_CONFIGURED')
  assert.equal(failure['conexus.workspace_id'], workspaceId)
})
