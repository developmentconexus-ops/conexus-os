import assert from 'node:assert/strict'
import test from 'node:test'
import { z } from 'zod'
import { operation, ProjectId } from '../../packages/contract/dist/index.js'
import { hubModuleUrl } from './hub-build.mjs'
import { hubSessionCookie, opaque, testListener } from './access/test-listener.mjs'

const { routes } = await import(hubModuleUrl('http/access.js'))
const projectId = '33333333-3333-4333-8333-333333333333'
const token = opaque('contract-operation')
const signedIn = { cookie: hubSessionCookie(token) }

test('an operation maps each malformed boundary and strips an extra reply field', async (t) => {
  const op = operation({
    id: 'PRJ-02', access: 'session', method: 'GET', path: '/api/control/probe/:projectId',
    params: z.object({ projectId: ProjectId }),
    query: z.object({ page: z.coerce.number().int() }),
    headers: null, body: null,
    success: { 200: z.object({ projectId: ProjectId, page: z.number().int() }) },
    effects: [], failures: [], malformed: { projectId: 'PROJECT_NOT_FOUND' },
  })
  const { app } = await testListener({
    sessions: { [token]: { account: { accountId: '11111111-1111-4111-8111-111111111111', displayName: 'Test' }, issuer: 'test', subject: 'test' } },
    registerRoutes: async (server) => {
      routes(server).operation(op, async (input) => ({ projectId: input.params.projectId, page: input.query.page, secret: 'never on the wire' }))
      return [op.id]
    },
  })
  t.after(() => app.close())

  const malformed = await app.inject({ method: 'GET', url: '/api/control/probe/not-a-uuid?page=1', headers: signedIn })
  assert.equal(malformed.statusCode, 404)
  assert.equal(malformed.json().code, 'PROJECT_NOT_FOUND')

  const query = await app.inject({ method: 'GET', url: `/api/control/probe/${projectId}?page=no`, headers: signedIn })
  assert.equal(query.statusCode, 400)
  assert.equal(query.json().code, 'REQUEST_VALIDATION_FAILED')

  const valid = await app.inject({ method: 'GET', url: `/api/control/probe/${projectId}?page=2`, headers: signedIn })
  assert.equal(valid.statusCode, 200)
  assert.deepEqual(valid.json(), { projectId, page: 2 })
})
