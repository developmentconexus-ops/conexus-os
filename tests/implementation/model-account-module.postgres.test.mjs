import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from 'node:net'
import { RequestContext } from '@mastra/core/request-context'
import { hubModuleUrl } from './hub-build.mjs'
import { setupModelAccounts } from './model-account-fixture.mjs'
import { ID, PASSWORD } from './project-fixture.mjs'
import { OWNER } from './builder-fixture.mjs'
import { query } from './hub-database.mjs'
import { refuseProtectedCluster } from './protected-cluster.mjs'
import { hubJsonWrite, opaque, testListener } from './access/test-listener.mjs'
import { bindRunContext } from './run-context.mjs'
const { AnthropicKey, parseCredential } = await import(hubModuleUrl('model-account/credential.js'))
const { createCredentialRefresh } = await import(hubModuleUrl('model-account/refresh.js'))
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
function codexStream() {
  const events = [
    { type: 'response.created', response: { id: 'resp-1', model: 'gpt-5.6-sol', created_at: 1 } },
    { type: 'response.output_item.added', output_index: 0, item: { type: 'reasoning', id: 'rs-1' } },
    { type: 'response.reasoning_summary_part.added', item_id: 'rs-1', summary_index: 0 },
    { type: 'response.reasoning_summary_text.delta', item_id: 'rs-1', summary_index: 0, delta: 'pensando' },
    { type: 'response.output_item.done', output_index: 0, item: { type: 'reasoning', id: 'rs-1', summary: [{ type: 'summary_text', text: 'pensando' }] } },
    { type: 'response.output_item.added', output_index: 1, item: { type: 'message', id: 'msg-1' } },
    { type: 'response.output_text.delta', item_id: 'msg-1', output_index: 1, content_index: 0, delta: 'oi' },
    { type: 'response.output_item.done', output_index: 1, item: { type: 'message', id: 'msg-1', content: [{ type: 'output_text', text: 'oi' }] } },
    { type: 'response.completed', response: { id: 'resp-1', usage: { input_tokens: 1, output_tokens: 2 } } },
  ]
  return new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } })
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
    assert.deepEqual(paid, [{ model_account_id: connected }])
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
    if (request.url === 'https://chatgpt.com/backend-api/codex/responses') return codexStream()
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
  for (let call = 0; call < 2; call++) {
    const { stream } = await selected.result.model.doStream({ prompt, maxOutputTokens: 24000 })
    const parts = []
    for await (const part of stream) parts.push(part)
    assert.deepEqual(parts.map(({ type }) => type), ['stream-start', 'response-metadata', 'reasoning-start', 'reasoning-delta', 'reasoning-end', 'text-start', 'text-delta', 'text-end', 'finish'])
    assert.deepEqual(parts.filter(({ type }) => type === 'reasoning-delta').map(({ delta }) => delta), ['pensando'])
    assert.deepEqual(parts.filter(({ type }) => type === 'text-delta').map(({ delta }) => delta), ['oi'])
    assert.equal(parts.find(({ type }) => type === 'finish').finishReason.unified, 'stop')
  }
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
    await query(f.connection, 'UPDATE model.model_account SET secret = $1 WHERE model_account_id = $2', ['conexus:secret:v1:synthetic-damaged-envelope', connected])
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
  assert.equal(row.model_account_id, connected)
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
  assert.deepEqual((await query(f.connection, 'SELECT model_account_id FROM builder.builder_run_model_account ORDER BY model_account_id')).rows.map(({ model_account_id }) => model_account_id), [anthropic, codex].sort())
  assert.deepEqual(await f.models.modelFor(f.openRun(runId), { modelId: 'unsupported/model', thinkingLevel: null }), { ok: false, error: { code: 'BUILDER_MODEL_NOT_SELECTED' } })
  await assert.rejects(f.models.modelFor(f.openRun(runId, ID.member), { modelId: 'openai/gpt-5.6-sol', thinkingLevel: null }), { id: 'BUILDER_RUN_NOT_ADMITTED' })
  carried.set('controller', { session: {}, getState: () => ({ thinkingLevel: 'high' }) })
  await assert.rejects(routing.resolve({ requestContext: carried }), { id: 'BUILDER_MODEL_NOT_SELECTED' })
})

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}
async function pausedClaude(t, f) {
  const started = deferred()
  const release = deferred()
  const requests = []
  const original = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    if (request.url === 'https://console.anthropic.com/v1/oauth/token') {
      assert.deepEqual((await query(f.connection, "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND usename = 'hub_runtime' AND state = 'idle in transaction'")).rows, [{ count: 0 }])
      requests.push({ kind: 'refresh', body: await request.json() })
      started.resolve()
      await release.promise
      return Response.json({ access_token: 'synthetic-rotated', refresh_token: 'synthetic-next', expires_in: 3600 })
    }
    assert.equal(request.url, 'https://api.anthropic.com/v1/messages')
    requests.push({ kind: 'model', bearer: request.headers.get('authorization') })
    assert.equal(request.headers.get('authorization'), `Bearer ${(await storedCredential(f, 'anthropic')).value.access}`)
    return new Response('synthetic refusal', { status: 418 })
  }
  t.after(() => { release.resolve(); globalThis.fetch = original })
  return { started, release, requests }
}
async function expiredClaude(f) {
  return f.connect({ provider: 'anthropic', kind: 'oauth', value: { access: 'synthetic-spent', refresh: 'synthetic-spent-refresh', expires: 1000 } })
}
async function selectedClaude(f, openRun) {
  const selected = await f.models.modelFor(openRun, { modelId: 'anthropic/claude-sonnet-5', thinkingLevel: null })
  assert.equal(selected.ok, true)
  return selected.result.model
}
function refusalOf(model) { return model.doStream({ prompt }).then(() => { throw new Error('fixture unexpectedly succeeded') }, (error) => error) }

test('every native refresh waiter rereads its own current authority after the shared rotation commits', async (t) => {
  const f = await setupModelAccounts(t, 'conexus_model_waiters')
  await expiredClaude(f)
  await query(f.connection, "INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'member')", [ID.owner, ID.otherWorkspace])
  const winnerRun = await f.seedRun(await f.seedBuilderProject())
  const peerRun = await f.seedRun(await f.seedBuilderProject('Synthetic peer', ID.otherWorkspace))
  const prewait = deferred()
  let reads = 0
  const peerOpenRun = async (work) => {
    const attempt = ++reads
    const result = await f.openRun(peerRun)(work)
    if (attempt === 2) prewait.resolve()
    return result
  }
  const winner = await selectedClaude(f, f.openRun(winnerRun))
  const peer = await selectedClaude(f, peerOpenRun)
  const provider = await pausedClaude(t, f)
  const winnerCall = refusalOf(winner)
  await provider.started.promise
  const peerCall = refusalOf(peer)
  await prewait.promise
  await query(f.connection, 'DELETE FROM iam.workspace_membership WHERE account_id = $1 AND workspace_id = $2', [ID.owner, ID.otherWorkspace])
  provider.release.resolve()
  const [winnerError, peerError] = await Promise.all([winnerCall, peerCall])
  assert.equal(peerError.id, 'PROJECT_NOT_FOUND')
  assert.equal(winnerError.statusCode, 418)
  assert.equal(provider.requests.filter(({ kind }) => kind === 'refresh').length, 1)
  assert.deepEqual(provider.requests.filter(({ kind }) => kind === 'model'), [{ kind: 'model', bearer: 'Bearer synthetic-rotated' }])
  assert.equal(reads, 3)
})

test('an ended winning run keeps the successfully rotated row but cannot receive its native bearer', async (t) => {
  const f = await setupModelAccounts(t, 'conexus_model_ended_winner')
  await expiredClaude(f)
  const projectId = await f.seedBuilderProject()
  const runId = await f.seedRun(projectId)
  const model = await selectedClaude(f, f.openRun(runId))
  const provider = await pausedClaude(t, f)
  const call = refusalOf(model)
  await provider.started.promise
  await query(f.connection, "UPDATE builder.builder_run SET state = 'SUCCEEDED', result_kind = 'RESPONSE_ONLY', finished_at = clock_timestamp() WHERE builder_run_id = $1", [runId])
  provider.release.resolve()
  assert.equal((await call).id, 'BUILDER_RUN_NOT_ADMITTED')
  assert.equal((await storedCredential(f, 'anthropic')).value.access, 'synthetic-rotated')
  assert.equal(provider.requests.filter(({ kind }) => kind === 'model').length, 0)
  const next = await selectedClaude(f, f.openRun(await f.seedRun(projectId)))
  assert.equal((await refusalOf(next)).statusCode, 418)
  assert.equal(provider.requests.filter(({ kind }) => kind === 'refresh').length, 1)
})


for (const change of ['oauth reconnect', 'key reconnect', 'disconnect']) {
  test(`an in-flight native refresh cannot overwrite ${change}, and a current caller reads the winning row`, async (t) => {
    const f = await setupModelAccounts(t, 'conexus_model_native_cas')
    const connected = await expiredClaude(f)
    const runId = await f.seedRun(await f.seedBuilderProject())
    const model = await selectedClaude(f, f.openRun(runId))
    const provider = await pausedClaude(t, f)
    const call = refusalOf(model)
    await provider.started.promise
    const replacement = change === 'key reconnect' ? { provider: 'anthropic', kind: 'api_key', value: AnthropicKey.parse(key) }
      : { provider: 'anthropic', kind: 'oauth', value: { access: 'synthetic-reconnected', refresh: 'synthetic-new-login', expires: 9_999_999_999_999 } }
    if (change === 'disconnect') await query(f.connection, 'DELETE FROM model.model_account WHERE model_account_id = $1', [connected])
    else assert.equal((await f.connect(replacement)), connected)
    provider.release.resolve()
    assert.equal((await call).id, 'BUILDER_MODEL_NOT_SELECTED')
    assert.equal(provider.requests.filter(({ kind }) => kind === 'model').length, 0)
    const next = await f.hold(runId, 'anthropic')
    if (change === 'disconnect') assert.deepEqual(next, { ok: false, error: { code: 'BUILDER_MODEL_NOT_SELECTED' } })
    else {
      assert.deepEqual(next.result.credential, replacement)
      assert.deepEqual(await storedCredential(f, 'anthropic'), replacement)
      if (change === 'oauth reconnect') {
        assert.equal((await refusalOf(await selectedClaude(f, f.openRun(runId)))).statusCode, 418)
        assert.deepEqual(provider.requests.filter(({ kind }) => kind === 'model'), [{ kind: 'model', bearer: 'Bearer synthetic-reconnected' }])
      }
    }
    assert.equal(provider.requests.filter(({ kind }) => kind === 'refresh').length, 1)
  })
}

test('a pre-wait snapshot straddling another refresh rereads the committed bytes without spending the token twice', async (t) => {
  const f = await setupModelAccounts(t, 'conexus_model_refresh_snapshot')
  await expiredClaude(f)
  const projects = await Promise.all([f.seedBuilderProject(), f.seedBuilderProject()])
  const [winnerRun, peerRun] = await Promise.all(projects.map((projectId) => f.seedRun(projectId)))
  const snapshot = deferred()
  const resume = deferred()
  let reads = 0
  const peerOpenRun = async (work) => {
    const result = await f.openRun(peerRun)(work)
    if (++reads === 2) { snapshot.resolve(); await resume.promise }
    return result
  }
  const winner = await selectedClaude(f, f.openRun(winnerRun))
  const peer = await selectedClaude(f, peerOpenRun)
  const provider = await pausedClaude(t, f)
  t.after(() => resume.resolve())
  const peerCall = refusalOf(peer)
  await snapshot.promise
  const winnerCall = refusalOf(winner)
  await provider.started.promise
  provider.release.resolve()
  assert.equal((await winnerCall).statusCode, 418)
  resume.resolve()
  assert.equal((await peerCall).statusCode, 418)
  assert.equal(provider.requests.filter(({ kind }) => kind === 'refresh').length, 1)
  assert.equal(provider.requests.filter(({ kind }) => kind === 'model').length, 2)
  assert.equal(reads, 4)
})

test('post-settlement custody refusal carries the actual current row and spent bytes', async (t) => {
  const f = await setupModelAccounts(t, 'conexus_model_refresh_custody')
  const connected = await expiredClaude(f)
  await f.connect({ provider: 'anthropic', kind: 'oauth', value: { access: 'synthetic-member', refresh: 'synthetic-member', expires: 9_999_999_999_999 } }, ID.member)
  const runId = await f.seedRun(await f.seedBuilderProject())
  const held = (await f.hold(runId, 'anthropic')).result
  const refresh = createCredentialRefresh(f.store, f.persist)
  const provider = await pausedClaude(t, f)
  const current = refresh.current(f.openRun(runId), held)
  await provider.started.promise
  const copied = (await query(f.connection, 'SELECT secret FROM model.model_account WHERE owner_account_id = $1', [ID.member])).rows[0].secret
  await query(f.connection, 'UPDATE model.model_account SET secret = $1 WHERE model_account_id = $2', [copied, connected])
  provider.release.resolve()
  const rejected = await current
  assert.equal(rejected.ok, false)
  assert.deepEqual([rejected.error.code, rejected.error.row.modelAccountId, rejected.error.spent], ['SECRET_CUSTODY_LOST', connected, copied])
  assert.equal(provider.requests.filter(({ kind }) => kind === 'model').length, 0)
})


async function availablePort() {
  const server = createServer()
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const port = server.address().port
  await new Promise((done) => server.close(done))
  return port
}

test('the actual Hub composes personal routes without Builder, runs its jobs and closes before releasing the database lock', async (t) => {
  const f = await setupModelAccounts(t, 'conexus_model_hub')
  const root = mkdtempSync(join(tmpdir(), 'conexus-model-hub-'))
  const repository = resolve(import.meta.dirname, '../..')
  const build = join(root, 'apps/hub/build')
  cpSync(dirname(fileURLToPath(hubModuleUrl('hub.js'))), build, { recursive: true })
  symlinkSync(join(repository, 'packages'), join(root, 'packages'))
  symlinkSync(join(repository, 'node_modules'), join(root, 'node_modules'))
  symlinkSync(join(repository, 'apps/hub/migrations'), join(root, 'apps/hub/migrations'))
  mkdirSync(join(root, 'apps/hub/public'))
  writeFileSync(join(root, 'apps/hub/public/index.html'), '<!doctype html><title>Synthetic Hub</title>')
  const port = await availablePort()
  const settings = {
    CONEXUS_ORIGIN: `https://hub.synthetic.test:${port}`, CONEXUS_PORT: String(port), CONEXUS_BOOTSTRAP_SUBJECT: 'synthetic',
    CONEXUS_DB_HOST: f.connection.host, CONEXUS_DB_PORT: String(f.connection.port), CONEXUS_DB_NAME: f.connection.database, CONEXUS_DB_USER: 'hub_runtime',
    CONEXUS_DB_PASSWORD_FILE: join(root, 'password'), CONEXUS_SECRET_KEY_FILE: join(root, 'key'),
    CONEXUS_OIDC_ISSUER: 'https://issuer.synthetic.test/realms/conexus', CONEXUS_OIDC_CLIENT_ID: 'synthetic', CONEXUS_OIDC_CLIENT_SECRET_FILE: join(root, 'client-secret'),
  }
  for (const [file, value] of [['password', PASSWORD], ['key', '31'.repeat(32)], ['client-secret', 'synthetic']]) writeFileSync(join(root, file), value, { mode: 0o600 })
  const previous = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.startsWith('CONEXUS_') && !name.startsWith('CONEXUS_TEST_')))
  for (const name of Object.keys(previous)) delete process.env[name]
  Object.assign(process.env, settings)
  const original = globalThis.fetch
  let discoveries = 0
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    if (request.url === `${settings.CONEXUS_OIDC_ISSUER}/.well-known/openid-configuration`) {
      discoveries++
      return Response.json({ issuer: settings.CONEXUS_OIDC_ISSUER, authorization_endpoint: 'https://issuer.synthetic.test/authorize', token_endpoint: 'https://issuer.synthetic.test/token', jwks_uri: 'https://issuer.synthetic.test/jwks', response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'] })
    }
    assert.equal(new URL(request.url).origin, `http://127.0.0.1:${port}`)
    return original(request)
  }
  let hub
  f.onCleanup(async () => { await hub?.close() })
  t.after(() => {
    globalThis.fetch = original
    for (const name of Object.keys(settings)) delete process.env[name]
    Object.assign(process.env, previous)
    rmSync(root, { recursive: true, force: true })
  })
  const { startHub } = await import(pathToFileURL(join(build, 'hub.js')))
  hub = await startHub()
  assert.equal(discoveries, 1)
  const address = `http://127.0.0.1:${port}`
  const response = await fetch(`${address}/api/control/model-accounts`, { headers: { host: `hub.synthetic.test:${port}`, 'sec-fetch-site': 'same-origin' } })
  assert.deepEqual([response.status, (await response.json()).type], [401, 'urn:conexus:problem:AUTHENTICATION_REQUIRED'])
  await hub.close()
  await hub.close()
  await assert.rejects(fetch(`${address}/api/control/model-accounts`))
  const locks = (await query(f.connection, "SELECT count(*)::int AS count FROM pg_locks WHERE locktype = 'advisory' AND database = (SELECT oid FROM pg_database WHERE datname = current_database())")).rows
  assert.deepEqual(locks, [{ count: 0 }])
})

test('a current row sealed with an unknown key throws its configuration Failure through hold and native refresh', async (t) => {
  const f = await setupModelAccounts(t, 'conexus_model_config_cause')
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not reach provider') })
  await expiredClaude(f)
  const runId = await f.seedRun(await f.seedBuilderProject())
  const model = await selectedClaude(f, f.openRun(runId))
  const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))
  const { encodeCredential } = await import(hubModuleUrl('model-account/credential.js'))
  const row = (await query(f.connection, 'SELECT * FROM model.model_account')).rows[0]
  const sealed = await createSecretEnvelope('89'.repeat(32)).seal(encodeCredential(await storedCredential(f, 'anthropic')), modelAccountContext(row.model_account_id))
  await query(f.connection, 'UPDATE model.model_account SET secret = $1', [sealed])
  await assert.rejects(f.hold(runId, 'anthropic'), { id: 'CONFIG_INVALID', details: { name: 'SECRET_KEY_UNKNOWN' } })
  await assert.rejects(model.doStream({ prompt }), { id: 'CONFIG_INVALID', details: { name: 'SECRET_KEY_UNKNOWN' } })
})

test('real PostgreSQL timeout diagnosis survives Builder admission and native refresh into the terminal logger', async (t) => {
  await refuseProtectedCluster()
  const f = await setupModelAccounts(t, 'conexus_model_pg_cause')
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not reach provider') })
  await expiredClaude(f)
  const projectId = await f.seedBuilderProject()
  const runId = await f.seedRun(projectId)
  await query(f.connection, `ALTER ROLE hub_runtime IN DATABASE "${f.connection.database}" SET statement_timeout = '100ms'`)
  const database = f.openRuntimeDatabase({ max: 1 })
  const { admitAccount } = await import(hubModuleUrl('identity-access/admission.js'))
  const { sql } = await import(hubModuleUrl('platform/db.js'))
  const { Failure, logFailure } = await import(hubModuleUrl('platform/failure.js'))
  let timeout = true
  let original
  const data = { transaction: (accountId, work) => database.transaction(accountId, async (gate) => {
    if (timeout) {
      const { tx } = await admitAccount(gate)
      try { await tx.run(sql`SELECT pg_sleep(1)`) } catch (error) { original = error; throw error }
    }
    return work(gate)
  }) }
  const routing = createBuilderModelRouting({ data, models: f.models, owner: { ownerId: OWNER }, conversationModel: async () => null,
    record: async () => undefined })
  const carried = context(runId, projectId, 'anthropic/claude-sonnet-5')
  const assertDiagnosis = (actual) => {
    assert.equal(actual instanceof Failure, true)
    assert.equal(actual, original)
    assert.equal(actual.id, 'DATABASE_BUSY')
    assert.equal(actual.cause.code, '57014')
    assert.equal(actual.details.sqlstate, '57014')
    const lines = []
    const log = (fields, code) => lines.push({ fields, code })
    logFailure({ error: log, warn: log, info: log }, actual)
    assert.equal(lines.length, 1)
    assert.equal(lines[0].code, 'DATABASE_BUSY')
    assert.match(lines[0].fields['exception.stacktrace'], /error \(57014\)/)
    assert.equal(JSON.stringify(lines).includes(actual.cause.message), false)
    return true
  }
  await assert.rejects(routing.resolve({ requestContext: carried }), assertDiagnosis)
  timeout = false
  const model = await routing.resolve({ requestContext: carried })
  timeout = true
  await assert.rejects(model.doStream({ prompt }), assertDiagnosis)
})
