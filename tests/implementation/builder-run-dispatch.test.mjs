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

test('BuilderRun message dispatch claims, executes and settles without Change pipeline', async () => {
  const runId = '11111111-1111-4111-8111-111111111111'
  const projectId = '22222222-2222-4222-8222-222222222222'
  const accountId = '33333333-3333-4333-8333-333333333333'
  const sourceRevision = 'a'.repeat(40)
  const calls = []
  const store = {
    createBuilderRun: async () => ({ builderRunId: runId, projectId, state: 'QUEUED', phase: null, mode: 'PLAN', baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null }),
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
    source: {
      prepareSource: async () => { throw new Error('ordinary C-020 must not use legacy prepareSource') },
      admitCandidate: async () => { throw new Error('ordinary C-020 must not use legacy admitCandidate') },
      prepareProjectSource: async input => { calls.push(['prepareProjectSource', input.executionId]); return new Uint8Array([1]) },
      admitSourceResult: async () => { throw new Error('must not admit source for PLAN response') },
    },
    runtime: {
      kind: 'REMOTE_E2B', modelIdentity: { admissionId: 'admission', providerId: 'provider', modelId: 'model' },
      execute: async (input) => {
        calls.push(['execute', input.mode, input.intent])
        await input.bindPhysicalSandbox('physical-sandbox')
        await input.bindMessage('mastra-message')
        return { projectId, executionId: runId, sandboxId: 'physical-sandbox', baseSourceRevision: sourceRevision, summary: 'Resposta', kind: 'RESPONSE_ONLY' }
      },
    },
    compiler: {}, applicationArtifacts: {},
  })
  const result = await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'key', content: 'Explique o app', mode: 'PLAN' })
  await service.close()
  assert.equal(result.builderRunId, runId)
  assert.deepEqual(calls, ['claim', ['phase', 'PREPARING'], ['prepareProjectSource', runId], ['execute', 'PLAN', 'Explique o app'], ['sandbox', 'physical-sandbox'], ['message', 'mastra-message'], ['phase', 'FINALIZING'], ['settle', 'RESPONSE_ONLY']])
})

test('BuilderRun cancellation records intent, aborts native work, and interrupts once', async () => {
  const runId = '88888888-8888-4888-8888-888888888888'
  const projectId = '99999999-9999-4999-8999-999999999999'
  const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const sourceRevision = 'a'.repeat(40)
  const calls = []
  let started
  const startedPromise = new Promise((resolve) => { started = resolve })
  const run = { builderRunId: runId, projectId, state: 'QUEUED', mode: 'BUILD', baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null }
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
      kind: 'REMOTE_E2B', modelIdentity: { admissionId: 'admission', providerId: 'provider', modelId: 'model' },
      execute: async (input) => {
        started()
        await new Promise((_resolve, reject) => {
          if (input.signal?.aborted) return reject(new Error('BUILDER_RUN_CANCELLED'))
          input.signal?.addEventListener('abort', () => reject(new Error('BUILDER_RUN_CANCELLED')), { once: true })
        })
        throw new Error('BUILDER_RUN_CANCELLED')
      },
    },
    compiler: {}, applicationArtifacts: {},
  })
  await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'cancel-key', content: 'pare', mode: 'BUILD' })
  await startedPromise
  await service.cancelBuilderRun({ accountId, projectId, builderRunId: runId })
  await service.close()
  assert.equal(calls[0], 'request-cancellation')
  assert.deepEqual(calls.at(-1), ['interrupt', 'USER_CANCELLED'])
})

test('BUILD source result is admitted, CASed, compiled and settles Preview', async () => {
  const runId = '44444444-4444-4444-8444-444444444444'
  const projectId = '55555555-5555-4555-8555-555555555555'
  const accountId = '66666666-6666-4666-8666-666666666666'
  const base = 'b'.repeat(40)
  const resultRevision = 'c'.repeat(40)
  const calls = []
  const run = { builderRunId: runId, projectId, state: 'QUEUED', mode: 'BUILD', baseSourceRevision: base, resultSourceRevision: null, resultKind: null, failureCode: null }
  const store = {
    createBuilderRun: async () => run,
    claimBuilderRun: async () => ({ ...run, state: 'RUNNING' }),
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
      readSourceFile: async input => ({ ...input, content: '<html></html>' }),
    },
    runtime: {
      kind: 'REMOTE_E2B', modelIdentity: { admissionId: 'admission', providerId: 'provider', modelId: 'model' },
      execute: async _input => ({ projectId, executionId: runId, sandboxId: 'sandbox', baseSourceRevision: base, summary: 'alterado', kind: 'CANDIDATE', resultSourceRevision: resultRevision, resultBundle: new Uint8Array([1]) }),
    },
    compiler: { kind: 'REMOTE_E2B', compile: async _input => ({ projectId, executionId: runId, sourceRevision: resultRevision, templateRef: 'x', recipeSha256: 'y', files: [] }) },
    applicationArtifacts: { retainApplication: async () => ({ artifactRevisionId: '77777777-7777-4777-8777-777777777777', artifactDigest: 'd'.repeat(64) }) },
  })
  await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'key', content: 'altere', mode: 'BUILD' })
  await service.close()
  assert.deepEqual(calls, [['prepareProjectSource', runId], ['admitSourceResult', runId], ['advance', resultRevision], ['build-settle', '77777777-7777-4777-8777-777777777777', 'd'.repeat(64)]])
})

test('native display stream resyncs current isolated Session state without replay', async () => {
  const projectA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const projectB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const runA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab'
  const runB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc'
  const sessionState = (text, toolStatus) => ({
    isRunning: true,
    currentMessage: { id: `message-${text}`, role: 'assistant', content: { parts: [{ type: 'text', text }] } },
    activeTools: new Map([['provider-only-id', { name: 'mastra_workspace_read_file', args: { path: '/workspace/repo/app/src/main.tsx', secret: 'no-leak' }, status: toolStatus, result: { private: 'no-leak' } }]]),
  })
  let stateA = sessionState('A current', 'running')
  let listenerA
  let unsubscribeCount = 0
  const sessionA = {
    displayState: { get: () => stateA },
    subscribe: callback => { listenerA = callback; return () => { unsubscribeCount += 1 } },
  }
  const sessionB = {
    displayState: { get: () => sessionState('B current', 'completed') },
    subscribe: () => () => {},
  }
  const service = createBuilderService({
    store: { close: async () => {} },
    source: {}, runtime: {
      kind: 'REMOTE_E2B', modelIdentity: { admissionId: 'admission', providerId: 'provider', modelId: 'model' },
      execute: async () => { throw new Error('not used') },
      getSessionByResource: async (projectId, scope) => projectId === projectA && scope === `builder:${runA}` ? sessionA : projectId === projectB && scope === `builder:${runB}` ? sessionB : undefined,
    }, compiler: {}, applicationArtifacts: {},
  })

  const stream = await service.observeBuilderRun({ projectId: projectA, builderRunId: runA })
  assert.ok(stream)
  const reader = stream.getReader()
  const initial = JSON.parse((await reader.read()).value.slice(6))
  assert.equal(initial.message.text, 'A current')
  assert.equal(initial.activities[0].state, 'started')
  assert.equal(JSON.stringify(initial).includes('no-leak'), false)

  stateA = sessionState('A after tool', 'completed')
  listenerA({ type: 'display_state_changed', displayState: stateA })
  const updated = JSON.parse((await reader.read()).value.slice(6))
  assert.equal(updated.message.text, 'A after tool')
  assert.equal(updated.activities[0].state, 'succeeded')
  await reader.cancel()
  assert.equal(unsubscribeCount, 1, 'a fallback observation owns its native Session subscription')

  const reconnect = await service.observeBuilderRun({ projectId: projectA, builderRunId: runA })
  assert.ok(reconnect)
  const reconnectReader = reconnect.getReader()
  assert.equal(JSON.parse((await reconnectReader.read()).value.slice(6)).message.text, 'A after tool')
  await reconnectReader.cancel()
  assert.equal(await service.observeBuilderRun({ projectId: projectB, builderRunId: runA }), null)
  await service.close()
})

test('native observation continues with real phases after the Session is released', async () => {
  const runId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const projectId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  const accountId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  const sourceRevision = 'e'.repeat(40)
  const run = { builderRunId: runId, projectId, state: 'QUEUED', mode: 'PLAN', baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null }
  let resolveAgent
  const agentReady = new Promise((resolve) => { resolveAgent = resolve })
  let sessionUnsubscribeCount = 0
  const session = {
    displayState: { get: () => ({ isRunning: true, currentMessage: { id: 'agent-message', role: 'assistant', content: { parts: [{ type: 'text', text: 'Lendo o projeto' }] } }, activeTools: new Map([['stable-tool-call', { name: 'mastra_workspace_read_file', args: { path: 'app/App.tsx', secret: 'private' }, status: 'running', result: 'private' }]]) }) },
    subscribe: () => { return () => { sessionUnsubscribeCount += 1 } },
  }
  const store = {
    createBuilderRun: async () => run,
    claimBuilderRun: async () => ({ ...run, state: 'RUNNING' }),
    bindBuilderRunMessage: async () => {}, bindBuilderRunSandbox: async () => {},
    settleBuilderRun: async () => {}, failBuilderRun: async () => {}, close: async () => {},
  }
  const service = createBuilderService({
    store,
    source: { prepareProjectSource: async () => new Uint8Array([1]) },
    runtime: {
      kind: 'REMOTE_E2B', modelIdentity: { admissionId: 'admission', providerId: 'provider', modelId: 'model' },
      execute: async (input) => {
        await input.setPhase?.('AGENT')
        const detachSession = input.onSession?.(session)
        await agentReady
        detachSession?.()
        return { projectId, executionId: runId, sandboxId: 'sandbox', baseSourceRevision: sourceRevision, summary: 'Resposta', kind: 'RESPONSE_ONLY' }
      },
    },
    compiler: {}, applicationArtifacts: {},
  })

  await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'phase-key', content: 'Explique', mode: 'PLAN' })
  const stream = await service.observeBuilderRun({ projectId, builderRunId: runId })
  assert.ok(stream)
  const reader = stream.getReader()
  const first = JSON.parse((await reader.read()).value.slice(6))
  assert.equal(['PREPARING', 'AGENT'].includes(first.phase), true)
  resolveAgent()
  const phases = [first.phase]
  for (;;) {
    const next = await reader.read()
    if (next.done) break
    phases.push(JSON.parse(next.value.slice(6)).phase)
  }
  assert.equal(phases.includes('AGENT'), true)
  assert.equal(phases.includes('FINALIZING'), true)
  assert.equal(phases.at(-1), 'SUCCEEDED')
  assert.equal(sessionUnsubscribeCount, 1, 'native Session subscription ends before the runtime releases the Session')
  await service.close()
})
