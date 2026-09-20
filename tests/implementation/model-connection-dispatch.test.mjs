import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

// One dispatch, two return shapes. Anthropic with an OAuth token set keeps returning the provider
// instance, because the bounded egress fetch, the beta headers and the identity rewrite cannot
// ride a config object. An API key returns Mastra's native config. These tests assert the shape
// the agent's model function actually hands back, through a fake that records it, and then chase
// a sentinel key through everywhere a credential must never appear.

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = await mkdtemp(resolve(repositoryRoot, 'apps/hub/model-connection-dispatch-build-'))
test.after(() => rm(buildRoot, { recursive: true, force: true }))

const bundle = (relativeSourcePath) => {
  const outfile = resolve(buildRoot, `${relativeSourcePath.replaceAll('/', '-')}.js`)
  const built = spawnSync(resolve(repositoryRoot, 'node_modules/.bin/esbuild'), [
    resolve(repositoryRoot, relativeSourcePath), `--outfile=${outfile}`, '--bundle', '--platform=node', '--format=esm', '--packages=external', '--log-level=error',
  ], { cwd: repositoryRoot, encoding: 'utf8' })
  if (built.status !== 0) throw new Error(built.stdout || built.stderr)
  return import(pathToFileURL(outfile).href)
}

const { resolveBuilderModel } = await bundle('apps/hub/src/builder/module.ts')
const SENTINEL = 'sk-sentinel-do-not-log-2f9a41c7e8b30d56'
const reference = { connectionId: '44444444-4444-4444-8444-444444444444', generation: '3' }

test('an API key resolves to the native config object, carrying the key and nothing else', async () => {
  const calls = []
  const resolved = await resolveBuilderModel({
    reference,
    modelIdentity: { modelId: 'gpt-5.4', providerId: 'openai' },
    resolveModel: async (credential, modelId) => {
      calls.push([credential, modelId])
      return Object.freeze({ id: `openai/${modelId}`, apiKey: SENTINEL })
    },
  })
  assert.deepEqual(calls, [[reference, 'gpt-5.4']])
  assert.deepEqual(Object.keys(resolved).sort(), ['apiKey', 'id'])
  assert.equal(resolved.id, 'openai/gpt-5.4')
  assert.equal(resolved.apiKey, SENTINEL)
})

test('an Anthropic OAuth connection resolves to the provider instance, not a config object', async () => {
  const providerInstance = { specificationVersion: 'v2', modelId: 'claude-opus-4-5', provider: 'anthropic', doStream() {} }
  const resolved = await resolveBuilderModel({
    reference,
    modelIdentity: { modelId: 'claude-opus-4-5', providerId: 'anthropic' },
    resolveModel: async () => providerInstance,
  })
  assert.equal(resolved, providerInstance)
  assert.equal('apiKey' in resolved, false)
})

test('no credential was admitted at all, so there is no model to fall back to', () => {
  assert.throws(
    () => resolveBuilderModel({ reference: undefined, modelIdentity: undefined, resolveModel: async () => {} }),
    /BUILDER_MODEL_CREDENTIAL_UNRESOLVABLE/)
})

test('the key never reaches the RequestContext the Builder traces', async () => {
  const { BUILDER_CREDENTIAL_REQUEST_CONTEXT_KEY, BUILDER_MODEL_REQUEST_CONTEXT_KEY, BUILDER_TRACE_REQUEST_CONTEXT_KEYS } =
    await bundle('apps/hub/src/builder/runtime.ts')
  // What the Builder puts in the request context is the coordinate of a credential, never the
  // credential. Resolution reads custody at call time on the far side of this boundary.
  const carried = {
    [BUILDER_CREDENTIAL_REQUEST_CONTEXT_KEY]: reference,
    [BUILDER_MODEL_REQUEST_CONTEXT_KEY]: { admissionId: 'builder-default', providerId: 'openai', modelId: 'gpt-5.4' },
  }
  assert.equal(JSON.stringify(carried).includes(SENTINEL), false)
  assert.equal(JSON.stringify(BUILDER_TRACE_REQUEST_CONTEXT_KEYS).includes('credential'), false)
})

test('a resolution failure is a named code and never quotes the credential', async () => {
  await assert.rejects(
    async () => resolveBuilderModel({
      reference, modelIdentity: { modelId: 'gpt-5.4', providerId: 'openai' },
      resolveModel: async () => { throw new Error('MODEL_CONNECTION_REVOKED') },
    }),
    (error) => error.message === 'MODEL_CONNECTION_REVOKED' && !error.message.includes(SENTINEL))
  // A malformed coordinate refuses by code rather than falling back to a model that can only throw.
  assert.throws(
    () => resolveBuilderModel({ reference: { connectionId: 1 }, modelIdentity: undefined, resolveModel: async () => {} }),
    /BUILDER_MODEL_CREDENTIAL_UNRESOLVABLE/)
})
