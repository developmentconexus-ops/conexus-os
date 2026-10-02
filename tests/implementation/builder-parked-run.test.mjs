import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { RequestContext } from '@mastra/core/request-context'
import { InMemoryStore } from '@mastra/core/storage'
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace'
import { hubModuleUrl } from './hub-build.mjs'

const { createBuilderController } = await import(hubModuleUrl('builder/harness/controller.js'))
const { createControllerRunSessions, createParkedDiscard, deleteSessionLeavingParked } = await import(hubModuleUrl('builder/run-runtime.js'))
const { createConversationSessions } = await import(hubModuleUrl('builder/conversation-sessions.js'))
const { createBuilderMemory } = await import(hubModuleUrl('builder/memory.js'))
const { createBuilderService } = await import(hubModuleUrl('builder/service.js'))
const { parkedCallStanding, readParkedCalls } = await import(hubModuleUrl('builder/runtime.js'))

const repositoryRoot = resolve(import.meta.dirname, '../..')
const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
const streamOf = (parts) => new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close() } })
const projectId = '22222222-2222-4222-8222-222222222222'
const accountId = '33333333-3333-4333-8333-333333333333'
const resourceId = `project:${projectId}`
const conversationId = '44444444-4444-4444-8444-444444444441'
const runId = '11111111-1111-4111-8111-111111111111'
const ASK = [{ question: 'Qual cor?', options: [{ label: 'Azul' }, { label: 'Verde' }] }]

// The model asks once; after the answer reaches it, it replies in text. `prompts` records what each call saw.
const askingModel = ({ asks = 1 } = {}) => {
  const prompts = []
  return {
    prompts,
    model: {
      specificationVersion: 'v2', provider: 'anthropic', modelId: 'probe-1', supportedUrls: {},
      async doGenerate() { throw new Error('doGenerate not used') },
      async doStream(options) {
        prompts.push(JSON.stringify(options.prompt))
        const parts = prompts.length <= asks
          ? [{ type: 'tool-call', toolCallId: `c${prompts.length}`, toolName: 'ask_user', input: JSON.stringify({ questions: ASK }) }, { type: 'finish', finishReason: 'tool-calls', usage }]
          : [{ type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: 'Pronto.' }, { type: 'text-end', id: 't' }, { type: 'finish', finishReason: 'stop', usage }]
        return { stream: streamOf([{ type: 'stream-start', warnings: [] }, ...parts]) }
      },
    },
  }
}

// A Hub process: a controller over the shared store, which a restart replaces and nothing else.
const hubOver = async (t, storage, model) => {
  const root = mkdtempSync(resolve(tmpdir(), 'builder-parked-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const workspaceOn = (id) => new Workspace({ id, filesystem: new LocalFilesystem({ basePath: root }), sandbox: new LocalSandbox({ workingDirectory: root }) })
  const workspace = workspaceOn('parked-ws')
  const conversationWorkspaces = new Map()
  const controller = createBuilderController({
    workspace: ({ requestContext }) => conversationWorkspaces.get(requestContext.getRaw('conexusBuilderConversationId')),
    model, storage, memory: createBuilderMemory({ storage, memoryModel: async () => model }), skillsPath: resolve(repositoryRoot, 'builder-skills'),
  })
  await controller.init()
  t.after(() => controller.destroy?.())
  const openSession = createControllerRunSessions({ controller, runContexts: new Map(), conversationWorkspaces, runTools: new Map(), readDefaultModel: async () => 'anthropic/default-model' })
  const open = (on = workspace) => openSession({
    projectId, conversationId, builderRunId: runId, workspace: on, runCheck: async () => { throw new Error('not used') },
    bindContext: (requestContext) => { requestContext.setRaw('conexusBuilderRunId', runId); requestContext.setRaw('conexusBuilderConversationId', conversationId) },
  })
  const live = () => controller.getSessionByResource(resourceId, `builder:${conversationId}`)
  return { controller, open, live, workspaceOn }
}

const storedToolResult = async (hub) => {
  const session = await hub.controller.createSession({ resourceId, scope: 'reader', threadId: conversationId })
  const parts = (await session.thread.listActiveMessages()).flatMap((message) => message.content.parts)
  await deleteSessionLeavingParked(hub.controller, resourceId, 'reader')
  return parts.filter((part) => part.type === 'tool-invocation').map((part) => ({ name: part.toolInvocation.toolName, state: part.toolInvocation.state, result: part.toolInvocation.result }))
}

test('a run parked on a question keeps its session live, and after a restart the answer resumes the same call to completion', async (t) => {
  const storage = new InMemoryStore()
  await storage.init()
  const { model, prompts } = askingModel()

  const before = await hubOver(t, storage, model)
  await before.controller.createSession({ resourceId, scope: `conversation:${conversationId}`, threadId: conversationId })
  const asked = await before.open()
  const first = await asked.sendTurn('faça um app')
  assert.equal(first.reason, 'suspended', 'the turn ends at the question instead of waiting for the answer')
  const parkedSession = await before.live()
  await asked.end()
  assert.equal(await before.live() === parkedSession, true, 'parking keeps the session live in the controller')
  assert.deepEqual([...parkedSession.displayState.get().pendingSuspensions.keys()], ['c1'], 'the live session itself says what the run is parked on')

  // A restart: a new controller over the same store, which knows nothing of the first one's memory.
  const after = await hubOver(t, storage, model)
  assert.equal(await after.live(), undefined)
  const resumed = await after.open()
  const turn = await resumed.resumeTurn({ toolCallId: 'c1', resumeData: ['Azul'] })
  assert.equal(turn.reason, 'complete')
  assert.equal(prompts.length, 2, 'the model was called once more, with the answer')
  assert.ok(prompts[1].includes('User answered'), 'the answer reached the model as the tool result')
  assert.deepEqual(await storedToolResult(after), [{ name: 'ask_user', state: 'result', result: { content: 'User answered:\nQual cor?: Azul', isError: false } }])
  await resumed.release()
  assert.equal(await after.live(), undefined)
})

test('the answer resumes the run in the same Hub too, with the controller that parked it and the browser session on the thread still running', async (t) => {
  const storage = new InMemoryStore()
  await storage.init()
  const { model, prompts } = askingModel()
  const hub = await hubOver(t, storage, model)
  // The browser's own session on the thread, which is there in production while a run works.
  await hub.controller.createSession({ resourceId, scope: `conversation:${conversationId}`, threadId: conversationId })
  const asked = await hub.open()
  assert.equal((await asked.sendTurn('faça um app')).reason, 'suspended')
  await asked.end()
  const resumed = await hub.open()
  assert.equal((await resumed.resumeTurn({ toolCallId: 'c1', resumeData: ['Verde'] })).reason, 'complete')
  assert.ok(prompts[1].includes('User answered'))
  await resumed.release()
})

test('an answer on a new VM remakes the session and resumes the parked call from storage instead of losing it', async (t) => {
  const storage = new InMemoryStore()
  await storage.init()
  const { model, prompts } = askingModel()
  const hub = await hubOver(t, storage, model)
  const asked = await hub.open()
  assert.equal((await asked.sendTurn('faça um app')).reason, 'suspended')
  await asked.end()
  const parked = await hub.live()
  const resumed = await hub.open(hub.workspaceOn('replaced-vm'))
  assert.equal(await hub.live() === parked, false, 'the session is made again on the new workspace')
  assert.equal((await resumed.resumeTurn({ toolCallId: 'c1', resumeData: ['Azul'] })).reason, 'complete')
  assert.equal(prompts.length, 2)
  assert.deepEqual(await storedToolResult(hub), [{ name: 'ask_user', state: 'result', result: { content: 'User answered:\nQual cor?: Azul', isError: false } }])
  await resumed.release()
})

test('a leg that ends before its turn deletes the parked session and leaves the question open for the next answer', async (t) => {
  const storage = new InMemoryStore()
  await storage.init()
  const { model } = askingModel()
  const hub = await hubOver(t, storage, model)
  const asked = await hub.open()
  await asked.sendTurn('faça um app')
  await asked.end()
  const failedLeg = await hub.open()
  await failedLeg.release()
  assert.equal(await hub.live(), undefined, 'the failed leg deleted the session')
  assert.deepEqual((await storedToolResult(hub)).map(({ state }) => state), ['call'], 'deleting the session answered nothing')
  const answered = await hub.open()
  assert.equal((await answered.resumeTurn({ toolCallId: 'c1', resumeData: ['Verde'] })).reason, 'complete')
  await answered.release()
})

test("a conversation session the idle sweep or the Hub's close deletes leaves the parked question open, though it held the call", async (t) => {
  const storage = new InMemoryStore()
  await storage.init()
  const { model } = askingModel()
  const hub = await hubOver(t, storage, model)
  const clock = { now: 0 }
  const sessions = createConversationSessions({ controller: hub.controller, now: () => clock.now, sweepEveryMs: 3_600_000 })
  t.after(() => sessions.close())
  const asked = await hub.open()
  await asked.sendTurn('faça um app')
  await asked.end()
  const browser = await sessions.open({ resourceId, conversationId, requestContext: new RequestContext() })
  await new Promise((wake) => { setTimeout(wake, 300) })
  assert.equal(browser.suspensions.has({ toolCallId: 'c1' }), true, 'a session on the thread is told of the call while the run is warm')
  clock.now += 60 * 60_000
  await sessions.sweep()
  await sessions.open({ resourceId, conversationId, requestContext: new RequestContext() })
  await new Promise((wake) => { setTimeout(wake, 300) })
  await sessions.close()
  await new Promise((wake) => { setTimeout(wake, 300) })
  assert.deepEqual((await storedToolResult(hub)).map(({ state }) => state), ['call'])
  const answered = await hub.open()
  assert.equal((await answered.resumeTurn({ toolCallId: 'c1', resumeData: ['Azul'] })).reason, 'complete')
  await answered.release()
})

test('a call the thread does not hold is refused, and a stop settles the parked call as denied', async (t) => {
  const storage = new InMemoryStore()
  await storage.init()
  const { model } = askingModel()
  const hub = await hubOver(t, storage, model)
  const asked = await hub.open()
  await asked.sendTurn('faça um app')
  await asked.end()
  const wrong = await hub.open()
  await assert.rejects(() => wrong.resumeTurn({ toolCallId: 'other', resumeData: ['x'] }), /BUILDER_SUSPENSION_NOT_FOUND/)
  await wrong.release()
  await createParkedDiscard({ controller: hub.controller })({ projectId, conversationId })
  assert.deepEqual((await storedToolResult(hub)).map(({ state }) => state), ['output-denied'])
  const reader = await hub.controller.createSession({ resourceId, scope: 'reader', threadId: conversationId })
  assert.equal(await parkedCallStanding(reader, 'c1'), 'ABSENT', 'a call a stop denied waits on no answer')
  await deleteSessionLeavingParked(hub.controller, resourceId, 'reader')
})

const summary = (state, phase) => ({ builderRunId: runId, projectId, conversationId, state, phase, baseSourceRevision: 'a'.repeat(40), resultSourceRevision: null, resultKind: null, failureCode: null, requestText: 'faça um app', createdAt: '2026-10-01T00:00:00.000Z', cancellationRequested: false })

// The run's row, as the store's functions keep it: PARKED is a phase, and the answer takes it out once.
const parkedStore = () => {
  const row = { state: 'QUEUED', phase: null }
  const calls = []
  return {
    calls, row,
    store: {
      createBuilderRun: async () => summary('QUEUED', null),
      claimBuilderRun: async () => { row.state = 'RUNNING'; row.phase = 'PREPARING'; return summary('RUNNING', 'PREPARING') },
      resumeBuilderRun: async () => {
        if (row.state !== 'RUNNING' || row.phase !== 'PARKED') return null
        row.phase = 'PREPARING'
        calls.push('resume')
        return summary('RUNNING', 'PREPARING')
      },
      readBuilderRun: async () => summary(row.state, row.phase),
      setBuilderRunPhase: async (_id, phase) => { row.phase = phase },
      readConversationSandbox: async () => null,
      bindBuilderRunMessage: async () => {},
      bindBuilderRunSandbox: async () => {},
      recordConversationSandbox: async () => {},
      settleBuilderRun: async () => { row.state = 'SUCCEEDED'; row.phase = null; calls.push('settle') },
      failBuilderRun: async (_id, code) => { row.state = 'FAILED'; calls.push(['fail', code]) },
      close: async () => {},
    },
  }
}
const runsOver = (execute) => ({
  runtime: { execute, discardParked: async () => {} },
  findParkedCall: async () => 'PARKED',
  conversations: { ownerOf: async () => 'PROJECT' },
  git: { readMain: async () => 'a'.repeat(40), mainContains: async () => false },
  appendDiagnostic: async () => {},
  source: {},
})
const settled = (kind) => ({ projectId, executionId: runId, sandboxId: 'vm', baseSourceRevision: 'a'.repeat(40), summary: '', kind })

test('the same answer sent twice resumes the run once, one sent while the run is still parking waits for the park, and the leg after it settles the run', async () => {
  const { store, row, calls } = parkedStore()
  let release
  const legs = []
  const service = createBuilderService({
    store, applicationArtifacts: {},
    runs: runsOver(async (input) => {
      legs.push(input.resume ?? null)
      if (!input.resume) { await new Promise((wake) => { release = wake }); return settled('PARKED') }
      return settled('RESPONSE_ONLY')
    }),
  })
  await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'k', content: 'faça um app', conversationId })
  const answer = { accountId, projectId, builderRunId: runId, toolCallId: 'c1', resumeData: ['Azul'] }
  const early = service.answerBuilderRun(answer)
  await new Promise((wake) => { setTimeout(wake, 20) })
  assert.deepEqual(calls, [], 'nothing resumed while the first leg still holds its session')
  release()
  assert.equal(await early, 'RESUMED')
  assert.equal(await service.answerBuilderRun(answer), 'ALREADY_ANSWERED', 'the second answer to the same call changes nothing')
  await service.close()
  assert.deepEqual(legs, [null, { toolCallId: 'c1', resumeData: ['Azul'] }])
  assert.deepEqual(calls, ['resume', 'settle'])
  assert.equal(row.state, 'SUCCEEDED')
})

test('a run parked with no leg in this process, as after a restart, is answered by a new leg', async () => {
  const { store, row, calls } = parkedStore()
  row.state = 'RUNNING'
  row.phase = 'PARKED'
  const legs = []
  const service = createBuilderService({ store, applicationArtifacts: {}, runs: runsOver(async (input) => { legs.push(input.resume); return settled('RESPONSE_ONLY') }) })
  await service.answerBuilderRun({ accountId, projectId, builderRunId: runId, toolCallId: 'c1', resumeData: ['Azul'] })
  await service.close()
  assert.deepEqual(legs, [{ toolCallId: 'c1', resumeData: ['Azul'] }])
  assert.deepEqual(calls, ['resume', 'settle'])
})

test('a reconcile pass while an answer is moving the run out of PARKED does not fail the run', async () => {
  const { store, row, calls } = parkedStore()
  row.state = 'RUNNING'
  row.phase = 'PARKED'
  let resumeRow
  const resumed = new Promise((wake) => { resumeRow = wake })
  const resumeInDatabase = store.resumeBuilderRun
  store.resumeBuilderRun = async (id) => { const result = await resumeInDatabase(id); await resumed; return result }
  // A candidate run the database keeps refusing keeps the reconcile timer running.
  store.listAdmissionRuns = async () => [{ builderRunId: 'stuck', projectId, candidateRevision: 'b'.repeat(40), resultSourceRevision: null }]
  store.advanceBuilderRunSource = async () => { throw new Error('DATABASE_DOWN') }
  store.recoverBuilderRuns = async () => []
  store.listUnownedRunCandidates = async () => (row.state === 'RUNNING' && row.phase !== 'PARKED' ? [{ builderRunId: runId, projectId, conversationId }] : [])
  const legs = []
  const service = createBuilderService({
    store, applicationArtifacts: {},
    runs: { ...runsOver(async (input) => { legs.push(input.resume); return settled('RESPONSE_ONLY') }), git: { readMain: async () => 'a'.repeat(40), mainContains: async () => true }, reconcileEveryMs: 5 },
  })
  await service.recover()
  const answering = service.answerBuilderRun({ accountId, projectId, builderRunId: runId, toolCallId: 'c1', resumeData: ['Azul'] })
  await new Promise((wake) => { setTimeout(wake, 100) })
  assert.deepEqual(calls, ['resume'], 'the row is running again and no leg is registered yet')
  resumeRow()
  assert.equal(await answering, 'RESUMED')
  await service.close()
  assert.deepEqual(calls, ['resume', 'settle'], 'the sweep did not fail the resumed run')
  assert.deepEqual(legs, [{ toolCallId: 'c1', resumeData: ['Azul'] }])
})

// The Hub's service over the run's row and a real Mastra thread: the web app's answer reaches
// `answerBuilderRun`, and a resumed leg answers the call through a new run session, as in production.
const serviceOverThread = async (t) => {
  const storage = new InMemoryStore()
  await storage.init()
  const { model, prompts } = askingModel()
  const hub = await hubOver(t, storage, model)
  const browser = await hub.controller.createSession({ resourceId, scope: `conversation:${conversationId}`, threadId: conversationId })
  const asked = await hub.open()
  assert.equal((await asked.sendTurn('faça um app')).reason, 'suspended')
  await asked.end()
  const { store, row, calls } = parkedStore()
  row.state = 'RUNNING'
  row.phase = 'PARKED'
  const runs = runsOver(async (input) => {
    const leg = await hub.open()
    try { await leg.resumeTurn(input.resume) } finally { await leg.release() }
    return settled('RESPONSE_ONLY')
  })
  const service = createBuilderService({
    store, applicationArtifacts: {},
    runs: { ...runs, findParkedCall: ({ toolCallId }) => parkedCallStanding(browser, toolCallId) },
  })
  const answer = (toolCallId) => service.answerBuilderRun({ accountId, projectId, builderRunId: runId, toolCallId, resumeData: ['Azul'] })
  return { service, row, calls, prompts, answer }
}

test('an answer to a call the run is not parked on is refused, the run stays parked, and its question can still be answered', async (t) => {
  const { service, row, calls, prompts, answer } = await serviceOverThread(t)
  const refused = await answer('forged')
  assert.deepEqual({ state: row.state, phase: row.phase, calls }, { state: 'RUNNING', phase: 'PARKED', calls: [] }, 'the run is still parked and nothing resumed it')
  assert.equal(refused, 'NOT_PARKED')
  assert.equal(await answer('c1'), 'RESUMED')
  await service.close()
  assert.deepEqual({ state: row.state, calls }, { state: 'SUCCEEDED', calls: ['resume', 'settle'] })
  assert.ok(prompts[1].includes('User answered'), 'the original question was answered after the refusal')
})

test('a second answer to a call already answered is told apart as ALREADY_ANSWERED, during its leg and after the run settled', async (t) => {
  const { service, row, answer } = await serviceOverThread(t)
  const first = answer('c1')
  assert.equal(await answer('c1'), 'ALREADY_ANSWERED', 'a double click while the answer is resuming the run')
  assert.equal(await first, 'RESUMED')
  await service.close()
  assert.equal(row.state, 'SUCCEEDED')
  assert.equal(await answer('c1'), 'ALREADY_ANSWERED', 'an old card answered again once the run is over')
})

// The Hub's service over a real Mastra thread, for the ways a run ends with its question still open.
// The run's row is the store's: a stop is refused a PARKED phase, as the database refuses it.
const endingOverThread = async (t, { asks = 1 } = {}) => {
  const storage = new InMemoryStore()
  await storage.init()
  const { model } = askingModel({ asks })
  const hub = await hubOver(t, storage, model)
  // await hub.controller.createSession({ resourceId, scope: `conversation:${conversationId}`, threadId: conversationId })
  const { store, row, calls } = parkedStore()
  const stopped = { requested: false }
  store.requestBuilderRunCancellation = async () => { stopped.requested = true; return summary('RUNNING', row.phase) }
  store.interruptBuilderRun = async (_id, reason) => { row.state = 'INTERRUPTED'; row.phase = null; calls.push(['interrupt', reason]) }
  store.setBuilderRunPhase = async (_id, phase) => {
    // What the store throws when the database refuses the phase of a run whose stop it recorded.
    if (phase === 'PARKED' && stopped.requested) throw new Error('BUILDER_RUN_PHASE_UPDATE_REFUSED')
    row.phase = phase
  }
  store.recoverBuilderRuns = async () => []
  const open = async () => {
    const reader = await hub.controller.createSession({ resourceId, scope: 'reader', threadId: conversationId })
    try {
      const results = (await reader.thread.listActiveMessages()).flatMap((message) => message.content.parts)
        .filter((part) => part.type === 'tool-invocation').map((part) => `${part.toolInvocation.toolCallId}:${part.toolInvocation.state}`)
      return { open: (await readParkedCalls(reader)).map((call) => call.toolCallId), results }
    } finally { await deleteSessionLeavingParked(hub.controller, resourceId, 'reader') }
  }
  const serviceOver = (execute, over = {}) => createBuilderService({
    store, applicationArtifacts: {},
    runs: { ...runsOver(execute), runtime: { execute, discardParked: createParkedDiscard({ controller: hub.controller }) }, ...over },
  })
  return { hub, store, row, calls, stopped, open, serviceOver, storage }
}

test('a stop during the park settles the question as denied, and the next run shows no old card', async (t) => {
  const { hub, row, open, serviceOver } = await endingOverThread(t)
  let reachPark
  const parkReached = new Promise((wake) => { reachPark = wake })
  let letPark
  const mayPark = new Promise((wake) => { letPark = wake })
  const service = serviceOver(async () => {
    const leg = await hub.open()
    assert.equal((await leg.sendTurn('faça um app')).reason, 'suspended')
    reachPark()
    await mayPark
    await leg.end()
    return settled('PARKED')
  })
  await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'k', content: 'faça um app', conversationId })
  await parkReached
  await service.cancelBuilderRun({ accountId, projectId, builderRunId: runId })
  letPark()
  await service.close()
  assert.equal(row.state, 'INTERRUPTED')
  assert.deepEqual(await open(), { open: [], results: ['c1:output-denied'] })
})

test('a park the database refuses settles the question as denied, and the run ends interrupted', async (t) => {
  const { hub, row, calls, stopped, open, serviceOver } = await endingOverThread(t)
  const service = serviceOver(async () => {
    const leg = await hub.open()
    await leg.sendTurn('faça um app')
    stopped.requested = true
    await leg.end()
    return settled('PARKED')
  })
  await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'k', content: 'faça um app', conversationId })
  await service.close()
  assert.deepEqual({ state: row.state, calls }, { state: 'INTERRUPTED', calls: [['interrupt', 'USER_CANCELLED']] })
  assert.deepEqual(await open(), { open: [], results: ['c1:output-denied'] })
})

test('a Hub that crashes while a resumed leg waits on a second question settles it on restart, and a second settle changes nothing', async (t) => {
  const { hub, store, row, open, serviceOver, storage } = await endingOverThread(t, { asks: 2 })
  const first = await hub.open()
  await first.sendTurn('faça um app')
  await first.end()
  row.state = 'RUNNING'
  row.phase = 'PARKED'
  // The answer resumes the run; its leg reaches the model's second question and the Hub dies there.
  const resumedLeg = serviceOver(async (input) => {
    const leg = await hub.open()
    assert.equal((await leg.resumeTurn(input.resume)).reason, 'suspended')
    return new Promise(() => {})
  })
  assert.equal(await resumedLeg.answerBuilderRun({ accountId, projectId, builderRunId: runId, toolCallId: 'c1', resumeData: ['Azul'] }), 'RESUMED')
  await new Promise((wake) => { setTimeout(wake, 200) })
  assert.deepEqual((await open()).open, ['c2'], 'the second question is open when the Hub dies')

  const after = await hubOver(t, storage, askingModel({ asks: 2 }).model)
  const restarted = createBuilderService({
    store: { ...store, recoverBuilderRuns: async () => [{ builderRunId: runId, projectId, conversationId }], listAdmissionRuns: async () => [] },
    applicationArtifacts: {},
    runs: { ...runsOver(async () => { throw new Error('not used') }), runtime: { execute: async () => { throw new Error('not used') }, discardParked: createParkedDiscard({ controller: after.controller }) } },
  })
  await restarted.recover()
  const reader = await after.controller.createSession({ resourceId, scope: 'reader', threadId: conversationId })
  const standing = async () => ({ open: (await readParkedCalls(reader)).map((call) => call.toolCallId), c2: await parkedCallStanding(reader, 'c2') })
  assert.deepEqual(await standing(), { open: [], c2: 'ABSENT' })
  await restarted.recover()
  assert.deepEqual(await standing(), { open: [], c2: 'ABSENT' }, 'settling again leaves the same end state')
  const states = (await reader.thread.listActiveMessages()).flatMap((message) => message.content.parts)
    .filter((part) => part.type === 'tool-invocation').map((part) => `${part.toolInvocation.toolCallId}:${part.toolInvocation.state}`)
  assert.deepEqual(states, ['c1:result', 'c2:output-denied'])
  await deleteSessionLeavingParked(after.controller, resourceId, 'reader')
})

test('a stop on a parked run tells the stream that follows its live session before the discard deletes it', async (t) => {
  const { hub, store, row, open, serviceOver } = await endingOverThread(t)
  const told = []
  const service = serviceOver(async () => {
    const leg = await hub.open()
    await leg.sendTurn('faça um app')
    await leg.end()
    return settled('PARKED')
  }, {
    publishRun: async (run) => {
      const session = await hub.live()
      told.push(`${run.state}:${run.phase}:${session ? 'live' : 'gone'}`)
    },
  })
  await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'k', content: 'faça um app', conversationId })
  await new Promise((wake) => { setTimeout(wake, 100) })
  assert.equal(row.phase, 'PARKED')
  store.requestBuilderRunCancellation = async () => { row.state = 'INTERRUPTED'; row.phase = null; return summary('INTERRUPTED', null) }
  await service.cancelBuilderRun({ accountId, projectId, builderRunId: runId })
  await service.close()
  assert.deepEqual(told.slice(-1), ['INTERRUPTED:null:live'])
  assert.equal(await hub.live(), undefined, 'the discard deleted the parked session after the stream heard the stop')
  assert.deepEqual(await open(), { open: [], results: ['c1:output-denied'] })
})

test('a failed discard never fails the stop that asked for it', async (t) => {
  const { serviceOver, row } = await endingOverThread(t)
  row.state = 'RUNNING'
  row.phase = 'PARKED'
  const service = serviceOver(async () => { throw new Error('not used') }, {
    runtime: { execute: async () => { throw new Error('not used') }, discardParked: async () => { throw new Error('thread unreachable') } },
  })
  await service.cancelBuilderRun({ accountId, projectId, builderRunId: runId })
})

test('a stop that lands once the park is written, while the leg still lets go, settles the question as denied', async (t) => {
  const { hub, store, row, open, serviceOver } = await endingOverThread(t)
  const stop = { service: null, done: null }
  store.requestBuilderRunCancellation = async () => {
    Object.assign(row, { state: 'INTERRUPTED', phase: null })
    return summary('INTERRUPTED', null)
  }
  store.setBuilderRunPhase = async (_id, phase) => {
    row.phase = phase
    if (phase === 'PARKED') {
      stop.done = stop.service.cancelBuilderRun({ accountId, projectId, builderRunId: runId })
      await stop.done
    }
  }
  stop.service = serviceOver(async () => {
    const leg = await hub.open()
    await leg.sendTurn('faça um app')
    await leg.end()
    return settled('PARKED')
  })
  await stop.service.createBuilderRun({ accountId, projectId, idempotencyKey: 'k', content: 'faça um app', conversationId })
  await stop.service.close()
  assert.equal(row.state, 'INTERRUPTED')
  assert.deepEqual(await open(), { open: [], results: ['c1:output-denied'] })
})
