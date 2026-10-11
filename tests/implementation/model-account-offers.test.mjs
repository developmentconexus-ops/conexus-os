import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { offersFor } = await import(hubModuleUrl('model-account/models.js'))

const levelsOf = (models, names) => Object.fromEntries(models.filter(({ modelName }) => names.includes(modelName)).map(({ modelName, thinkingLevels }) => [modelName, thinkingLevels.join(' ')]))

test('the picker offers a person with a ChatGPT account the chat models of the router catalog, each with the levels Mastra Code sends it', async () => {
  const offered = await offersFor(['openai-codex'])
  const ids = offered.map(({ id }) => id)
  assert.deepEqual(offered.find(({ id }) => id === 'openai/gpt-5.6-sol'), { id: 'openai/gpt-5.6-sol', provider: 'openai', providerName: 'OpenAI (ChatGPT)', modelName: 'gpt-5.6-sol', thinkingLevels: ['low', 'medium', 'high', 'xhigh', 'max'] })
  assert.deepEqual(levelsOf(offered, ['gpt-5.4-mini', 'gpt-5.3-codex', 'o3', 'gpt-6-sol']), {
    'gpt-5.4-mini': 'low medium high xhigh',
    'gpt-5.3-codex': 'low medium high xhigh',
    o3: 'off low medium high xhigh',
    'gpt-6-sol': 'off low medium high xhigh max',
  })
  for (const present of ['openai/gpt-5.4-mini', 'openai/gpt-5.3-codex']) assert.equal(ids.includes(present), true, present)
  for (const absent of ['openai/gpt-4', 'openai/o1', 'openai/gpt-image-1', 'openai/gpt-image-2', 'openai/chatgpt-image-latest', 'openai/text-embedding-3-large', 'openai/gpt-realtime-2.1']) {
    assert.equal(ids.includes(absent), false, `${absent} is retired or cannot chat`)
  }
})

test('the picker offers a person with an Anthropic account the chat models of the router catalog, each with the levels Mastra Code sends it', async () => {
  const offered = await offersFor(['anthropic'])
  assert.deepEqual(levelsOf(offered, ['claude-opus-5-5', 'claude-opus-4-7', 'claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-opus-4-5']), {
    'claude-haiku-4-5': 'off low medium high xhigh',
    'claude-opus-4-5': 'off low medium high xhigh',
    'claude-opus-4-6': 'off low medium high max',
    'claude-opus-4-7': 'off low medium high xhigh max',
    'claude-opus-5-5': 'off low medium high xhigh max',
    'claude-sonnet-4-6': 'off low medium high max',
  })
  assert.equal(offered.every(({ id, provider }) => provider === 'anthropic' && id.startsWith('anthropic/')), true)
})

test('the picker offers nothing for a provider the person has no account with', async () => {
  assert.deepEqual(await offersFor([]), [])
})
