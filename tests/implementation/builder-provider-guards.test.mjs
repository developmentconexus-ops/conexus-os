import assert from 'node:assert/strict'
import test from 'node:test'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { openaiCodexProvider } from '@mastra/code-sdk/providers/openai-codex'
import { invariant, failureOf } from './failure-matchers.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const { providerTool } = await import(hubModuleUrl('builder/harness/controller.js'))
const { languageModelOf } = await import(hubModuleUrl('builder/openai-codex/route.js'))
const { heldCodexCredentials } = await import(hubModuleUrl('builder/openai-codex/credential.js'))

test('the three provider search tools pass the guard unchanged', () => {
  for (const tool of [createOpenAI({}).tools.webSearch(), createAnthropic({}).tools.webSearch_20250305(), createGoogleGenerativeAI({}).tools.googleSearch({})]) {
    assert.equal(providerTool(tool), tool)
  }
})

test('an object that is not a provider tool is refused with the invariant that names it', () => {
  assert.throws(() => providerTool({ id: 'x' }), invariant('PROVIDER_TOOL_SHAPE_REFUSED'))
})

test('the real Codex provider model passes, and a model of another specification version is refused', () => {
  const tokens = { access: 'a', refresh: 'r', expires: Date.now() + 60_000, accountId: 'acct', email: null }
  const real = openaiCodexProvider('gpt-5-codex', { authStorage: heldCodexCredentials(tokens, async () => tokens) })
  assert.equal(languageModelOf(real), real)
  assert.throws(() => languageModelOf({ specificationVersion: 'v2', doStream() {} }), failureOf('OPENAI_CODEX_MODEL_REFUSED'))
})
