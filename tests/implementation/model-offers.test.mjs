import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

// The payer table. A credential pays for one model router provider and reaches some slice of that
// provider's models; these assert the slice against Mastra's own registry rather than a fixture,
// because the registry is what the Builder will actually route to.

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = await mkdtemp(resolve(repositoryRoot, 'apps/hub/model-offers-build-'))
test.after(() => rm(buildRoot, { recursive: true, force: true }))

const bundle = (relativeSourcePath) => {
  const outfile = resolve(buildRoot, `${relativeSourcePath.replaceAll('/', '-')}.js`)
  const built = spawnSync(resolve(repositoryRoot, 'node_modules/.bin/esbuild'), [
    resolve(repositoryRoot, relativeSourcePath), `--outfile=${outfile}`, '--bundle', '--platform=node', '--format=esm', '--packages=external', '--log-level=error',
  ], { cwd: repositoryRoot, encoding: 'utf8' })
  if (built.status !== 0) throw new Error(built.stdout || built.stderr)
  return import(pathToFileURL(outfile).href)
}

const { paidModels, modelOffers, modelOfferSlug, accountSignIns, apiKeyProviders } =
  await bundle('apps/hub/src/model-connection/paid-models.ts')
const { PROVIDER_REGISTRY } = await import('@mastra/core/llm')

const admissible = (providerId) => {
  const deprecated = new Set(PROVIDER_REGISTRY[providerId].deprecatedModels ?? [])
  return PROVIDER_REGISTRY[providerId].models.filter((modelId) => !deprecated.has(modelId) && !/latest|\*/i.test(modelId))
}

test('an Anthropic account sign-in pays for every Anthropic model the registry names', () => {
  assert.deepEqual(paidModels('anthropic', 'OAUTH_TOKEN_SET'), admissible('anthropic'))
  assert.ok(paidModels('anthropic', 'OAUTH_TOKEN_SET').includes('claude-opus-4-5'))
})

test('without its own catalog, a ChatGPT account is offered the openai ids that catalog last listed', () => {
  assert.deepEqual(paidModels('openai-codex', 'OAUTH_TOKEN_SET'), ['gpt-5.5', 'gpt-5.6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-6-astra'])
  assert.equal(paidModels('openai-codex', 'OAUTH_TOKEN_SET').includes('gpt-5.4'), false)
})

test('an account catalog replaces the registry for that connection, in the provider\'s order and names', () => {
  const offers = modelOffers({
    connectionId: '11111111-1111-4111-8111-111111111111',
    connectionLabel: 'Meu ChatGPT',
    providerId: 'openai-codex',
    credentialKind: 'OAUTH_TOKEN_SET',
  }, [{ modelId: 'gpt-6-astra', label: 'GPT-6-Astra' }, { modelId: 'gpt-7-not-in-any-registry', label: 'GPT-7' }])
  assert.deepEqual(offers.map((offer) => [offer.choiceId, offer.label, offer.modelId]), [
    ['openai-codex/gpt-6-astra', 'GPT-6-Astra', 'gpt-6-astra'],
    ['openai-codex/gpt-7-not-in-any-registry', 'GPT-7', 'gpt-7-not-in-any-registry'],
  ])
})

test('an API key pays for every model of the registry provider it was filed under', () => {
  assert.deepEqual(paidModels('groq', 'API_KEY'), admissible('groq'))
  assert.deepEqual(paidModels('openai', 'API_KEY'), admissible('openai'))
})

test('no floating model id is ever offered', () => {
  assert.equal(paidModels('openai', 'API_KEY').some((modelId) => /latest|\*/i.test(modelId)), false)
  assert.equal(PROVIDER_REGISTRY.openai.models.includes('chatgpt-image-latest'), true)
})

test('a provider the model router does not know pays for nothing', () => {
  assert.deepEqual(paidModels('not-a-provider', 'API_KEY'), [])
  assert.deepEqual(paidModels('not-a-provider', 'OAUTH_TOKEN_SET'), [])
  assert.deepEqual(paidModels('openai-codex', 'API_KEY'), [])
  assert.deepEqual(paidModels('constructor', 'API_KEY'), [])
})

test('an offer names the connection that pays for it and the model id as Mastra names it', () => {
  const offers = modelOffers({
    connectionId: '11111111-1111-4111-8111-111111111111',
    connectionLabel: 'Meu ChatGPT',
    providerId: 'openai-codex',
    credentialKind: 'OAUTH_TOKEN_SET',
  })
  assert.deepEqual(offers[0], {
    choiceId: 'openai-codex/gpt-5.5',
    label: 'gpt-5.5',
    providerId: 'openai-codex',
    modelId: 'gpt-5.5',
    connectionId: '11111111-1111-4111-8111-111111111111',
    connectionLabel: 'Meu ChatGPT',
    credentialKind: 'OAUTH_TOKEN_SET',
  })
  assert.equal(offers.length, 5)
})

test('the offer slug is what create_builder_run_with_model will accept', () => {
  assert.equal(modelOfferSlug('openai-codex/gpt-5.5'), 'openai-codex-gpt-5.5')
  assert.equal(modelOfferSlug('anthropic/claude-opus-4-5'), 'anthropic-claude-opus-4-5')
  assert.match(modelOfferSlug('openai-codex/gpt-5.5'), /^[a-z0-9][a-z0-9._-]{0,127}$/)
  assert.equal(modelOfferSlug(`openai/${'x'.repeat(200)}`).length, 128)
})

test('the account sign-ins are the two Conexus built, under the names the person knows', () => {
  assert.deepEqual(accountSignIns(), [
    { providerId: 'anthropic', name: 'Claude' },
    { providerId: 'openai-codex', name: 'ChatGPT' },
  ])
})

test('every provider the model router knows can be offered an API key, sorted by name', () => {
  const providers = apiKeyProviders()
  assert.equal(providers.length, Object.keys(PROVIDER_REGISTRY).length)
  assert.deepEqual(providers.find((provider) => provider.providerId === 'anthropic'), {
    providerId: 'anthropic', name: 'Anthropic', docUrl: 'https://docs.anthropic.com/en/docs/about-claude/models',
  })
  assert.deepEqual(providers.find((provider) => provider.providerId === 'groq'), {
    providerId: 'groq', name: 'Groq', docUrl: PROVIDER_REGISTRY.groq.docUrl ?? null,
  })
  assert.equal(providers.some((provider) => provider.providerId === 'openai-codex'), false)
  assert.deepEqual([...providers].sort((left, right) => left.name.localeCompare(right.name) || left.providerId.localeCompare(right.providerId)), providers)
})
