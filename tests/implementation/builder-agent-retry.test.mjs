import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { InMemoryStore } from '@mastra/core/storage'
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace'
import { hubModuleUrl } from './hub-build.mjs'

const { createBuilderController } = await import(hubModuleUrl('builder/harness/controller.js'))
const { createControllerRunSessions } = await import(hubModuleUrl('builder/run-runtime.js'))
const { builderFailureCategory } = await import(hubModuleUrl('builder/failure-vocabulary.js'))

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
const openRun = async (t, { model, failsRead }) => {
  const root = mkdtempSync(resolve(tmpdir(), 'builder-agent-retry-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(root, { recursive: true })
  const workspace = new Workspace({ id: 'retry-ws', filesystem: new LocalFilesystem({ basePath: root }), sandbox: new LocalSandbox({ workingDirectory: root }) })
  const runWorkspaces = new Map([[conversationId, workspace]])
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
    workspace: ({ requestContext }) => runWorkspaces.get(requestContext.getRaw('conexusBuilderConversationId')),
    model, storage, skillsPath: resolve(repositoryRoot, 'builder-skills'), modelRetryDelayMs: () => 1,
  })
  await controller.init()
  t.after(() => controller.destroy?.())
  const run = await createControllerRunSessions({ controller, runContexts: new Map(), conversationWorkspaces: runWorkspaces, runTools: new Map(), readDefaultModel: async () => 'anthropic/default-model' })({
    projectId, conversationId, builderRunId, workspace,
    runCheck: async () => { throw new Error('not used') },
    bindContext: (requestContext) => { requestContext.setRaw('conexusBuilderRunId', builderRunId); requestContext.setRaw('conexusBuilderConversationId', conversationId) },
  })
  return { run, storageCalls, controller }
}

const settle = (turn) => turn.then((value) => ({ settled: 'resolved', reason: value.reason, continuations: value.continuations }), (error) => ({ settled: 'rejected', code: error.message }))

test('a storage connect failure in one loop step continues the same session, and the turn completes with the retry counted', async (t) => {
  const { model, calls } = answering()
  const { run, storageCalls } = await openRun(t, { model, failsRead: (read) => read === 2 })
  assert.deepEqual(await settle(run.sendTurn('Faça o app.')), { settled: 'resolved', reason: 'complete', continuations: 1 })
  assert.equal(storageCalls.thrown, 1)
  assert.equal(calls.length, 1)
})

test('a storage failure that never clears settles as BUILDER_AGENT_PLATFORM_FAILED after two continuations, never as a refused model request', async (t) => {
  const { model } = answering()
  const { run, storageCalls } = await openRun(t, { model, failsRead: (read) => read % 2 === 0 })
  const outcome = await settle(run.sendTurn('Faça o app.'))
  assert.deepEqual(outcome, { settled: 'rejected', code: 'BUILDER_AGENT_PLATFORM_FAILED' })
  assert.equal(storageCalls.thrown, 3)
  assert.equal(builderFailureCategory(outcome.code), 'INTERNAL_ERROR')
})

test('an auth failure from the model is not retried', async (t) => {
  const refused = Object.assign(new Error('Unauthorized'), { statusCode: 401 })
  const { model, calls } = answering(refused)
  const { run } = await openRun(t, { model, failsRead: () => false })
  assert.deepEqual(await settle(run.sendTurn('Faça o app.')), { settled: 'rejected', code: 'BUILDER_MODEL_AUTH_FAILED' })
  assert.equal(calls.length, 1)
})

test('the web says a platform fault was the Conexus, not the model, and other internal errors keep their sentence', async () => {
  const { failureReason } = await import('../../apps/web/src/features/builder/failure-reasons.ts')
  assert.equal(
    failureReason({ failureCategory: 'INTERNAL_ERROR', failureCode: 'BUILDER_AGENT_PLATFORM_FAILED' }),
    'Uma falha temporária do Conexus, e não do modelo, interrompeu a execução. As alterações desta execução não foram aplicadas. Envie o pedido novamente.',
  )
  assert.equal(failureReason({ failureCategory: 'INTERNAL_ERROR', failureCode: 'BUILDER_PREPARATION_FAILED' }), 'Ocorreu um erro interno inesperado. Tente novamente.')
  assert.equal(failureReason({ failureCategory: 'MODEL_REQUEST_REFUSED', failureCode: 'BUILDER_MODEL_STREAM_FAILED' }), 'O provedor do modelo recusou ou interrompeu o pedido. Tente novamente ou escolha outro modelo.')
  assert.equal(failureReason(null), 'Ocorreu um erro interno inesperado. Tente novamente.')
})

const MODEL_FAILURES = [
  ['503', Object.assign(new Error('Service Unavailable'), { statusCode: 503 })],
  ['ECONNRESET', Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })],
  ['overloaded 529', Object.assign(new Error('Overloaded'), { statusCode: 529 })],
]
for (const [label, failure] of MODEL_FAILURES) {
  test(`a model ${label} three times is retried by Mastra inside the call, and the turn completes with no continuation message`, async (t) => {
    const { model, calls } = answering(failure, 3)
    const { run, controller } = await openRun(t, { model, failsRead: () => false })
    const retryEvents = []
    const session = await controller.getSessionByResource(`project:${projectId}`, `builder:${conversationId}`)
    session.subscribe((event) => { if (event.type === 'error') retryEvents.push([event.retryable, event.retryAttempt, event.maxRetries]) })
    assert.deepEqual(await settle(run.sendTurn('Faça o app.')), { settled: 'resolved', reason: 'complete', continuations: 0 })
    assert.equal(calls.length, 4, 'one call that failed three times, then the one that answered')
    assert.deepEqual(retryEvents, [[true, 1, 10], [true, 2, 10], [true, 3, 10]], 'each retry is announced as a retryable error event')
  })
}

test("a model 503 that never clears is retried ten times, Mastra Code's limit, then fails as a refused model request without a continuation", async (t) => {
  const { model, calls } = answering(Object.assign(new Error('Service Unavailable'), { statusCode: 503 }))
  const { run } = await openRun(t, { model, failsRead: () => false })
  const outcome = await settle(run.sendTurn('Faça o app.'))
  assert.deepEqual(outcome, { settled: 'rejected', code: 'BUILDER_MODEL_STREAM_FAILED' })
  assert.equal(calls.length, 11)
  assert.equal(builderFailureCategory(outcome.code), 'MODEL_REQUEST_REFUSED')
})

test('a rate limit is retried by Mastra twice, then fails as rate limited, with no continuation message', async (t) => {
  const { model, calls } = answering(Object.assign(new Error('Too many requests'), { statusCode: 429 }))
  const { run } = await openRun(t, { model, failsRead: () => false })
  assert.deepEqual(await settle(run.sendTurn('Faça o app.')), { settled: 'rejected', code: 'BUILDER_MODEL_RATE_LIMITED' })
  assert.equal(calls.length, 3)
})
