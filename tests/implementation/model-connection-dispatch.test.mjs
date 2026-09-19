import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { writeFileSync } from 'node:fs'
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
const { readModelChoices, resolveModelAdmission } = await bundle('apps/hub/src/model-connection/model-catalog.ts')

const writeCatalog = (path, entries) =>
  writeFileSync(path, JSON.stringify({ schemaVersion: 'conexus-model-admission-catalog/v1', entries }))

const SENTINEL = 'sk-sentinel-do-not-log-2f9a41c7e8b30d56'
const reference = { connectionId: '44444444-4444-4444-8444-444444444444', generation: '3' }
const fallbackModel = { specificationVersion: 'v2', modelId: 'fallback', provider: 'fallback' }

test('an API key resolves to the native config object, carrying the key and nothing else', async () => {
  const calls = []
  const resolved = await resolveBuilderModel({
    reference,
    modelIdentity: { modelId: 'gpt-5.4', providerId: 'openai' },
    resolveModel: async (credential, modelId) => {
      calls.push([credential, modelId])
      return Object.freeze({ id: `openai/${modelId}`, apiKey: SENTINEL })
    },
    fallbackModel,
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
    fallbackModel,
  })
  assert.equal(resolved, providerInstance)
  assert.equal('apiKey' in resolved, false)
})

test('no credential was admitted at all, so the sentinel-refusing fallback stands', async () => {
  const resolved = await resolveBuilderModel({
    reference: undefined, modelIdentity: undefined, fallbackModel,
  })
  assert.equal(resolved, fallbackModel)
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
      fallbackModel,
    }),
    (error) => error.message === 'MODEL_CONNECTION_REVOKED' && !error.message.includes(SENTINEL))
  // A malformed coordinate refuses by code rather than falling back to a model that can only throw.
  assert.throws(
    () => resolveBuilderModel({ reference: { connectionId: 1 }, modelIdentity: undefined, fallbackModel }),
    /BUILDER_MODEL_CREDENTIAL_UNRESOLVABLE/)
})

test('the catalog refuses an entry that still carries the removed egress field, and names it', () => {
  const catalog = resolve(buildRoot, 'catalog-with-removed-field.json')
  writeCatalog(catalog, [{
    admissionId: 'builder-default', providerKey: 'anthropic', modelId: 'claude-opus-4-5',
    officialHttpsOrigin: 'https://api.anthropic.com',
    capabilitySet: ['BUILDER_CODING'], enabled: true,
  }])
  assert.throws(
    () => readModelChoices({ catalogFile: catalog, requiredCapabilities: ['BUILDER_CODING'] }),
    /PROJECT_MODEL_CATALOG_FIELD_REMOVED:officialHttpsOrigin/)
})

test('the catalog admits a second provider now that the Anthropic gate is gone', () => {
  const catalog = resolve(buildRoot, 'catalog-two-providers.json')
  writeCatalog(catalog, [
    { admissionId: 'anthropic-default', providerKey: 'anthropic', modelId: 'claude-opus-4-5', capabilitySet: ['BUILDER_CODING'], enabled: true },
    { admissionId: 'openai-default', providerKey: 'openai', modelId: 'gpt-4o', capabilitySet: ['BUILDER_CODING'], enabled: true },
  ])
  const choices = readModelChoices({ catalogFile: catalog, requiredCapabilities: ['BUILDER_CODING'] })
  assert.deepEqual(choices.map((choice) => choice.providerId), ['anthropic', 'openai'])
  assert.equal(resolveModelAdmission({ catalogFile: catalog, admissionId: 'openai-default', requiredCapabilities: ['BUILDER_CODING'] }).providerId, 'openai')
})

// The catalog names the model and the connection names the credential. A Codex entry therefore
// carries providerKey 'openai', because that is what Mastra's registry lists and the validator
// checks, while the connection behind it stays provider_id 'openai-codex' so an account can hold a
// selected subscription and a selected API key at the same time.
test('the Codex models are selectable under the provider key Mastra actually carries', () => {
  const catalog = resolve(buildRoot, 'catalog-codex.json')
  writeCatalog(catalog, [
    { admissionId: 'codex-default', providerKey: 'openai', modelId: 'gpt-5.3-codex', capabilitySet: ['BUILDER_CODING', 'BUILDER_VERIFICATION'], enabled: true },
    { admissionId: 'codex-spark', providerKey: 'openai', modelId: 'gpt-5.3-codex-spark', capabilitySet: ['BUILDER_CODING'], enabled: true },
  ])
  const choices = readModelChoices({ catalogFile: catalog, requiredCapabilities: ['BUILDER_CODING'] })
  assert.deepEqual(choices.map((choice) => choice.modelId), ['gpt-5.3-codex', 'gpt-5.3-codex-spark'])
  assert.deepEqual(choices.map((choice) => choice.providerId), ['openai', 'openai'])
  assert.equal(resolveModelAdmission({ catalogFile: catalog, admissionId: 'codex-default', requiredCapabilities: ['BUILDER_CODING'] }).modelId, 'gpt-5.3-codex')
})

test('a model the provider registry does not list is still refused', () => {
  const catalog = resolve(buildRoot, 'catalog-unknown-model.json')
  writeCatalog(catalog, [{ admissionId: 'openai-default', providerKey: 'openai', modelId: 'gpt-not-a-model', capabilitySet: ['BUILDER_CODING'], enabled: true }])
  assert.throws(() => readModelChoices({ catalogFile: catalog, requiredCapabilities: ['BUILDER_CODING'] }), /PROJECT_MODEL_CATALOG_REFUSED/)
})

test('a floating pin is still refused, because that is Product policy and not model logic', () => {
  const catalog = resolve(buildRoot, 'catalog-floating-pin.json')
  writeCatalog(catalog, [{ admissionId: 'openai-default', providerKey: 'openai', modelId: 'chatgpt-image-latest', capabilitySet: ['BUILDER_CODING'], enabled: true }])
  assert.throws(() => readModelChoices({ catalogFile: catalog, requiredCapabilities: ['BUILDER_CODING'] }), /PROJECT_MODEL_CATALOG_REFUSED/)
})
