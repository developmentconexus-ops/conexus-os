import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

test('GET project-summaries authenticates, sorts by lastActivityAt, and answers the store as-is', async (t) => {
  const { createHttpApp } = await import(hubModuleUrl('http/app.js'))
  const { registerProjectSummaryRoutes } = await import(hubModuleUrl('project/summary-routes.js'))

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
})

test('GET project repository answers REACHABLE, UNREACHABLE and denial from the port', async (t) => {
  const { createHttpApp } = await import(hubModuleUrl('http/app.js'))
  const { registerProjectRepositoryRoutes } = await import(hubModuleUrl('builder/repository-routes.js'))

  const projectId = '30000000-0000-4000-8000-000000000102'
  let authenticated = true
  let answer = { state: 'REACHABLE', fullName: 'acme-org/widgets', url: 'https://github.com/acme-org/widgets' }
  let calledWith = null
  const app = await createHttpApp({
    staticRoot: null,
    registerRoutes: (server) => registerProjectRepositoryRoutes(server, {
      resolveCurrentSession: async () => authenticated ? { account: { accountId: 'account-102' } } : null,
      repository: {
        read: async (input) => {
          calledWith = input
          if (answer instanceof Error) throw answer
          return answer
        },
      },
    }),
  })
  t.after(() => app.close())

  const read = () => app.inject({ method: 'GET', url: `/api/control/projects/${projectId}/repository` })
  const reachable = await read()
  assert.equal(reachable.statusCode, 200)
  assert.deepEqual(reachable.json(), answer)
  assert.deepEqual(calledWith, { accountId: 'account-102', projectId })

  answer = { state: 'UNREACHABLE' }
  const unreachable = await read()
  assert.equal(unreachable.statusCode, 200)
  assert.deepEqual(unreachable.json(), { state: 'UNREACHABLE' })

  authenticated = false
  assert.equal((await read()).statusCode, 401)
  authenticated = true

  answer = new Error('NOT_AUTHORIZED')
  const denied = await read()
  assert.equal(denied.statusCode, 403)
  assert.equal(denied.json().type.endsWith('project-build-denied'), true)

  answer = new Error('BUILDER_FACTORY_UNAVAILABLE')
  const outage = await read()
  assert.equal(outage.statusCode, 503)
  assert.equal(outage.json().type.endsWith('repository-state-unavailable'), true)
  // Neither GitHub's own message nor any token-bearing detail crosses the boundary.
  assert.equal(JSON.stringify(outage.json()).includes('BUILDER_FACTORY_UNAVAILABLE'), false)
})

test('GET project thumbnail streams PNG bytes with ETag and cache control, handles 401, 404, 503', async (t) => {
  const { createHttpApp } = await import(hubModuleUrl('http/app.js'))
  const { registerProjectThumbnailRoutes } = await import(hubModuleUrl('project/thumbnail-routes.js'))

  const projectId = '30000000-0000-4000-8000-000000000103'
  let authenticated = true
  let answer = {
    projectId,
    artifactRevisionId: 'rev-001',
    mediaType: 'image/png',
    bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    byteLength: 8,
    sha256: 'fake-sha256',
    createdAt: '2026-09-28T12:00:00.000Z',
  }
  let calledWith = null

  const app = await createHttpApp({
    staticRoot: null,
    registerRoutes: (server) => registerProjectThumbnailRoutes(server, {
      resolveCurrentSession: async () => authenticated ? { account: { accountId: 'account-103' } } : null,
      reader: {
        readThumbnail: async (input) => {
          calledWith = input
          if (answer instanceof Error) throw answer
          return answer
        },
      },
    }),
  })
  t.after(() => app.close())

  const fetchThumbnail = (id = projectId) => app.inject({ method: 'GET', url: `/api/control/projects/${id}/thumbnail` })

  // 200 Success
  const res = await fetchThumbnail()
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['content-type'], 'image/png')
  assert.equal(res.headers['content-length'], '8')
  assert.equal(res.headers['cache-control'], 'private, no-cache')
  assert.equal(res.headers['etag'], '"rev-001"')
  assert.deepEqual(res.rawPayload, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  assert.deepEqual(calledWith, { accountId: 'account-103', projectId })

  // 401 Unauthenticated
  authenticated = false
  const unauth = await fetchThumbnail()
  assert.equal(unauth.statusCode, 401)
  authenticated = true

  // 404 Not Found (no thumbnail)
  answer = null
  const notFound = await fetchThumbnail()
  assert.equal(notFound.statusCode, 404)
  assert.equal(notFound.json().type.endsWith('project-thumbnail-not-found'), true)

  // 404 Invalid project ID (e.g. Postgres 22P02)
  answer = Object.assign(new Error('invalid input syntax for type uuid'), { code: '22P02' })
  const malformed = await fetchThumbnail()
  assert.equal(malformed.statusCode, 404)
  assert.equal(malformed.json().type.endsWith('project-not-found'), true)

  // 503 Service Unavailable / Store failure
  answer = new Error('DATABASE_CONNECTION_REFUSED')
  const unavailable = await fetchThumbnail()
  assert.equal(unavailable.statusCode, 503)
  assert.equal(unavailable.json().type.endsWith('project-thumbnail-unavailable'), true)
})
