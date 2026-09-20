import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = await mkdtemp(resolve(repositoryRoot, 'apps/hub/builder-credential-generation-build-'))
test.after(() => rm(buildRoot, { recursive: true, force: true }))

const bundle = (relativeSourcePath) => {
  const outfile = resolve(buildRoot, `${relativeSourcePath.replaceAll('/', '-')}.js`)
  const built = spawnSync(resolve(repositoryRoot, 'node_modules/.bin/esbuild'), [
    resolve(repositoryRoot, relativeSourcePath), `--outfile=${outfile}`, '--bundle', '--platform=node', '--format=esm', '--packages=external', '--log-level=error',
  ], { cwd: repositoryRoot, encoding: 'utf8' })
  if (built.status !== 0) throw new Error(built.stdout || built.stderr)
  return import(pathToFileURL(outfile).href)
}

const { createBuilderStore } = await bundle('apps/hub/src/builder/store.ts')
const { resolveBuilderModel } = await bundle('apps/hub/src/builder/module.ts')
const { sendBuilderSessionMessage } = await bundle('apps/hub/src/builder/runtime.ts')

const runId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'
const accountId = '33333333-3333-4333-8333-333333333333'
const baseSourceRevision = 'a'.repeat(40)

const fakeRunRow = (modelCredentialGeneration) => ({
  builderRunId: runId, projectId, state: 'RUNNING', phase: 'PREPARING', mode: 'BUILD',
  baseSourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null,
  modelConnectionId: 'conn-1', modelCredentialGeneration,
})

test('store normalizes a bigint-as-number modelCredentialGeneration to a string before it leaves the boundary', async () => {
  const pool = { query: async () => ({ rows: [{ value: fakeRunRow(1) }] }), end: async () => {} }
  const store = createBuilderStore({ ingressPool: pool, executorPool: pool })
  const run = await store.readBuilderRun({ accountId, projectId })
  assert.equal(run.modelCredentialGeneration, '1')
  assert.equal(typeof run.modelCredentialGeneration, 'string')
})

test('store passes an explicit null modelCredentialGeneration through unchanged', async () => {
  const pool = { query: async () => ({ rows: [{ value: fakeRunRow(null) }] }), end: async () => {} }
  const store = createBuilderStore({ ingressPool: pool, executorPool: pool })
  const run = await store.readBuilderRun({ accountId, projectId })
  assert.equal(run.modelCredentialGeneration, null)
})

test('store refuses a modelCredentialGeneration it cannot normalize instead of passing it on', async () => {
  const pool = { query: async () => ({ rows: [{ value: fakeRunRow('not-a-generation') }] }), end: async () => {} }
  const store = createBuilderStore({ ingressPool: pool, executorPool: pool })
  await assert.rejects(() => store.readBuilderRun({ accountId, projectId }), /BUILDER_RUN_ROW_INVALID/)
})

test('claimBuilderRun normalizes the same bigint-as-number generation', async () => {
  const pool = { query: async () => ({ rows: [{ value: fakeRunRow(7) }] }), end: async () => {} }
  const store = createBuilderStore({ ingressPool: pool, executorPool: pool })
  const claimed = await store.claimBuilderRun(runId, { admissionId: 'a', providerId: 'p', modelId: 'm' })
  assert.equal(claimed.modelCredentialGeneration, '7')
})

test('a run whose generation arrives from the database as a NUMBER still resolves the connection model, not the sentinel', async () => {
  const pool = { query: async () => ({ rows: [{ value: fakeRunRow(1) }] }), end: async () => {} }
  const store = createBuilderStore({ ingressPool: pool, executorPool: pool })
  const claimed = await store.claimBuilderRun(runId, { admissionId: 'a', providerId: 'p', modelId: 'm' })

  const resolvedModel = { modelId: 'claude-resolved' }
  const calls = []
  const resolveModel = (reference, modelId) => { calls.push([reference, modelId]); return resolvedModel }

  const result = resolveBuilderModel({
    reference: { connectionId: claimed.modelConnectionId, generation: claimed.modelCredentialGeneration },
    modelIdentity: { modelId: 'claude-3-x' },
    resolveModel,
  })

  assert.equal(result, resolvedModel)
  assert.deepEqual(calls, [[{ connectionId: 'conn-1', generation: '1' }, 'claude-3-x']])
})

test('resolveBuilderModel refuses an unnormalized numeric generation instead of calling custody with it', () => {
  let resolveModelCalled = false
  assert.throws(() => resolveBuilderModel({
    reference: { connectionId: 'conn-1', generation: 1 },
    modelIdentity: { modelId: 'claude-3-x' },
    resolveModel: () => { resolveModelCalled = true; return { modelId: 'never' } },
  }), /BUILDER_MODEL_CREDENTIAL_UNRESOLVABLE/)
  assert.equal(resolveModelCalled, false)
})

test('resolveBuilderModel refuses when no credential was admitted at all, because there is nothing to run on', () => {
  assert.throws(() => resolveBuilderModel({
    reference: undefined,
    modelIdentity: { modelId: 'claude-3-x' },
    resolveModel: () => { throw new Error('must not be called') },
  }), /BUILDER_MODEL_CREDENTIAL_UNRESOLVABLE/)
})

test('sendBuilderSessionMessage classifies a 401/403 agent error as an auth failure without leaking the provider message', async () => {
  let listener
  const providerError = new Error('invalid x-api-key header, secret-token-xyz')
  providerError.statusCode = 401
  const session = {
    subscribe: (callback) => { listener = callback; return () => {} },
    sendMessage: async () => {
      listener({ type: 'error', error: providerError })
      listener({ type: 'agent_end', reason: 'error' })
    },
  }
  await assert.rejects(() => sendBuilderSessionMessage(session, { content: 'hi' }), (error) => {
    assert.equal(error.message, 'BUILDER_MODEL_AUTH_FAILED')
    return true
  })
})

test('sendBuilderSessionMessage preserves a generic agent error as a safe named code, not the raw provider message', async () => {
  let listener
  const session = {
    subscribe: (callback) => { listener = callback; return () => {} },
    sendMessage: async () => {
      listener({ type: 'error', error: new Error('upstream 500 with internal trace id abc123') })
      listener({ type: 'agent_end', reason: 'error' })
    },
  }
  await assert.rejects(() => sendBuilderSessionMessage(session, { content: 'hi' }), (error) => {
    assert.equal(error.message, 'BUILDER_MODEL_STREAM_FAILED')
    return true
  })
})

test('sendBuilderSessionMessage still reports rate limiting distinctly', async () => {
  const session = {
    subscribe: () => () => {},
    sendMessage: async () => { const err = new Error('Too Many Requests'); err.statusCode = 429; throw err },
  }
  await assert.rejects(() => sendBuilderSessionMessage(session, { content: 'hi' }), (error) => {
    assert.equal(error.message, 'BUILDER_MODEL_RATE_LIMITED')
    return true
  })
})

test('sendBuilderSessionMessage propagates a model-resolution rejection unchanged, with no agent_end event required', async () => {
  const session = {
    subscribe: () => () => {},
    sendMessage: async () => { throw new Error('BUILDER_MODEL_CREDENTIAL_UNRESOLVABLE') },
  }
  await assert.rejects(() => sendBuilderSessionMessage(session, { content: 'hi' }), (error) => {
    assert.equal(error.message, 'BUILDER_MODEL_CREDENTIAL_UNRESOLVABLE')
    return true
  })
})

test('sendBuilderSessionMessage returns complete on success', async () => {
  let listener
  const session = {
    subscribe: (callback) => { listener = callback; return () => {} },
    sendMessage: async () => { listener({ type: 'agent_end', reason: 'complete' }) },
  }
  const reason = await sendBuilderSessionMessage(session, { content: 'hi' })
  assert.equal(reason, 'complete')
})
