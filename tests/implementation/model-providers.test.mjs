import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiKeyProvider } from '@conexus/contract'
import { hubModuleUrl } from './hub-build.mjs'

const { CredentialKind, MODEL_PROVIDERS, parseModelId } = await import(hubModuleUrl('model-account/credential.js'))

test('a provider and kind outside the table do not parse, and each lawful pair does', () => {
  const lawful = [['anthropic', 'api_key'], ['anthropic', 'oauth'], ['openai-codex', 'oauth'], ['google-ai-pro', 'google_ai_pro']]
  for (const [provider, kind] of lawful) assert.deepEqual(CredentialKind.parse({ provider, kind }), { provider, kind })
  for (const [provider, kind] of [['openai-codex', 'api_key'], ['anthropic', 'google_ai_pro'], ['google-ai-pro', 'oauth'], ['mistral', 'api_key']]) {
    assert.equal(CredentialKind.safeParse({ provider, kind }).success, false, `${provider} ${kind}`)
  }
})

test('the router prefixes are the table\'s, and the ChatGPT account routes under openai', () => {
  assert.deepEqual(Object.values(MODEL_PROVIDERS).map((entry) => entry.routerPrefix), ['anthropic', 'openai', 'google-ai-pro'])
  assert.deepEqual(['anthropic', 'openai', 'google-ai-pro', 'openai-codex', 'groq'].map((prefix) => parseModelId(`${prefix}/synthetic-model`) !== null), [true, true, true, false, false])
})

test('every provider the key route accepts has a key shape in the provider table, and no other provider has one', () => {
  const withShape = Object.entries(MODEL_PROVIDERS).filter(([, entry]) => 'api_key' in entry.kinds).map(([provider]) => provider)
  assert.deepEqual(ApiKeyProvider.options, withShape)
})
