import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RequestContext } from '@mastra/core/request-context'
import { hubModuleUrl } from './hub-build.mjs'
import { setupModelAccounts } from './model-account-fixture.mjs'
import { ID } from './project-fixture.mjs'
import { OWNER } from './builder-fixture.mjs'
import { query } from './hub-database.mjs'
import { hubJsonWrite, opaque, testListener } from './access/test-listener.mjs'
import { bindRunContext } from './run-context.mjs'
const { AnthropicKey, parseCredential } = await import(hubModuleUrl('model-account/credential.js'))
const { modelAccountContext } = await import(hubModuleUrl('platform/secrets.js'))
const { createBuilderModelRouting } = await import(hubModuleUrl('builder/model-routing.js'))
const { createBuilderStore } = await import(hubModuleUrl('builder/store.js'))
const MDL = ['listAvailableModels', 'listModelAccounts', 'setModelAccountApiKey', 'startClaudeModelLogin', 'completeClaudeModelLogin', 'startCodexModelLogin', 'pollCodexModelLogin', 'getGoogleModelConnection', 'startGoogleModelLogin', 'completeGoogleModelLogin', 'getGoogleModelLoginStatus']
const key = `sk-ant-api03-${'x'.repeat(40)}`
const prompt = [{ role: 'user', content: [{ type: 'text', text: 'oi' }] }]
const token = opaque('model-module-person')
const authentic = { headers: hubJsonWrite, cookies: { '__Host-conexus_session': token } }
async function listener(t, models) {
  let registered
  const { app } = await testListener({ sessions: { [token]: { account: { accountId: ID.owner, displayName: 'Synthetic person' } } }, registerRoutes: async (app) => { registered = await models.registerRoutes(app); return registered } })
  t.after(() => app.close())
  return { app, registered }
}
async function storedCredential(f, provider) {
  const row = (await query(f.connection, 'SELECT * FROM model.model_account WHERE owner_account_id = $1 AND provider = $2', [ID.owner, provider])).rows[0]
  return parseCredential(row, await f.envelope.open(row.secret, modelAccountContext(row.model_account_id)))
}
function context(runId, projectId, modelId, thinkingLevel = 'high') {
  const carried = new RequestContext()
  bindRunContext(carried, { builderRunId: runId, accountId: ID.owner, conversationId: projectId })
  carried.set('controller', { session: { modelId }, getState: () => ({ thinkingLevel }) })
  return carried
}

test('the concrete owner registers all existing routes, preserves account order, key custody and Google-disabled replies', async (t) => {
  const f = await setupModelAccounts(t, 'conexus_model_http')
  const { app, registered } = await listener(t, f.models)
  assert.deepEqual(registered, MDL)
  const empty = await app.inject({ method: 'GET', url: '/api/control/model-accounts/models', ...authentic })
  assert.deepEqual([empty.statusCode, empty.json()], [200, { models: [], defaultThinkingLevel: 'medium' }])
  const wrote = await app.inject({ method: 'PUT', url: '/api/control/model-accounts/anthropic/api-key', ...authentic, payload: { key: ` ${key}\n` } })
  assert.deepEqual([wrote.statusCode, wrote.body], [204, ''])
  assert.deepEqual(await storedCredential(f, 'anthropic'), { provider: 'anthropic', kind: 'api_key', value: key })
  const listed = await app.inject({ method: 'GET', url: '/api/control/model-accounts', ...authentic })
  assert.deepEqual(listed.json(), { accounts: [
    { provider: 'openai-codex', providerName: 'OpenAI (ChatGPT)', own: { state: 'absent' } },
    { provider: 'anthropic', providerName: 'Anthropic (Claude)', own: { state: 'connected', kind: 'api_key' } },
  ] })
  assert.doesNotMatch(listed.body, /sk-ant-|secret|sealed/)
  const models = (await app.inject({ method: 'GET', url: '/api/control/model-accounts/models', ...authentic })).json().models
  assert.equal(models.some((m) => m.id === 'anthropic/claude-sonnet-5'), true)
  assert.equal(models.every((m) => m.provider === 'anthropic'), true)
  const google = await app.inject({ method: 'GET', url: '/api/control/model-accounts/google-ai-pro/connection', ...authentic })
  assert.deepEqual([google.statusCode, google.json().type], [503, 'urn:conexus:problem:MODEL_LOGIN_UNAVAILABLE'])
  const refused = await app.inject({ method: 'PUT', url: '/api/control/model-accounts/anthropic/api-key', ...authentic, payload: { key: 'invalid' } })
  assert.equal(refused.statusCode, 400)
})

test('Builder and memory consume the concrete owner, record the actual payer before native requests, and retain thinking and cache options', async (t) => {
  const f = await setupModelAccounts(t, 'conexus_model_payer')
  const connected = await f.connect({ provider: 'anthropic', kind: 'api_key', value: AnthropicKey.parse(key) })
  const projectId = await f.seedBuilderProject()
  const runId = await f.seedRun(projectId)
  await query(f.connection, "INSERT INTO model.installation_default(role, model_id, updated_by) VALUES ('build', 'anthropic/claude-sonnet-5', $1), ('memory', 'anthropic/claude-haiku-4-5', $1)", [ID.owner])
  const builder = createBuilderStore({ database: f.database, ownerId: OWNER, registry: {} })
  const routing = createBuilderModelRouting({ models: f.models, data: f.database, owner: { ownerId: OWNER }, conversationModel: async () => null,
    record: (builderRunId, accountId, modelAccountId) => builder.recordBuilderRunModelAccount({ builderRunId, accountId, modelAccountId }) })
  await routing.check({ accountId: ID.owner, projectId, conversationId: projectId })
  const seen = []
  const original = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    assert.equal(request.url, 'https://api.anthropic.com/v1/messages')
    const paid = (await query(f.connection, 'SELECT model_account_id FROM builder.builder_run_model_account WHERE builder_run_id = $1', [runId])).rows
    assert.deepEqual(paid, [{ model_account_id: connected.result }])
    seen.push({ key: request.headers.get('x-api-key'), body: await request.json() })
    return new Response('synthetic refusal', { status: 418 })
  }
  t.after(() => { globalThis.fetch = original })
  const carried = context(runId, projectId, 'anthropic/claude-sonnet-5')
  const build = await routing.resolve({ requestContext: carried })
  assert.equal(build.specificationVersion, 'v3')
  await assert.rejects(build.doStream({ prompt }))
  await assert.rejects((await routing.resolveMemory(carried)).doStream({ prompt }))
  assert.deepEqual(seen.map(({ key, body }) => [key, body.model, body.output_config?.effort]), [[key, 'claude-sonnet-5', 'high'], [key, 'claude-haiku-4-5', undefined]])
  assert.deepEqual(seen[0].body.messages.at(-1).content.at(-1).cache_control, { type: 'ephemeral', ttl: '5m' })
})

test('Claude login uses the native PKCE HTTP exchange through the real owner and stores a personal subscription', async (t) => {
  const f = await setupModelAccounts(t, 'conexus_model_claude')
  const { app } = await listener(t, f.models)
  const seen = []
  const original = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    assert.equal(request.url, 'https://console.anthropic.com/v1/oauth/token')
    seen.push(await request.json())
    return Response.json({ access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expires_in: 3600 })
  }
  t.after(() => { globalThis.fetch = original })
  const base = '/api/control/model-accounts/anthropic/oauth'
  const started = await app.inject({ method: 'POST', url: `${base}/start`, ...authentic, payload: {} })
  assert.equal(started.statusCode, 200)
  const { loginId, url } = started.json()
  const state = new URL(url).searchParams.get('state')
  const bad = await app.inject({ method: 'POST', url: `${base}/complete`, ...authentic, payload: { loginId, code: 'wrong#state' } })
  assert.deepEqual([bad.statusCode, bad.json()], [200, { state: 'failed' }])
  assert.equal(seen.length, 0)
  const done = await app.inject({ method: 'POST', url: `${base}/complete`, ...authentic, payload: { loginId, code: `synthetic-code#${state}` } })
  assert.deepEqual([done.statusCode, done.json()], [200, { state: 'succeeded' }])
  const credential = await storedCredential(f, 'anthropic')
  assert.deepEqual([credential.provider, credential.kind, credential.value.access, credential.value.refresh], ['anthropic', 'oauth', 'synthetic-access', 'synthetic-refresh'])
  assert.deepEqual([seen[0].grant_type, seen[0].code, seen[0].state, seen[0].code_verifier], ['authorization_code', 'synthetic-code', state, state])
})

test('the actual owner runs native Codex device HTTP, normalizes missing email and refreshes once before native requests', async (t) => {
  const f = await setupModelAccounts(t, 'conexus_model_codex')
  const { app } = await listener(t, f.models)
  const seen = []
  const jwt = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-provider-account' } })).toString('base64url')}.synthetic`
  const original = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const body = await request.text()
    seen.push({ url: request.url, body, bearer: request.headers.get('authorization'), account: request.headers.get('chatgpt-account-id') })
    if (request.url === 'https://auth.openai.com/api/accounts/deviceauth/usercode') return Response.json({ device_auth_id: 'synthetic-device', user_code: 'ABCD-1234', interval: 1 })
    if (request.url === 'https://auth.openai.com/api/accounts/deviceauth/token') return Response.json({ authorization_code: 'synthetic-code', code_verifier: 'synthetic-verifier' })
    if (request.url === 'https://auth.openai.com/oauth/token') {
      const refreshed = new URLSearchParams(body).get('grant_type') === 'refresh_token'
      return Response.json({ access_token: refreshed ? 'synthetic-rotated' : 'synthetic-initial', refresh_token: refreshed ? 'synthetic-next-refresh' : 'synthetic-spent-refresh', expires_in: 3600, id_token: jwt })
    }
    if (request.url === 'https://chatgpt.com/backend-api/codex/responses') return new Response('synthetic refusal', { status: 418 })
    throw new Error(`unexpected provider fixture URL ${request.url}`)
  }
  t.after(() => { globalThis.fetch = original })
  const base = '/api/control/model-accounts/openai-codex/oauth'
  const started = await app.inject({ method: 'POST', url: `${base}/start`, ...authentic, payload: {} })
  assert.equal(started.statusCode, 200)
  const { loginId, url, userCode, intervalMs } = started.json()
  assert.deepEqual([url, userCode, intervalMs], ['https://auth.openai.com/codex/device', 'ABCD-1234', 1000])
  const done = await app.inject({ method: 'POST', url: `${base}/poll?loginId=${loginId}`, ...authentic, payload: {} })
  assert.deepEqual([done.statusCode, done.json()], [200, { state: 'succeeded' }])
  const stored = await storedCredential(f, 'openai-codex')
  assert.deepEqual([stored.value.accountId, stored.value.email, stored.value.access], ['synthetic-provider-account', null, 'synthetic-initial'])
  await f.connect({ ...stored, value: { ...stored.value, expires: 1000 } })
  const projectId = await f.seedBuilderProject()
  const runId = await f.seedRun(projectId)
  const selected = await f.models.modelFor(f.openRun(runId), { modelId: 'openai/gpt-5.6-sol', thinkingLevel: 'high' })
  assert.equal(selected.ok, true)
  for (let call = 0; call < 2; call++) await assert.rejects(selected.result.model.doStream({ prompt, maxOutputTokens: 24000 }))
  const refreshes = seen.filter(({ url, body }) => url === 'https://auth.openai.com/oauth/token' && new URLSearchParams(body).get('grant_type') === 'refresh_token')
  assert.equal(refreshes.length, 1)
  assert.equal(new URLSearchParams(refreshes[0].body).get('refresh_token'), 'synthetic-spent-refresh')
  const calls = seen.filter(({ url }) => url === 'https://chatgpt.com/backend-api/codex/responses')
  assert.deepEqual(calls.map(({ bearer, account, body }) => [bearer, account, JSON.parse(body).reasoning, JSON.parse(body).max_output_tokens]), Array(2).fill(['Bearer synthetic-rotated', 'synthetic-provider-account', { effort: 'high', summary: 'auto' }, undefined]))
  const rotated = await storedCredential(f, 'openai-codex')
  assert.deepEqual([rotated.value.access, rotated.value.refresh, rotated.value.email], ['synthetic-rotated', 'synthetic-next-refresh', null])
})

for (const provider of ['anthropic', 'openai-codex']) {
  test(`${provider} metadata preflight uses the admitted account and leaves custody checking to the model call`, async (t) => {
    const f = await setupModelAccounts(t, 'conexus_model_preflight')
    const connected = await f.connect(provider === 'anthropic' ? { provider, kind: 'api_key', value: AnthropicKey.parse(key) }
      : { provider, kind: 'oauth', value: { access: 'synthetic', refresh: 'synthetic', expires: 9_999_999_999_999, accountId: 'synthetic', email: null } })
    await query(f.connection, 'UPDATE model.model_account SET secret = $1 WHERE model_account_id = $2', ['conexus:secret:v1:synthetic-damaged-envelope', connected.result])
    const modelId = provider === 'anthropic' ? 'anthropic/claude-sonnet-5' : 'openai/gpt-5.6-sol'
    assert.deepEqual(await f.models.checkBeforeRun(ID.owner, [modelId]), { ok: true, result: undefined })
    assert.deepEqual(await f.models.checkBeforeRun(ID.outsider, [modelId]), { ok: false, error: { code: 'BUILDER_MODEL_NOT_SELECTED' } })
    const projectId = await f.seedBuilderProject()
    const runId = await f.seedRun(projectId)
    const selected = await f.models.modelFor(f.openRun(runId), { modelId, thinkingLevel: null })
    assert.equal(selected.ok, false)
    assert.equal(selected.error.code, 'SECRET_CUSTODY_LOST')
  })
}


test('native Claude refresh is shared by real runs, commits before Messages and adopts a newer stored snapshot', async (t) => {
  const f = await setupModelAccounts(t, 'conexus_model_claude_refresh')
  const connected = await f.connect({ provider: 'anthropic', kind: 'oauth', value: { access: 'synthetic-spent', refresh: 'synthetic-spent-refresh', expires: 1000 } })
  const projects = await Promise.all([f.seedBuilderProject(), f.seedBuilderProject()])
  const runIds = await Promise.all(projects.map((projectId) => f.seedRun(projectId)))
  const selected = await Promise.all(runIds.map((runId) => f.models.modelFor(f.openRun(runId), { modelId: 'anthropic/claude-sonnet-5', thinkingLevel: null })))
  assert.equal(selected.every(({ ok }) => ok), true)
  let release
  const tokenResponse = new Promise((resolve) => { release = resolve })
  let started
  const refreshing = new Promise((resolve) => { started = resolve })
  const requests = []
  const original = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    if (request.url === 'https://console.anthropic.com/v1/oauth/token') {
      requests.push(await request.json())
      started()
      await tokenResponse
      return Response.json({ access_token: 'synthetic-rotated', refresh_token: 'synthetic-next', expires_in: 3600 })
    }
    assert.equal(request.url, 'https://api.anthropic.com/v1/messages')
    assert.equal(request.headers.get('authorization'), 'Bearer synthetic-rotated')
    assert.equal((await storedCredential(f, 'anthropic')).value.access, 'synthetic-rotated')
    return new Response('synthetic refusal', { status: 418 })
  }
  t.after(() => { release(); globalThis.fetch = original })
  const calls = selected.map(({ result }) => assert.rejects(result.model.doStream({ prompt })))
  await refreshing
  release()
  await Promise.all(calls)
  assert.deepEqual(requests.map(({ grant_type, refresh_token }) => [grant_type, refresh_token]), [['refresh_token', 'synthetic-spent-refresh']])
  const row = (await query(f.connection, 'SELECT model_account_id FROM model.model_account')).rows[0]
  assert.equal(row.model_account_id, connected.result)
  await assert.rejects(selected[0].result.model.doStream({ prompt }))
  assert.equal(requests.length, 1)
})

test('actual personal selection refuses absent and unsupported providers, retains defaults and records both model accounts', async (t) => {
  const f = await setupModelAccounts(t, 'conexus_model_selection')
  const anthropic = await f.connect({ provider: 'anthropic', kind: 'api_key', value: AnthropicKey.parse(key) })
  const codex = await f.connect({ provider: 'openai-codex', kind: 'oauth', value: { access: 'synthetic', refresh: 'synthetic', expires: 9_999_999_999_999, accountId: 'synthetic', email: null } })
  const projectId = await f.seedBuilderProject()
  const runId = await f.seedRun(projectId)
  const builder = createBuilderStore({ database: f.database, ownerId: OWNER, registry: {} })
  const routing = createBuilderModelRouting({ models: f.models, data: f.database, owner: { ownerId: OWNER }, conversationModel: async () => null,
    record: (builderRunId, accountId, modelAccountId) => builder.recordBuilderRunModelAccount({ builderRunId, accountId, modelAccountId }) })
  const check = () => routing.check({ accountId: ID.owner, projectId, conversationId: projectId })
  await assert.rejects(check(), { id: 'BUILDER_MODEL_NOT_SELECTED' })
  await query(f.connection, "INSERT INTO model.installation_default(role, model_id, updated_by) VALUES ('build', 'openai/gpt-5.6-sol', $1)", [ID.owner])
  await assert.rejects(check(), { id: 'BUILDER_MODEL_NOT_SELECTED' })
  await query(f.connection, "INSERT INTO model.installation_default(role, model_id, updated_by) VALUES ('memory', 'anthropic/claude-haiku-4-5', $1)", [ID.owner])
  await check()
  assert.deepEqual(await f.models.readDefault(ID.owner, 'build'), 'openai/gpt-5.6-sol')
  const carried = context(runId, projectId, 'openai/gpt-5.6-sol')
  await routing.resolve({ requestContext: carried })
  await routing.resolveMemory(carried)
  assert.deepEqual((await query(f.connection, 'SELECT model_account_id FROM builder.builder_run_model_account ORDER BY model_account_id')).rows.map(({ model_account_id }) => model_account_id), [anthropic.result, codex.result].sort())
  assert.deepEqual(await f.models.modelFor(f.openRun(runId), { modelId: 'unsupported/model', thinkingLevel: null }), { ok: false, error: { code: 'BUILDER_MODEL_NOT_SELECTED' } })
  assert.deepEqual(await f.models.modelFor(f.openRun(runId, ID.member), { modelId: 'openai/gpt-5.6-sol', thinkingLevel: null }), { ok: false, error: { code: 'BUILDER_RUN_NOT_ADMITTED' } })
  carried.set('controller', { session: {}, getState: () => ({ thinkingLevel: 'high' }) })
  await assert.rejects(routing.resolve({ requestContext: carried }), { id: 'BUILDER_MODEL_NOT_SELECTED' })
})
