import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { LawfulCredential, MODEL_PROVIDERS, isRouterPrefix } = await import(hubModuleUrl('builder/model-account/providers.js'))

test('a provider and kind outside the table do not parse, and each lawful pair does', () => {
  const lawful = [['anthropic', 'api_key'], ['anthropic', 'oauth'], ['openai-codex', 'oauth'], ['google-ai-pro', 'google_ai_pro']]
  for (const [provider, kind] of lawful) assert.deepEqual(LawfulCredential.parse({ provider, kind }), { provider, kind })
  for (const [provider, kind] of [['openai-codex', 'api_key'], ['anthropic', 'google_ai_pro'], ['google-ai-pro', 'oauth'], ['mistral', 'api_key']]) {
    assert.equal(LawfulCredential.safeParse({ provider, kind }).success, false, `${provider} ${kind}`)
  }
})

test('the router prefixes are the table\'s, and the ChatGPT account routes under openai', () => {
  assert.deepEqual(Object.values(MODEL_PROVIDERS).map((entry) => entry.routerPrefix), ['anthropic', 'openai', 'google-ai-pro'])
  assert.deepEqual(['anthropic', 'openai', 'google-ai-pro', 'openai-codex', 'groq'].map(isRouterPrefix), [true, true, true, false, false])
})
