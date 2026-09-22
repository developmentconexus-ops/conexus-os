import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { createBuilderService } = await import(hubModuleUrl('builder/service.js'))
const { projectBuilderRun } = await import(hubModuleUrl('builder/failure-vocabulary.js'))

// A minimal FactoryRunDependencies fixture: every run is bound and dispatched through
// factory.runtime.execute, so each test only overrides the pieces it exercises.
const makeBinding = (projectId) => Object.freeze({
  projectId, factoryProjectId: 'factory-project', projectRepositoryId: 'project-repository', repositoryId: 'repository-row',
  boundAt: '2026-09-21T12:00:00.000Z',
})

const makeFactory = ({ binding, execute, appendDiagnostic }) => ({
  runtime: { execute },
  readBindingForRun: async () => binding,
  readSourceHead: async () => 'a'.repeat(40),
  readConversationRepository: async () => binding.projectRepositoryId,
  appendDiagnostic: appendDiagnostic ?? (async () => {}),
  recoverAdmissions: async () => [],
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
  const binding = makeBinding(projectId)
  const calls = []
  const store = {
    createBuilderRun: async () => ({ builderRunId: runId, projectId, state: 'QUEUED', phase: null, mode: 'PLAN', baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null }),
    readFactoryBinding: async () => binding,
    claimBuilderRun: async () => { calls.push('claim'); return { builderRunId: runId, projectId, state: 'RUNNING', phase: 'PREPARING', mode: 'PLAN', baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null } },
    setBuilderRunPhase: async (_id, phase) => calls.push(['phase', phase]),
    bindBuilderRunMessage: async (_id, messageId) => calls.push(['message', messageId]),
    bindBuilderRunSandbox: async (_id, sandboxId) => calls.push(['sandbox', sandboxId]),
    settleBuilderRun: async (input) => calls.push(['settle', input.resultKind]),
    failBuilderRun: async () => calls.push('fail'),
    close: async () => {},
  }
  const service = createBuilderService({
    store,
    factory: makeFactory({
      binding,
      execute: async (input) => {
        calls.push(['execute', input.mode, input.intent])
        await input.bindPhysicalSandbox('physical-sandbox')
        await input.bindMessage('mastra-message')
        return { projectId, executionId: runId, sandboxId: 'physical-sandbox', baseSourceRevision: sourceRevision, summary: 'Resposta', kind: 'RESPONSE_ONLY' }
      },
    }),
    applicationArtifacts: {},
  })
  const result = await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'key', content: 'Explique o app', mode: 'PLAN' })
  await service.close()
  assert.equal(result.builderRunId, runId)
  assert.deepEqual(calls, ['claim', ['phase', 'PREPARING'], ['execute', 'PLAN', 'Explique o app'], ['sandbox', 'physical-sandbox'], ['message', 'mastra-message'], ['phase', 'FINALIZING'], ['settle', 'RESPONSE_ONLY']])
})

test('createBuilderRun refuses an unbound Project before a run is created or dispatched', async () => {
  const projectId = '22222222-2222-4222-8222-222222222222'
  const accountId = '33333333-3333-4333-8333-333333333333'
  const store = {
    createBuilderRun: async () => { throw new Error('must not create a run for an unbound Project') },
    readFactoryBinding: async () => null,
    claimBuilderRun: async () => { throw new Error('must not claim') },
    close: async () => {},
  }
  const service = createBuilderService({
    store,
    factory: makeFactory({
      binding: makeBinding(projectId),
      execute: async () => { throw new Error('must not execute') },
    }),
    applicationArtifacts: {},
  })
  await assert.rejects(
    service.createBuilderRun({ accountId, projectId, idempotencyKey: 'key', content: 'Explique o app', mode: 'PLAN' }),
    /^Error: BUILDER_FACTORY_PROJECT_UNBOUND$/,
  )
  await service.close()
})

test('a run whose binding disappeared between create and claim fails outright with BUILDER_FACTORY_PROJECT_UNBOUND', async () => {
  const runId = '11111111-1111-4111-8111-111111111113'
  const projectId = '22222222-2222-4222-8222-222222222222'
  const accountId = '33333333-3333-4333-8333-333333333333'
  const sourceRevision = 'a'.repeat(40)
  const binding = makeBinding(projectId)
  const run = { builderRunId: runId, projectId, state: 'QUEUED', phase: null, mode: 'PLAN', baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null }
  const calls = []
  const store = {
    createBuilderRun: async () => run,
    // create-time binding lookup still finds the Project bound; the claim-time lookup below is
    // the one that comes back null, as if the binding were removed while the run sat queued.
    readFactoryBinding: async () => binding,
    claimBuilderRun: async () => { calls.push('claim'); return { ...run, state: 'RUNNING' } },
    failBuilderRun: async (_id, code) => calls.push(['fail', code]),
    close: async () => {},
  }
  const factory = {
    runtime: { execute: async () => { throw new Error('must not execute once claim finds no binding') } },
    readBindingForRun: async () => null,
    readSourceHead: async () => sourceRevision,
    readConversationRepository: async () => binding.projectRepositoryId,
    appendDiagnostic: async () => {},
    recoverAdmissions: async () => [],
  }
  const service = createBuilderService({ store, factory, applicationArtifacts: {} })
  await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'key', content: 'Explique o app', mode: 'PLAN' })
  await service.close()
  assert.deepEqual(calls, ['claim', ['fail', 'BUILDER_FACTORY_PROJECT_UNBOUND']])
})

test('a failure before the agent keeps the operator request on the run and names a public category', async () => {
  const runId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const projectId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccd'
  const accountId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  const sourceRevision = 'a'.repeat(40)
  const binding = makeBinding(projectId)
  const createdAt = '2026-09-20T12:00:00.000Z'
  let stored = null
  let failed = null
  const row = (state, failureCode) => ({
    builderRunId: runId, projectId, state, phase: null, mode: 'BUILD', baseSourceRevision: sourceRevision,
    resultSourceRevision: null, resultKind: null, failureCode, requestText: stored, createdAt,
  })
  const store = {
    createBuilderRun: async (input) => { stored = input.content; return row('QUEUED', null) },
    readFactoryBinding: async () => binding,
    claimBuilderRun: async () => row('RUNNING', null),
    setBuilderRunPhase: async () => {},
    failBuilderRun: async (_id, code) => { failed = code },
    close: async () => {},
  }
  const service = createBuilderService({
    store,
    factory: makeFactory({
      binding,
      // Materializing the base revision on the Factory's mirror still fails before the agent
      // is ever opened, the same shape the local pipeline's pre-agent failure once took.
      execute: async () => { throw new Error('BUILDER_SOURCE_MATERIALIZATION_REFUSED') },
    }),
    applicationArtifacts: {},
  })
  const accepted = await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'preagent', content: 'Crie um contador', mode: 'BUILD' })
  await service.close()
  assert.equal(stored, 'Crie um contador')
  assert.equal(accepted.requestText, 'Crie um contador')
  assert.equal(failed, 'BUILDER_SOURCE_MATERIALIZATION_REFUSED')
  assert.deepEqual(projectBuilderRun(row('FAILED', failed)), {
    builderRunId: runId, projectId, state: 'FAILED', phase: null, mode: 'BUILD', baseSourceRevision: sourceRevision,
    resultSourceRevision: null, resultKind: null, failureCode: 'BUILDER_SOURCE_MATERIALIZATION_REFUSED',
    failureCategory: 'ENVIRONMENT_PREPARATION_FAILED', requestText: 'Crie um contador', createdAt,
  })
})

test('BuilderRun cancellation records intent, aborts native work, and interrupts once', async () => {
  const runId = '88888888-8888-4888-8888-888888888888'
  const projectId = '99999999-9999-4999-8999-999999999999'
  const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const sourceRevision = 'a'.repeat(40)
  const binding = makeBinding(projectId)
  const calls = []
  let started
  const startedPromise = new Promise((resolve) => { started = resolve })
  const run = { builderRunId: runId, projectId, state: 'QUEUED', mode: 'BUILD', baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null }
  const store = {
    createBuilderRun: async () => run,
    readFactoryBinding: async () => binding,
    claimBuilderRun: async () => ({ ...run, state: 'RUNNING' }),
    requestBuilderRunCancellation: async () => { calls.push('request-cancellation'); return { ...run, state: 'RUNNING', cancellationRequested: true } },
    interruptBuilderRun: async (_id, reason) => calls.push(['interrupt', reason]),
    setBuilderRunPhase: async () => {},
    bindBuilderRunMessage: async () => {}, bindBuilderRunSandbox: async () => {}, failBuilderRun: async () => calls.push('fail'), close: async () => {},
  }
  const service = createBuilderService({
    store,
    factory: makeFactory({
      binding,
      execute: async (input) => {
        started()
        await new Promise((_resolve, reject) => {
          if (input.signal?.aborted) return reject(new Error('BUILDER_RUN_CANCELLED'))
          input.signal?.addEventListener('abort', () => reject(new Error('BUILDER_RUN_CANCELLED')), { once: true })
        })
        throw new Error('BUILDER_RUN_CANCELLED')
      },
    }),
    applicationArtifacts: {},
  })
  await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'cancel-key', content: 'pare', mode: 'BUILD' })
  await startedPromise
  await service.cancelBuilderRun({ accountId, projectId, builderRunId: runId })
  await service.close()
  assert.equal(calls[0], 'request-cancellation')
  assert.deepEqual(calls.at(-1), ['interrupt', 'USER_CANCELLED'])
})

test('a run cancelled mid phase change is interrupted, not failed, whatever error the abort surfaces', async () => {
  const runId = '88888888-8888-4888-8888-888888888889'
  const projectId = '99999999-9999-4999-8999-999999999999'
  const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const binding = makeBinding(projectId)
  const calls = []
  let started
  const startedPromise = new Promise((resolve) => { started = resolve })
  const run = { builderRunId: runId, projectId, state: 'QUEUED', mode: 'BUILD', baseSourceRevision: 'a'.repeat(40), resultSourceRevision: null, resultKind: null, failureCode: null }
  const service = createBuilderService({
    store: {
      createBuilderRun: async () => run,
      readFactoryBinding: async () => binding,
      claimBuilderRun: async () => ({ ...run, state: 'RUNNING' }),
      setBuilderRunPhase: async () => {},
      requestBuilderRunCancellation: async () => ({ ...run, state: 'RUNNING', cancellationRequested: true }),
      interruptBuilderRun: async (_id, reason) => calls.push(['interrupt', reason]),
      bindBuilderRunMessage: async () => {}, bindBuilderRunSandbox: async () => {}, failBuilderRun: async (_id, code) => calls.push(['fail', code]), close: async () => {},
    },
    factory: makeFactory({
      binding,
      execute: async (input) => {
        started()
        await new Promise((resolve) => input.signal?.addEventListener('abort', resolve, { once: true }))
        throw new Error('BUILDER_RUN_PHASE_UPDATE_REFUSED')
      },
    }),
    applicationArtifacts: {},
  })
  await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'cancel-mid-phase', content: 'pare', mode: 'BUILD' })
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
  const binding = makeBinding(projectId)
  const calls = []
  const run = { builderRunId: runId, projectId, state: 'QUEUED', mode: 'BUILD', baseSourceRevision: base, resultSourceRevision: null, resultKind: null, failureCode: null }
  const store = {
    createBuilderRun: async () => run,
    readFactoryBinding: async () => binding,
    claimBuilderRun: async () => ({ ...run, state: 'RUNNING' }),
    setBuilderRunPhase: async (_id, phase) => calls.push(['phase', phase]),
    bindBuilderRunMessage: async () => {}, bindBuilderRunSandbox: async () => {}, failBuilderRun: async () => calls.push('fail'), close: async () => {},
    advanceBuilderRunSource: async (_id, revision) => calls.push(['advance', revision]),
    settleBuilderRunBuild: async input => calls.push(['build-settle', input.artifactRevisionId, input.artifactDigest]),
  }
  const service = createBuilderService({
    store,
    factory: makeFactory({
      binding,
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
  await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'key', content: 'altere', mode: 'BUILD' })
  await service.close()
  assert.deepEqual(calls, [
    ['phase', 'PREPARING'], ['phase', 'COMPILING'],
    ['advance', resultRevision],
    ['retain', { projectId, executionId: runId, sourceRevision: resultRevision, templateRef: 'x', recipeSha256: 'y', files: [] }],
    ['phase', 'FINALIZING'],
    ['build-settle', '77777777-7777-4777-8777-777777777777', 'd'.repeat(64)],
  ])
})

test('a build or smoke failure still admits and advances the source, and settles SOURCE_CHANGED_BUILD_FAILED', async () => {
  const runId = '44444444-4444-4444-8444-444444444445'
  const projectId = '55555555-5555-4555-8555-555555555555'
  const accountId = '66666666-6666-4666-8666-666666666666'
  const base = 'b'.repeat(40)
  const resultRevision = 'c'.repeat(40)
  const binding = makeBinding(projectId)
  const calls = []
  const run = { builderRunId: runId, projectId, state: 'QUEUED', mode: 'BUILD', baseSourceRevision: base, resultSourceRevision: null, resultKind: null, failureCode: null }
  const store = {
    createBuilderRun: async () => run,
    readFactoryBinding: async () => binding,
    claimBuilderRun: async () => ({ ...run, state: 'RUNNING' }),
    setBuilderRunPhase: async (_id, phase) => calls.push(['phase', phase]),
    bindBuilderRunMessage: async () => {}, bindBuilderRunSandbox: async () => {}, failBuilderRun: async (_id, code) => calls.push(['fail', code]), close: async () => {},
    advanceBuilderRunSource: async (_id, revision) => calls.push(['advance', revision]),
    settleBuilderRunBuild: async (input) => calls.push(['build-settle', input.failureCode ?? null]),
  }
  // retainApplication must never be reached: there is no compiled application to retain when the
  // sandbox reports a build or smoke failure, only the code that names it.
  const service = createBuilderService({
    store,
    factory: makeFactory({
      binding,
      execute: async (input) => {
        await input.setPhase('COMPILING')
        return {
          projectId, executionId: runId, sandboxId: 'sandbox', baseSourceRevision: base, summary: 'alterado', kind: 'SOURCE_ADMITTED',
          resultSourceRevision: resultRevision,
          applicationBuild: { kind: 'BUILD_FAILED', code: 'APPLICATION_SMOKE_NO_ROOT_CHILD' },
        }
      },
    }),
    applicationArtifacts: { retainApplication: async () => { throw new Error('must not retain a build-failed compile') } },
  })
  await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'key', content: 'altere', mode: 'BUILD' })
  await service.close()
  assert.deepEqual(calls, [
    ['phase', 'PREPARING'], ['phase', 'COMPILING'],
    ['advance', resultRevision],
    ['phase', 'FINALIZING'],
    ['build-settle', 'APPLICATION_SMOKE_NO_ROOT_CHILD'],
  ])
})

test('a runtime failure that is not a build or smoke failure still fails the run outright', async () => {
  const runId = '44444444-4444-4444-8444-444444444446'
  const projectId = '55555555-5555-4555-8555-555555555555'
  const accountId = '66666666-6666-4666-8666-666666666666'
  const base = 'b'.repeat(40)
  const binding = makeBinding(projectId)
  const calls = []
  const run = { builderRunId: runId, projectId, state: 'QUEUED', mode: 'BUILD', baseSourceRevision: base, resultSourceRevision: null, resultKind: null, failureCode: null }
  const store = {
    createBuilderRun: async () => run,
    readFactoryBinding: async () => binding,
    claimBuilderRun: async () => ({ ...run, state: 'RUNNING' }),
    setBuilderRunPhase: async () => {},
    bindBuilderRunMessage: async () => {}, bindBuilderRunSandbox: async () => {},
    failBuilderRun: async (_id, code) => calls.push(['fail', code]),
    close: async () => {},
    advanceBuilderRunSource: async () => { throw new Error('must not admit: the runtime never returned a result') },
    settleBuilderRunBuild: async () => { throw new Error('must not settle a build: the runtime never returned a result') },
  }
  const service = createBuilderService({
    store,
    factory: makeFactory({
      binding,
      execute: async () => { throw new Error('APPLICATION_COMPILER_WORKSPACE_REFUSED') },
    }),
    applicationArtifacts: {},
  })
  await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'key', content: 'altere', mode: 'BUILD' })
  await service.close()
  assert.deepEqual(calls, [['fail', 'APPLICATION_COMPILER_WORKSPACE_REFUSED']])
})
