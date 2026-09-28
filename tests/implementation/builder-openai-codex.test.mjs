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

test("a run pays with the caller's own account for its model's provider, else the shared one, and without either it is refused", async () => {
  const { RequestContext } = await import('@mastra/core/request-context')
  const { createModelRouting } = await import(built('builder/model-routing.js'))
  const { store, rows, share } = fakeStore()
  await store.write(ana, 'openai-codex', 'oauth', 'ana-secret')
  await store.write(bia, 'google-ai-pro', 'google_ai_pro', 'bia-google-secret')
  const threadModels = new Map([['conversation-openai', 'openai/gpt-5.6-sol'], ['conversation-claude', 'anthropic/claude-fable-5']])
  let installationDefault = null
  const routing = createModelRouting({
    routes: {
      openai: { accountProvider: 'openai-codex', take: (account) => ({ modelProvider: 'openai', model: async (name) => ({ called: name, with: account.secret }) }) },
      'google-ai-pro': { accountProvider: 'google-ai-pro', take: (account) => ({ modelProvider: 'google-ai-pro', model: async (name) => ({ called: name, with: account.secret }) }) },
    },
    modelAccounts: store,
    modelOf: async (_projectId, conversationId) => threadModels.get(conversationId) ?? null,
    readDefault: async () => installationDefault,
  })
  const hold = (accountId, conversationId, builderRunId = `run-${accountId}-${conversationId}`) =>
    routing.hold({ builderRunId, accountId, projectId: 'project-1', conversationId, mode: 'PLAN' })
  const turn = (builderRunId, modelId) => {
    const requestContext = new RequestContext()
    requestContext.setRaw('conexusBuilderRunId', builderRunId)
    requestContext.set('controller', { session: { modelId } })
    return routing.resolve({ requestContext })
  }
  const rowId = (owner, provider) => rows.get(`${owner}:${provider}`).id

  const anaRun = await hold(ana, 'conversation-openai', 'run-ana')
  assert.equal(anaRun.modelAccountId, rowId(ana, 'openai-codex'))
  assert.deepEqual(await turn('run-ana', 'openai/gpt-5.6-sol'), { called: 'gpt-5.6-sol', with: 'ana-secret' })
  await assert.rejects(turn('run-ana', 'google-ai-pro/gemini-3-flash'), /BUILDER_MODEL_NOT_SELECTED/, 'a switch to another provider mid-run has no account held')

  await assert.rejects(hold(bia, 'conversation-openai'), /BUILDER_MODEL_NOT_SELECTED/, "bia's Google account does not pay for a ChatGPT model")
  share(ana, 'openai-codex')
  assert.equal((await hold(bia, 'conversation-openai')).modelAccountId, rowId(ana, 'openai-codex'), 'the shared row pays when the caller has none')

  await assert.rejects(hold(ana, 'conversation-claude'), /BUILDER_MODEL_NOT_SELECTED/, 'a provider the Hub cannot call')
  await assert.rejects(hold(ana, 'conversation-new'), /BUILDER_MODEL_NOT_SELECTED/, 'no selection and no installation default')
  installationDefault = 'google-ai-pro/gemini-3-flash'
  assert.equal((await hold(bia, 'conversation-new')).modelAccountId, rowId(bia, 'google-ai-pro'), 'the installation default when the conversation chose none')

  anaRun.release()
  await assert.rejects(turn('run-ana', 'openai/gpt-5.6-sol'), /BUILDER_MODEL_NOT_SELECTED/, 'a released run calls nothing')
})

test('a run started in Planejar holds an account for the Construir model too, so a build model from another provider runs after the plan approval', async () => {
  const { RequestContext } = await import('@mastra/core/request-context')
  const { createModelRouting } = await import(built('builder/model-routing.js'))
  const { store, rows } = fakeStore()
  await store.write(ana, 'openai-codex', 'oauth', 'ana-secret')
  await store.write(ana, 'google-ai-pro', 'google_ai_pro', 'ana-google-secret')
  await store.write(bia, 'openai-codex', 'oauth', 'bia-secret')
  const threadModels = { plan: 'openai/gpt-5.6-sol', build: 'google-ai-pro/gemini-3-flash' }
  const routing = createModelRouting({
    routes: {
      openai: { accountProvider: 'openai-codex', take: (account) => ({ modelProvider: 'openai', model: async (name) => ({ called: name, with: account.secret }) }) },
      'google-ai-pro': { accountProvider: 'google-ai-pro', take: (account) => ({ modelProvider: 'google-ai-pro', model: async (name) => ({ called: name, with: account.secret }) }) },
    },
    modelAccounts: store,
    modelOf: async (_projectId, _conversationId, mode) => threadModels[mode],
    readDefault: async () => null,
  })
  const hold = (accountId, builderRunId, mode) => routing.hold({ builderRunId, accountId, projectId: 'project-1', conversationId: 'conversation-1', mode })
  const turn = (builderRunId, modelId) => {
    const requestContext = new RequestContext()
    requestContext.setRaw('conexusBuilderRunId', builderRunId)
    requestContext.set('controller', { session: { modelId } })
    return routing.resolve({ requestContext })
  }

  const planned = await hold(ana, 'run-plan', 'PLAN')
  assert.deepEqual([
    planned.modelAccountId,
    await turn('run-plan', 'openai/gpt-5.6-sol'),
    await turn('run-plan', 'google-ai-pro/gemini-3-flash'),
  ], [
    rows.get(`${ana}:openai-codex`).id,
    { called: 'gpt-5.6-sol', with: 'ana-secret' },
    { called: 'gemini-3-flash', with: 'ana-google-secret' },
  ])
  planned.release()
  await assert.rejects(turn('run-plan', 'google-ai-pro/gemini-3-flash'), /BUILDER_MODEL_NOT_SELECTED/, 'a released run calls neither provider')

  await assert.rejects(hold(bia, 'run-bia-plan', 'PLAN'), /BUILDER_MODEL_NOT_SELECTED/, 'a Planejar run whose Construir model has no account is refused before it starts')
  Object.assign(threadModels, { plan: 'google-ai-pro/gemini-3-flash', build: 'openai/gpt-5.6-sol' })
  assert.equal((await hold(bia, 'run-bia-build', 'BUILD')).modelAccountId, rows.get(`${bia}:openai-codex`).id, 'a Construir run never returns to Planejar, so it holds only its own model')
})
