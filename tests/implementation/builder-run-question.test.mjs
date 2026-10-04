import assert from 'node:assert/strict'
import { test } from 'node:test'
import { InMemoryStore } from '@mastra/core/storage'
import { hubModuleUrl } from './hub-build.mjs'
import { accountId, conversationId, harness, projectId } from './builder-run-harness.mjs'
import { ASK, agentOf, bindRun, builderOn, leftovers, liveSession, partsOf, pendingCall, resourceId, scriptedModel, snapshotOf, suspendedRuns } from './builder-question-fixture.mjs'

// The thread's state of one call as Mastra stored it.
const storedState = async (session, toolCallId) => {
  for (const message of await session.thread.listActiveMessages()) {
    for (const part of message.content.parts) if (part.type === 'tool-invocation' && part.toolInvocation.toolCallId === toolCallId) return part.toolInvocation.state
  }
  return null
}

// The real run, the real Builder controller and a scripted model, around the run harness's sandbox.
const realRun = async (t, options = {}) => {
  const storage = new InMemoryStore()
  await storage.init()
  const { model, prompts } = scriptedModel()
  const builder = await builderOn(t, storage, model)
  const run = await harness(t, { ...options, session: (input) => builder.openSession(input) })
  return { ...run, ...builder, storage, prompts }
}

test('an answer resumes the question on the same session and VM, and the run goes on to its end', async (t) => {
  const run = await realRun(t, {
    answers: [async (service) => {
      assert.equal(service.answerQuestion({ projectId, conversationId, toolCallId: await pendingCall(run.controller), resumeData: ['Azul'] }), 'ACCEPTED')
    }],
  })
  await run.start()
  await run.service.close()
  const phases = run.calls.filter(([kind]) => kind === 'phase').map(([, phase]) => phase)
  assert.deepEqual(phases, ['PREPARING', 'AGENT', 'WAITING', 'AGENT', 'FINALIZING'])
  assert.deepEqual(run.calls.at(-1), ['settle', 'RESPONSE_ONLY'])
  assert.equal(run.events.filter((event) => event === 'start').length, 1, 'no second sandbox start')
  assert.equal(run.events.filter((event) => Array.isArray(event) && event[0] === 'open').length, 1, 'one session for the run')
  assert.equal(JSON.stringify(run.prompts.at(-1)).includes('User answered:\\nQual cor?: Azul'), true, 'the model read the answer')
  assert.notEqual(await liveSession(run.controller), undefined, 'the session stays with the conversation after the run')
})

test('a message while the question waits ends the question as denied, and the same run takes it as a plain turn', async (t) => {
  const held = {}
  const run = await realRun(t, {
    answers: [async (service) => {
      held.call = await pendingCall(run.controller)
      held.session = await liveSession(run.controller)
      held.runId = await snapshotOf(held.session)
      const taken = await service.sendBuilderMessage({ accountId, projectId, conversationId, idempotencyKey: 'second', content: 'Use verde' })
      assert.equal(taken.created, false)
    }],
  })
  await run.start()
  await run.service.close()
  assert.deepEqual(run.calls.at(-1), ['settle', 'RESPONSE_ONLY'])
  const last = run.prompts.at(-1)
  assert.deepEqual(partsOf(last.at(-1)).map((part) => part.text), ['Use verde'], 'the message reached the model')
  assert.equal(JSON.stringify(last).includes(held.call), true, 'and the model still reads the question it asked')
  assert.notEqual(await storedState(held.session, held.call), 'call', 'the question is stored ended')
  assert.deepEqual(await leftovers(run, held.runId), { registered: false, rows: 0 })
})

for (const [ending, options, expected] of [
  ['expires', { questionWaitMs: 500 }, ['interrupt', 'BUILDER_QUESTION_EXPIRED']],
  ['is stopped', { answers: [async (service) => { await service.cancelBuilderRun({ accountId, projectId, builderRunId: '11111111-1111-4111-8111-111111111111' }) }] }, ['interrupt', 'USER_CANCELLED']],
]) {
  test(`a question that ${ending} ends before the run's last write and leaves nothing of itself in Mastra`, async (t) => {
    const held = {}
    const watch = async (service) => {
      held.call = await pendingCall(run.controller)
      held.session = await liveSession(run.controller)
      held.runId = await snapshotOf(held.session)
      await options.answers?.[0](service)
    }
    const run = await realRun(t, { ...options, questionWaitMs: options.questionWaitMs ?? 60_000, answers: [watch] })
    await run.start()
    await run.service.close()
    assert.deepEqual(run.calls.at(-1), expected)
    assert.notEqual(held.runId, undefined, 'the question was a suspended run')
    assert.notEqual(await storedState(held.session, held.call), 'call')
    assert.deepEqual(await suspendedRuns(held.session), [])
    assert.deepEqual(await leftovers(run, held.runId), { registered: false, rows: 0 })
  })
}

test('a message sent the moment the question is asked, before Mastra stores it, still reaches the model, every time', async (t) => {
  const storage = new InMemoryStore()
  await storage.init()
  const { model, prompts } = scriptedModel()
  const builder = await builderOn(t, storage, model)
  const signal = new AbortController().signal
  const echoed = []
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const builderRunId = `11111111-1111-4111-8111-1111111111${String(attempt).padStart(2, '0')}`
    const session = await builder.openSession({ projectId, conversationId, builderRunId, bindContext: bindRun(builderRunId) })
    assert.equal((await session.takeStep({ kind: 'SEND', content: ASK }, signal)).reason, 'suspended')
    assert.equal((await session.takeStep({ kind: 'SEND', content: `cor ${attempt}` }, signal)).reason, 'complete')
    echoed.push(partsOf(prompts.at(-1).at(-1)).map((part) => part.text).join(''))
    await session.release()
  }
  assert.deepEqual(echoed, Array.from({ length: 10 }, (_, attempt) => `cor ${attempt}`))
  assert.deepEqual(await suspendedRuns(await liveSession(builder.controller)), [])
})

test('a question a stopped Hub left open is denied at the next send of a new Hub, which deletes its rows, and the model reads both', async (t) => {
  const storage = new InMemoryStore()
  await storage.init()
  const signal = new AbortController().signal
  const before = await builderOn(t, storage, scriptedModel().model)
  const asking = await before.openSession({ projectId, conversationId, builderRunId: '11111111-1111-4111-8111-111111111101', bindContext: bindRun('11111111-1111-4111-8111-111111111101') })
  assert.equal((await asking.takeStep({ kind: 'SEND', content: ASK }, signal)).reason, 'suspended')
  await asking.untilQuestionStored()
  const call = await pendingCall(before.controller)
  const questionRun = await snapshotOf(await liveSession(before.controller))

  const { model, prompts } = scriptedModel()
  const after = await builderOn(t, storage, model)
  const next = await after.openSession({ projectId, conversationId, builderRunId: '11111111-1111-4111-8111-111111111102', bindContext: bindRun('11111111-1111-4111-8111-111111111102') })
  assert.equal(next.pending(call), false, 'a new Hub holds no question, so no card is drawn')
  assert.equal((await next.takeStep({ kind: 'SEND', content: 'Use verde' }, signal)).reason, 'complete')
  const last = prompts.at(-1)
  assert.deepEqual(partsOf(last.at(-1)).map((part) => part.text), ['Use verde'])
  assert.equal(JSON.stringify(last).includes(call), true, 'the model reads the question it asked before the restart')
  assert.notEqual(await storedState(await liveSession(after.controller), call), 'call')
  assert.deepEqual(await suspendedRuns(await liveSession(after.controller)), [])
  assert.deepEqual(await leftovers({ mastra: after.mastra, storage }, questionRun), { registered: false, rows: 0 })
  await next.release()
})

// Mastra 1.71 keeps the `agentic-loop` registration of a suspended run that an abort ends, and the
// Hub releases it in endQuestions (https://github.com/mastra-ai/mastra/issues/25903). When this
// fails, an upgrade fixed it: the release goes, and so does this test.
test('Mastra still leaves the loop registration and the snapshot rows of a question an abort ends', async (t) => {
  const storage = new InMemoryStore()
  await storage.init()
  const builder = await builderOn(t, storage, scriptedModel().model)
  const builderRunId = '11111111-1111-4111-8111-111111111103'
  const session = await builder.openSession({ projectId, conversationId, builderRunId, bindContext: bindRun(builderRunId) })
  assert.equal((await session.takeStep({ kind: 'SEND', content: ASK }, new AbortController().signal)).reason, 'suspended')
  await session.untilQuestionStored()
  const live = await liveSession(builder.controller)
  const questionRun = await snapshotOf(live)
  live.abort()
  const agent = await agentOf(builder.controller)
  for (let waited = 0; agent.listActiveThreadRuns().some((active) => active.threadId === conversationId) && waited < 5_000; waited += 10) {
    await new Promise((wake) => { setTimeout(wake, 10) })
  }
  assert.deepEqual(await leftovers({ mastra: builder.mastra, storage }, questionRun), { registered: true, rows: 2 })
  assert.deepEqual(await suspendedRuns(live), [questionRun])
  await session.endQuestions()
  assert.deepEqual(await leftovers({ mastra: builder.mastra, storage }, questionRun), { registered: false, rows: 0 })
  await session.release()
})

test('the idle sweep keeps a conversation whose question waits, and lets it go once the question ended', async (t) => {
  const storage = new InMemoryStore()
  await storage.init()
  const clock = { now: 0 }
  const builder = await builderOn(t, storage, scriptedModel().model, { sweep: { now: () => clock.now, sweepEveryMs: 3_600_000 } })
  const builderRunId = '11111111-1111-4111-8111-111111111104'
  const session = await builder.openSession({ projectId, conversationId, builderRunId, bindContext: bindRun(builderRunId) })
  assert.equal((await session.takeStep({ kind: 'SEND', content: ASK }, new AbortController().signal)).reason, 'suspended')
  await session.untilQuestionStored()
  clock.now += 60 * 60_000
  await builder.conversations.sweep()
  assert.notEqual(await liveSession(builder.controller), undefined, 'a waiting question keeps its session')
  await session.endQuestions()
  await builder.conversations.sweep()
  assert.equal(await liveSession(builder.controller), undefined)
})

test('a cleanup past its bound releases nothing, so a question asked after it keeps its registration and rows', async (t) => {
  const storage = new InMemoryStore()
  await storage.init()
  const builder = await builderOn(t, storage, scriptedModel().model, { questionReleaseMs: 300 })
  const builderRunId = '11111111-1111-4111-8111-111111111105'
  const signal = new AbortController().signal
  const session = await builder.openSession({ projectId, conversationId, builderRunId, bindContext: bindRun(builderRunId) })
  assert.equal((await session.takeStep({ kind: 'SEND', content: ASK }, signal)).reason, 'suspended')
  await session.untilQuestionStored()
  const agent = await agentOf(builder.controller)
  const listSuspendedRuns = agent.listSuspendedRuns.bind(agent)
  let late = () => undefined
  const held = new Promise((settle) => { late = settle })
  let calls = 0
  // The first cleanup's read answers only after its bound, and then with what the thread holds by then.
  agent.listSuspendedRuns = async (input) => {
    calls += 1
    if (calls === 1) await held
    return listSuspendedRuns(input)
  }
  await assert.rejects(session.endQuestions(), (error) => error.id === 'BUILDER_QUESTION_NOT_RELEASED')
  assert.equal((await session.takeStep({ kind: 'SEND', content: ASK }, signal)).reason, 'suspended')
  await session.untilQuestionStored()
  const asked = await snapshotOf(await liveSession(builder.controller))
  late()
  await new Promise((settle) => { setTimeout(settle, 200) })
  assert.deepEqual(await leftovers({ mastra: builder.mastra, storage }, asked), { registered: true, rows: 2 })
  assert.equal(await pendingCall(builder.controller) !== undefined, true, 'the new question still waits')
})

const { createInbox, endQuestions } = await import(hubModuleUrl('builder/run/question.js'))

test('an answer that arrives after a wait ended is refused and never ends the next wait', async () => {
  const inbox = createInbox(() => true, () => 'USER_CANCELLED')
  const signal = new AbortController().signal
  inbox.open()
  const first = inbox.wait({ waitMs: 60_000, signal })
  assert.equal(inbox.message('continue', 'key-1'), 'ACCEPTED')
  assert.deepEqual(await first, { kind: 'MESSAGE', content: 'continue', idempotencyKey: 'key-1' })
  assert.equal(inbox.answer('call-of-the-ended-question', { answer: 'late' }), 'ENDED')
  assert.equal(inbox.message('another', 'key-2'), 'BUSY')
  inbox.open()
  assert.deepEqual(await inbox.wait({ waitMs: 20, signal }), { kind: 'EXPIRED' })
})

test('ending the questions fails within its bound when Mastra never answers', async () => {
  const never = () => new Promise(() => undefined)
  const session = {
    thread: { requireId: () => conversationId, listActiveMessages: async () => [] },
    identity: { getResourceId: () => resourceId },
    suspensions: { hasPending: () => false },
    machinery: { getAgent: () => ({ listActiveThreadRuns: () => [], listSuspendedRuns: never }) },
  }
  const started = Date.now()
  await assert.rejects(endQuestions({ getMastra: () => undefined }, session, { ms: 200 }), (error) => error.id === 'BUILDER_QUESTION_NOT_RELEASED')
  assert.ok(Date.now() - started < 2_000, 'the bound holds the whole operation')
})
