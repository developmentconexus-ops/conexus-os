import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { InMemoryStore } from '@mastra/core/storage'
import { accountId, conversationId, harness, projectId, runId } from '../implementation/builder-run-harness.mjs'
import { ASK, builderOn, leftovers, liveSession, scriptedModel, snapshotOf, suspendedRuns } from '../implementation/builder-question-fixture.mjs'

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

// Each way a question ends in a real run, and the run's last write. A run with no question is the control.
const WAYS = {
  control: { content: 'oi', ending: 'settle:RESPONSE_ONLY' },
  message: { content: ASK, ending: 'settle:RESPONSE_ONLY', act: (service, index) => service.sendBuilderMessage({ accountId, projectId, conversationId, idempotencyKey: `message-${index}`, content: 'Use verde' }) },
  expiry: { content: ASK, ending: 'interrupt:BUILDER_QUESTION_EXPIRED', questionWaitMs: 300 },
  stop: { content: ASK, ending: 'interrupt:USER_CANCELLED', act: (service) => service.cancelBuilderRun({ accountId, projectId, builderRunId: runId }) },
}

const measure = async (t, way) => {
  const { content, ending, act, questionWaitMs = 60_000 } = WAYS[way]
  const storage = new InMemoryStore()
  await storage.init()
  const { model, prompts } = scriptedModel()
  const builder = await builderOn(t, storage, model)
  const answers = []
  const run = await harness(t, { answers, questionWaitMs, session: (input) => builder.openSession(input) })
  const questionRuns = []
  const endings = new Set()
  let heapAtStart = 0
  for (let index = 0; index < WARMUP + ENDINGS; index += 1) {
    if (index === WARMUP) heapAtStart = await settledHeap()
    answers.splice(0, answers.length, async (service) => {
      questionRuns.push(await snapshotOf(await liveSession(builder.controller)))
      await act?.(service, index)
    })
    await (index === 0 ? run.start(content, `run-${index}`) : run.again(content, `run-${index}`))
    await run.untilEnded()
    endings.add(run.calls.at(-1).join(':'))
    for (const kept of [run.calls, run.events, run.logs, run.timings, run.sessions, run.publishedRuns, prompts]) kept.length = 0
  }
  const growth = (await settledHeap()) - heapAtStart
  const kept = []
  for (const questionRun of questionRuns) {
    const left = await leftovers({ mastra: builder.mastra, storage }, questionRun)
    if (left.registered || left.rows > 0) kept.push(questionRun)
  }
  const suspended = await suspendedRuns(await liveSession(builder.controller))
  await run.service.close()
  return { growth, outcome: { questions: questionRuns.length, endings: [...endings], kept, suspended }, expected: ending }
}

test(`${ENDINGS} questions ended each way in real runs leave no Mastra leftovers and keep the heap within 5 MB of a control run`, { timeout: 3_600_000 }, async (t) => {
  const control = await measure(t, 'control')
  assert.deepEqual(control.outcome, { questions: 0, endings: ['settle:RESPONSE_ONLY'], kept: [], suspended: [] })
  for (const way of ['message', 'expiry', 'stop']) {
    const ended = await measure(t, way)
    t.diagnostic(`${way}: heap growth ${(ended.growth / MB).toFixed(2)} MB against control ${(control.growth / MB).toFixed(2)} MB`)
    assert.deepEqual(ended.outcome, { questions: WARMUP + ENDINGS, endings: [ended.expected], kept: [], suspended: [] }, way)
    assert.ok(ended.growth - control.growth < 5 * MB, `${way}: heap growth ${(ended.growth / MB).toFixed(2)} MB against control ${(control.growth / MB).toFixed(2)} MB`)
  }
})
