import assert from 'node:assert/strict'
import { test } from 'node:test'
import { jsonLines, runWithTelemetry, startCollector } from './telemetry-harness.mjs'

const SCRIPT = `
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Mastra } from '@mastra/core/mastra'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
const build = process.env.HUB_BUILD
const { createHttpApp } = await import(build + '/http/app.js')
const { Failure } = await import(build + '/platform/failure.js')
const { logger } = await import(build + '/platform/logger.js')
const { registerBuilderSessionRoutes } = await import(build + '/builder/mastra-session-routes.js')
const { createBuilderController } = await import(build + '/builder/harness/controller.js')
const { createConversationSessions } = await import(build + '/builder/conversation-sessions.js')

const root = mkdtempSync(join(tmpdir(), 'conexus-failure-http-'))
const storage = new LibSQLStore({ id: 'failure-http', url: 'file:' + join(root, 'session.db') })
const model = { specificationVersion: 'v2', provider: 'p', modelId: 'm', supportedUrls: {}, async doGenerate() { throw new Error('unused') }, async doStream() { throw new Error('unused') } }
const controller = createBuilderController({ id: 'conexus-builder', model, storage, memory: new Memory({ storage }), modelRetryDelayMs: () => 1, skillsPath: resolve('builder-skills') })
const mastra = new Mastra({ storage, agentControllers: { 'conexus-builder': controller }, logger: false })
await controller.init()
const sessions = createConversationSessions({ controller, now: () => 0, sweepEveryMs: 3_600_000 })
const PROJECT = '33333333-3333-4333-8333-333333333333'
const THREADS = '/api/builder/agent-controller/conexus-builder/sessions/project:' + PROJECT + '/threads?sessionScope=conversation:77777777-7777-4777-8777-777777777777'
let threadsThrow = () => { throw new Error('unset') }
controller.queryThreads = async () => threadsThrow()

const app = await createHttpApp({ registerRoutes: async (server) => {
  server.get('/root-async', async () => { throw new Failure('INTERNAL_UNEXPECTED', { details: { project: 'p1' } }) })
  server.get('/root-sync', () => { throw new Failure('NOT_FOUND') })
  server.get('/vendor', async () => { throw new Error('PLANTED_VENDOR_TEXT') })
  server.post('/validated', { schema: { body: { type: 'object', required: ['a'], properties: { a: { type: 'string' } } } } }, async () => 'ok')
  await server.register(async (scope) => {
    scope.addHook('onRequest', async (request) => { if (request.url === '/scoped/hook') throw new Failure('NOT_FOUND') })
    scope.get('/scoped/route', async () => { throw new Failure('NOT_FOUND') })
    scope.get('/scoped/hook', async () => 'x')
  })
  await registerBuilderSessionRoutes(server, {
    mastra, controllerId: 'conexus-builder', controller, sessions, origin: 'https://conexus.test',
    resolveCurrentSession: async () => ({ account: { accountId: '22222222-2222-4222-8222-222222222222', displayName: 'Operator' }, issuer: 'https://issuer.test', subject: 's' }),
    admitProject: async () => true, conversationOwner: async () => 'PROJECT', projectBusy: async () => false, runContext: () => undefined, answerParked: async () => 'RESUMED',
  })
  return []
} })
const cases = [
  ['root async Failure', { url: '/root-async' }],
  ['root sync Failure', { url: '/root-sync' }],
  ['plain Error', { url: '/vendor' }],
  ['scoped route', { url: '/scoped/route' }],
  ['onRequest hook', { url: '/scoped/hook' }],
  ['unknown route', { url: '/nowhere' }],
  ['invalid body', { method: 'POST', url: '/validated', payload: { b: 1 } }],
  ['malformed JSON', { method: 'POST', url: '/validated', payload: '{bad', headers: { 'content-type': 'application/json' } }],
  ['unsupported media type', { method: 'POST', url: '/validated', payload: '<a/>', headers: { 'content-type': 'application/xml' } }],
  ['mount plain Error', { url: THREADS, cookies: { '__Host-conexus_session': 's' }, before: () => { threadsThrow = () => { throw new Error('PLANTED_VENDOR_TEXT') } } }],
]
const report = {}
for (const [name, { before, ...request }] of cases) {
  before?.()
  logger.info('CASE ' + name)
  const answer = await app.inject(request)
  report[name] = [answer.statusCode, answer.headers['content-type'], answer.body]
}
logger.info('CASE end')
console.log(JSON.stringify({ report }))
await sessions.close()
await app.close()
await controller.destroy()
await storage.close()
`

const run = async () => {
  const collector = await startCollector()
  const result = await runWithTelemetry(SCRIPT, { endpoint: collector.endpoint }).finally(() => collector.close())
  assert.equal(result.code, 0, result.stderr)
  const records = jsonLines(result.stdout)
  const { report } = records.find((record) => record.report)
  const logged = (name) => {
    const from = records.findIndex((record) => record.msg === `CASE ${name}`)
    const rest = records.slice(from + 1)
    const to = rest.findIndex((record) => typeof record.msg === 'string' && record.msg.startsWith('CASE '))
    return rest.slice(0, to).filter((record) => !record.report)
  }
  const answer = (name) => {
    const [status, type, body] = report[name]
    return { status, type, body: JSON.parse(body) }
  }
  return { answer, logged, stdout: result.stdout }
}

test('every route shape answers a failure as problem+json and writes exactly one log line', async () => {
  const { answer, logged } = await run()
  const expected = [
    ['root async Failure', 500, 'INTERNAL_UNEXPECTED', 50],
    ['root sync Failure', 404, 'NOT_FOUND', 30],
    ['plain Error', 500, 'INTERNAL_UNEXPECTED', 50],
    ['scoped route', 404, 'NOT_FOUND', 30],
    ['onRequest hook', 404, 'NOT_FOUND', 30],
    ['unknown route', 404, 'NOT_FOUND', 30],
    ['invalid body', 400, 'REQUEST_VALIDATION_FAILED', 30],
    ['malformed JSON', 400, 'REQUEST_JSON_INVALID', 30],
    ['unsupported media type', 415, 'REQUEST_MEDIA_TYPE_UNSUPPORTED', 30],
    ['mount plain Error', 500, 'INTERNAL_UNEXPECTED', 50],
  ]
  for (const [name, status, code, level] of expected) {
    const { status: got, type, body } = answer(name)
    assert.equal(got, status, name)
    assert.equal(type.startsWith('application/problem+json'), true, `${name}: ${type}`)
    assert.deepEqual({ type: body.type, title: body.title, status: body.status, code: body.code }, { type: `urn:conexus:problem:${code}`, title: code, status, code }, name)
    const lines = logged(name)
    assert.deepEqual(lines.map((line) => [line.msg, line.level]), [[code, level]], `${name}: one line`)
  }
})

test('a fault nobody named answers INTERNAL_UNEXPECTED with a trace id, and its text stays in the log', async () => {
  const { answer, logged, stdout } = await run()
  for (const name of ['plain Error', 'mount plain Error']) {
    const { body } = answer(name)
    assert.match(body.traceId, /^[0-9a-f]{32}$/, name)
    assert.equal(JSON.stringify(body).includes('PLANTED_VENDOR_TEXT'), false, `${name}: the answer carries no vendor text`)
    assert.equal(logged(name)[0]['exception.message'], 'PLANTED_VENDOR_TEXT', `${name}: the log has the cause`)
  }
  assert.equal(answer('root async Failure').body.traceId.length, 32)
  assert.equal(logged('root async Failure')[0]['failure.details.project'], 'p1')
  assert.equal(answer('root sync Failure').body.traceId, undefined, 'a USER row carries no trace id')
  assert.equal(stdout.includes('HTTP_SERVER_ERROR'), false)
})
