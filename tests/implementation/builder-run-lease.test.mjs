import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { createBuilderService } = await import(hubModuleUrl('builder/service.js'))

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
