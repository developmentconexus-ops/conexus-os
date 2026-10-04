import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { InMemoryStore } from '@mastra/core/storage'
import { conversationId, projectId } from '../implementation/builder-run-harness.mjs'
import { ASK, bindRun, builderOn, leftovers, liveSession, scriptedModel, snapshotOf, suspendedRuns } from '../implementation/builder-question-fixture.mjs'

setFlagsFromString('--expose-gc')
const gc = runInNewContext('gc')
const ENDINGS = 200
const WARMUP = 20
const MB = 1024 * 1024

const settledHeap = async () => {
  for (let pass = 0; pass < 4; pass += 1) {
    gc()
    await new Promise((wake) => { setImmediate(wake) })
  }
  return process.memoryUsage().heapUsed
}

// One run per iteration: a control run takes two plain turns; a question run asks, then ends by a
// message (a send, or a new Hub's next send) or by the run's exit (expiry, Stop).
const iterations = {
  control: async (session, signal) => {
    assert.equal((await session.takeStep({ kind: 'SEND', content: 'oi' }, signal)).reason, 'complete')
    assert.equal((await session.takeStep({ kind: 'SEND', content: 'de novo' }, signal)).reason, 'complete')
  },
  message: async (session, signal, live) => {
    assert.equal((await session.takeStep({ kind: 'SEND', content: ASK }, signal)).reason, 'suspended')
    const runId = await snapshotOf(await live())
    assert.equal((await session.takeStep({ kind: 'SEND', content: 'Use verde' }, signal)).reason, 'complete')
    return runId
  },
  exit: async (session, signal, live) => {
    assert.equal((await session.takeStep({ kind: 'SEND', content: ASK }, signal)).reason, 'suspended')
    const runId = await snapshotOf(await live())
    await session.endQuestions()
    return runId
  },
}

const measure = async (t, way) => {
  const storage = new InMemoryStore()
  await storage.init()
  const { model, prompts } = scriptedModel()
  const builder = await builderOn(t, storage, model)
  const signal = new AbortController().signal
  const live = () => liveSession(builder.controller)
  const questionRuns = []
  let heapAtStart = 0
  for (let index = 0; index < WARMUP + ENDINGS; index += 1) {
    if (index === WARMUP) heapAtStart = await settledHeap()
    const builderRunId = `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`
    const session = await builder.openSession({ projectId, conversationId, builderRunId, bindContext: bindRun(builderRunId) })
    const runId = await iterations[way](session, signal, live)
    await session.release()
    if (runId) questionRuns.push(runId)
    prompts.length = 0
  }
  const growth = (await settledHeap()) - heapAtStart
  const kept = []
  for (const runId of questionRuns) {
    const left = await leftovers({ mastra: builder.mastra, storage }, runId)
    if (left.registered || left.rows > 0) kept.push(runId)
  }
  return { growth, questions: questionRuns.length, kept, suspended: await suspendedRuns(await live()) }
}

test(`${ENDINGS} questions ended each way leave no Mastra leftovers and keep the heap within 5 MB of a control run`, { timeout: 600_000 }, async (t) => {
  const control = await measure(t, 'control')
  for (const way of ['message', 'exit']) {
    const ended = await measure(t, way)
    t.diagnostic(`${way}: ${ended.questions} questions, heap growth ${(ended.growth / MB).toFixed(2)} MB against control ${(control.growth / MB).toFixed(2)} MB`)
    assert.equal(ended.questions, WARMUP + ENDINGS)
    assert.deepEqual(ended.kept, [], `${way}: no question keeps its loop registration or snapshot rows`)
    assert.deepEqual(ended.suspended, [], `${way}: Mastra lists no suspended run`)
    assert.ok(ended.growth - control.growth < 5 * MB, `${way}: heap growth ${(ended.growth / MB).toFixed(2)} MB against control ${(control.growth / MB).toFixed(2)} MB`)
  }
})
