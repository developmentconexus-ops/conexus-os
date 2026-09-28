import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Agent } from '@mastra/core/agent'
import { AgentController } from '@mastra/core/agent-controller'
import { InMemoryStore } from '@mastra/core/storage'
import { hubModuleUrl } from './hub-build.mjs'

const { sendBuilderSessionMessage } = await import(hubModuleUrl('builder/runtime.js'))

const OBSERVATION_FAILED = 'Encountered error during memory observation: timeout exceeded when trying to connect'

const streamOf = (chunks) => new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close() } })
const model = {
  specificationVersion: 'v2', provider: 'mock', modelId: 'mock-model', supportedUrls: {},
  doGenerate: async () => { throw new Error('the Builder streams') },
  doStream: async () => ({
    stream: streamOf([
      { type: 'stream-start', warnings: [] },
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', delta: 'Pronto.' },
      { type: 'text-end', id: 't1' },
      { type: 'finish', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
    ]),
  }),
}

const openSession = async (t, { observationFails }) => {
  const observationalMemory = {
    id: 'observational-memory',
    async processInputStep({ abort }) {
      if (observationFails) abort(OBSERVATION_FAILED)
    },
  }
  const agent = new Agent({ id: 'builder', name: 'builder', instructions: 'Build.', model, inputProcessors: [observationalMemory] })
  const controller = new AgentController({ id: 'code', storage: new InMemoryStore(), modes: [{ id: 'build', name: 'Build', default: true }], agent })
  await controller.init()
  t.after(() => controller.destroy())
  const session = await controller.createSession({ resourceId: 'conversation', scope: 'builder:run', threadId: 'conversation' })
  return { controller, session }
}

const settle = (turn) => Promise.race([
  turn.then((reason) => ({ settled: 'resolved', reason }), (error) => ({ settled: 'rejected', code: error.message, cause: error.cause })),
  new Promise((resolve) => setTimeout(() => resolve({ settled: 'still running after 20 s' }), 20_000).unref()),
])

test('a turn whose input processor passes ends complete', async (t) => {
  const { session } = await openSession(t, { observationFails: false })
  assert.deepEqual(await settle(sendBuilderSessionMessage(session, { content: 'Faça o app.' })), { settled: 'resolved', reason: 'complete' })
})

test('a turn whose input processor trips fails with the processor named, and its session can be deleted', async (t) => {
  const { controller, session } = await openSession(t, { observationFails: true })
  const outcome = await settle(sendBuilderSessionMessage(session, { content: 'Faça o app.' }))
  assert.deepEqual(outcome, {
    settled: 'rejected',
    code: 'BUILDER_AGENT_TRIPWIRE',
    cause: { processorId: 'observational-memory', reason: OBSERVATION_FAILED },
  })
  assert.equal(await controller.deleteSession({ resourceId: 'conversation', scope: 'builder:run' }), true)
})

test('a tripwire that asks the agent to retry does not end the turn', async () => {
  let listener
  const session = {
    subscribe: (callback) => { listener = callback; return () => {} },
    thread: { requireId: () => 'conversation' },
    identity: { getResourceId: () => 'conversation' },
    machinery: { subscribeToThread: async () => ({
      stream: (async function* () { yield { type: 'tripwire', payload: { processorId: 'reminder', reason: 'Try again.', retry: true } } })(),
      unsubscribe: () => undefined,
    }) },
    abort: () => undefined,
    sendMessage: async () => {
      await new Promise((resolve) => setImmediate(resolve))
      listener({ type: 'agent_end', reason: 'complete' })
    },
  }
  assert.equal(await sendBuilderSessionMessage(session, { content: 'Faça o app.' }), 'complete')
})
