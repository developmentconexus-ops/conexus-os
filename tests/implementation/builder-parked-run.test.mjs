import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { InMemoryStore } from '@mastra/core/storage'
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace'
import { hubModuleUrl } from './hub-build.mjs'

const { createBuilderController } = await import(hubModuleUrl('builder/harness/controller.js'))
const { createControllerRunSessions, createParkedDiscard } = await import(hubModuleUrl('builder/run-runtime.js'))
const { createBuilderMemory } = await import(hubModuleUrl('builder/memory.js'))
const { createBuilderService } = await import(hubModuleUrl('builder/service.js'))
const { parkedCallStanding } = await import(hubModuleUrl('builder/runtime.js'))

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
const askingModel = () => {
  const prompts = []
  return {
    prompts,
    model: {
      specificationVersion: 'v2', provider: 'anthropic', modelId: 'probe-1', supportedUrls: {},
      async doGenerate() { throw new Error('doGenerate not used') },
      async doStream(options) {
        prompts.push(JSON.stringify(options.prompt))
        const parts = prompts.length === 1
          ? [{ type: 'tool-call', toolCallId: 'c1', toolName: 'ask_user', input: JSON.stringify({ questions: ASK }) }, { type: 'finish', finishReason: 'tool-calls', usage }]
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
  const workspace = new Workspace({ id: 'parked-ws', filesystem: new LocalFilesystem({ basePath: root }), sandbox: new LocalSandbox({ workingDirectory: root }) })
  const conversationWorkspaces = new Map()
  const controller = createBuilderController({
    workspace: ({ requestContext }) => conversationWorkspaces.get(requestContext.getRaw('conexusBuilderConversationId')),
    model, storage, memory: createBuilderMemory({ storage, memoryModel: async () => model }), skillsPath: resolve(repositoryRoot, 'builder-skills'),
  })
  await controller.init()
  t.after(() => controller.destroy?.())
  const openSession = createControllerRunSessions({ controller, runContexts: new Map(), conversationWorkspaces, runTools: new Map(), readDefaultModel: async () => 'anthropic/default-model' })
  const open = () => openSession({
    projectId, conversationId, builderRunId: runId, workspace, runCheck: async () => { throw new Error('not used') },
    bindContext: (requestContext) => { requestContext.setRaw('conexusBuilderRunId', runId); requestContext.setRaw('conexusBuilderConversationId', conversationId) },
  })
  const live = () => controller.getSessionByResource(resourceId, `builder:${conversationId}`)
  return { controller, open, live }
}

const storedToolResult = async (hub) => {
  const session = await hub.controller.createSession({ resourceId, scope: 'reader', threadId: conversationId })
  const parts = (await session.thread.listActiveMessages()).flatMap((message) => message.content.parts)
  await hub.controller.deleteSession({ resourceId, scope: 'reader' })
  return parts.filter((part) => part.type === 'tool-invocation').map((part) => ({ name: part.toolInvocation.toolName, state: part.toolInvocation.state, result: part.toolInvocation.result }))
}

test('a run parked on a question releases its session, and after a restart the answer resumes the same call to completion', async (t) => {
  const storage = new InMemoryStore()
  await storage.init()
  const { model, prompts } = askingModel()

  const before = await hubOver(t, storage, model)
  await before.controller.createSession({ resourceId, scope: `conversation:${conversationId}`, threadId: conversationId })
  const asked = await before.open()
  const first = await asked.sendTurn('faça um app')
  assert.equal(first.reason, 'suspended', 'the turn ends at the question instead of waiting for the answer')
  await asked.park()
  assert.equal(await before.live(), undefined, 'parking leaves no session in the controller')

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
  await asked.park()
  const resumed = await hub.open()
  assert.equal((await resumed.resumeTurn({ toolCallId: 'c1', resumeData: ['Verde'] })).reason, 'complete')
  assert.ok(prompts[1].includes('User answered'))
  await resumed.release()
})

test('a call the thread does not hold is refused, and a stop settles the parked call as denied', async (t) => {
  const storage = new InMemoryStore()
  await storage.init()
  const { model } = askingModel()
  const hub = await hubOver(t, storage, model)
  const asked = await hub.open()
  await asked.sendTurn('faça um app')
  await asked.park()
  const wrong = await hub.open()
  await assert.rejects(() => wrong.resumeTurn({ toolCallId: 'other', resumeData: ['x'] }), /BUILDER_SUSPENSION_NOT_FOUND/)
  await wrong.release()
  await createParkedDiscard({ controller: hub.controller })({ projectId, conversationId })
  assert.deepEqual((await storedToolResult(hub)).map(({ state }) => state), ['output-denied'])
  const reader = await hub.controller.createSession({ resourceId, scope: 'reader', threadId: conversationId })
  assert.equal(await parkedCallStanding(reader, 'c1'), 'ABSENT', 'a call a stop denied waits on no answer')
  await hub.controller.deleteSession({ resourceId, scope: 'reader' })
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
  await asked.park()
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
