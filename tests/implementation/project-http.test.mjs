import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import { hubSessionCookie, opaque, testListener } from './access/test-listener.mjs'

const TOKEN = opaque('project-reader')
const cookie = hubSessionCookie(TOKEN)
const ACCOUNT = '10000000-0000-4000-8000-000000000072'
const WORKSPACE = '20000000-0000-4000-8000-000000000072'
const PROJECT = '30000000-0000-4000-8000-000000000072'
const REVISION = '50000000-0000-4000-8000-000000000072'
const summary = { projectId: PROJECT, workspaceId: WORKSPACE, name: 'Disclosed Project', archived: false }
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const unreachable = () => { throw new Error('STORE_NOT_REACHED') }
const listener = async (t, { store = {}, thumbnailReader } = {}, authenticated = () => true) => {
  const { registerProjectRoutes } = await import(hubModuleUrl('project/routes.js'))
  const { app } = await testListener({
    sessions: { [TOKEN]: () => authenticated() ? { account: { accountId: ACCOUNT } } : null },
    registerRoutes: (server) => registerProjectRoutes(server, {
      store: { listProjects: unreachable, getProject: unreachable, createProject: unreachable, deleteProject: unreachable, listProjectSummariesWithActivity: unreachable, ...store },
      thumbnailReader,
    }),
  })
  t.after(() => app.close())
  return app
}
const get = (app, url) => app.inject({ method: 'GET', url, headers: { cookie } })
const problem = (response) => `${response.statusCode} ${response.json().code}`

test('PRJ-01 and PRJ-02 answer the store, 404 a hidden project, and 404 a malformed id before the store', async (t) => {
  let disclose = true
  const calls = []
  const app = await listener(t, { store: {
    listProjects: async (input) => { calls.push(input); return disclose ? [summary] : [] },
    getProject: async (input) => { calls.push(input); return disclose ? { ...summary, projectRevision: REVISION, deleting: false } : null },
  } })
  assert.deepEqual((await get(app, `/api/control/workspaces/${WORKSPACE}/projects`)).json(), [summary])
  assert.deepEqual((await get(app, `/api/control/projects/${PROJECT}`)).json(), { ...summary, projectRevision: REVISION, deleting: false })
  assert.deepEqual(calls, [{ accountId: ACCOUNT, workspaceId: WORKSPACE }, { accountId: ACCOUNT, projectId: PROJECT }])
  disclose = false
  assert.deepEqual((await get(app, `/api/control/workspaces/${WORKSPACE}/projects`)).json(), [])
  assert.equal(problem(await get(app, `/api/control/projects/${PROJECT}`)), '404 PROJECT_NOT_FOUND')
  assert.equal(problem(await get(app, '/api/control/projects/not-a-uuid')), '404 PROJECT_NOT_FOUND')
  assert.equal(problem(await get(app, '/api/control/workspaces/not-a-uuid/projects')), '404 WORKSPACE_NOT_FOUND')
})

test('PRJ-02 answers the purged tombstone with an empty revision and strips a column the schema does not name', async (t) => {
  const app = await listener(t, { store: {
    getProject: async () => ({ ...summary, projectRevision: '', deleting: true, secret: 'never on the wire' }),
  } })
  assert.deepEqual((await get(app, `/api/control/projects/${PROJECT}`)).json(), { ...summary, projectRevision: '', deleting: true })
})

test('a store failure on a read is the logged 500, and the session is checked first', async (t) => {
  let authenticated = true
  const app = await listener(t, { store: { listProjects: async () => { throw new Error('STORE_DOWN') } } }, () => authenticated)
  assert.equal(problem(await get(app, `/api/control/workspaces/${WORKSPACE}/projects`)), '500 INTERNAL_UNEXPECTED')
  authenticated = false
  assert.equal(problem(await get(app, `/api/control/workspaces/${WORKSPACE}/projects`)), '401 AUTHENTICATION_REQUIRED')
})

test('PRJ-SUMMARIES answers the cards as { projects } and names its own failure', async (t) => {
  const card = { projectId: PROJECT, name: 'Fresh', archived: false, lastActivityAt: '2026-02-03T00:00:00.000Z', latestRun: { state: 'SUCCEEDED', resultKind: 'SOURCE_CHANGED' }, hasPreview: true, deleting: false }
  let failure = null
  const app = await listener(t, { store: { listProjectSummariesWithActivity: async () => { if (failure) throw failure; return [card] } } })
  const url = `/api/control/workspaces/${WORKSPACE}/project-summaries`
  assert.deepEqual((await get(app, url)).json(), { projects: [card] })
  assert.equal(problem(await get(app, '/api/control/workspaces/not-a-uuid/project-summaries')), '404 WORKSPACE_NOT_FOUND')
  failure = new Error('DATABASE_DOWN')
  assert.equal(problem(await get(app, url)), '503 PROJECT_SUMMARIES_UNAVAILABLE')
})

test('PRJ-THUMBNAIL streams the PNG with its ETag and cache header, and names 404 and 503', async (t) => {
  let answer = { artifactRevisionId: 'rev-001', mediaType: 'image/png', bytes: PNG, sha256: 'x' }
  const calls = []
  const app = await listener(t, { thumbnailReader: { readThumbnail: async (input) => { calls.push(input); if (answer instanceof Error) throw answer; return answer } } })
  const url = `/api/control/projects/${PROJECT}/thumbnail`
  const ok = await get(app, url)
  assert.equal(ok.statusCode, 200)
  assert.equal(ok.headers['content-type'], 'image/png')
  assert.equal(ok.headers['content-length'], '8')
  assert.equal(ok.headers['cache-control'], 'private, no-cache')
  assert.equal(ok.headers.etag, '"rev-001"')
  assert.deepEqual(ok.rawPayload, PNG)
  assert.deepEqual(calls, [{ accountId: ACCOUNT, projectId: PROJECT }])
  answer = null
  assert.equal(problem(await get(app, url)), '404 PROJECT_THUMBNAIL_NOT_FOUND')
  assert.equal(problem(await get(app, '/api/control/projects/not-a-uuid/thumbnail')), '404 PROJECT_NOT_FOUND')
  answer = new Error('DATABASE_DOWN')
  assert.equal(problem(await get(app, url)), '503 PROJECT_THUMBNAIL_UNAVAILABLE')
})

test('PRJ-THUMBNAIL without a reader answers its unavailable failure', async (t) => {
  const app = await listener(t)
  assert.equal(problem(await get(app, `/api/control/projects/${PROJECT}/thumbnail`)), '503 PROJECT_THUMBNAIL_UNAVAILABLE')
})
