import assert from 'node:assert/strict'
import { test } from 'node:test'
import { jsonLines, runWithTelemetry, startCollector } from './telemetry-harness.mjs'

const SCRIPT = `
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { ConsoleLogger } from '@mastra/core/logger'
import { Mastra } from '@mastra/core/mastra'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
const build = process.env.HUB_BUILD
const { createHttpApp } = await import(build + '/http/app.js')
const { foreignRoutes, routes } = await import(build + '/http/access.js')
const { Failure } = await import(build + '/platform/failure.js')
const { logger } = await import(build + '/platform/logger.js')
const { mountLogFilter, mountValidationFailure, registerBuilderSessionRoutes } = await import(build + '/builder/mastra-session-routes.js')
const { createBuilderController } = await import(build + '/builder/harness/controller.js')
const { createLiveConversations } = await import(build + '/builder/conversation.js')

const root = mkdtempSync(join(tmpdir(), 'conexus-failure-http-'))
const storage = new LibSQLStore({ id: 'failure-http', url: 'file:' + join(root, 'session.db') })
const model = { specificationVersion: 'v2', provider: 'p', modelId: 'm', supportedUrls: {}, async doGenerate() { throw new Error('unused') }, async doStream() { throw new Error('unused') } }
const controller = createBuilderController({ id: 'conexus-builder', model, storage, memory: new Memory({ storage }), modelRetryDelayMs: () => 1, skillsPath: resolve('builder-skills') })
const onErrorCalls = []
const mastra = new Mastra({
  storage,
  agentControllers: { 'conexus-builder': controller },
  logger: new ConsoleLogger({ name: 'conexus-builder', level: 'warn', filter: mountLogFilter }),
  server: { onValidationError: mountValidationFailure, onError: (error, context) => { onErrorCalls.push(error.message); return context.json({}, 500) } },
})
await controller.init()
const sessions = createLiveConversations({ controller, sandboxes: { open: () => ({ workspace: undefined }) }, readSandboxId: async () => null, runOpen: () => false, now: () => 0 })
const PROJECT = '33333333-3333-4333-8333-333333333333'
const THREADS = '/api/builder/agent-controller/conexus-builder/sessions/project:' + PROJECT + '/threads?sessionScope=conversation:77777777-7777-4777-8777-777777777777'
const MODEL = '/api/builder/agent-controller/conexus-builder/sessions/project:' + PROJECT + '/model?sessionScope=conversation:77777777-7777-4777-8777-777777777777'
let threadsThrow = () => { throw new Error('unset') }
controller.queryThreads = async () => threadsThrow()

const HUB = 'https://conexus.test'
const policy = {
  listener: 'hub', hubOrigin: HUB,
  resolveHubSession: async () => ({ account: { accountId: '22222222-2222-4222-8222-222222222222', displayName: 'Operator' }, issuer: 'https://issuer.test', subject: 's' }),
}
const app = await createHttpApp({ policy, registerRoutes: async (server) => {
  const route = routes(server)
  route.navigation({ url: '/root-async', handler: async () => { throw new Failure('INTERNAL_UNEXPECTED', { details: { project: 'p1' } }) } })
  route.navigation({ url: '/root-sync', handler: () => { throw new Failure('NOT_FOUND') } })
  route.navigation({ url: '/vendor', handler: async () => { throw new Error('PLANTED_VENDOR_TEXT') } })
  route.session({ method: 'POST', url: '/validated', schema: { body: { type: 'object', required: ['a'], properties: { a: { type: 'string' } } } }, handler: async () => 'ok' })
  await foreignRoutes(server, 'navigation', async (scope) => {
    scope.addHook('onRequest', async (request) => { if (request.url === '/scoped/hook') throw new Failure('NOT_FOUND') })
    scope.get('/scoped/route', async () => { throw new Failure('NOT_FOUND') })
    scope.get('/scoped/hook', async () => 'x')
  })
  await registerBuilderSessionRoutes(server, {
    mastra, controllerId: 'conexus-builder', controller, conversations: sessions,
    mayBuild: async () => true, conversationOwner: async () => 'PROJECT', projectBusy: async () => false, answerQuestion: () => 'ACCEPTED',
  })
  return []
} })
const write = { origin: HUB, 'content-type': 'application/json' }
const signedIn = { '__Host-conexus_session': 's'.repeat(43) }
const cases = [
  ['root async Failure', { url: '/root-async' }],
  ['root sync Failure', { url: '/root-sync' }],
  ['plain Error', { url: '/vendor' }],
  ['scoped route', { url: '/scoped/route' }],
  ['onRequest hook', { url: '/scoped/hook' }],
  ['unknown route', { url: '/nowhere' }],
  ['invalid body', { method: 'POST', url: '/validated', payload: { b: 1 }, headers: write }],
  ['malformed JSON', { method: 'POST', url: '/validated', payload: '{bad', headers: write }],
  ['unsupported media type', { method: 'POST', url: '/validated', payload: '<a/>', headers: { origin: HUB, 'content-type': 'application/xml' } }],
  ['mount invalid body', { method: 'POST', url: MODEL, cookies: signedIn, headers: write, payload: { nope: 1 } }],
  ['mount plain Error', { url: THREADS, cookies: signedIn, before: () => { threadsThrow = () => { throw new Error('PLANTED_VENDOR_TEXT') } } }],
]
const report = {}
for (const [name, { before, ...request }] of cases) {
  before?.()
  logger.info('CASE ' + name)
  const answer = await app.inject(request)
  report[name] = [answer.statusCode, answer.headers['content-type'], answer.body]
}
logger.info('CASE end')
console.log(JSON.stringify({ report, onErrorCalls }))
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
  return { answer, logged, stdout: result.stdout, stderr: result.stderr, onErrorCalls: records.find((record) => record.report).onErrorCalls }
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
    ['mount invalid body', 400, 'REQUEST_VALIDATION_FAILED', 30],
    ['mount plain Error', 500, 'INTERNAL_UNEXPECTED', 50],
  ]
  for (const [name, status, code, level] of expected) {
    const { status: got, type, body } = answer(name)
    assert.equal(got, status, name)
    // Mastra sends a validation hook's body as plain JSON; the body is the same problem.
    assert.equal(type.startsWith(name === 'mount invalid body' ? 'application/json' : 'application/problem+json'), true, `${name}: ${type}`)
    assert.deepEqual({ type: body.type, title: body.title, status: body.status, code: body.code }, { type: `urn:conexus:problem:${code}`, title: code, status, code }, name)
    const lines = logged(name)
    assert.deepEqual(lines.map((line) => [line.msg, line.level]), [[code, level]], `${name}: one line`)
  }
})

test('a fault nobody named answers INTERNAL_UNEXPECTED with a trace id, and its text is in neither the answer nor the log', async () => {
  const { answer, logged, stdout } = await run()
  for (const name of ['plain Error', 'mount plain Error']) {
    const { body } = answer(name)
    assert.match(body.traceId, /^[0-9a-f]{32}$/, name)
    assert.equal(JSON.stringify(body).includes('PLANTED_VENDOR_TEXT'), false, `${name}: the answer carries no vendor text`)
    assert.equal(logged(name)[0]['exception.type'], 'Error', `${name}: the log has the cause's type`)
    assert.equal(JSON.stringify(logged(name)).includes('PLANTED_VENDOR_TEXT'), false, `${name}: the log carries no vendor text`)
  }
  assert.equal(answer('root async Failure').body.traceId.length, 32)
  assert.equal(logged('root async Failure')[0]['failure.details.project'], 'p1')
  assert.equal(answer('root sync Failure').body.traceId, undefined, 'a USER row carries no trace id')
  assert.equal(stdout.includes('HTTP_SERVER_ERROR'), false)
})

test("Mastra's server.onError is not called for the mount's routes, and its own handler-error line is filtered so one line remains", async () => {
  const { onErrorCalls, stdout, stderr } = await run()
  assert.deepEqual(onErrorCalls, [])
  assert.equal(`${stdout}${stderr}`.includes('Error calling handler'), false)
})
