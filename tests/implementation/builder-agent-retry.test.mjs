import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { InMemoryStore } from '@mastra/core/storage'
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace'
import { hubModuleUrl } from './hub-build.mjs'
import { testConversations } from './builder-conversation-fixture.mjs'

const { createBuilderController } = await import(hubModuleUrl('builder/harness/controller.js'))
const { createControllerRunSessions } = await import(hubModuleUrl('builder/run/turn.js'))
const { createModelRouting } = await import(hubModuleUrl('builder/model-routing.js'))
const { createAnthropicRoute } = await import(hubModuleUrl('builder/anthropic/route.js'))
const { createClaudeHolds } = await import(hubModuleUrl('builder/anthropic/credential.js'))

const repositoryRoot = resolve(import.meta.dirname, '../..')
const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
const streamOf = (parts) => new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close() } })
const projectId = '22222222-2222-4222-8222-222222222222'
const builderRunId = '11111111-1111-4111-8111-111111111111'
const conversationId = '44444444-4444-4444-8444-444444444444'
const CONNECT_TIMEOUT = 'timeout exceeded when trying to connect'

const answering = (failModelWith, failTimes = Infinity) => {
  const calls = []
  const model = {
    specificationVersion: 'v2', provider: 'anthropic', modelId: 'probe-1', supportedUrls: {},
    async doGenerate() { throw new Error('doGenerate not used') },
    async doStream() {
      calls.push(calls.length)
      if (failModelWith && calls.length <= failTimes) throw failModelWith
      return { stream: streamOf([{ type: 'stream-start', warnings: [] }, { type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: 'Pronto.' }, { type: 'text-end', id: 't' }, { type: 'finish', finishReason: 'stop', usage }]) }
    },
  }
  return { model, calls }
}

// Each message reads storage twice; the second read is the loop step's run, where the log's failure was thrown.
const openRun = async (t, { model, failsRead, bindExtra = () => {} }) => {
  const root = mkdtempSync(resolve(tmpdir(), 'builder-agent-retry-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(root, { recursive: true })
  const workspace = new Workspace({ id: 'retry-ws', filesystem: new LocalFilesystem({ basePath: root }), sandbox: new LocalSandbox({ workingDirectory: root }) })
  let conversations
  const storage = new InMemoryStore()
  await storage.init()
  const workflows = await storage.getStore('workflows')
  const original = workflows.getWorkflowRunById.bind(workflows)
  const storageCalls = { reads: 0, thrown: 0 }
  workflows.getWorkflowRunById = async (args) => {
    storageCalls.reads += 1
    if (failsRead(storageCalls.reads)) {
      storageCalls.thrown += 1
      throw new Error(CONNECT_TIMEOUT)
    }
    return original(args)
  }
  const controller = createBuilderController({
    workspace: (context) => conversations.workspace(context),
    model, storage, skillsPath: resolve(repositoryRoot, 'builder-skills'), modelRetryDelayMs: () => 1,
  })
  await controller.init()
  t.after(() => controller.destroy?.())
  conversations = testConversations(controller, () => workspace)
  t.after(() => conversations.close())
  const run = await createControllerRunSessions({ controller, conversations, readDefaultModel: async () => 'anthropic/default-model' })({
    projectId, conversationId, builderRunId,
    bindContext: (requestContext) => { requestContext.setRaw('conexusBuilderRunId', builderRunId); requestContext.setRaw('conexusBuilderConversationId', conversationId); bindExtra(requestContext) },
  })
  return { run, storageCalls, controller }
}

const settle = (turn) => turn.then((value) => ({ settled: 'resolved', reason: value.reason }), (error) => ({ settled: 'rejected', code: error.message }))

test('a storage connect failure in one loop step ends the turn as BUILDER_AGENT_PLATFORM_FAILED, never as a refused model request, and sends no second message', async (t) => {
  const { model, calls } = answering()
  const { run, storageCalls } = await openRun(t, { model, failsRead: (read) => read === 2 })
  const outcome = await settle(run.takeStep({ kind: 'SEND', content: 'Faça o app.' }, new AbortController().signal))
  assert.deepEqual(outcome, { settled: 'rejected', code: 'BUILDER_AGENT_PLATFORM_FAILED' })
  assert.equal(storageCalls.thrown, 1)
  assert.equal(calls.length, 0)
})

test('an auth failure from the model is not retried', async (t) => {
  const refused = Object.assign(new Error('Unauthorized'), { statusCode: 401 })
  const { model, calls } = answering(refused)
  const { run } = await openRun(t, { model, failsRead: () => false })
  assert.deepEqual(await settle(run.takeStep({ kind: 'SEND', content: 'Faça o app.' }, new AbortController().signal)), { settled: 'rejected', code: 'BUILDER_MODEL_AUTH_FAILED' })
  assert.equal(calls.length, 1)
})

test('a Failure that carries a database error reaches the Builder stream as its code, never as the database error', async (t) => {
  const { Failure } = await import(hubModuleUrl('platform/failure.js'))
  const database = Object.assign(new Error('duplicate key value violates unique constraint "builder_run_one_active"'), {
    name: 'error', code: '23505', detail: `Key (project_id)=(${projectId}) already exists.`, schema: 'builder', table: 'builder_run', constraint: 'builder_run_one_active',
  })
  const { model } = answering(new Failure('BUILDER_RUN_TRANSITION_REFUSED', { cause: database }))
  const { run, controller } = await openRun(t, { model, failsRead: () => false })
  const session = await controller.getSessionByResource(`project:${projectId}`, `conversation:${conversationId}`)
  const events = []
  session.subscribe((event) => { events.push(event) })
  const outcome = await settle(run.takeStep({ kind: 'SEND', content: 'Faça o app.' }, new AbortController().signal))
  const wire = JSON.stringify(events)
  assert.equal(outcome.settled, 'rejected')
  assert.equal(wire.includes('BUILDER_RUN_TRANSITION_REFUSED'), true, 'the stream names the failure by its code')
  for (const leaked of ['builder_run_one_active', 'Key (project_id)', '23505', 'schema']) assert.equal(wire.includes(leaked), false, leaked)
  assert.equal(JSON.stringify(new Failure('PROJECT_BUSY', { cause: database })), '{"message":"PROJECT_BUSY","domain":"MASTRA_SERVER","category":"USER","code":"PROJECT_BUSY","details":{}}')
})

test('the web says a platform fault was the Conexus, not the model, and other internal errors keep their sentence', async () => {
  const { failureCodeText } = await import('../../apps/web/src/app/failure.ts')
  assert.equal(
    failureCodeText('BUILDER_AGENT_PLATFORM_FAILED'),
    'Uma falha do Conexus, e não do modelo, interrompeu a execução. As alterações desta execução não foram aplicadas. A falha foi registrada.',
  )
  assert.equal(failureCodeText('BUILDER_PREPARATION_FAILED'), 'O Conexus falhou de um jeito que não esperávamos. A falha foi registrada.')
  assert.equal(failureCodeText('BUILDER_MODEL_STREAM_FAILED'), 'O provedor do modelo recusou ou interrompeu o pedido. Escolha outro modelo.')
  assert.equal(failureCodeText(null), 'O Conexus falhou de um jeito que não esperávamos. A falha foi registrada.')
})

const MODEL_FAILURES = [
  ['503', Object.assign(new Error('Service Unavailable'), { statusCode: 503 })],
  ['ECONNRESET', Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })],
  ['overloaded 529', Object.assign(new Error('Overloaded'), { statusCode: 529 })],
]
for (const [label, failure] of MODEL_FAILURES) {
  test(`a model ${label} three times is retried by Mastra inside the call, and the turn completes`, async (t) => {
    const { model, calls } = answering(failure, 3)
    const { run, controller } = await openRun(t, { model, failsRead: () => false })
    const retryEvents = []
    const session = await controller.getSessionByResource(`project:${projectId}`, `conversation:${conversationId}`)
    session.subscribe((event) => { if (event.type === 'error') retryEvents.push([event.retryable, event.retryAttempt, event.maxRetries]) })
    assert.deepEqual(await settle(run.takeStep({ kind: 'SEND', content: 'Faça o app.' }, new AbortController().signal)), { settled: 'resolved', reason: 'complete' })
    assert.equal(calls.length, 4, 'one call that failed three times, then the one that answered')
    assert.deepEqual(retryEvents, [[true, 1, 10], [true, 2, 10], [true, 3, 10]], 'each retry is announced as a retryable error event')
  })
}

test("a model 503 that never clears is retried ten times, Mastra Code's limit, then fails as a refused model request", async (t) => {
  const { model, calls } = answering(Object.assign(new Error('Service Unavailable'), { statusCode: 503 }))
  const { run } = await openRun(t, { model, failsRead: () => false })
  const outcome = await settle(run.takeStep({ kind: 'SEND', content: 'Faça o app.' }, new AbortController().signal))
  assert.deepEqual(outcome, { settled: 'rejected', code: 'BUILDER_MODEL_STREAM_FAILED' })
  assert.equal(calls.length, 11)
})

test('a rate limit is retried by Mastra twice, then fails as rate limited', async (t) => {
  const { model, calls } = answering(Object.assign(new Error('Too many requests'), { statusCode: 429 }))
  const { run } = await openRun(t, { model, failsRead: () => false })
  assert.deepEqual(await settle(run.takeStep({ kind: 'SEND', content: 'Faça o app.' }, new AbortController().signal)), { settled: 'rejected', code: 'BUILDER_MODEL_RATE_LIMITED' })
  assert.equal(calls.length, 3)
})

// The real installed Anthropic provider, reached through the Hub's model routing, with a local stand-in for the upstream.
const apiKey = `sk-ant-api03-${'k'.repeat(40)}`
const accountId = '55555555-5555-4555-8555-555555555555'
const routing = createModelRouting({
  routes: { anthropic: createAnthropicRoute(createClaudeHolds({ store: { readById: async () => null, rewrite: async () => false } })) },
  modelAccounts: { usable: async () => ({ modelAccountId: 'row-anthropic', kind: 'api_key', secret: apiKey }) },
  conversationModel: async () => null,
  readDefault: async () => null,
  record: async () => {},
})
const bindAccount = (requestContext) => requestContext.setRaw('conexusBuilderAccountId', accountId)

const anthropicError = (status, type, message) => () => new Response(JSON.stringify({ type: 'error', error: { type, message } }), { status, headers: { 'content-type': 'application/json' } })
const anthropicAnswer = () => new Response([
  ['message_start', { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'm', content: [], usage: { input_tokens: 1, output_tokens: 1 } } }],
  ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
  ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Pronto.' } }],
  ['content_block_stop', { type: 'content_block_stop', index: 0 }],
  ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 2 } }],
  ['message_stop', { type: 'message_stop' }],
].map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } })

// Serves the upstream's replies in order, the last one for every call after; anything outside api.anthropic.com is refused.
const upstreamReplying = (t, replies) => {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (input, init) => {
    const url = new Request(input, init).url
    if (!url.startsWith('https://api.anthropic.com/')) throw new Error(`unexpected request to ${url}`)
    calls.push(url)
    return replies[Math.min(calls.length - 1, replies.length - 1)]()
  }
  t.after(() => { globalThis.fetch = original })
  return calls
}

const runOnUpstream = async (t, replies) => {
  const calls = upstreamReplying(t, replies)
  const { run, controller } = await openRun(t, { model: (ctx) => routing.resolve(ctx), failsRead: () => false, bindExtra: bindAccount })
  const notices = []
  const everything = []
  const session = await controller.getSessionByResource(`project:${projectId}`, `conversation:${conversationId}`)
  session.subscribe((event) => {
    everything.push(event.type === 'error' ? { ...event, error: event.error && Object.fromEntries(Object.getOwnPropertyNames(event.error).map((name) => [name, event.error[name]])) } : event)
    if (event.type === 'error' && event.retryable) notices.push([event.retryable, event.retryAttempt, event.maxRetries])
  })
  let thrownCause
  const outcome = await settle(run.takeStep({ kind: 'SEND', content: 'Faça o app.' }, new AbortController().signal).catch((error) => { thrownCause = error.cause; throw error }))
  const exposed = JSON.stringify({ outcome, everything }).includes(apiKey)
  const leakingEvents = everything.filter((event) => JSON.stringify(event).includes(apiKey)).map((event) => `${event.type}${event.retryable ? ':retry' : ''}`)
  return { calls: calls.length, notices, outcome, exposed, leakingEvents, outcomeExposed: JSON.stringify(outcome).includes(apiKey), causeLogged: JSON.stringify(thrownCause ?? null) }
}

const transient = [['503', 503, 'api_error', 'Service Unavailable'], ['529', 529, 'overloaded_error', 'Overloaded']]
for (const [label, status, type, message] of transient) {
  test(`an Anthropic ${label} response, decoded by the real provider, is retried with a notice each time and the turn completes without exposing the key`, async (t) => {
    const r = await runOnUpstream(t, [anthropicError(status, type, message), anthropicError(status, type, message), anthropicAnswer])
    assert.deepEqual(r, { calls: 3, notices: [[true, 1, 10], [true, 2, 10]], outcome: { settled: 'resolved', reason: 'complete' }, exposed: false, leakingEvents: [], outcomeExposed: false, causeLogged: 'null' })
  })
}

test('an Anthropic 503 that never clears is retried ten times, then ends as a refused model request without exposing the key', async (t) => {
  const r = await runOnUpstream(t, [anthropicError(503, 'api_error', 'Service Unavailable')])
  assert.deepEqual(r.outcome, { settled: 'rejected', code: 'BUILDER_MODEL_STREAM_FAILED' })
  assert.deepEqual({ calls: r.calls, notices: r.notices.length, exposed: r.exposed }, { calls: 11, notices: 10, exposed: false })
})

test('an Anthropic 429 is retried twice, then ends as rate limited, without exposing the key', async (t) => {
  const r = await runOnUpstream(t, [anthropicError(429, 'rate_limit_error', 'This request would exceed your rate limit')])
  assert.deepEqual(r.outcome, { settled: 'rejected', code: 'BUILDER_MODEL_RATE_LIMITED' })
  assert.deepEqual({ calls: r.calls, exposed: r.exposed }, { calls: 3, exposed: false })
})

test('an Anthropic 401 ends the run as a refused credential at once, with no retry and no notice, and the key is in no event', async (t) => {
  const r = await runOnUpstream(t, [anthropicError(401, 'authentication_error', 'invalid x-api-key')])
  assert.deepEqual(r.outcome, { settled: 'rejected', code: 'BUILDER_MODEL_AUTH_FAILED' })
  assert.deepEqual({ calls: r.calls, notices: r.notices, exposed: r.exposed }, { calls: 1, notices: [], exposed: false })
})

test('an upstream that echoes the key in its 401 body still ends the run as a bare failure code, with the key nowhere in what the turn settles with', async (t) => {
  const r = await runOnUpstream(t, [anthropicError(401, 'authentication_error', `invalid x-api-key ${apiKey}`)])
  assert.deepEqual({ outcome: r.outcome, outcomeExposed: r.outcomeExposed }, { outcome: { settled: 'rejected', code: 'BUILDER_MODEL_AUTH_FAILED' }, outcomeExposed: false })
})

test('an Anthropic 400 is not a transient failure: it is retried at most once and ends as a refused model request', async (t) => {
  const r = await runOnUpstream(t, [anthropicError(400, 'invalid_request_error', 'messages: text content blocks must be non-empty')])
  assert.deepEqual({ outcome: r.outcome, calls: r.calls, exposed: r.exposed }, { outcome: { settled: 'rejected', code: 'BUILDER_MODEL_STREAM_FAILED' }, calls: 2, exposed: false })
})

const echoing = (status, type, message) => anthropicError(status, type, `${message} for ${apiKey}`)

test('a transient Anthropic response that echoes the key is retried with notices that carry only the status, and the key is in no event the session emits', async (t) => {
  const r = await runOnUpstream(t, [echoing(503, 'api_error', 'Service Unavailable'), echoing(529, 'overloaded_error', 'Overloaded'), anthropicAnswer])
  assert.deepEqual(r, { calls: 3, notices: [[true, 1, 10], [true, 2, 10]], outcome: { settled: 'resolved', reason: 'complete' }, exposed: false, leakingEvents: [], outcomeExposed: false, causeLogged: 'null' })
})

test('a transient Anthropic failure that echoes the key and never clears ends with the key in no retry notice and in no cause the run logs', async (t) => {
  const r = await runOnUpstream(t, [echoing(503, 'api_error', 'Service Unavailable')])
  assert.deepEqual({ outcome: r.outcome, retryNoticesLeaking: r.leakingEvents.filter((type) => type !== 'error'), causeLogged: r.causeLogged }, { outcome: { settled: 'rejected', code: 'BUILDER_MODEL_STREAM_FAILED' }, retryNoticesLeaking: [], causeLogged: '{"statusCode":503}' })
})
