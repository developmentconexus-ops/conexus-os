import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { hubModuleUrl } from './hub-build.mjs'
import { setupModelAccounts } from './model-account-fixture.mjs'
import { ID } from './project-fixture.mjs'
import { query } from './hub-database.mjs'
import { hubJsonWrite, hubWrite, opaque, testListener } from './access/test-listener.mjs'
const { decodeKey, parseCredential } = await import(hubModuleUrl('model-account/credential.js'))
const { modelAccountContext } = await import(hubModuleUrl('platform/secrets.js'))
const ana = ID.owner, bia = ID.member
const SESSION_TOKEN = opaque('google-owner')
const authentic = { headers: hubJsonWrite, cookies: { '__Host-conexus_session': SESSION_TOKEN } }

async function createLoginApp(t) {
  const root = mkdtempSync(join(tmpdir(), 'conexus-model-google-'))
  const binary = join(root, 'cli-proxy-api')
  copyFileSync(join(import.meta.dirname, 'builder-google-ai-pro-fake-cliproxy.mjs'), binary)
  chmodSync(binary, 0o755)
  const previous = process.env.XDG_STATE_HOME
  process.env.XDG_STATE_HOME = root
  const f = await setupModelAccounts(t, 'conexus_model_google', { googleAiPro: { binary, sha256: createHash('sha256').update(readFileSync(binary)).digest('hex') } })
  t.after(() => { if (previous === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previous; rmSync(root, { recursive: true, force: true }) })
  let caller = ana
  const { app } = await testListener({ sessions: { [SESSION_TOKEN]: () => ({ account: { accountId: caller, displayName: caller === ana ? 'Ana' : 'Bia' } }) }, registerRoutes: (app) => f.models.registerRoutes(app) })
  t.after(() => app.close())
  return { ...f, app, stateDir: join(root, 'conexus', 'cliproxy'), as: (accountId) => { caller = accountId } }
}

const base = '/api/control/model-accounts/google-ai-pro/login'
const callback = (url, overrides = {}) => {
  const state = new URL(url).searchParams.get('state')
  const params = new URLSearchParams({ state, code: 'good', ...overrides })
  return `http://localhost:51121/oauth-callback?${params}`
}
const pollOnce = (app, loginId) => app.inject({ method: 'POST', url: `${base}/${loginId}`, headers: hubWrite, cookies: authentic.cookies })
const pollUntilSettled = async (app, loginId) => {
  for (let polls = 0; polls < 100; polls++) {
    const { state } = (await pollOnce(app, loginId)).json()
    if (state !== 'waiting') return state
    await delay(25)
  }
  return 'waiting'
}

test('signing in from Settings stores the record as the person\'s own model.model_account row', async (t) => {
  const { app, stateDir, connection: databaseConnection, envelope } = await createLoginApp(t)
  const started = await app.inject({ method: 'POST', url: `${base}/start`, ...authentic, payload: {} })
  assert.equal(started.statusCode, 200)
  const { loginId, url } = started.json()
  assert.equal(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth?'), true)

  // The address the forwarder on the Hub's machine redirects to, pasted when that hop fails.
  const forwarded = callback(url).replace('localhost:51121/oauth-callback', '127.0.0.1:40123/antigravity/callback')
  const completed = await app.inject({ method: 'POST', url: `${base}/complete`, ...authentic, payload: { loginId, callbackUrl: forwarded } })
  assert.equal(completed.statusCode, 200)
  assert.equal(await pollUntilSettled(app, loginId), 'succeeded')

  const written = (await query(databaseConnection, 'SELECT * FROM model.model_account')).rows
  assert.equal(written.length, 1)
  assert.deepEqual([written[0].owner_account_id, written[0].connected_by_name], [ana, 'Ana'])
  const stored = decodeKey(parseCredential(written[0], await envelope.open(written[0].secret, modelAccountContext(written[0].model_account_id))).value)
  assert.equal(stored.fileName, 'antigravity-person@example.com.json')
  assert.deepEqual(JSON.parse(Buffer.from(stored.bytes).toString()), { type: 'antigravity', refresh_token: 'refresh-from-google' })
  assert.deepEqual(readdirSync(stateDir), [], 'the sign-in proxy and its copy of the record are gone')

  const connection = await app.inject({ method: 'GET', url: '/api/control/model-accounts/google-ai-pro/connection', ...authentic })
  assert.deepEqual(connection.json(), { own: { state: 'connected', kind: 'google_ai_pro' } })
})

test('a pasted address with the wrong host, path or state is refused, and a refused sign-in fails', async (t) => {
  const { app } = await createLoginApp(t)
  const { loginId, url } = (await app.inject({ method: 'POST', url: `${base}/start`, ...authentic, payload: {} })).json()
  for (const callbackUrl of [
    callback(url).replace('localhost:51121', 'evil.example:51121'),
    callback(url).replace('/oauth-callback', '/other'),
    callback(url).replace('http:', 'https:'),
    callback(url, { state: 'another-state-value' }),
    'not a url',
  ]) {
    const refused = await app.inject({ method: 'POST', url: `${base}/complete`, ...authentic, payload: { loginId, callbackUrl } })
    assert.equal(refused.statusCode, 400, callbackUrl)
    assert.equal(refused.json().type.endsWith('MODEL_LOGIN_CALLBACK_REFUSED'), true)
  }
  await app.inject({ method: 'POST', url: `${base}/complete`, ...authentic, payload: { loginId, callbackUrl: callback(url, { code: 'bad' }) } })
  assert.equal(await pollUntilSettled(app, loginId), 'failed')
})

test('one sign-in at a time: another person is told to wait, and the same person restarts theirs', async (t) => {
  const { app, as } = await createLoginApp(t)
  const first = (await app.inject({ method: 'POST', url: `${base}/start`, ...authentic, payload: {} })).json()
  as(bia)
  const busy = await app.inject({ method: 'POST', url: `${base}/start`, ...authentic, payload: {} })
  assert.equal(busy.statusCode, 409)
  assert.equal(busy.json().type.endsWith('MODEL_LOGIN_BUSY'), true)
  const hidden = await pollOnce(app, first.loginId)
  assert.deepEqual([hidden.statusCode, hidden.json().type], [404, 'urn:conexus:problem:MODEL_LOGIN_NOT_FOUND'], 'a sign-in is visible only to its person')
  as(ana)
  const second = (await app.inject({ method: 'POST', url: `${base}/start`, ...authentic, payload: {} })).json()
  assert.notEqual(second.loginId, first.loginId)
  const replaced = await pollOnce(app, first.loginId)
  assert.deepEqual([replaced.statusCode, replaced.json().type], [404, 'urn:conexus:problem:MODEL_LOGIN_NOT_FOUND'], 'a restarted sign-in forgets the one it replaced')
})

test('the Builder offers the Google AI Pro models only to a person with their own account', async (t) => {
  const { app, as } = await createLoginApp(t)
  const offered = async () => (await app.inject({ method: 'GET', url: '/api/control/model-accounts/models', ...authentic })).json().models.map(({ id }) => id)
  assert.deepEqual(await offered(), [])
  const { loginId, url } = (await app.inject({ method: 'POST', url: `${base}/start`, ...authentic, payload: {} })).json()
  await app.inject({ method: 'POST', url: `${base}/complete`, ...authentic, payload: { loginId, callbackUrl: callback(url) } })
  assert.equal(await pollUntilSettled(app, loginId), 'succeeded')
  const all = ['gemini-3.1-pro-low', 'gemini-pro-agent', 'gemini-3.8-flash-high', 'gemini-3.7-flash-high', 'gemini-3.6-flash-high', 'gemini-3-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'].map((model) => `google-ai-pro/${model}`)
  assert.deepEqual(await offered(), all)
  const named = (await app.inject({ method: 'GET', url: `/api/control/model-accounts/models`, ...authentic })).json().models
  assert.deepEqual(new Set(named.map(({ providerName }) => providerName)), new Set(['Google AI Pro']))
  assert.equal((await app.inject({ method: 'GET', url: `/api/control/model-accounts/models`, ...authentic })).json().defaultThinkingLevel, 'medium', "the Hub sends the level a conversation runs at until the person picks one, as Mastra Code's resolveDefaultThinkingLevel gives it")
  assert.deepEqual(named.slice(0, 3).map(({ modelName, thinkingLevels }) => [modelName, thinkingLevels]), [
    ['gemini-3.1-pro-low', ['off', 'low', 'medium', 'high']], ['gemini-pro-agent', []], ['gemini-3.8-flash-high', ['off', 'low', 'medium', 'high']],
  ], "each model offers the levels Mastra Code's Gemini mapping gives it, off included where it sends nothing, and none to a model without thinking")
  as(bia)
  assert.deepEqual(await offered(), [], 'another person without an account is offered nothing')
})

test('the sign-in routes need a Hub session, and their writes need a write from the Hub page', async (t) => {
  const { app } = await createLoginApp(t)
  const forged = await app.inject({ method: 'POST', url: `${base}/start`, headers: { ...hubJsonWrite, origin: 'https://evil.test' }, cookies: authentic.cookies, payload: {} })
  assert.equal(forged.statusCode, 403)
  const idle = '00000000-0000-4000-8000-000000000000'
  const anonymous = await app.inject({ method: 'POST', url: `${base}/${idle}`, headers: hubWrite })
  assert.equal(anonymous.statusCode, 401)
  for (const method of ['GET', 'HEAD']) {
    const old = await app.inject({ method, url: `${base}/${idle}`, cookies: authentic.cookies })
    assert.equal(old.statusCode, 404, `${method} is no longer a poll`)
  }
})


test('the actual owner serves a native Google stream and captures rotated bytes after run end before closing its process', async (t) => {
  const { writeFileSync, existsSync } = await import('node:fs')
  const { encodeKey, instanceIdOf } = await import(hubModuleUrl('model-account/credential.js'))
  const f = await createLoginApp(t)
  const record = { fileName: 'antigravity-synthetic.json', bytes: new TextEncoder().encode('{"type":"antigravity","refresh_token":"synthetic-spent"}') }
  const key = encodeKey(record)
  const connected = await f.connect({ provider: 'google-ai-pro', kind: 'google_ai_pro', value: key })
  const projectId = await f.seedBuilderProject()
  const runId = await f.seedRun(projectId)
  assert.deepEqual(f.models.jobs.map(({ name, everyMs }) => [name, everyMs]), [['idle-cliproxy', 60000]])
  await f.models.jobs[0].run(new AbortController().signal)
  const selected = await f.models.modelFor(f.openRun(runId), { modelId: 'google-ai-pro/gemini-3-flash', thinkingLevel: 'high' })
  assert.equal(selected.ok, true)
  assert.equal(selected.result.modelAccountId, connected)
  assert.equal(selected.result.model.specificationVersion, 'v3')
  const start = Date.now()
  const { stream } = await selected.result.model.doStream({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'oi' }] }] })
  const reader = stream.getReader()
  const first = await reader.read()
  assert.equal(first.value.type, 'stream-start')
  assert.equal(Date.now() - start < 550, true, 'the first native stream part precedes the proxy end')
  const parts = []
  for (;;) { const part = await reader.read(); if (part.done) break; parts.push(part.value.type) }
  assert.equal(parts.includes('finish'), true)
  const instanceDir = join(f.stateDir, instanceIdOf(key))
  const pid = Number(readFileSync(join(instanceDir, 'pid'), 'utf8'))
  const next = encodeKey({ ...record, bytes: new TextEncoder().encode('{"type":"antigravity","refresh_token":"synthetic-rotated"}') })
  writeFileSync(join(instanceDir, 'auth', record.fileName), decodeKey(next).bytes)
  await query(f.connection, "UPDATE builder.builder_run SET state = 'SUCCEEDED', result_kind = 'RESPONSE_ONLY', finished_at = clock_timestamp() WHERE builder_run_id = $1", [runId])
  await f.models.close()
  const stored = (await query(f.connection, 'SELECT secret FROM model.model_account WHERE model_account_id = $1', [connected])).rows[0]
  assert.equal(await f.envelope.open(stored.secret, modelAccountContext(connected)), next)
  assert.equal(existsSync(instanceDir), false)
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
})
