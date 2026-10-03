import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { createBuilderService } = await import(hubModuleUrl('builder/service.js'))
const { logger } = await import(hubModuleUrl('platform/logger.js'))
const { Failure } = await import(hubModuleUrl('platform/failure.js'))

// A minimal BuilderRunDependencies fixture: every run is dispatched through runs.runtime.execute,
// so each test only overrides the pieces it exercises.
// A conversation is the Project's when its thread is; these tests name the missing one through the conversation id.
const makeRuns = ({ execute, appendDiagnostic, publishRun, discardParked }) => ({
  runtime: { execute, discardParked: discardParked ?? (async () => {}) },
  publishRun: publishRun ?? (async () => {}),
  conversations: {
    ownerOf: async (_projectId, conversationId) => (conversationId === 'conv-missing' ? 'NONE' : 'PROJECT'),
  },
  git: { readMain: async () => 'a'.repeat(40), mainContains: async () => false },
  appendDiagnostic: appendDiagnostic ?? (async () => {}),
  source: {
    listSourceTree: async () => { throw new Error('not reached') },
    readSourceFile: async () => { throw new Error('not reached') },
  },
})

test('BuilderRun message dispatch claims, executes and settles without Change pipeline', async () => {
  const runId = '11111111-1111-4111-8111-111111111111'
  const projectId = '22222222-2222-4222-8222-222222222222'
  const accountId = '33333333-3333-4333-8333-333333333333'
  const sourceRevision = 'a'.repeat(40)
  const calls = []
  const store = {
    createBuilderRun: async () => ({ builderRunId: runId, projectId, state: 'QUEUED', phase: null, baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null }),
    claimBuilderRun: async () => { calls.push('claim'); return { builderRunId: runId, projectId, conversationId: 'conv-plan', state: 'RUNNING', phase: 'PREPARING', baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null } },
    setBuilderRunPhase: async (_id, phase) => calls.push(['phase', phase]),
    bindBuilderRunMessage: async (_id, messageId) => calls.push(['message', messageId]),
    bindBuilderRunSandbox: async (_id, sandboxId) => calls.push(['sandbox', sandboxId]),
    readConversationSandbox: async (input) => { calls.push(['read-conversation-sandbox', input]); return 'vm-before' },
    recordConversationSandbox: async (input) => calls.push(['conversation-sandbox', input]),
    settleBuilderRun: async (input) => calls.push(['settle', input.resultKind]),
    failBuilderRun: async () => calls.push('fail'),
    close: async () => {},
  }
  const service = createBuilderService({
    store,
    runs: makeRuns({
      execute: async (input) => {
        calls.push(['execute', input.intent, input.providerSandboxId])
        await input.bindPhysicalSandbox('physical-sandbox')
        await input.bindMessage('mastra-message')
        return { projectId, executionId: runId, sandboxId: 'physical-sandbox', baseSourceRevision: sourceRevision, summary: 'Resposta', kind: 'RESPONSE_ONLY' }
      },
    }),
    applicationArtifacts: {},
  })
  const result = await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'key', content: 'Explique o app', conversationId: 'conv-plan' })
  await service.close()
  assert.equal(result.builderRunId, runId)
  assert.deepEqual(calls, [
    'claim', ['phase', 'PREPARING'], ['read-conversation-sandbox', { projectId, conversationId: 'conv-plan' }], ['execute', 'Explique o app', 'vm-before'],
    ['sandbox', 'physical-sandbox'], ['conversation-sandbox', { projectId, conversationId: 'conv-plan', providerSandboxId: 'physical-sandbox' }],
    ['message', 'mastra-message'], ['phase', 'FINALIZING'], ['settle', 'RESPONSE_ONLY'],
  ])
})

test('createBuilderRun hands the store a base read from main in the Conexus Git', async () => {
  const projectId = '22222222-2222-4222-8222-222222222222'
  const accountId = '33333333-3333-4333-8333-333333333333'
  const main = '9'.repeat(40)
  const reads = []
  const store = {
    createBuilderRun: async (input) => {
      const base = await input.readBase()
      return { builderRunId: '11111111-1111-4111-8111-111111111112', projectId, state: 'SUCCEEDED', phase: null, baseSourceRevision: base, resultSourceRevision: null, resultKind: 'RESPONSE_ONLY', failureCode: null }
    },
    close: async () => {},
  }
  const runs = { ...makeRuns({ execute: async () => { throw new Error('must not execute a settled run') } }), git: { readMain: async (id) => { reads.push(id); return main }, mainContains: async () => false } }
  const service = createBuilderService({ store, runs, applicationArtifacts: {} })
  const run = await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'key', content: 'Explique o app', conversationId: 'conv-plan' })
  await service.close()
  assert.equal(run.baseSourceRevision, main)
  assert.deepEqual(reads, [projectId])
})

test('a failure before the agent keeps the operator request on the run and names a public category', async () => {
  const runId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const projectId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccd'
  const accountId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  const sourceRevision = 'a'.repeat(40)
  const createdAt = '2026-09-20T12:00:00.000Z'
  let stored = null
  let failed = null
  const row = (state, failureCode) => ({
    builderRunId: runId, projectId, state, phase: null, baseSourceRevision: sourceRevision,
    resultSourceRevision: null, resultKind: null, failureCode, requestText: stored, createdAt,
  })
  const store = {
    createBuilderRun: async (input) => { stored = input.content; return row('QUEUED', null) },
    claimBuilderRun: async () => row('RUNNING', null),
    setBuilderRunPhase: async () => {},
    readConversationSandbox: async () => null,
    failBuilderRun: async (_id, code) => { failed = code },
    close: async () => {},
  }
  const service = createBuilderService({
    store,
    runs: makeRuns({
      // The starter root is refused before the agent is ever opened.
      execute: async () => { throw new Failure('BUILDER_STARTER_ROOT_REFUSED') },
    }),
    applicationArtifacts: {},
  })
  const accepted = await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'preagent', content: 'Crie um contador', conversationId: 'conv-build' })
  await service.close()
  assert.equal(stored, 'Crie um contador')
  assert.equal(accepted.requestText, 'Crie um contador')
  assert.equal(failed, 'BUILDER_STARTER_ROOT_REFUSED')
})

test('BuilderRun cancellation records intent, aborts native work, and interrupts once', async () => {
  const runId = '88888888-8888-4888-8888-888888888888'
  const projectId = '99999999-9999-4999-8999-999999999999'
  const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const sourceRevision = 'a'.repeat(40)
  const calls = []
  let started
  const startedPromise = new Promise((resolve) => { started = resolve })
  const run = { builderRunId: runId, projectId, state: 'QUEUED', baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null }
  const store = {
    createBuilderRun: async () => run,
    claimBuilderRun: async () => ({ ...run, state: 'RUNNING' }),
    requestBuilderRunCancellation: async () => { calls.push('request-cancellation'); return { ...run, state: 'RUNNING', cancellationRequested: true } },
    interruptBuilderRun: async (_id, reason) => calls.push(['interrupt', reason]),
    setBuilderRunPhase: async () => {},
    bindBuilderRunMessage: async () => {}, bindBuilderRunSandbox: async () => {}, readConversationSandbox: async () => null, recordConversationSandbox: async () => {}, failBuilderRun: async () => calls.push('fail'), close: async () => {},
  }
  const service = createBuilderService({
    store,
    runs: makeRuns({
      execute: async (input) => {
        started()
        await new Promise((_resolve, reject) => {
          if (input.signal?.aborted) return reject(new Failure('BUILDER_RUN_CANCELLED'))
          input.signal?.addEventListener('abort', () => reject(new Failure('BUILDER_RUN_CANCELLED')), { once: true })
        })
        throw new Failure('BUILDER_RUN_CANCELLED')
      },
    }),
    applicationArtifacts: {},
  })
  await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'cancel-key', content: 'pare', conversationId: 'conv-build' })
  await startedPromise
  await service.cancelBuilderRun({ accountId, projectId, builderRunId: runId })
  await service.close()
  assert.equal(calls[0], 'request-cancellation')
  assert.deepEqual(calls.at(-1), ['interrupt', 'USER_CANCELLED'])
})

test('stopping the legs aborts a live one and interrupts its run as HUB_RESTART, never as the operator\'s stop', async () => {
  const runId = '88888888-8888-4888-8888-888888888889'
  const projectId = '99999999-9999-4999-8999-999999999998'
  const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab'
  const calls = []
  let started
  const startedPromise = new Promise((resolve) => { started = resolve })
  const run = { builderRunId: runId, projectId, state: 'QUEUED', baseSourceRevision: 'a'.repeat(40), resultSourceRevision: null, resultKind: null, failureCode: null }
  const store = {
    createBuilderRun: async () => run,
    claimBuilderRun: async () => ({ ...run, state: 'RUNNING' }),
    interruptBuilderRun: async (_id, reason) => calls.push(['interrupt', reason]),
    setBuilderRunPhase: async () => {},
    bindBuilderRunMessage: async () => {}, bindBuilderRunSandbox: async () => {}, readConversationSandbox: async () => null, recordConversationSandbox: async () => {}, failBuilderRun: async () => calls.push('fail'), close: async () => {},
  }
  const service = createBuilderService({
    store,
    runs: makeRuns({
      execute: async (input) => {
        started()
        await new Promise((_resolve, reject) => input.signal?.addEventListener('abort', () => reject(new Failure('BUILDER_RUN_CANCELLED')), { once: true }))
      },
    }),
    applicationArtifacts: {},
  })
  await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'restart-key', content: 'construa', conversationId: 'conv-build' })
  await startedPromise
  service.stopLegs()
  await service.close()
  assert.deepEqual(calls, [['interrupt', 'HUB_RESTART']])
})

test("a browser following the conversation is handed the run as the builder-session read serves it: at each phase, at a stop request, and once settled", async () => {
  const runId = '88888888-8888-4888-8888-88888888888a'
  const projectId = '99999999-9999-4999-8999-999999999999'
  const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const row = { builderRunId: runId, projectId, conversationId: 'conv-build', state: 'QUEUED', phase: null, baseSourceRevision: 'a'.repeat(40), resultSourceRevision: null, resultKind: null, failureCode: null }
  const published = []
  let started
  const startedPromise = new Promise((resolve) => { started = resolve })
  const store = {
    createBuilderRun: async () => ({ ...row }),
    claimBuilderRun: async () => Object.assign(row, { state: 'RUNNING' }),
    readBuilderRun: async (input) => input.accountId === accountId && input.projectId === projectId ? { ...row } : null,
    setBuilderRunPhase: async (_id, phase) => { row.phase = phase },
    requestBuilderRunCancellation: async () => Object.assign(row, { cancellationRequested: true }),
    interruptBuilderRun: async () => { Object.assign(row, { state: 'INTERRUPTED', phase: null, failureCode: 'USER_CANCELLED' }) },
    bindBuilderRunMessage: async () => {}, bindBuilderRunSandbox: async () => {}, readConversationSandbox: async () => null, recordConversationSandbox: async () => {}, failBuilderRun: async () => {}, close: async () => {},
  }
  const service = createBuilderService({
    store,
    runs: makeRuns({
      publishRun: async (run) => { published.push([run.state, run.phase, run.cancellationRequested === true]) },
      execute: async (input) => {
        await input.setPhase('AGENT')
        started()
        await new Promise((_resolve, reject) => input.signal?.addEventListener('abort', () => reject(new Failure('BUILDER_RUN_CANCELLED')), { once: true }))
      },
    }),
    applicationArtifacts: {},
  })
  await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'publish-key', content: 'faça', conversationId: 'conv-build' })
  await startedPromise
  await service.cancelBuilderRun({ accountId, projectId, builderRunId: runId })
  await service.close()
  assert.deepEqual(published, [
    ['RUNNING', 'PREPARING', false],
    ['RUNNING', 'AGENT', false],
    ['RUNNING', 'AGENT', true],
    ['INTERRUPTED', null, true],
  ])
})

test('a run cancelled mid phase change is interrupted, not failed, whatever error the abort surfaces', async () => {
  const runId = '88888888-8888-4888-8888-888888888889'
  const projectId = '99999999-9999-4999-8999-999999999999'
  const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const calls = []
  let started
  const startedPromise = new Promise((resolve) => { started = resolve })
  const run = { builderRunId: runId, projectId, state: 'QUEUED', baseSourceRevision: 'a'.repeat(40), resultSourceRevision: null, resultKind: null, failureCode: null }
  const service = createBuilderService({
    store: {
      createBuilderRun: async () => run,
      claimBuilderRun: async () => ({ ...run, state: 'RUNNING' }),
      setBuilderRunPhase: async () => {},
      requestBuilderRunCancellation: async () => ({ ...run, state: 'RUNNING', cancellationRequested: true }),
      interruptBuilderRun: async (_id, reason) => calls.push(['interrupt', reason]),
      bindBuilderRunMessage: async () => {}, bindBuilderRunSandbox: async () => {}, readConversationSandbox: async () => null, recordConversationSandbox: async () => {}, failBuilderRun: async (_id, code) => calls.push(['fail', code]), close: async () => {},
    },
    runs: makeRuns({
      execute: async (input) => {
        started()
        await new Promise((resolve) => input.signal?.addEventListener('abort', resolve, { once: true }))
        throw new Failure('BUILDER_RUN_PHASE_UPDATE_REFUSED')
      },
    }),
    applicationArtifacts: {},
  })
  await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'cancel-mid-phase', content: 'pare', conversationId: 'conv-build' })
  await startedPromise
  await service.cancelBuilderRun({ accountId, projectId, builderRunId: runId })
  await service.close()
  assert.deepEqual(calls, [['interrupt', 'USER_CANCELLED']])
})

test('BUILD source result is admitted by the runtime, compiled, settles Preview and persists every phase in order', async () => {
  const runId = '44444444-4444-4444-8444-444444444444'
  const projectId = '55555555-5555-4555-8555-555555555555'
  const accountId = '66666666-6666-4666-8666-666666666666'
  const base = 'b'.repeat(40)
  const resultRevision = 'c'.repeat(40)
  const calls = []
  const run = { builderRunId: runId, projectId, state: 'QUEUED', baseSourceRevision: base, resultSourceRevision: null, resultKind: null, failureCode: null }
  const store = {
    createBuilderRun: async () => run,
    claimBuilderRun: async () => ({ ...run, state: 'RUNNING' }),
    setBuilderRunPhase: async (_id, phase) => calls.push(['phase', phase]),
    bindBuilderRunMessage: async () => {}, bindBuilderRunSandbox: async () => {}, readConversationSandbox: async () => null, recordConversationSandbox: async () => {}, failBuilderRun: async () => calls.push('fail'), close: async () => {},
    advanceBuilderRunSource: async (_id, revision) => calls.push(['advance', revision]),
    settleBuilderRunBuild: async input => calls.push(['build-settle', input.artifactRevisionId, input.artifactDigest]),
  }
  const service = createBuilderService({
    store,
    runs: makeRuns({
      // The Factory's own compare-and-swap admits the source; the sandbox that ran the agent
      // also compiles, so the runtime owns the COMPILING phase.
      execute: async (input) => {
        await input.setPhase('COMPILING')
        return {
          projectId, executionId: runId, sandboxId: 'sandbox', baseSourceRevision: base, summary: 'alterado', kind: 'SOURCE_ADMITTED',
          resultSourceRevision: resultRevision,
          applicationBuild: { kind: 'BUILT', compiledApplication: { projectId, executionId: runId, sourceRevision: resultRevision, templateRef: 'x', recipeSha256: 'y', files: [] } },
        }
      },
    }),
    applicationArtifacts: { retainApplication: async (input) => { calls.push(['retain', input.compiled]); return { artifactRevisionId: '77777777-7777-4777-8777-777777777777', artifactDigest: 'd'.repeat(64) } } },
  })
  await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'key', content: 'altere', conversationId: 'conv-build' })
  await service.close()
  assert.deepEqual(calls, [
    ['phase', 'PREPARING'], ['phase', 'COMPILING'],
    ['advance', resultRevision],
    ['retain', { projectId, executionId: runId, sourceRevision: resultRevision, templateRef: 'x', recipeSha256: 'y', files: [] }],
    ['phase', 'FINALIZING'],
    ['build-settle', '77777777-7777-4777-8777-777777777777', 'd'.repeat(64)],
  ])
})

test('a page that did not render still admits and advances the source, and settles SOURCE_CHANGED_BUILD_FAILED', async () => {
  const runId = '44444444-4444-4444-8444-444444444445'
  const projectId = '55555555-5555-4555-8555-555555555555'
  const accountId = '66666666-6666-4666-8666-666666666666'
  const base = 'b'.repeat(40)
  const resultRevision = 'c'.repeat(40)
  const calls = []
  const run = { builderRunId: runId, projectId, state: 'QUEUED', baseSourceRevision: base, resultSourceRevision: null, resultKind: null, failureCode: null }
  const store = {
    createBuilderRun: async () => run,
    claimBuilderRun: async () => ({ ...run, state: 'RUNNING' }),
    setBuilderRunPhase: async (_id, phase) => calls.push(['phase', phase]),
    bindBuilderRunMessage: async () => {}, bindBuilderRunSandbox: async () => {}, readConversationSandbox: async () => null, recordConversationSandbox: async () => {}, failBuilderRun: async (_id, code) => calls.push(['fail', code]), close: async () => {},
    advanceBuilderRunSource: async (_id, revision) => calls.push(['advance', revision]),
    settleBuilderRunBuild: async (input) => calls.push(['build-settle', input.failureCode ?? null]),
  }
  // retainApplication must never be reached: a page that did not render has no build to retain,
  // only the code that names it.
  const service = createBuilderService({
    store,
    runs: makeRuns({
      execute: async (input) => {
        await input.setPhase('COMPILING')
        return {
          projectId, executionId: runId, sandboxId: 'sandbox', baseSourceRevision: base, summary: 'alterado', kind: 'SOURCE_ADMITTED',
          resultSourceRevision: resultRevision,
          applicationBuild: { kind: 'UNRENDERED', code: 'APPLICATION_SMOKE_FAILED', detail: 'boot failed:\nBOOT_NO_ROOT_CHILD nada na tela' },
        }
      },
      appendDiagnostic: async (note) => calls.push(['note', note.code, note.outcome, note.detail]),
    }),
    applicationArtifacts: { retainApplication: async () => { throw new Error('must not retain a build-failed compile') } },
  })
  await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'key', content: 'altere', conversationId: 'conv-build' })
  await service.close()
  assert.deepEqual(calls, [
    ['phase', 'PREPARING'], ['phase', 'COMPILING'],
    ['advance', resultRevision],
    ['phase', 'FINALIZING'],
    ['build-settle', 'APPLICATION_SMOKE_FAILED'],
    ['note', 'APPLICATION_SMOKE_FAILED', 'BUILD_FAILED', 'boot failed:\nBOOT_NO_ROOT_CHILD nada na tela'],
  ])
})

test('a runtime failure still fails the run outright', async () => {
  const runId = '44444444-4444-4444-8444-444444444446'
  const projectId = '55555555-5555-4555-8555-555555555555'
  const accountId = '66666666-6666-4666-8666-666666666666'
  const base = 'b'.repeat(40)
  const calls = []
  const run = { builderRunId: runId, projectId, state: 'QUEUED', baseSourceRevision: base, resultSourceRevision: null, resultKind: null, failureCode: null }
  const store = {
    createBuilderRun: async () => run,
    claimBuilderRun: async () => ({ ...run, state: 'RUNNING' }),
    setBuilderRunPhase: async () => {},
    bindBuilderRunMessage: async () => {}, bindBuilderRunSandbox: async () => {}, readConversationSandbox: async () => null, recordConversationSandbox: async () => {},
    failBuilderRun: async (_id, code) => calls.push(['fail', code]),
    close: async () => {},
    advanceBuilderRunSource: async () => { throw new Error('must not admit: the runtime never returned a result') },
    settleBuilderRunBuild: async () => { throw new Error('must not settle a build: the runtime never returned a result') },
  }
  const service = createBuilderService({
    store,
    runs: makeRuns({
      execute: async () => { throw new Failure('APPLICATION_COMPILER_WORKSPACE_REFUSED') },
    }),
    applicationArtifacts: {},
  })
  await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'key', content: 'altere', conversationId: 'conv-build' })
  await service.close()
  assert.deepEqual(calls, [['fail', 'APPLICATION_COMPILER_WORKSPACE_REFUSED']])
})

const withServerTree = (projectId, runId, resultRevision) => ({
  projectId, executionId: runId, sourceRevision: resultRevision, templateRef: 'x', recipeSha256: 'y',
  files: [{ path: 'conexus-server/manifest.json', mediaType: 'application/json', bytes: new Uint8Array(), sha256: 'a'.repeat(64) }],
})

test('a source-shape refusal from the application server settles with the runner\'s own code, as a build failure the agent can read', async () => {
  const runId = '44444444-4444-4444-8444-444444444447'
  const projectId = '55555555-5555-4555-8555-555555555556'
  const accountId = '66666666-6666-4666-8666-666666666666'
  const base = 'b'.repeat(40)
  const resultRevision = 'c'.repeat(40)
  const calls = []
  const run = { builderRunId: runId, projectId, state: 'QUEUED', baseSourceRevision: base, resultSourceRevision: null, resultKind: null, failureCode: null, conversationId: 'conv-1' }
  const store = {
    createBuilderRun: async () => run,
    claimBuilderRun: async () => ({ ...run, state: 'RUNNING' }),
    setBuilderRunPhase: async () => {},
    bindBuilderRunMessage: async () => {}, bindBuilderRunSandbox: async () => {}, readConversationSandbox: async () => null, recordConversationSandbox: async () => {},
    failBuilderRun: async (_id, code) => calls.push(['fail', code]), close: async () => {},
    advanceBuilderRunSource: async (_id, revision) => calls.push(['advance', revision]),
    settleBuilderRunBuild: async (input) => calls.push(['build-settle', input.failureCode ?? null]),
  }
  const service = createBuilderService({
    store,
    runs: makeRuns({
      execute: async () => ({
        projectId, executionId: runId, sandboxId: 'sandbox', baseSourceRevision: base, summary: 'alterado', kind: 'SOURCE_ADMITTED',
        resultSourceRevision: resultRevision,
        applicationBuild: { kind: 'BUILT', compiledApplication: withServerTree(projectId, runId, resultRevision) },
      }),
      appendDiagnostic: async (note) => calls.push(['note', note.code, note.outcome, note.detail]),
    }),
    applicationArtifacts: { retainApplication: async () => ({ artifactRevisionId: '77777777-0000-4000-8000-000000000000', artifactDigest: 'd'.repeat(64) }) },
    applicationServer: { prepare: async () => { throw new Failure('SERVER_TREE_REFUSED', { cause: 'SERVER_TREE_REFUSED' }) } },
  })
  await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'key', content: 'altere', conversationId: 'conv-build' })
  await service.close()
  assert.deepEqual(calls, [
    ['advance', resultRevision],
    ['build-settle', 'SERVER_TREE_REFUSED'],
    ['note', 'SERVER_TREE_REFUSED', 'BUILD_FAILED', 'SERVER_TREE_REFUSED'],
    ['fail', 'SERVER_TREE_REFUSED'],
  ])
})

test('a platform-side prepare fault settles as a platform failure, not a build failure, and still carries its reason', async () => {
  const runId = '44444444-4444-4444-8444-444444444448'
  const projectId = '55555555-5555-4555-8555-555555555557'
  const accountId = '66666666-6666-4666-8666-666666666666'
  const base = 'b'.repeat(40)
  const resultRevision = 'c'.repeat(40)
  const calls = []
  const run = { builderRunId: runId, projectId, state: 'QUEUED', baseSourceRevision: base, resultSourceRevision: null, resultKind: null, failureCode: null, conversationId: 'conv-2' }
  const store = {
    createBuilderRun: async () => run,
    claimBuilderRun: async () => ({ ...run, state: 'RUNNING' }),
    setBuilderRunPhase: async () => {},
    bindBuilderRunMessage: async () => {}, bindBuilderRunSandbox: async () => {}, readConversationSandbox: async () => null, recordConversationSandbox: async () => {},
    failBuilderRun: async (_id, code) => calls.push(['fail', code]), close: async () => {},
    advanceBuilderRunSource: async (_id, revision) => calls.push(['advance', revision]),
    settleBuilderRunBuild: async (input) => calls.push(['build-settle', input.failureCode ?? null]),
  }
  const service = createBuilderService({
    store,
    runs: makeRuns({
      execute: async () => ({
        projectId, executionId: runId, sandboxId: 'sandbox', baseSourceRevision: base, summary: 'alterado', kind: 'SOURCE_ADMITTED',
        resultSourceRevision: resultRevision,
        applicationBuild: { kind: 'BUILT', compiledApplication: withServerTree(projectId, runId, resultRevision) },
      }),
      appendDiagnostic: async (note) => calls.push(['note', note.code, note.outcome, note.detail]),
    }),
    applicationArtifacts: { retainApplication: async () => ({ artifactRevisionId: '77777777-0000-4000-8000-000000000000', artifactDigest: 'd'.repeat(64) }) },
    applicationServer: { prepare: async () => { throw new Failure('APPLICATION_SERVER_REFUSED', { cause: 'connect ECONNREFUSED 127.0.0.1:5432' }) } },
  })
  await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'key', content: 'altere', conversationId: 'conv-build' })
  await service.close()
  assert.deepEqual(calls, [
    ['advance', resultRevision],
    ['build-settle', 'APPLICATION_SERVER_REFUSED'],
    ['note', 'APPLICATION_SERVER_REFUSED', 'PLATFORM_FAILED', 'connect ECONNREFUSED 127.0.0.1:5432'],
    ['fail', 'APPLICATION_SERVER_REFUSED'],
  ])
})

test("a conversation that is not the Project's is refused before a run exists", async () => {
  const projectId = '22222222-2222-4222-8222-222222222222'
  const created = []
  const store = {
    createBuilderRun: async (input) => { created.push(input.conversationId); throw new Error('STOP_AFTER_CREATE') },
    close: async () => {},
  }
  const service = createBuilderService({ store, runs: makeRuns({ execute: async () => { throw new Error('not reached') } }), applicationArtifacts: {} })
  const attempt = (conversationId) => service.createBuilderRun({ accountId: '33333333-3333-4333-8333-333333333333', projectId, idempotencyKey: conversationId, content: 'altere', conversationId }).catch((error) => error.message)
  assert.deepEqual([await attempt('conv-plan'), await attempt('conv-build'), await attempt('conv-missing')], ['STOP_AFTER_CREATE', 'STOP_AFTER_CREATE', 'CONVERSATION_NOT_FOUND'])
  assert.deepEqual(created, ['conv-plan', 'conv-build'])
  await service.close()
})

test('a run publishes the state it parks in, and the state it ends in, before its session is closed', async () => {
  const projectId = '99999999-9999-4999-8999-999999999999'
  const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const drive = async (runId, result) => {
    const row = { builderRunId: runId, projectId, conversationId: 'conv-build', state: 'QUEUED', phase: null, baseSourceRevision: 'a'.repeat(40), resultSourceRevision: null, resultKind: null, failureCode: null }
    const events = []
    const store = {
      createBuilderRun: async () => ({ ...row }),
      claimBuilderRun: async () => Object.assign(row, { state: 'RUNNING' }),
      readBuilderRun: async () => ({ ...row }),
      setBuilderRunPhase: async (_id, phase) => { Object.assign(row, { phase }) },
      settleBuilderRun: async () => { Object.assign(row, { state: 'SETTLED', phase: null, resultKind: 'RESPONSE_ONLY' }) },
      failBuilderRun: async () => { Object.assign(row, { state: 'FAILED', phase: null }) },
      interruptBuilderRun: async () => { Object.assign(row, { state: 'INTERRUPTED', phase: null }) },
      bindBuilderRunMessage: async () => {}, bindBuilderRunSandbox: async () => {}, readConversationSandbox: async () => null, recordConversationSandbox: async () => {}, close: async () => {},
    }
    const service = createBuilderService({
      store,
      runs: makeRuns({
        publishRun: async (run) => { events.push(`publish:${run.state}:${run.phase}`) },
        discardParked: async () => { events.push('discard') },
        execute: async (input) => {
          input.holdSession(async () => { events.push('close-session') })
          return result(input)
        },
      }),
      applicationArtifacts: {},
    })
    await service.createBuilderRun({ accountId, projectId, idempotencyKey: `key-${runId}`, content: 'faça', conversationId: 'conv-build' })
    await service.close()
    return events
  }
  const parkedId = '88888888-8888-4888-8888-88888888888b'
  const parked = await drive(parkedId, () => ({ kind: 'PARKED', projectId, executionId: parkedId, baseSourceRevision: 'a'.repeat(40) }))
  assert.deepEqual(parked.filter((event) => event !== 'publish:RUNNING:PREPARING').slice(0, 2), ['publish:RUNNING:PARKED', 'close-session'])
  const endedId = '88888888-8888-4888-8888-88888888888c'
  const ended = await drive(endedId, () => ({ kind: 'RESPONSE_ONLY', projectId, executionId: endedId, baseSourceRevision: 'a'.repeat(40) }))
  assert.deepEqual(ended.slice(-2), ['publish:SETTLED:null', 'close-session'])
  assert.equal(ended.filter((event) => event === 'close-session').length, 1)
  const failedId = '88888888-8888-4888-8888-88888888888d'
  const failed = await drive(failedId, () => { throw new Failure('BUILDER_MODEL_STREAM_FAILED') })
  assert.deepEqual(failed.slice(failed.indexOf('publish:FAILED:null'), failed.indexOf('discard') + 1), ['publish:FAILED:null', 'close-session', 'discard'], 'a failed leg publishes FAILED, closes its session, then settles')
  assert.equal(failed.filter((event) => event === 'discard').length, 1)
  const cancelledId = '88888888-8888-4888-8888-88888888888e'
  const cancelled = await drive(cancelledId, () => { throw new Failure('BUILDER_RUN_CANCELLED') })
  assert.deepEqual(cancelled.slice(cancelled.indexOf('publish:INTERRUPTED:null'), cancelled.indexOf('discard') + 1), ['publish:INTERRUPTED:null', 'close-session', 'discard'], 'a cancelled leg publishes INTERRUPTED, closes its session, then settles')
  assert.equal(cancelled.filter((event) => event === 'discard').length, 1)
})

// A leg that fails, a store whose failBuilderRun throws `failures` times before it writes, and the
// lines the Hub logged. The store's lease takes the run over once no leg beats for it.
const settleHarness = async ({ failures }) => {
  const runId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const projectId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const lines = []
  const originalError = logger.error
  logger.error = (line) => lines.push(line)
  const written = []
  let refused = 0
  const run = { builderRunId: runId, projectId, conversationId: 'conv-build', state: 'QUEUED', baseSourceRevision: 'a'.repeat(40), resultSourceRevision: null, resultKind: null, failureCode: null }
  const store = {
    createBuilderRun: async () => run,
    claimBuilderRun: async () => ({ ...run, state: 'RUNNING' }),
    setBuilderRunPhase: async () => {},
    bindBuilderRunMessage: async () => {}, bindBuilderRunSandbox: async () => {}, readConversationSandbox: async () => null, recordConversationSandbox: async () => {},
    failBuilderRun: async (_id, code) => {
      if (refused < failures) { refused += 1; throw new Failure('BUILDER_RUN_FAILURE_REFUSED') }
      written.push(code)
    },
    heartbeatBuilderRuns: async (_owner, ids) => { beating = ids.includes(runId) },
    expireParkedBuilderRuns: async () => [],
    takeOverStaleBuilderRuns: async (owner) => (beating || written.length > 0 ? [] : [{ builderRunId: runId, projectId, conversationId: 'conv-build', started: true, candidateRevision: null, resultSourceRevision: null, previousOwnerId: owner }]),
    close: async () => {},
  }
  let beating = true
  const service = createBuilderService({
    store,
    runs: { ...makeRuns({ execute: async () => { throw new Failure('BUILDER_MODEL_INCOMPLETE') } }), settleRetryMs: 1 },
    applicationArtifacts: {},
  })
  await service.createBuilderRun({ accountId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', projectId, idempotencyKey: 'k', content: 'construa', conversationId: 'conv-build' })
  const until = async (done) => { for (let i = 0; i < 400 && !done(); i++) await new Promise((wake) => { setTimeout(wake, 5) }) }
  // A beat lasts until the next pass: what no leg refreshes goes stale.
  return { service, written, lines, projectId, runId, until, quiet: () => { beating = false }, restore: () => { logger.error = originalError } }
}

test('a failed run whose settle write fails once ends settled after the retry, with nothing logged', async () => {
  const h = await settleHarness({ failures: 1 })
  await h.until(() => h.written.length > 0)
  await h.service.close()
  h.restore()
  assert.deepEqual(h.written, ['BUILDER_MODEL_INCOMPLETE'])
  assert.deepEqual(h.lines, [])
})

test('a settle write that keeps failing is logged with a code, and once the leg stops beating a sweep settles the row', async () => {
  const h = await settleHarness({ failures: 3 })
  await h.until(() => h.lines.length > 0)
  for (let pass = 0; pass < 100 && h.written.length === 0; pass++) {
    h.quiet()
    await h.service.heartbeat()
    await h.service.sweep()
    await new Promise((wake) => { setTimeout(wake, 5) })
  }
  await h.service.close()
  h.restore()
  assert.deepEqual(h.lines, [`BUILDER_RUN_SETTLE_FAILED:${h.runId}:BUILDER_RUN_FAILURE_REFUSED`])
  assert.deepEqual(h.written, ['BUILDER_RUN_SETTLE_LOST'])
})

test('near the heap limit a new run is refused before any row exists and the warm parked sessions are let go; at the limit the run starts', async (t) => {
  const projectId = '22222222-2222-4222-8222-222222222222'
  const queued = { builderRunId: '11111111-1111-4111-8111-111111111111', projectId, conversationId: 'conv-heap', state: 'QUEUED', phase: null, baseSourceRevision: 'a'.repeat(40), resultSourceRevision: null, resultKind: null, failureCode: null }
  const rows = []
  const evictions = []
  const warnings = []
  t.mock.method(logger, 'warn', (line) => { warnings.push(line) })
  let ratio = 0.86
  const runs = makeRuns({ execute: async () => ({ projectId, executionId: queued.builderRunId, sandboxId: 'vm', baseSourceRevision: queued.baseSourceRevision, summary: '', kind: 'RESPONSE_ONLY' }) })
  const service = createBuilderService({
    store: {
      createBuilderRun: async () => { rows.push('row'); return queued },
      claimBuilderRun: async () => ({ ...queued, state: 'RUNNING', phase: 'PREPARING' }),
      setBuilderRunPhase: async () => {},
      readConversationSandbox: async () => null,
      bindBuilderRunMessage: async () => {},
      settleBuilderRun: async () => {},
      readBuilderRun: async () => null,
      close: async () => {},
    },
    runs: { ...runs, runtime: { ...runs.runtime, evictParked: async () => { evictions.push('evict'); return 2 } }, heapUsedRatio: () => ratio },
    applicationArtifacts: {},
  })
  const ask = () => service.createBuilderRun({ accountId: '33333333-3333-4333-8333-333333333333', projectId, idempotencyKey: 'key', content: 'Faça um app', conversationId: 'conv-heap' })
  await assert.rejects(ask(), { message: 'BUILDER_CAPACITY_FULL' })
  assert.deepEqual({ rows, evictions, warnings }, { rows: [], evictions: ['evict'], warnings: ['BUILDER_RUN_REFUSED_HEAP:0.860'] })
  ratio = 0.85
  assert.equal((await ask()).state, 'QUEUED')
  await service.close()
  assert.deepEqual({ rows, evictions }, { rows: ['row'], evictions: ['evict'] }, 'at the threshold the run is created and nothing more is let go')
})
