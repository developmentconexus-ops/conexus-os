import assert from 'node:assert/strict'
import test from 'node:test'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { invariant } from './failure-matchers.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const { providerTool } = await import(hubModuleUrl('builder/harness/controller.js'))
test('the three provider search tools pass the guard unchanged', () => {
  for (const tool of [createOpenAI({}).tools.webSearch(), createAnthropic({}).tools.webSearch_20250305(), createGoogleGenerativeAI({}).tools.googleSearch({})]) {
    assert.equal(providerTool(tool), tool)
  }
})

test('an object that is not a provider tool is refused with the invariant that names it', () => {
  assert.throws(() => providerTool({ id: 'x' }), invariant('PROVIDER_TOOL_SHAPE_REFUSED'))
})

test('the native Codex leaf returns the AI SDK v3 model that Builder calls', async () => {
  const { codexModel } = await import('./codex-model.mjs')
  const model = await codexModel('gpt-5-codex', { access: 'a', refresh: 'r', expires: 9_999_999_999_999, accountId: 'acct', email: null })
  assert.equal(model.specificationVersion, 'v3')
  for (const operation of ['doGenerate', 'doStream']) assert.equal(typeof model[operation], 'function')
})
