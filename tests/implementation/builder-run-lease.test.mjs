import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { createBuilderService } = await import(hubModuleUrl('builder/service.js'))
const { Failure } = await import(hubModuleUrl('platform/failure.js'))

test('a run this Hub took over and could not settle is taken again and settled as first classed, not as an ending of its own it lost', async () => {
  const ownerId = '0f000000-0000-4000-8000-0000000000aa'
  const calls = []
  let takes = 0
  let interrupts = 0
  let settled = false
  const service = createBuilderService({
    store: {
      ownerId,
      renewRunLease: async () => (settled ? [] : [{
        builderRunId: '0f000000-0000-4000-8000-0000000000bb', projectId: '0f000000-0000-4000-8000-0000000000cc', conversationId: 'conv-taken',
        candidateRevision: null, resultSourceRevision: null,
        previousOwnerId: takes++ === 0 ? '0f000000-0000-4000-8000-0000000000dd' : ownerId,
      }]),
      interruptBuilderRun: async (_id, reason) => {
        calls.push(['interrupt', reason])
        if (interrupts++ === 0) throw new Error('DATABASE_DOWN')
        settled = true
      },
      failBuilderRun: async (_id, code) => { calls.push(['fail', code]); settled = true },
      close: async () => {},
    },
    applicationArtifacts: {},
    runs: {
      ports: {},
      git: { readMain: async () => 'a'.repeat(40), mainContains: async () => false },
      conversations: { ownerOf: async () => 'PROJECT' },
      source: {},
      appendDiagnostic: async () => {},
      publishRun: async () => {},
      questionWaitMs: 60_000,
    },
  })
  const signal = new AbortController().signal
  await service.renewLease(signal)
  await service.renewLease(signal)
  await service.renewLease(signal)
  await service.close()
  assert.deepEqual(calls, [['interrupt', 'HUB_RESTART'], ['interrupt', 'HUB_RESTART']])
})

test('a Conexus Git that cannot answer `main` fails the source reads and the run start with its name, and no read is served as absent', async () => {
  const accountId = '0f000000-0000-4000-8000-0000000000a1'
  const projectId = '0f000000-0000-4000-8000-0000000000a2'
  const reached = []
  const service = createBuilderService({
    store: {
      ownerId: '0f000000-0000-4000-8000-0000000000aa',
      admitBuilder: async () => {},
      admitSourceRevision: async () => { reached.push('admit'); return true },
      createBuilderRun: async (input) => { await input.readBase(); reached.push('create') },
    },
    applicationArtifacts: {},
    runs: {
      ports: {},
      git: { readMain: async () => { throw new Failure('CONEXUS_GIT_REF_REFUSED') }, mainContains: async () => false },
      conversations: { ownerOf: async () => 'PROJECT' },
      source: {},
      appendDiagnostic: async () => {},
      publishRun: async () => {},
      questionWaitMs: 60_000,
      heapUsedRatio: () => 0,
    },
  })
  const named = (error) => error.id === 'BUILDER_SOURCE_UNAVAILABLE' && error.details.reason === 'CONEXUS_GIT_REF_REFUSED'
  await assert.rejects(service.listSourceTree({ accountId, projectId, sourceRevision: 'a'.repeat(40) }), named)
  await assert.rejects(service.sendBuilderMessage({ accountId, projectId, conversationId: 'conv', idempotencyKey: 'k', content: 'oi' }), named)
  assert.deepEqual(reached, [])
})
