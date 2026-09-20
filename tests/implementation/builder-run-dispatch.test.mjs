import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const output = mkdtempSync(resolve(root, 'apps/hub/builder-run-dispatch-build-'))
const compiled = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'), '--project', resolve(root, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', output], { cwd: root, encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(compiled.stdout || compiled.stderr)
test.after(() => rmSync(output, { recursive: true, force: true }))
const { createBuilderService } = await import(pathToFileURL(resolve(output, 'builder/service.js')).href)
const { projectBuilderRun } = await import(pathToFileURL(resolve(output, 'builder/failure-vocabulary.js')).href)

// One offer, the shape the connection custody module hands over: a model the account can pay for
// in this Project, named with the connection's own provider id.
const offer = {
  choiceId: 'anthropic/claude-opus-4-5', label: 'claude-opus-4-5',
  providerId: 'anthropic', modelId: 'claude-opus-4-5',
  connectionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', connectionLabel: 'Meu Claude',
  credentialKind: 'OAUTH_TOKEN_SET',
}
const listModelOffers = async () => [offer]
const admitted = {
  modelAdmissionId: 'anthropic-claude-opus-4-5', modelProviderId: 'anthropic', modelId: 'claude-opus-4-5',
  modelConnectionId: offer.connectionId, modelCredentialGeneration: '1',
}

test('BuilderRun message dispatch claims, executes and settles without Change pipeline', async () => {
  const runId = '11111111-1111-4111-8111-111111111111'
  const projectId = '22222222-2222-4222-8222-222222222222'
  const accountId = '33333333-3333-4333-8333-333333333333'
  const sourceRevision = 'a'.repeat(40)
  const calls = []
  const store = {
    createBuilderRun: async () => ({ builderRunId: runId, projectId, state: 'QUEUED', phase: null, mode: 'PLAN', baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null, ...admitted }),
    claimBuilderRun: async () => { calls.push('claim'); return { builderRunId: runId, projectId, state: 'RUNNING', phase: 'PREPARING', mode: 'PLAN', baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null, ...admitted } },
    setBuilderRunPhase: async (_id, phase) => calls.push(['phase', phase]),
    bindBuilderRunMessage: async (_id, messageId) => calls.push(['message', messageId]),
    bindBuilderRunSandbox: async (_id, sandboxId) => calls.push(['sandbox', sandboxId]),
    settleBuilderRun: async (input) => calls.push(['settle', input.resultKind]),
    failBuilderRun: async () => calls.push('fail'),
    close: async () => {},
  }
  const service = createBuilderService({
    store,
    source: {
      prepareSource: async () => { throw new Error('ordinary C-020 must not use legacy prepareSource') },
      admitCandidate: async () => { throw new Error('ordinary C-020 must not use legacy admitCandidate') },
      prepareProjectSource: async input => { calls.push(['prepareProjectSource', input.executionId]); return new Uint8Array([1]) },
      admitSourceResult: async () => { throw new Error('must not admit source for PLAN response') },
    },
    runtime: {
      kind: 'REMOTE_E2B',
      execute: async (input) => {
        calls.push(['execute', input.mode, input.intent])
        await input.bindPhysicalSandbox('physical-sandbox')
        await input.bindMessage('mastra-message')
        return { projectId, executionId: runId, sandboxId: 'physical-sandbox', baseSourceRevision: sourceRevision, summary: 'Resposta', kind: 'RESPONSE_ONLY' }
      },
    },
    applicationArtifacts: {}, listModelOffers,
  })
  const result = await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'key', content: 'Explique o app', mode: 'PLAN' })
  await service.close()
  assert.equal(result.builderRunId, runId)
  assert.deepEqual(calls, ['claim', ['phase', 'PREPARING'], ['prepareProjectSource', runId], ['execute', 'PLAN', 'Explique o app'], ['sandbox', 'physical-sandbox'], ['message', 'mastra-message'], ['phase', 'FINALIZING'], ['settle', 'RESPONSE_ONLY']])
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
    builderRunId: runId, projectId, state, phase: null, mode: 'BUILD', baseSourceRevision: sourceRevision,
    resultSourceRevision: null, resultKind: null, failureCode, requestText: stored, createdAt, ...admitted,
  })
  const store = {
    createBuilderRun: async (input) => { stored = input.content; return row('QUEUED', null) },
    claimBuilderRun: async () => row('RUNNING', null),
    setBuilderRunPhase: async () => {},
    failBuilderRun: async (_id, code) => { failed = code },
    close: async () => {},
  }
  const service = createBuilderService({
    store,
    source: { prepareProjectSource: async () => { throw new Error('BUILDER_SOURCE_MATERIALIZATION_REFUSED') } },
    runtime: { kind: 'REMOTE_E2B', execute: async () => { throw new Error('the agent must never start') } },
    applicationArtifacts: {}, listModelOffers,
  })
  const accepted = await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'preagent', content: 'Crie um contador', mode: 'BUILD' })
  await service.close()
  assert.equal(stored, 'Crie um contador')
  assert.equal(accepted.requestText, 'Crie um contador')
  assert.equal(failed, 'BUILDER_SOURCE_MATERIALIZATION_REFUSED')
  assert.deepEqual(projectBuilderRun(row('FAILED', failed)), {
    builderRunId: runId, projectId, state: 'FAILED', phase: null, mode: 'BUILD', baseSourceRevision: sourceRevision,
    resultSourceRevision: null, resultKind: null, failureCode: 'BUILDER_SOURCE_MATERIALIZATION_REFUSED',
    failureCategory: 'ENVIRONMENT_PREPARATION_FAILED', requestText: 'Crie um contador', createdAt, ...admitted,
  })
})

test('BuilderRun cancellation records intent, aborts native work, and interrupts once', async () => {
  const runId = '88888888-8888-4888-8888-888888888888'
  const projectId = '99999999-9999-4999-8999-999999999999'
  const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const sourceRevision = 'a'.repeat(40)
  const calls = []
  let started
  const startedPromise = new Promise((resolve) => { started = resolve })
  const run = { builderRunId: runId, projectId, state: 'QUEUED', mode: 'BUILD', baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null, ...admitted }
  const store = {
    createBuilderRun: async () => run,
    claimBuilderRun: async () => ({ ...run, state: 'RUNNING' }),
    requestBuilderRunCancellation: async () => { calls.push('request-cancellation'); return { ...run, state: 'RUNNING', cancellationRequested: true } },
    interruptBuilderRun: async (_id, reason) => calls.push(['interrupt', reason]),
    bindBuilderRunMessage: async () => {}, bindBuilderRunSandbox: async () => {}, failBuilderRun: async () => calls.push('fail'), close: async () => {},
  }
  const service = createBuilderService({
    store,
    source: { prepareProjectSource: async () => new Uint8Array([1]), admitSourceResult: async () => { throw new Error('not reached') } },
    runtime: {
      kind: 'REMOTE_E2B',
      execute: async (input) => {
        started()
        await new Promise((_resolve, reject) => {
          if (input.signal?.aborted) return reject(new Error('BUILDER_RUN_CANCELLED'))
          input.signal?.addEventListener('abort', () => reject(new Error('BUILDER_RUN_CANCELLED')), { once: true })
        })
        throw new Error('BUILDER_RUN_CANCELLED')
      },
    },
    applicationArtifacts: {}, listModelOffers,
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
  const calls = []
  let started
  const startedPromise = new Promise((resolve) => { started = resolve })
  const run = { builderRunId: runId, projectId, state: 'QUEUED', mode: 'BUILD', baseSourceRevision: 'a'.repeat(40), resultSourceRevision: null, resultKind: null, failureCode: null, ...admitted }
  const service = createBuilderService({
    store: {
      createBuilderRun: async () => run,
      claimBuilderRun: async () => ({ ...run, state: 'RUNNING' }),
      setBuilderRunPhase: async () => {},
      requestBuilderRunCancellation: async () => ({ ...run, state: 'RUNNING', cancellationRequested: true }),
      interruptBuilderRun: async (_id, reason) => calls.push(['interrupt', reason]),
      bindBuilderRunMessage: async () => {}, bindBuilderRunSandbox: async () => {}, failBuilderRun: async (_id, code) => calls.push(['fail', code]), close: async () => {},
    },
    source: { prepareProjectSource: async () => new Uint8Array([1]), admitSourceResult: async () => { throw new Error('not reached') } },
    runtime: {
      kind: 'REMOTE_E2B',
      execute: async (input) => {
        started()
        await new Promise((resolve) => input.signal?.addEventListener('abort', resolve, { once: true }))
        throw new Error('BUILDER_RUN_PHASE_UPDATE_REFUSED')
      },
    },
    applicationArtifacts: {}, listModelOffers,
  })
  await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'cancel-mid-phase', content: 'pare', mode: 'BUILD' })
  await startedPromise
  await service.cancelBuilderRun({ accountId, projectId, builderRunId: runId })
  await service.close()
  assert.deepEqual(calls, [['interrupt', 'USER_CANCELLED']])
})

test('BUILD source result is admitted, CASed, compiled, settles Preview and persists every phase in order', async () => {
  const runId = '44444444-4444-4444-8444-444444444444'
  const projectId = '55555555-5555-4555-8555-555555555555'
  const accountId = '66666666-6666-4666-8666-666666666666'
  const base = 'b'.repeat(40)
  const resultRevision = 'c'.repeat(40)
  const calls = []
  const run = { builderRunId: runId, projectId, state: 'QUEUED', mode: 'BUILD', baseSourceRevision: base, resultSourceRevision: null, resultKind: null, failureCode: null, ...admitted }
  const store = {
    createBuilderRun: async () => run,
    claimBuilderRun: async () => ({ ...run, state: 'RUNNING' }),
    setBuilderRunPhase: async (_id, phase) => calls.push(['phase', phase]),
    bindBuilderRunMessage: async () => {}, bindBuilderRunSandbox: async () => {}, failBuilderRun: async () => calls.push('fail'), close: async () => {},
    advanceBuilderRunSource: async (_id, revision) => calls.push(['advance', revision]),
    settleBuilderRunBuild: async input => calls.push(['build-settle', input.artifactRevisionId, input.artifactDigest]),
  }
  const service = createBuilderService({
    store,
    source: {
      prepareSource: async () => { throw new Error('ordinary C-020 must not use legacy prepareSource') },
      admitCandidate: async () => { throw new Error('ordinary C-020 must not use legacy admitCandidate') },
      prepareProjectSource: async input => { calls.push(['prepareProjectSource', input.executionId]); return new Uint8Array([1]) },
      admitSourceResult: async input => { calls.push(['admitSourceResult', input.executionId]); return { baseSourceRevision: base, resultSourceRevision: resultRevision, patch: 'diff' } },
      listSourceTree: async () => ({ sourceRevision: resultRevision, entries: [{ kind: 'FILE', path: 'app/index.html' }] }),
      readSourceFiles: async input => ({ sourceRevision: input.sourceRevision, files: input.paths.map(path => ({ path, content: '<html></html>' })) }),
    },
    runtime: {
      kind: 'REMOTE_E2B',
      // The sandbox that runs the agent now also compiles, so the runtime owns that phase.
      execute: async (input) => {
        await input.setPhase?.('COMPILING')
        return {
          projectId, executionId: runId, sandboxId: 'sandbox', baseSourceRevision: base, summary: 'alterado', kind: 'CANDIDATE',
          resultSourceRevision: resultRevision, resultBundle: new Uint8Array([1]),
          compiledApplication: { projectId, executionId: runId, sourceRevision: resultRevision, templateRef: 'x', recipeSha256: 'y', files: [] },
        }
      },
    },
    applicationArtifacts: { retainApplication: async (input) => { calls.push(['retain', input.compiled]); return { artifactRevisionId: '77777777-7777-4777-8777-777777777777', artifactDigest: 'd'.repeat(64) } } },
    listModelOffers,
  })
  await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'key', content: 'altere', mode: 'BUILD' })
  await service.close()
  assert.deepEqual(calls, [
    ['phase', 'PREPARING'], ['prepareProjectSource', runId], ['phase', 'COMPILING'],
    ['phase', 'SOURCE_ADMISSION'], ['admitSourceResult', runId], ['advance', resultRevision],
    ['retain', { projectId, executionId: runId, sourceRevision: resultRevision, templateRef: 'x', recipeSha256: 'y', files: [] }],
    ['phase', 'FINALIZING'],
    ['build-settle', '77777777-7777-4777-8777-777777777777', 'd'.repeat(64)],
  ])
})

