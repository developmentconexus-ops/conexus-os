export function failureHttpScript({ network = false, runner = false } = {}) {
  return `
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { ConsoleLogger } from '@mastra/core/logger'
import { Mastra } from '@mastra/core/mastra'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { MastraServer } from '@mastra/fastify'
import { z } from 'zod'
import { trace } from '@opentelemetry/api'
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
${runner ? `const { createApplicationRunnerApp } = await import(build + '/app-runner/http.js')
const { createApplicationRunnerClient } = await import(build + '/app-runner/module.js')
const runnerSocket = join(root, 'runner.sock')
const runnerLogs = []
const runnerContexts = []
const hubInvokeContexts = []
const runner = createApplicationRunnerApp({
  supervisor: {
    prepare: async () => { throw new Error('PRIVATE_RUNNER_CAUSE') },
    invoke: async () => { throw new Error('PRIVATE_RUNNER_CAUSE') },
    release: async () => { throw new Error('PRIVATE_RUNNER_CAUSE') },
  },
  log: (event) => runnerLogs.push(event),
})
runner.addHook('onRequest', async (request) => { runnerContexts.push({ traceparent: request.headers.traceparent, traceId: trace.getActiveSpan()?.spanContext().traceId }) })
await runner.listen({ path: runnerSocket })
const runnerClient = createApplicationRunnerClient(runnerSocket)
const runnerInput = {
  projectId: '11111111-1111-4111-8111-111111111111', operation: 'find', input: {},
  files: [{ path: 'conexus-server/manifest.json', content: 'e30=', sha256: 'a'.repeat(64) }],
  caller: { accountId: '22222222-2222-4222-8222-222222222222', email: null, displayName: 'Synthetic' },
}` : ''}
let threadsThrow = () => { throw new Error('unset') }
controller.queryThreads = async () => threadsThrow()

const HUB = 'https://conexus.test'
const policy = {
  listener: 'hub', hubOrigin: HUB,
  resolveHubSession: async () => ({ account: { accountId: '22222222-2222-4222-8222-222222222222', displayName: 'Operator' }, issuer: 'https://issuer.test', subject: 's' }),
}
const onSend = []
const app = await createHttpApp({ policy, registerRoutes: async (server) => {
  server.addHook('onSend', async (request, reply, payload) => { onSend.push([request.url, reply.statusCode]); return payload })
  const route = routes(server)
  ${network ? `route.navigation({ url: '/project', handler: () => { throw new Failure('PROJECT_NOT_FOUND') } })
  await foreignRoutes(server, 'navigation', async (scope) => {
    const native = new MastraServer({ app: scope, mastra, prefix: '' })
    native.registerContextMiddleware()
    await native.registerRoute(scope, { requiresAuth: false, method: 'GET', path: '/native-query', queryParamSchema: z.object({ count: z.coerce.number().int() }), handler: async () => 'unreachable' })
    await native.registerRoute(scope, { requiresAuth: false, method: 'GET', path: '/native-path/:id', pathParamSchema: z.object({ id: z.string().uuid() }), handler: async () => 'unreachable' })
  })` : ''}
  route.navigation({ url: '/root-async', handler: async () => { throw new Failure('INTERNAL_UNEXPECTED', { details: { project: 'p1' } }) } })
  route.navigation({ url: '/root-sync', handler: () => { throw new Failure('NOT_FOUND') } })
  route.navigation({ url: '/vendor', handler: async () => { throw new Error('PLANTED_VENDOR_TEXT') } })
  ${runner ? "route.navigation({ url: '/runner-native-error', handler: () => { hubInvokeContexts.push(trace.getActiveSpan()?.spanContext().traceId); return runnerClient.invoke(runnerInput) } })" : ''}
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
  ${network ? `['project refusal', { url: '/project' }],
  ['native query validation', { url: '/native-query?count=invalid' }],
  ['native path validation', { url: '/native-path/not-a-uuid' }],` : ''}
  ${runner ? `['native runner escape', { url: '/runner-native-error' }],` : ''}
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
${network ? "await app.listen({ host: '127.0.0.1', port: 0 })\nconst origin = 'http://127.0.0.1:' + app.server.address().port" : ''}
const report = {}
for (const [name, { before, ...request }] of cases) {
  before?.()
  logger.info('CASE ' + name)
  ${network ? `const headers = { ...request.headers }
  if (request.cookies) headers.cookie = Object.entries(request.cookies).map(([key, value]) => key + '=' + value).join('; ')
  const payload = request.payload
  const answer = await fetch(origin + request.url, { method: request.method ?? 'GET', headers, ...(payload === undefined ? {} : { body: typeof payload === 'string' ? payload : JSON.stringify(payload) }) })
  report[name] = [answer.status, answer.headers.get('content-type'), await answer.text(), Object.fromEntries(answer.headers)]` : `const answer = await app.inject(request)
  report[name] = [answer.statusCode, answer.headers['content-type'], answer.body]`}
}
logger.info('CASE end')
console.log(JSON.stringify({ report, onErrorCalls, onSend, runnerLogs: ${runner ? 'runnerLogs' : '[]'}, runnerContexts: ${runner ? 'runnerContexts' : '[]'}, hubInvokeContexts: ${runner ? 'hubInvokeContexts' : '[]'} }))
await sessions.close()
await app.close()
${runner ? 'await runner.close()' : ''}
await controller.destroy()
await storage.close()
rmSync(root, { recursive: true, force: true })
`
}
