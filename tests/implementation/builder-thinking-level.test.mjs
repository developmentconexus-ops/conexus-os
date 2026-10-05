import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RequestContext } from '@mastra/core/request-context'
import { hubModuleUrl } from './hub-build.mjs'
import { bindRunContext, RUN_CONTEXT } from './run-context.mjs'

const { createModelRouting } = await import(hubModuleUrl('builder/model-routing.js'))
const { createAnthropicRoute } = await import(hubModuleUrl('builder/anthropic/route.js'))
const { createClaudeHolds, serializeClaudeTokens } = await import(hubModuleUrl('builder/anthropic/credential.js'))
const { createOpenAICodexRoute } = await import(hubModuleUrl('builder/openai-codex/route.js'))
const { createGoogleAiProRoute } = await import(hubModuleUrl('builder/google-ai-pro/route.js'))
const { encodeKey } = await import(hubModuleUrl('builder/google-ai-pro/credential.js'))

const ana = '22222222-2222-4222-8222-222222222222'
const anthropicKey = `sk-ant-api03-${'x'.repeat(40)}`
const googleKey = encodeKey({ fileName: 'antigravity-ana@example.com.json', bytes: new TextEncoder().encode(JSON.stringify({ type: 'antigravity', refresh_token: 'refresh-ana' })) })
const ROUTER = 'http://127.0.0.1:9'
const prompt = [{ role: 'system', content: 'Seja breve.' }, { role: 'user', content: [{ type: 'text', text: 'oi' }] }]

// The rows each route is paid by, one per provider; a stand-in for model.model_account.
const rows = {
  anthropic: { modelAccountId: 'row-anthropic', kind: 'api_key', secret: anthropicKey },
  'openai-codex': { modelAccountId: 'row-codex', kind: 'oauth', secret: JSON.stringify({ type: 'oauth', access: 'access-ana', refresh: 'refresh-ana', expires: 9_999_999_999_999, accountId: 'acct-ana' }) },
  'google-ai-pro': { modelAccountId: 'row-google', kind: 'google_ai_pro', secret: googleKey },
}
const claudeSubscription = { modelAccountId: 'row-claude', kind: 'oauth', secret: serializeClaudeTokens({ access: 'access-ana', refresh: 'refresh-ana', expires: 9_999_999_999_999 }) }

const routingOver = (anthropicRow = rows.anthropic) => createModelRouting({
  routes: {
    anthropic: createAnthropicRoute(createClaudeHolds({ store: { readById: async () => null, rewrite: async () => false } })),
    openai: createOpenAICodexRoute({ hold: (_id, tokens) => async () => tokens }),
    'google-ai-pro': createGoogleAiProRoute({ routerUrl: async () => ROUTER, track: () => {} }),
  },
  modelAccounts: { usable: async (_owner, provider) => provider === 'anthropic' ? anthropicRow : rows[provider] ?? null },
  conversationModel: async () => null,
  readDefault: async (role) => role === 'memory' ? 'anthropic/claude-haiku-4-5' : null,
  record: async () => {},
})

// The request context AgentController gives a call: the session's model and its live state.
const turn = (modelId, state = {}) => {
  const requestContext = new RequestContext()
  bindRunContext(requestContext, { ...RUN_CONTEXT, accountId: ana })
  requestContext.set('controller', { session: { modelId, modeId: 'build' }, getState: () => state })
  return requestContext
}

// Records the one request a model sends upstream, and refuses it.
const sentBy = async (t, model) => {
  const seen = []
  const original = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    seen.push({ url: request.url, headers: request.headers, body: await request.json() })
    return new Response('upstream refused', { status: 418 })
  }
  t.after(() => { globalThis.fetch = original })
  await assert.rejects(model.doStream({ prompt }))
  globalThis.fetch = original
  assert.equal(seen.length, 1)
  return seen[0]
}

// What a request asks of the model's thinking, per provider, in the provider's own wire shape.
const thinkingSent = {
  anthropic: ({ body }) => ({ thinking: body.thinking, effort: body.output_config?.effort }),
  openai: ({ body }) => body.reasoning,
  google: ({ body }) => body.generationConfig?.thinkingConfig,
}

const CASES = [
  // [model the session runs on, the row that pays, the level the person picked, wire shape, what the request asks]
  ['anthropic/claude-sonnet-5', rows.anthropic, 'low', 'anthropic', { thinking: { type: 'adaptive', display: 'summarized' }, effort: 'low' }],
  ['anthropic/claude-sonnet-5', rows.anthropic, 'xhigh', 'anthropic', { thinking: { type: 'adaptive', display: 'summarized' }, effort: 'xhigh' }],
  ['anthropic/claude-haiku-4-5', rows.anthropic, 'high', 'anthropic', { thinking: { type: 'enabled', budget_tokens: 16384 }, effort: undefined }],
  ['anthropic/claude-opus-5-5', claudeSubscription, 'low', 'anthropic', { thinking: { type: 'adaptive', display: 'summarized' }, effort: 'low' }],
  ['anthropic/claude-opus-5-5', claudeSubscription, 'high', 'anthropic', { thinking: { type: 'adaptive', display: 'summarized' }, effort: 'high' }],
  ['openai/gpt-5.6-sol', rows.anthropic, 'low', 'openai', { effort: 'low', summary: 'auto' }],
  ['openai/gpt-5.6-sol', rows.anthropic, 'xhigh', 'openai', { effort: 'xhigh', summary: 'auto' }],
  ['google-ai-pro/gemini-3-flash', rows.anthropic, 'low', 'google', { thinkingLevel: 'low', includeThoughts: true }],
  ['google-ai-pro/gemini-3-flash', rows.anthropic, 'medium', 'google', { thinkingLevel: 'medium', includeThoughts: true }],
  ['google-ai-pro/gemini-3-flash', rows.anthropic, 'high', 'google', { thinkingLevel: 'high', includeThoughts: true }],
  ['google-ai-pro/gemini-3-flash', rows.anthropic, 'xhigh', 'google', { thinkingLevel: 'high', includeThoughts: true }],
  ['google-ai-pro/gemini-3-flash', rows.anthropic, 'off', 'google', undefined],
  ['google-ai-pro/gemini-2.5-pro', rows.anthropic, 'medium', 'google', { thinkingBudget: 8192, includeThoughts: true }],
  ['google-ai-pro/gemini-pro-agent', rows.anthropic, 'high', 'google', undefined],
]

for (const [modelId, row, level, wire, expected] of CASES) {
  test(`${modelId} at ${level} asks the provider for ${JSON.stringify(expected)}`, async (t) => {
    const model = await routingOver(row).resolve({ requestContext: turn(modelId, { thinkingLevel: level }) })
    assert.deepEqual(thinkingSent[wire](await sentBy(t, model)), expected)
  })
}

test('a conversation whose person picked no level runs every provider at medium', async (t) => {
  const asked = []
  for (const [modelId, row, wire] of [['anthropic/claude-sonnet-5', rows.anthropic, 'anthropic'], ['anthropic/claude-opus-5-5', claudeSubscription, 'anthropic'], ['openai/gpt-5.6-sol', rows.anthropic, 'openai'], ['google-ai-pro/gemini-3-flash', rows.anthropic, 'google']]) {
    asked.push(thinkingSent[wire](await sentBy(t, await routingOver(row).resolve({ requestContext: turn(modelId) }))))
  }
  assert.deepEqual(asked, [
    { thinking: { type: 'adaptive', display: 'summarized' }, effort: 'medium' },
    { thinking: { type: 'adaptive', display: 'summarized' }, effort: 'medium' },
    { effort: 'medium', summary: 'auto' },
    { thinkingLevel: 'medium', includeThoughts: true },
  ])
})

test("the memory's calls carry no thinking level: the Builder's level is the conversation's, not the memory's", async (t) => {
  const model = await routingOver().resolveMemory(turn('anthropic/claude-sonnet-5', { thinkingLevel: 'xhigh' }))
  const sent = await sentBy(t, model)
  assert.deepEqual([sent.body.model, sent.body.thinking, sent.body.output_config], ['claude-haiku-4-5', undefined, undefined])
})

test('an Anthropic key request carries the prompt cache breakpoints and the thinking Mastra Code adds to its own key provider', async (t) => {
  const sent = await sentBy(t, await routingOver().resolve({ requestContext: turn('anthropic/claude-sonnet-5', { thinkingLevel: 'high' }) }))
  assert.deepEqual({
    url: sent.url, key: sent.headers.get('x-api-key'),
    system: sent.body.system, lastMessage: sent.body.messages.at(-1).content.at(-1),
    thinking: sent.body.thinking, effort: sent.body.output_config.effort,
  }, {
    url: 'https://api.anthropic.com/v1/messages', key: anthropicKey,
    system: [{ type: 'text', text: 'Seja breve.', cache_control: { type: 'ephemeral', ttl: '5m' } }],
    lastMessage: { type: 'text', text: 'oi', cache_control: { type: 'ephemeral', ttl: '5m' } },
    thinking: { type: 'adaptive', display: 'summarized' }, effort: 'high',
  })
})

test("a Google AI Pro model is Mastra's own Google provider on Gemini's API, through the Hub's router with the person's credential as its key", async (t) => {
  const model = await routingOver().resolve({ requestContext: turn('google-ai-pro/gemini-3.8-flash-high', { thinkingLevel: 'low' }) })
  const sent = await sentBy(t, model)
  assert.deepEqual({
    provider: model.provider, url: sent.url, key: sent.headers.get('x-goog-api-key'), authorization: sent.headers.get('authorization'),
    thinking: sent.body.generationConfig.thinkingConfig,
  }, {
    provider: 'google.generative-ai', url: `${ROUTER}/v1beta/models/gemini-3.8-flash-high:streamGenerateContent?alt=sse`, key: googleKey, authorization: null,
    thinking: { thinkingLevel: 'low', includeThoughts: true },
  })
})

const sse = (events) => new Response(events.map((event) => `${event.event ? `event: ${event.event}\n` : ''}data: ${JSON.stringify(event.data ?? event)}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } })

// Streams one answer from a stand-in upstream that speaks the provider's wire format, through the real SDK model.
const streamedFrom = async (t, model, upstream) => {
  const original = globalThis.fetch
  globalThis.fetch = async () => upstream()
  t.after(() => { globalThis.fetch = original })
  const parts = []
  const reader = (await model.doStream({ prompt })).stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
  }
  globalThis.fetch = original
  const text = (type) => parts.filter((part) => part.type === type).map((part) => part.delta).join('')
  return { reasoning: text('reasoning-delta'), answer: text('text-delta'), finish: parts.find((part) => part.type === 'finish') }
}

test('an Anthropic thinking stream reaches the Builder as reasoning, then the answer, with its cache and reasoning token breakdown', async (t) => {
  const model = await routingOver().resolve({ requestContext: turn('anthropic/claude-sonnet-5', { thinkingLevel: 'high' }) })
  const { reasoning, answer, finish } = await streamedFrom(t, model, () => sse([
    { event: 'message_start', data: { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5', content: [], usage: { input_tokens: 12, cache_creation_input_tokens: 3, cache_read_input_tokens: 40, output_tokens: 1 } } } },
    { event: 'content_block_start', data: { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } } },
    { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'pensando' } } },
    { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } } },
    { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
    { event: 'content_block_start', data: { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } } },
    { event: 'content_block_delta', data: { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Olá' } } },
    { event: 'content_block_stop', data: { type: 'content_block_stop', index: 1 } },
    { event: 'message_delta', data: { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 9 } } },
    { event: 'message_stop', data: { type: 'message_stop' } },
  ]))
  assert.deepEqual({ reasoning, answer, reason: finish.finishReason.unified }, { reasoning: 'pensando', answer: 'Olá', reason: 'stop' })
  assert.deepEqual(finish.usage.inputTokens, { total: 55, noCache: 12, cacheRead: 40, cacheWrite: 3 })
  assert.equal(finish.usage.outputTokens.total, 9)
})

test('a Gemini thinking stream reaches the Builder as reasoning, then the answer, with its thought and cache token breakdown', async (t) => {
  const model = await routingOver().resolve({ requestContext: turn('google-ai-pro/gemini-3-flash', { thinkingLevel: 'high' }) })
  const { reasoning, answer, finish } = await streamedFrom(t, model, () => sse([
    { candidates: [{ content: { role: 'model', parts: [{ text: 'pensando', thought: true }] } }] },
    { candidates: [{ content: { role: 'model', parts: [{ text: 'Olá' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 50, cachedContentTokenCount: 30, candidatesTokenCount: 7, thoughtsTokenCount: 20, totalTokenCount: 77 } },
  ]))
  assert.deepEqual({ reasoning, answer, reason: finish.finishReason.unified }, { reasoning: 'pensando', answer: 'Olá', reason: 'stop' })
  assert.deepEqual(finish.usage.inputTokens, { total: 50, noCache: 20, cacheRead: 30, cacheWrite: undefined })
  assert.deepEqual(finish.usage.outputTokens, { total: 27, text: 7, reasoning: 20 })
})
