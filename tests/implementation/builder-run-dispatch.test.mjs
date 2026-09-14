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
    createBuilderRun: async () => ({ builderRunId: runId, projectId, state: 'QUEUED', mode: 'PLAN', baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null }),
    claimBuilderRun: async () => { calls.push('claim'); return { builderRunId: runId, projectId, state: 'RUNNING', mode: 'PLAN', baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null } },
    bindBuilderRunMessage: async (_id, messageId) => calls.push(['message', messageId]),
    bindBuilderRunSandbox: async (_id, sandboxId) => calls.push(['sandbox', sandboxId]),
    settleBuilderRun: async (input) => calls.push(['settle', input.resultKind]),
    failBuilderRun: async () => calls.push('fail'),
    close: async () => {},
  }
  const service = createBuilderService({
    store,
    source: {
      prepareSource: async () => { calls.push('source'); return new Uint8Array([1]) },
      admitSourceResult: async () => { throw new Error('must not admit source for PLAN response') },
    },
    runtime: {
      kind: 'REMOTE_E2B', modelIdentity: { admissionId: 'admission', providerId: 'provider', modelId: 'model' },
      execute: async (input) => {
        calls.push(['execute', input.mode, input.intent])
        await input.bindPhysicalSandbox('physical-sandbox')
        await input.bindMessage('mastra-message')
        return { projectId, changeId: runId, workUnitId: runId, actorRunId: runId, admissionToken: runId, sandboxId: 'physical-sandbox', baseSourceRevision: sourceRevision, summary: 'Resposta', kind: 'RESPONSE_ONLY' }
      },
    },
    compiler: {}, applicationArtifacts: {},
  })
  const result = await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'key', content: 'Explique o app', mode: 'PLAN' })
  await service.close()
  assert.equal(result.builderRunId, runId)
  assert.deepEqual(calls, ['claim', 'source', ['execute', 'PLAN', 'Explique o app'], ['sandbox', 'physical-sandbox'], ['message', 'mastra-message'], ['settle', 'RESPONSE_ONLY']])
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
      prepareSource: async () => new Uint8Array([1]),
      admitSourceResult: async input => { calls.push(['admit', input.executionId]); return { baseSourceRevision: base, candidateSourceRevision: resultRevision } },
      listSourceTree: async () => ({ sourceRevision: resultRevision, entries: [{ kind: 'FILE', path: 'app/index.html' }] }),
      readSourceFile: async input => ({ ...input, content: '<html></html>' }),
    },
    runtime: {
      kind: 'REMOTE_E2B', modelIdentity: { admissionId: 'admission', providerId: 'provider', modelId: 'model' },
      execute: async _input => ({ projectId, changeId: runId, workUnitId: runId, actorRunId: runId, admissionToken: runId, sandboxId: 'sandbox', baseSourceRevision: base, summary: 'alterado', kind: 'SOURCE_CHANGED', candidateSourceRevision: resultRevision, resultBundle: new Uint8Array([1]) }),
    },
    compiler: { kind: 'REMOTE_E2B', compile: async _input => ({ projectId, changeId: runId, sourceRevision: resultRevision, templateRef: 'x', recipeSha256: 'y', files: [] }) },
    applicationArtifacts: { retainApplication: async () => ({ artifactRevisionId: '77777777-7777-4777-8777-777777777777', artifactDigest: 'd'.repeat(64) }) },
  })
  await service.createBuilderRun({ accountId, projectId, idempotencyKey: 'key', content: 'altere', mode: 'BUILD' })
  await service.close()
  assert.deepEqual(calls, [['admit', runId], ['advance', resultRevision], ['build-settle', '77777777-7777-4777-8777-777777777777', 'd'.repeat(64)]])
})
