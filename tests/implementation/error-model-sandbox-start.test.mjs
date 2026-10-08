import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import { takeHubLogs } from './hub-log-capture.mjs'
const { e2bConversationSandboxes } = await import(hubModuleUrl('builder/conversation-sandboxes.js'))
const { Failure } = await import(hubModuleUrl('platform/failure.js'))
const { createBuilderService } = await import(hubModuleUrl('builder/service.js'))

const projectId = '11111111-1111-4111-8111-111111111111'
const accountId = '22222222-2222-4222-8222-222222222222'
const conversationId = '33333333-3333-4333-8333-333333333333'
const builderRunId = '44444444-4444-4444-8444-444444444444'
const base = 'a'.repeat(40)

test('production start rejection settles the run with its named failure before binding sandbox or changing source/Preview', async (t) => {
  const cause = new Error('PRIVATE_START_MARKER')
  const calls = []
  const sandbox = e2bConversationSandboxes({ apiKey: 'synthetic-unused', templateId: 'unused', idleMs: 1, check: {}, create: () => ({
    sandboxId: undefined,
    start: async () => { calls.push('start'); throw cause },
    kill: async () => { calls.push('kill') },
  }) }).open({ conversationId, providerSandboxId: null, retire: async (kill) => kill() })
  await assert.rejects(sandbox.start(), (error) => error instanceof Failure && error.id === 'BUILDER_SANDBOX_OPEN_FAILED' && error.cause === cause)
  calls.length = 0
  const pointers = { source: base, preview: 'b'.repeat(64), sandboxId: null }
  const row = { builderRunId, projectId, conversationId, state: 'QUEUED', phase: null, baseSourceRevision: base, resultSourceRevision: null, resultKind: null, failureCode: null }
  const published = []
  const store = {
    admitBuilder: async () => {},
    createBuilderRun: async () => ({ ...row }),
    claimBuilderRun: async () => Object.assign(row, { state: 'RUNNING' }),
    setBuilderRunPhase: async ({ phase }) => ({ ...Object.assign(row, { phase }) }),
    readBuilderRun: async () => ({ ...row }),
    failBuilderRun: async ({ failureCode }) => { Object.assign(row, { state: 'FAILED', phase: null, failureCode }) },
    bindBuilderRunSandbox: async ({ sandboxId }) => { pointers.sandboxId = sandboxId },
    recordConversationSandbox: async () => { calls.push('record-sandbox') },
    advanceBuilderRunSource: async () => { pointers.source = 'changed' },
    settleBuilderRunBuild: async () => { pointers.preview = 'changed' },
    close: async () => {},
  }
  const git = { readMain: async () => base, mainContains: async () => false, readBlob: async () => null, isStarter: async () => false }
  const service = createBuilderService({ store, registry: {}, runs: {
    ports: { checkModel: async () => {}, git, readProjectName: async () => 'Synthetic project', openSandbox: async () => sandbox, log: () => {} },
    git, conversations: { ownerOf: async () => 'PROJECT' }, source: {},
    publishRun: async (value) => published.push(value), appendDiagnostic: async () => { calls.push('diagnostic') },
  } })
  t.after(() => service.close())
  takeHubLogs()
  await service.sendBuilderMessage({ accountId, projectId, conversationId, idempotencyKey: 'start-pin', content: 'Explique o app' })
  await service.close()
  assert.deepEqual([row.state, row.failureCode, row.resultSourceRevision], ['FAILED', 'BUILDER_SANDBOX_OPEN_FAILED', null])
  assert.deepEqual(pointers, { source: base, preview: 'b'.repeat(64), sandboxId: null })
  assert.deepEqual(calls, ['start', 'kill'])
  assert.deepEqual(published.map(({ state, phase }) => [state, phase]), [['RUNNING', 'PREPARING'], ['FAILED', null]])
  const lines = takeHubLogs().filter(({ message }) => message === 'BUILDER_SANDBOX_OPEN_FAILED')
  assert.deepEqual(lines.map(({ level, message }) => [level, message]), [['error', 'BUILDER_SANDBOX_OPEN_FAILED']])
  assert.equal(JSON.stringify(lines).includes('PRIVATE_START_MARKER'), false)
})

for (const error of [new Failure('BUILDER_SOURCE_ADMISSION_FAILED'), new DOMException('Stopped', 'AbortError')]) {
  test(`production start preserves ${error instanceof Failure ? error.id : error.name} identity`, async () => {
    const sandbox = e2bConversationSandboxes({ apiKey: 'synthetic-unused', templateId: 'unused', idleMs: 1, check: {}, create: () => ({
      sandboxId: undefined,
      start: async () => { throw error },
    }) }).open({ conversationId, providerSandboxId: null, retire: async (kill) => kill() })
    await assert.rejects(sandbox.start(), (received) => received === error)
  })
}

test('a later sandbox command rejection keeps its original identity', async () => {
  const cause = new Error('PRIVATE_PREPARATION_MARKER')
  const sandbox = e2bConversationSandboxes({ apiKey: 'synthetic-unused', templateId: 'unused', idleMs: 1, check: {}, create: () => ({
    sandboxId: 'opened',
    start: async () => {},
    runCommand: async () => { throw cause },
  }) }).open({ conversationId, providerSandboxId: null, retire: async (kill) => kill() })
  await sandbox.start()
  await assert.rejects(sandbox.executeCommand('git', ['fetch']), (error) => error === cause)
})
