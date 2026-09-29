import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const built = hubModuleUrl
const { createHttpApp } = await import(built('http/app.js'))
const { registerModelAccountRoutes } = await import(built('builder/model-accounts.js'))
const { createCodexHolds, parseCodexTokens, serializeCodexTokens } = await import(built('builder/openai-codex/credential.js'))
const { openaiCodexModel } = await import(built('builder/openai-codex/model.js'))

const origin = 'https://conexus.test'
const ana = '22222222-2222-4222-8222-222222222222'
const bia = '55555555-5555-4555-8555-555555555555'
const authentic = {
  headers: { origin, 'x-conexus-csrf': 'csrf-1', 'content-type': 'application/json' },
  cookies: { '__Host-conexus_session': 'session-1', '__Host-conexus_csrf': 'csrf-1' },
}
const tokens = (label, expires) => ({ access: `access-${label}`, refresh: `refresh-${label}`, expires, accountId: 'chatgpt-account-1', email: 'ana@example.com' })

// model.model_account as a recording stand-in; the Postgres-backed store is proven in
// model-account-postgres.test.mjs.
const fakeStore = () => {
  const rows = new Map()
  const key = (owner, provider) => `${owner}:${provider}`
  let nextId = 1
  const shared = (provider) => [...rows.values()].find((row) => row.provider === provider && row.sharing === 'everyone') ?? null
  const held = (row) => row && { modelAccountId: row.id, kind: row.kind, secret: row.secret }
  const store = {
    usable: async (owner, provider) => held(rows.get(key(owner, provider)) ?? shared(provider)),
    connection: async (owner, provider) => ({ mine: rows.has(key(owner, provider)), shared: shared(provider) !== null }),
    hasShared: async (provider) => shared(provider) !== null,
    write: async (owner, provider, kind, secret) => {
      const existing = rows.get(key(owner, provider))
      rows.set(key(owner, provider), { id: existing?.id ?? `row-${nextId++}`, owner, provider, kind, secret, sharing: existing?.sharing ?? 'just_me' })
    },
    readById: async (id) => held([...rows.values()].find((row) => row.id === id) ?? null),
    rewrite: async (id, secret) => {
      const row = [...rows.values()].find((candidate) => candidate.id === id)
      if (!row) return false
      row.secret = secret
      return true
    },
  }
  return { store, rows, share: (owner, provider) => { rows.get(key(owner, provider)).sharing = 'everyone' } }
}

// OpenAI's device endpoints, scripted: each poll answers what the test queued, else "pending".
const fakeDevice = () => {
  const answers = []
  let expiring = false
  let started = 0
  return {
    device: {
      start: async () => {
        started += 1
        const deadlineAt = Date.now() + (expiring ? 50 : 15 * 60_000)
        expiring = false
        return { deviceAuthId: `device-${started}`, userCode: `CODE-${started}`, url: 'https://auth.openai.com/codex/device', intervalMs: 0, deadlineAt }
      },
      poll: async () => answers.shift() ?? { status: 'pending', nextPollMs: 0 },
    },
    answer: (value) => answers.push(value),
    expireSoon: () => { expiring = true },
  }
}

const createApp = async (t) => {
  const { store, rows, share } = fakeStore()
  const { device, answer, expireSoon } = fakeDevice()
  let caller = ana
  let administrator = false
  const app = await createHttpApp({
    registerRoutes: async (instance) => {
      await registerModelAccountRoutes(instance, {
        origin,
        resolveCurrentSession: async (request) => request.cookies['__Host-conexus_session'] ? { account: { accountId: caller } } : null,
        isInstallationAdministrator: async () => administrator,
        modelAccounts: store,
        openaiCodexDevice: device,
      })
      return []
    },
    staticRoot: null,
  })
  t.after(() => app.close())
  return { app, rows, share, answer, expireSoon, as: (accountId) => { caller = accountId }, makeAdministrator: () => { administrator = true } }
}

const base = '/api/control/model-accounts/openai-codex/oauth'
const poll = async (app, loginId) => (await app.inject({ method: 'GET', url: `${base}/poll?loginId=${loginId}`, ...authentic })).json()
const start = async (app) => (await app.inject({ method: 'POST', url: `${base}/start`, ...authentic, payload: {} })).json()

test('signing in with ChatGPT hands the person a device code, and the sign-in stores the tokens as their own just_me oauth row', async (t) => {
  const { app, rows, answer } = await createApp(t)
  const started = await app.inject({ method: 'POST', url: `${base}/start`, ...authentic, payload: {} })
  assert.equal(started.statusCode, 200)
  const { loginId, url, userCode, intervalMs, expiresAt } = started.json()
  assert.deepEqual({ url, userCode, intervalMs }, { url: 'https://auth.openai.com/codex/device', userCode: 'CODE-1', intervalMs: 0 })
  assert.equal(Number.isNaN(Date.parse(expiresAt)), false)

  assert.deepEqual(await poll(app, loginId), { state: 'waiting' })
  answer({ status: 'complete', credentials: tokens('signed-in', Date.now() + 3_600_000) })
  assert.deepEqual(await poll(app, loginId), { state: 'succeeded' })
  assert.deepEqual(await poll(app, loginId), { state: 'succeeded' }, 'a settled sign-in answers the same again')

  assert.deepEqual([...rows.values()].map(({ owner, provider, kind, sharing }) => ({ owner, provider, kind, sharing })),
    [{ owner: ana, provider: 'openai-codex', kind: 'oauth', sharing: 'just_me' }])
  assert.deepEqual(parseCodexTokens([...rows.values()][0].secret), tokens('signed-in', parseCodexTokens([...rows.values()][0].secret).expires))

  const accounts = await app.inject({ method: 'GET', url: '/api/control/model-accounts', ...authentic })
  assert.deepEqual(accounts.json(), { administrator: false, accounts: [{ provider: 'openai-codex', mine: true, shared: false }] })
  for (const body of [started.body, accounts.body]) assert.doesNotMatch(body, /access-|refresh-/, 'no token ever reaches the browser')
})

test('a sign-in belongs to the person who started it, and it expires', async (t) => {
  const { app, rows, answer, expireSoon, as } = await createApp(t)
  const first = await start(app)
  as(bia)
  assert.deepEqual(await poll(app, first.loginId), { state: 'expired' }, 'another person cannot see or finish it')
  answer({ status: 'complete', credentials: tokens('stolen', Date.now() + 3_600_000) })
  assert.deepEqual(await poll(app, first.loginId), { state: 'expired' })
  assert.equal(rows.size, 0, "another person's poll never settles someone else's sign-in")

  as(ana)
  assert.deepEqual(await poll(app, first.loginId), { state: 'succeeded' }, 'its own person settles it')
  assert.deepEqual([...rows.values()].map(({ owner }) => owner), [ana])

  const second = await start(app)
  const third = await start(app)
  assert.notEqual(third.loginId, second.loginId)
  assert.deepEqual(await poll(app, second.loginId), { state: 'expired' }, "starting again drops the person's earlier sign-in")

  expireSoon()
  const late = await start(app)
  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.deepEqual(await poll(app, late.loginId), { state: 'expired' })
  assert.deepEqual(await poll(app, 'not-a-login-id'), { state: 'expired' })

  const refused = await start(app)
  answer({ status: 'failed', error: 'denied' })
  assert.deepEqual(await poll(app, refused.loginId), { state: 'failed' })
  assert.equal(rows.size, 1)
})

test('the sign-in routes need a Hub session, and starting one needs the CSRF pair', async (t) => {
  const { app } = await createApp(t)
  const forged = await app.inject({ method: 'POST', url: `${base}/start`, headers: { origin, 'content-type': 'application/json' }, cookies: authentic.cookies, payload: {} })
  assert.equal(forged.statusCode, 403)
  const anonymous = await app.inject({ method: 'GET', url: `${base}/poll?loginId=x`, headers: {} })
  assert.equal(anonymous.statusCode, 401)
  const accounts = await app.inject({ method: 'GET', url: '/api/control/model-accounts', headers: {} })
  assert.equal(accounts.statusCode, 401)
})

test('the picker offers the ChatGPT models from the model router catalog only to a person with a usable account, own or shared', async (t) => {
  const { app, answer, as, share } = await createApp(t)
  const offered = async (query = '') => (await app.inject({ method: 'GET', url: `/api/control/model-accounts/models${query}`, ...authentic })).json().models
  assert.deepEqual([await offered(), await offered('?scope=installation')], [[], []])

  const { loginId } = await start(app)
  answer({ status: 'complete', credentials: tokens('signed-in', Date.now() + 3_600_000) })
  assert.deepEqual(await poll(app, loginId), { state: 'succeeded' })

  const mine = await offered()
  const ids = mine.map(({ id }) => id)
  assert.deepEqual(mine.find(({ id }) => id === 'openai/gpt-5.6-sol'), { id: 'openai/gpt-5.6-sol', provider: 'openai', modelName: 'ChatGPT gpt-5.6-sol', hasApiKey: true })
  for (const present of ['openai/gpt-5.4-mini', 'openai/gpt-5.3-codex']) assert.equal(ids.includes(present), true, present)
  for (const absent of ['openai/gpt-4', 'openai/o1', 'openai/gpt-image-1', 'openai/gpt-image-2', 'openai/chatgpt-image-latest', 'openai/text-embedding-3-large', 'openai/gpt-realtime-2.1']) {
    assert.equal(ids.includes(absent), false, `${absent} is deprecated or cannot chat`)
  }
  assert.deepEqual(await offered('?scope=installation'), [], 'a just_me account is not the installation\'s')

  as(bia)
  assert.deepEqual(await offered(), [], 'another person without an account is offered nothing')
  share(ana, 'openai-codex')
  assert.deepEqual((await offered()).map(({ id }) => id), ids)
  assert.deepEqual((await offered('?scope=installation')).map(({ id }) => id), ids)
})

test('an expired token is refreshed once for every run holding the row, and written back before any call uses it (AC-22)', async () => {
  const { store, rows } = fakeStore()
  await store.write(ana, 'openai-codex', 'oauth', serializeCodexTokens(tokens('old', 1_000)))
  const rowId = [...rows.values()][0].id
  const refreshes = []
  let clock = 2_000
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const holds = createCodexHolds({
    store,
    now: () => clock,
    refresh: async (refreshToken, accountId, email) => {
      refreshes.push({ refreshToken, accountId, email })
      await gate
      return tokens('new', 10_000)
    },
  })
  const runA = holds.hold(rowId, tokens('old', 1_000))
  const runB = holds.hold(rowId, tokens('old', 1_000))
  const calls = Promise.all([runA(), runB()])
  await new Promise((resolve) => setImmediate(resolve))
  release()
  assert.deepEqual(await calls, [{ accessToken: 'access-new', accountId: 'chatgpt-account-1' }, { accessToken: 'access-new', accountId: 'chatgpt-account-1' }])
  assert.deepEqual(refreshes, [{ refreshToken: 'refresh-old', accountId: 'chatgpt-account-1', email: 'ana@example.com' }], 'one refresh for both runs')
  assert.deepEqual(parseCodexTokens(rows.get(`${ana}:openai-codex`).secret), tokens('new', 10_000), 'the row holds the refreshed tokens')

  // A run that took the row before the refresh adopts the stored tokens instead of spending the used refresh token.
  const runC = holds.hold(rowId, tokens('old', 1_000))
  assert.deepEqual(await runC(), { accessToken: 'access-new', accountId: 'chatgpt-account-1' })
  assert.equal(refreshes.length, 1)

  clock = 5_000
  assert.deepEqual(await runA(), { accessToken: 'access-new', accountId: 'chatgpt-account-1' }, 'a live token is used as it is')

  await store.rewrite(rowId, serializeCodexTokens(tokens('new', 1_000)))
  rows.clear()
  await assert.rejects(holds.hold(rowId, tokens('new', 1_000))(), /BUILDER_MODEL_NOT_SELECTED/, 'a disconnected account ends the run the way a missing one does')
})

test('a ChatGPT model calls the Codex endpoint with the held bearer, the account header and the Codex options', async (t) => {
  const seen = []
  const original = globalThis.fetch
  globalThis.fetch = async (request) => {
    seen.push({ url: request.url, authorization: request.headers.get('authorization'), account: request.headers.get('chatgpt-account-id'), originator: request.headers.get('originator'), body: JSON.parse(await request.text()) })
    return new Response('upstream refused', { status: 418 })
  }
  t.after(() => { globalThis.fetch = original })
  const model = openaiCodexModel('gpt-5.1', async () => ({ accessToken: 'access-live', accountId: 'chatgpt-account-1' }))
  assert.equal(model.provider, 'openai.responses')
  await assert.rejects(model.doStream({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'oi' }] }] }))
  assert.equal(seen.length, 1)
  const [{ url, authorization, account, originator, body }] = seen
  assert.deepEqual({ url, authorization, account, originator }, {
    url: 'https://chatgpt.com/backend-api/codex/responses', authorization: 'Bearer access-live', account: 'chatgpt-account-1', originator: 'mastracode',
  })
  assert.deepEqual({ model: body.model, store: body.store, reasoning: body.reasoning, stream: body.stream }, { model: 'gpt-5.1-codex', store: false, reasoning: { effort: 'medium' }, stream: true })
  assert.match(body.instructions, /^You are an interactive CLI tool/)
})

const routesOver = (holds = null) => ({
  openai: {
    accountProvider: 'openai-codex',
    take: (account) => {
      const bearer = holds?.hold(account.modelAccountId, parseCodexTokens(account.secret))
      return { modelProvider: 'openai', model: async (name) => ({ called: name, with: bearer ? (await bearer()).accessToken : account.secret }) }
    },
  },
  'google-ai-pro': { accountProvider: 'google-ai-pro', take: (account) => ({ modelProvider: 'google-ai-pro', model: async (name) => ({ called: name, with: account.secret }) }) },
})

const routingOver = async ({ store, threadModels = {}, installationDefault = () => null, routes = routesOver() }) => {
  const { RequestContext } = await import('@mastra/core/request-context')
  const { createModelRouting } = await import(built('builder/model-routing.js'))
  const recorded = []
  const routing = createModelRouting({
    routes,
    modelAccounts: store,
    modelOf: async (_projectId, _conversationId, mode) => threadModels[mode] ?? null,
    readDefault: async () => installationDefault(),
    record: async (builderRunId, modelAccountId) => { recorded.push([builderRunId, modelAccountId]) },
  })
  const call = (builderRunId, accountId, modelId, modeId = 'build') => {
    const requestContext = new RequestContext()
    requestContext.setRaw('conexusBuilderRunId', builderRunId)
    requestContext.setRaw('conexusBuilderAccountId', accountId)
    requestContext.set('controller', { session: { modelId, modeId } })
    return routing.resolve({ requestContext })
  }
  const check = (accountId, mode = 'PLAN') => routing.check({ accountId, projectId: 'project-1', conversationId: 'conversation-1', mode })
  return { call, check, recorded }
}

test("a model call pays with the caller's own account for its model's provider, else the shared one; without either it fails with the connect-a-model message", async () => {
  const { store, share } = fakeStore()
  await store.write(ana, 'openai-codex', 'oauth', 'ana-secret')
  await store.write(bia, 'google-ai-pro', 'google_ai_pro', 'bia-google-secret')
  const { call, check } = await routingOver({ store, threadModels: { plan: 'openai/gpt-5.6-sol' } })

  assert.deepEqual(await call('run-ana', ana, 'openai/gpt-5.6-sol'), { called: 'gpt-5.6-sol', with: 'ana-secret' })
  await assert.rejects(check(bia), /BUILDER_MODEL_NOT_SELECTED/, "bia's Google account does not pay for a ChatGPT model")
  await assert.rejects(call('run-bia', bia, 'openai/gpt-5.6-sol'), /BUILDER_MODEL_NOT_SELECTED/)
  share(ana, 'openai-codex')
  assert.deepEqual(await call('run-bia', bia, 'openai/gpt-5.6-sol'), { called: 'gpt-5.6-sol', with: 'ana-secret' }, 'the shared row pays when the caller has none')
  await assert.doesNotReject(check(bia))
})

test('a model for a provider the Hub cannot call is refused with the connect-a-model message', async () => {
  const { store } = fakeStore()
  await store.write(ana, 'openai-codex', 'oauth', 'ana-secret')
  const { call } = await routingOver({ store })
  await assert.rejects(call('run-ana', ana, 'anthropic/claude-fable-5'), /BUILDER_MODEL_NOT_SELECTED/)
})

test("the installation's default answers when the session chose no model", async () => {
  const { store } = fakeStore()
  await store.write(bia, 'google-ai-pro', 'google_ai_pro', 'bia-google-secret')
  let installationDefault = null
  const { call } = await routingOver({ store, installationDefault: () => installationDefault })
  await assert.rejects(call('run-bia', bia, ''), /BUILDER_MODEL_NOT_SELECTED/, 'no selection and no installation default')
  installationDefault = 'google-ai-pro/gemini-3-flash'
  assert.deepEqual(await call('run-bia', bia, ''), { called: 'gemini-3-flash', with: 'bia-google-secret' })
})

test('a run planned on ChatGPT and built on Google AI Pro pays each call with that model\'s account and records both', async () => {
  const { store, rows } = fakeStore()
  await store.write(ana, 'openai-codex', 'oauth', 'ana-secret')
  await store.write(ana, 'google-ai-pro', 'google_ai_pro', 'ana-google-secret')
  const { call, recorded } = await routingOver({ store })

  assert.deepEqual(await call('run-1', ana, 'openai/gpt-5.6-sol', 'plan'), { called: 'gpt-5.6-sol', with: 'ana-secret' })
  assert.deepEqual(await call('run-1', ana, 'google-ai-pro/gemini-3-flash', 'build'), { called: 'gemini-3-flash', with: 'ana-google-secret' })
  assert.deepEqual(recorded, [['run-1', rows.get(`${ana}:openai-codex`).id], ['run-1', rows.get(`${ana}:google-ai-pro`).id]])
})

test('a fresh conversation with a model only for Planejar starts: the start check reads the start mode alone', async () => {
  const { store } = fakeStore()
  await store.write(ana, 'openai-codex', 'oauth', 'ana-secret')
  await store.write(bia, 'google-ai-pro', 'google_ai_pro', 'bia-google-secret')
  const { check } = await routingOver({ store, threadModels: { plan: 'openai/gpt-5.6-sol', build: null } })
  await assert.doesNotReject(check(ana, 'PLAN'))
  await assert.rejects(check(bia, 'PLAN'), /BUILDER_MODEL_NOT_SELECTED/, 'the one model the run starts on has no account')
})

test('a ChatGPT token refreshed on one call is written back once, and the next call reads it from the row', async () => {
  const { store, rows } = fakeStore()
  await store.write(ana, 'openai-codex', 'oauth', serializeCodexTokens(tokens('old', 1_000)))
  const refreshes = []
  const holds = createCodexHolds({
    store,
    now: () => 2_000,
    refresh: async (refreshToken) => { refreshes.push(refreshToken); return tokens('new', 10_000) },
  })
  const { call } = await routingOver({ store, routes: routesOver(holds) })
  const answers = [await call('run-1', ana, 'openai/gpt-5.6-sol'), await call('run-1', ana, 'openai/gpt-5.6-sol')]
  assert.deepEqual(answers, [{ called: 'gpt-5.6-sol', with: 'access-new' }, { called: 'gpt-5.6-sol', with: 'access-new' }])
  assert.deepEqual(refreshes, ['refresh-old'])
  assert.deepEqual(parseCodexTokens(rows.get(`${ana}:openai-codex`).secret), tokens('new', 10_000))
})
