import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RequestContext } from '@mastra/core/request-context'
import { hubModuleUrl } from './hub-build.mjs'
import { bindRunContext, RUN_CONTEXT } from './run-context.mjs'
import { hubJsonWrite, opaque, testListener } from './access/test-listener.mjs'
import { fakeModelAccounts } from './model-accounts-fake.mjs'

const built = hubModuleUrl
const { registerModelAccountRoutes } = await import(built('builder/model-accounts.js'))
const { createModelRouting } = await import(built('builder/model-routing.js'))
const { createClaudeHolds, parseClaudeTokens, serializeClaudeTokens } = await import(built('builder/anthropic/credential.js'))
const { createAnthropicRoute } = await import(built('builder/anthropic/route.js'))

const SESSION_TOKEN = opaque('ana')
const ana = '22222222-2222-4222-8222-222222222222'
const bia = '55555555-5555-4555-8555-555555555555'
const RUN_1 = '66666666-6666-4666-8666-666666666661'
const RUN_2 = '66666666-6666-4666-8666-666666666662'
const authentic = {
  headers: hubJsonWrite,
  cookies: { '__Host-conexus_session': SESSION_TOKEN },
}
// Shaped like a Console key, and no key at all.
const fakeKey = `sk-ant-api03-${'x'.repeat(40)}`
const tokens = (label, expires) => ({ access: `access-${label}`, refresh: `refresh-${label}`, expires })

const NAMES = { [ana]: 'Ana', [bia]: 'Bia' }
const write = (modelAccounts, accountId, kind, secret) => modelAccounts.write({ account: { accountId, displayName: NAMES[accountId] }, credential: { provider: 'anthropic', kind }, secret })

// Anthropic's authorization endpoints, scripted: the pasted code `good#verifier-N` is the one Anthropic accepts.
const fakeAuthorization = () => {
  let started = 0
  const exchanged = []
  return {
    authorization: {
      start: async () => {
        started += 1
        return { url: `https://claude.ai/oauth/authorize?attempt=${started}`, verifier: `verifier-${started}` }
      },
      complete: async (pasted, verifier) => {
        exchanged.push([pasted, verifier])
        if (pasted !== `good#${verifier}`) throw new Error('Invalid authorization state')
        return tokens('signed-in', 9_999_999_999_999)
      },
    },
    exchanged,
  }
}

const createApp = async (t) => {
  const { modelAccounts, rows } = fakeModelAccounts()
  const { authorization, exchanged } = fakeAuthorization()
  let caller = ana
  const { app } = await testListener({
    sessions: { [SESSION_TOKEN]: () => ({ account: { accountId: caller, displayName: NAMES[caller] } }) },
    registerRoutes: async (instance) => {
      await registerModelAccountRoutes(instance, {
        modelAccounts,
        defaultThinkingLevel: 'medium',
        claudeAuthorization: authorization,
      })
      return []
    },
  })
  t.after(() => app.close())
  return { app, modelAccounts, rows, exchanged, as: (accountId) => { caller = accountId } }
}

const putKey = (app, key, { provider = 'anthropic', headers = authentic.headers } = {}) =>
  app.inject({ method: 'PUT', url: `/api/control/model-accounts/${provider}/api-key`, headers, cookies: authentic.cookies, payload: { key } })
const accounts = (app) => app.inject({ method: 'GET', url: '/api/control/model-accounts', ...authentic })
const claudeBase = '/api/control/model-accounts/anthropic/oauth'
const startClaude = async (app) => (await app.inject({ method: 'POST', url: `${claudeBase}/start`, ...authentic, payload: {} })).json()
const completeClaude = async (app, loginId, code) =>
  (await app.inject({ method: 'POST', url: `${claudeBase}/complete`, ...authentic, payload: { loginId, code } })).json()
const rowsOf = (rows) => [...rows.values()].map(({ owner, connectedByName, provider, kind }) => ({ owner, connectedByName, provider, kind }))

test('a pasted Anthropic key becomes the person\'s own api_key row, and no answer ever carries it back', async (t) => {
  const { app, rows } = await createApp(t)
  const stored = await putKey(app, `  ${fakeKey}\n`)
  assert.deepEqual([stored.statusCode, stored.body], [204, ''])
  assert.deepEqual(rowsOf(rows), [{ owner: ana, connectedByName: 'Ana', provider: 'anthropic', kind: 'api_key' }])
  assert.equal([...rows.values()][0].secret, fakeKey, 'the row holds the key without the pasted whitespace')

  const listed = await accounts(app)
  assert.deepEqual(listed.json(), { accounts: [
    { provider: 'openai-codex', providerName: 'OpenAI (ChatGPT)', own: { state: 'absent' } },
    { provider: 'anthropic', providerName: 'Anthropic (Claude)', own: { state: 'connected', kind: 'api_key' } },
  ] })
  assert.doesNotMatch(listed.body, /sk-ant-/)
})

test('the key endpoint refuses a write from another origin, a key of the wrong shape and a provider with no API key accounts, and echoes none of them', async (t) => {
  const { app, rows } = await createApp(t)
  const forged = await putKey(app, fakeKey, { headers: { ...hubJsonWrite, origin: 'https://evil.test' } })
  const misshapen = await putKey(app, 'sk-proj-not-an-anthropic-key-0123456789')
  const unknown = await putKey(app, fakeKey, { provider: 'mistral' })
  const inherited = await putKey(app, fakeKey, { provider: 'constructor' })
  assert.deepEqual([forged, misshapen, unknown, inherited].map((reply) => reply.statusCode), [403, 400, 404, 404])
  assert.deepEqual([forged, misshapen, unknown, inherited].map((reply) => reply.json().type), [
    'REQUEST_AUTHENTICITY_DENIED', 'MODEL_ACCOUNT_KEY_REFUSED', 'MODEL_ACCOUNT_PROVIDER_UNKNOWN', 'MODEL_ACCOUNT_PROVIDER_UNKNOWN',
  ].map((type) => `urn:conexus:problem:${type}`))
  for (const reply of [forged, misshapen, unknown, inherited]) assert.doesNotMatch(reply.body, /sk-ant-|sk-proj-/)
  assert.equal(rows.size, 0)
})

test('signing in with a Claude subscription takes the pasted code, stores the tokens as the person\'s own oauth row, and replaces their key', async (t) => {
  const { app, rows, exchanged } = await createApp(t)
  await putKey(app, fakeKey)
  const started = await startClaude(app)
  assert.deepEqual({ url: started.url, expires: Number.isNaN(Date.parse(started.expiresAt)) }, { url: 'https://claude.ai/oauth/authorize?attempt=1', expires: false })

  assert.deepEqual(await completeClaude(app, started.loginId, 'typo#verifier-1'), { state: 'failed' })
  assert.equal([...rows.values()][0].kind, 'api_key', 'a refused code leaves the row as it was')
  assert.deepEqual(await completeClaude(app, started.loginId, 'good#verifier-1'), { state: 'succeeded' }, 'the same sign-in takes a corrected paste')
  assert.deepEqual(exchanged, [['typo#verifier-1', 'verifier-1'], ['good#verifier-1', 'verifier-1']], 'the verifier never left the Hub, and each paste was exchanged with it')

  assert.deepEqual(rowsOf(rows), [{ owner: ana, connectedByName: 'Ana', provider: 'anthropic', kind: 'oauth' }])
  assert.deepEqual(parseClaudeTokens([...rows.values()][0].secret), tokens('signed-in', 9_999_999_999_999))
  const listed = await accounts(app)
  assert.deepEqual(listed.json().accounts[1], { provider: 'anthropic', providerName: 'Anthropic (Claude)', own: { state: 'connected', kind: 'oauth' } })
  assert.deepEqual(await completeClaude(app, started.loginId, 'good#verifier-1'), { state: 'expired' }, 'a finished sign-in is gone')
  assert.doesNotMatch(listed.body, /access-|refresh-/)
})

test('a Claude sign-in belongs to the person who started it, and is completed only by a write from the Hub page', async (t) => {
  const { app, rows, as } = await createApp(t)
  const started = await startClaude(app)
  as(bia)
  assert.deepEqual(await completeClaude(app, started.loginId, 'good#verifier-1'), { state: 'expired' })
  assert.equal(rows.size, 0)
  as(ana)
  const forged = await app.inject({
    method: 'POST', url: `${claudeBase}/complete`, headers: { ...hubJsonWrite, origin: 'https://evil.test' }, cookies: authentic.cookies,
    payload: { loginId: started.loginId, code: 'good#verifier-1' },
  })
  assert.equal(forged.statusCode, 403)
  assert.equal(rows.size, 0)
  const again = await startClaude(app)
  assert.deepEqual(await completeClaude(app, started.loginId, 'good#verifier-1'), { state: 'expired' }, "starting again drops the person's earlier sign-in")
  assert.deepEqual(await completeClaude(app, again.loginId, 'good#verifier-2'), { state: 'succeeded' })
})

// What Mastra's model router catalog lists for anthropic, in its order. It lists claude-fable-5-1 and no claude-sonnet-5-5.
const CATALOG_MODELS = [
  'claude-fable-5', 'claude-fable-5-1', 'claude-haiku-4-5', 'claude-haiku-4-5-20251001', 'claude-opus-4-5', 'claude-opus-4-5-20251101', 'claude-opus-4-6', 'claude-opus-4-7',
  'claude-opus-4-8', 'claude-opus-5', 'claude-opus-5-5', 'claude-sonnet-4-5', 'claude-sonnet-4-5-20250929', 'claude-sonnet-4-6', 'claude-sonnet-5',
]

test("the picker offers every chat model of Mastra's catalog to a person with either kind of own Anthropic account, each with the levels Mastra Code sends it", async (t) => {
  const { app, modelAccounts, as } = await createApp(t)
  const offered = async () => (await app.inject({ method: 'GET', url: '/api/control/model-accounts/models', ...authentic })).json().models
  assert.deepEqual(await offered(), [])
  await putKey(app, fakeKey)
  const claude = await offered()
  assert.deepEqual(claude.map(({ modelName }) => modelName), CATALOG_MODELS)
  const levelsOf = (models) => Object.fromEntries(models.map(({ modelName, thinkingLevels }) => [modelName, thinkingLevels.join(' ')]))
  // Claude 5 and Opus 4.7 and 4.8 take every level; Opus 4.6 and Sonnet 4.6 run xhigh as high, so they skip it; the budget-era models give xhigh and max the same budget, so they skip max.
  assert.deepEqual(levelsOf(claude.filter(({ modelName }) => ['claude-opus-5-5', 'claude-opus-4-7', 'claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-opus-4-5'].includes(modelName))), {
    'claude-haiku-4-5': 'off low medium high xhigh',
    'claude-opus-4-5': 'off low medium high xhigh',
    'claude-opus-4-6': 'off low medium high max',
    'claude-opus-4-7': 'off low medium high xhigh max',
    'claude-opus-5-5': 'off low medium high xhigh max',
    'claude-sonnet-4-6': 'off low medium high max',
  })
  await write(modelAccounts, ana, 'oauth', serializeClaudeTokens(tokens('signed-in', 1)))
  assert.deepEqual(await offered(), claude)
  as(bia)
  assert.deepEqual(await offered(), [], "another person's account offers nothing")
})

const routingOver = ({ modelAccounts, holds = createClaudeHolds({}) }) => {
  const recorded = []
  const routing = createModelRouting({
    routes: { anthropic: createAnthropicRoute(holds) },
    modelAccounts,
    conversationModel: async () => null,
    readDefault: async () => null,
    record: async (builderRunId, _accountId, modelAccountId) => { recorded.push([builderRunId, modelAccountId]) },
  })
  const call = (builderRunId, accountId, modelId) => {
    const requestContext = new RequestContext()
    bindRunContext(requestContext, { ...RUN_CONTEXT, builderRunId, accountId })
    requestContext.set('controller', { session: { modelId, modeId: 'build' } })
    return routing.resolve({ requestContext })
  }
  return { call, recorded }
}

// Records each request a Claude subscription model sends upstream, and refuses it.
const recordUpstream = (t) => {
  const seen = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    const headers = new Headers(init?.headers)
    const body = JSON.parse(init.body)
    seen.push({
      url: String(url), authorization: headers.get('authorization'), apiKey: headers.get('x-api-key'),
      betas: headers.get('anthropic-beta').split(','), model: body.model, system: body.system?.[0]?.text,
    })
    return new Response('upstream refused', { status: 418 })
  }
  t.after(() => { globalThis.fetch = original })
  return seen
}
const prompt = [{ role: 'user', content: [{ type: 'text', text: 'oi' }] }]

// Records each request an Anthropic key model sends upstream, and refuses it.
const recordKeyUpstream = (t) => {
  const seen = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), apiKey: new Headers(init?.headers).get('x-api-key'), model: JSON.parse(init.body).model })
    return new Response('upstream refused', { status: 418 })
  }
  t.after(() => { globalThis.fetch = original })
  return seen
}

test('an Anthropic key pays on the Messages endpoint with the caller\'s key, and the run records the row', async (t) => {
  const { modelAccounts } = fakeModelAccounts()
  await write(modelAccounts, ana, 'api_key', fakeKey)
  const seen = recordKeyUpstream(t)
  const { call, recorded } = routingOver({ modelAccounts })
  await assert.rejects((await call(RUN_1, ana, 'anthropic/claude-sonnet-5')).doStream({ prompt }))
  assert.deepEqual(recorded, [[RUN_1, 'row-1']])
  await assert.rejects(call(RUN_2, bia, 'anthropic/claude-sonnet-5'), /BUILDER_MODEL_NOT_SELECTED/, 'a person without an Anthropic account is told to connect one')
  assert.deepEqual(seen, [{ url: 'https://api.anthropic.com/v1/messages', apiKey: fakeKey, model: 'claude-sonnet-5' }])
})

test('a Claude subscription pays with its bearer on the Messages endpoint, with the betas and identity message Mastra Code sends and no key header', async (t) => {
  const { modelAccounts } = fakeModelAccounts()
  await write(modelAccounts, ana, 'oauth', serializeClaudeTokens(tokens('live', 9_999_999_999_999)))
  const seen = recordUpstream(t)
  const { call } = routingOver({ modelAccounts })
  const model = await call(RUN_1, ana, 'anthropic/claude-opus-5-5')
  assert.equal(model.provider, 'anthropic.messages')
  await assert.rejects(model.doStream({ prompt }))
  assert.equal(seen.length, 1)
  const [{ url, authorization, apiKey, betas, model: sentModel, system }] = seen
  assert.deepEqual({ url, authorization, apiKey, sentModel, system }, {
    url: 'https://api.anthropic.com/v1/messages', authorization: 'Bearer access-live', apiKey: null, sentModel: 'claude-opus-5-5',
    system: "You are Claude Code, Anthropic's official CLI for Claude.",
  })
  assert.deepEqual(betas.slice(0, 2), ['oauth-2025-04-20', 'claude-code-20250219'])
})

test('an expired Claude token is refreshed once, written back to the row, and the request carries the new one (AC-22)', async (t) => {
  const { modelAccounts, rows } = fakeModelAccounts()
  await write(modelAccounts, ana, 'oauth', serializeClaudeTokens(tokens('old', 1_000)))
  const refreshes = []
  const holds = createClaudeHolds({ now: () => 2_000, refresh: async (refreshToken) => { refreshes.push(refreshToken); return tokens('new', 10_000) } })
  const seen = recordUpstream(t)
  const { call } = routingOver({ modelAccounts, holds })
  const model = await call(RUN_1, ana, 'anthropic/claude-sonnet-5')
  await assert.rejects(model.doStream({ prompt }))
  await assert.rejects(model.doStream({ prompt }))
  assert.deepEqual(refreshes, ['refresh-old'])
  assert.deepEqual(parseClaudeTokens(rows.get(`${ana}:anthropic`).secret), tokens('new', 10_000))
  assert.deepEqual(seen.map(({ authorization }) => authorization), ['Bearer access-new', 'Bearer access-new'])
})
