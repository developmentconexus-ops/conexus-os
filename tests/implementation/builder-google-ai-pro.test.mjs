import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { hubModuleUrl } from './hub-build.mjs'

const built = hubModuleUrl
const { encodeKey, decodeKey, parseKey, instanceIdOf } = await import(built('builder/google-ai-pro/credential.js'))
const { configYaml, createCliproxyPool, verifyCliproxyBinary } = await import(built('builder/google-ai-pro/pool.js'))
const { startModelRouter } = await import(built('builder/google-ai-pro/router.js'))
const { createRefreshWriteBack } = await import(built('builder/google-ai-pro/write-back.js'))
const { createHttpApp } = await import(built('http/app.js'))
const { registerModelAccountRoutes } = await import(built('builder/model-accounts.js'))
const { createGoogleAiProAccounts } = await import(built('builder/google-ai-pro/store.js'))

const record = (account, extra = {}) => ({ fileName: `antigravity-${account}.json`, bytes: new TextEncoder().encode(JSON.stringify({ type: 'antigravity', refresh_token: `refresh-${account}`, ...extra })) })

const scratch = (t) => {
  const root = mkdtempSync(join(tmpdir(), 'conexus-google-ai-pro-'))
  const binary = join(root, 'cli-proxy-api')
  copyFileSync(join(import.meta.dirname, 'builder-google-ai-pro-fake-cliproxy.mjs'), binary)
  chmodSync(binary, 0o755)
  const stateDir = join(root, 'state')
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return { root, binary, stateDir }
}

const openPool = (t, options) => {
  const pool = createCliproxyPool(options)
  t.after(() => pool.close())
  return pool
}

const openRouter = async (t, pool, persistFor) => {
  const router = await startModelRouter(pool, persistFor ?? (() => undefined))
  t.after(() => router.close())
  return router
}

const alive = (pid) => {
  try { process.kill(pid, 0); return true } catch { return false }
}

const until = async (predicate, ms = 5_000) => {
  for (const deadline = Date.now() + ms; Date.now() < deadline; await delay(25)) if (await predicate()) return true
  return false
}

test('a credential carries the auth record whole, and only a well-formed Antigravity record parses', () => {
  const key = encodeKey(record('ana@example.com'))
  assert.equal(key.startsWith('cxagy1.'), true)
  assert.equal(parseKey(key), key)
  const decoded = decodeKey(key)
  assert.equal(decoded.fileName, 'antigravity-ana@example.com.json')
  assert.deepEqual(JSON.parse(Buffer.from(decoded.bytes).toString()), { type: 'antigravity', refresh_token: 'refresh-ana@example.com' })
  assert.equal(instanceIdOf(key), createHash('sha256').update(key).digest('hex').slice(0, 16))

  const encoded = (value) => Buffer.from(value).toString('base64url')
  for (const refused of [
    'sk-openai-key',
    `cxagy2.${encoded('antigravity-a.json')}.${encoded('{"type":"antigravity"}')}`,
    `cxagy1.${encoded('../../etc/passwd')}.${encoded('{"type":"antigravity"}')}`,
    `cxagy1.${encoded('antigravity-a.json')}.${encoded('{"type":"codex"}')}`,
    `cxagy1.${encoded('antigravity-a.json')}.${encoded('not json')}`,
    `cxagy1.${encoded('antigravity-a.json')}`,
  ]) assert.equal(parseKey(refused), null, refused)
  assert.throws(() => encodeKey({ fileName: '.oauth-antigravity-state.oauth', bytes: new Uint8Array([1]) }), /^Error: GOOGLE_AI_PRO_RECORD_REFUSED$/)
})

test('the proxy config asks Gemini for its thinking summary and leaves every other key as it was', () => {
  assert.equal(configYaml({ port: 8317, authDir: '/state/auth', proxyKey: 'key-1' }), [
    'host: "127.0.0.1"',
    'port: 8317',
    'auth-dir: "/state/auth"',
    'api-keys:',
    '  - "key-1"',
    'remote-management:',
    '  allow-remote: false',
    '  secret-key: ""',
    '  disable-control-panel: true',
    'usage-statistics-enabled: false',
    'logging-to-file: false',
    'payload:',
    '  default:',
    '    - models:',
    '        - name: "gemini-*"',
    '          protocol: "antigravity"',
    '      params:',
    '        "generationConfig.thinkingConfig.includeThoughts": true',
    '',
  ].join('\n'))
})

test('a binary whose sha256 differs from the pinned one is refused', async (t) => {
  const { binary } = scratch(t)
  const pinned = createHash('sha256').update(readFileSync(binary)).digest('hex')
  await verifyCliproxyBinary(binary, pinned)
  await assert.rejects(verifyCliproxyBinary(binary, '0'.repeat(64)), /^Error: GOOGLE_AI_PRO_BINARY_REFUSED$/)
  await assert.rejects(verifyCliproxyBinary(join(binary, 'missing'), pinned), /^Error: GOOGLE_AI_PRO_BINARY_REFUSED$/)
})

test('two people reach two proxies holding only their own record, and one person reuses one', async (t) => {
  const { binary, stateDir } = scratch(t)
  const router = await openRouter(t, openPool(t, { binary, stateDir }))
  const models = async (key) => {
    const answer = await fetch(`${router.url}/v1/models`, { headers: { authorization: `Bearer ${key}` } })
    assert.equal(answer.status, 200)
    return answer.json()
  }
  const ana = encodeKey(record('ana@example.com'))
  const bia = encodeKey(record('bia@example.com'))
  const first = await models(ana)
  const second = await models(bia)
  const again = await models(ana)
  assert.deepEqual(first.data.map((model) => model.owned_by), ['antigravity-ana@example.com.json'])
  assert.deepEqual(second.data.map((model) => model.owned_by), ['antigravity-bia@example.com.json'])
  assert.equal(again.pid, first.pid)
  assert.notEqual(second.pid, first.pid)
  assert.deepEqual(readdirSync(stateDir).sort(), [instanceIdOf(ana), instanceIdOf(bia)].sort())
})

test('concurrent first calls for one person start one proxy', async (t) => {
  const { binary, stateDir } = scratch(t)
  const router = await openRouter(t, openPool(t, { binary, stateDir }))
  const key = encodeKey(record('ana@example.com'))
  const answers = await Promise.all([1, 2, 3].map(() => fetch(`${router.url}/v1/models`, { headers: { authorization: `Bearer ${key}` } }).then((answer) => answer.json())))
  assert.equal(new Set(answers.map((answer) => answer.pid)).size, 1)
})

test('a call without a usable bearer is refused with 401 and starts nothing', async (t) => {
  const { binary, stateDir } = scratch(t)
  const router = await openRouter(t, openPool(t, { binary, stateDir }))
  for (const authorization of [undefined, 'Bearer sk-not-a-record', 'Basic abc']) {
    const answer = await fetch(`${router.url}/v1/chat/completions`, { method: 'POST', headers: authorization ? { authorization } : {}, body: '{}' })
    assert.equal(answer.status, 401)
    assert.equal((await answer.json()).error.message, 'Conecte o Google AI Pro nas Configurações.')
  }
  assert.equal(existsSync(stateDir), false)
})

test('a streamed answer reaches the caller before the proxy finishes it', async (t) => {
  const { binary, stateDir } = scratch(t)
  const router = await openRouter(t, openPool(t, { binary, stateDir }))
  const key = encodeKey(record('ana@example.com'))
  const answer = await fetch(`${router.url}/v1/chat/completions`, {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'gemini-3.1-pro-low', stream: true }),
  })
  assert.equal(answer.headers.get('content-type'), 'text/event-stream')
  const reader = answer.body.getReader()
  const started = Date.now()
  const first = new TextDecoder().decode((await reader.read()).value)
  assert.equal(Date.now() - started < 500, true, 'first event arrived before the proxy ended the stream')
  assert.equal(first, 'data: {"files":["antigravity-ana@example.com.json"]}\n\n')
  let rest = ''
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) rest += new TextDecoder().decode(chunk.value)
  assert.equal(rest, 'data: [DONE]\n\n')
})

test('a call waits for the proxy to accept the stored sign-in, which it refreshes after it is listening', async (t) => {
  const { binary, stateDir } = scratch(t)
  const router = await openRouter(t, openPool(t, { binary, stateDir }))
  const key = encodeKey(record('ana@example.com', { unavailableForMs: 800 }))
  const answer = await fetch(`${router.url}/v1/chat/completions`, {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'gemini-3.1-pro-low', stream: true }),
  })
  assert.equal(answer.status, 200)
  assert.equal((await answer.text()).endsWith('data: [DONE]\n\n'), true)
})

test('a proxy that never accepts the stored sign-in fails the start and is not kept', async (t) => {
  const { binary, stateDir } = scratch(t)
  const pool = openPool(t, { binary, stateDir, authReadyTimeoutMs: 600 })
  const router = await openRouter(t, pool)
  const answer = await fetch(`${router.url}/v1/chat/completions`, {
    method: 'POST', headers: { authorization: `Bearer ${encodeKey(record('ana@example.com', { unavailableForMs: -1 }))}` }, body: JSON.stringify({ model: 'gemini-3.1-pro-low' }),
  })
  assert.equal(answer.status, 503)
  assert.deepEqual(await answer.json(), { error: { message: 'O Google AI Pro não iniciou. Tente novamente.', type: 'invalid_request_error' } })
  assert.deepEqual(readdirSync(stateDir), [])
})

test('a proxy 401 becomes a reconnect message', async (t) => {
  const { binary, stateDir } = scratch(t)
  const router = await openRouter(t, openPool(t, { binary, stateDir }))
  const answer = await fetch(`${router.url}/v1/chat/completions`, {
    method: 'POST', headers: { authorization: `Bearer ${encodeKey(record('ana@example.com'))}` }, body: JSON.stringify({ model: 'unauthorized' }),
  })
  assert.equal(answer.status, 401)
  assert.deepEqual(await answer.json(), { error: { message: 'Reconecte o Google AI Pro nas Configurações.', type: 'invalid_request_error' } })
})

test('an idle proxy stops and its directory is removed', async (t) => {
  const { binary, stateDir } = scratch(t)
  const pool = openPool(t, { binary, stateDir, idleMs: 100, sweepEveryMs: 50 })
  const key = encodeKey(record('ana@example.com'))
  const lease = await pool.acquire(key)
  const { pid } = await (await fetch(`${lease.url}/v1/models`, { headers: { authorization: `Bearer ${lease.proxyKey}` } })).json()
  await delay(300)
  assert.equal(alive(pid), true, 'a leased proxy is never stopped')
  lease.release()
  assert.equal(await until(() => !alive(pid) && !existsSync(join(stateDir, instanceIdOf(key)))), true)
  const next = await pool.acquire(key)
  const restarted = await (await fetch(`${next.url}/v1/models`, { headers: { authorization: `Bearer ${next.proxyKey}` } })).json()
  assert.notEqual(restarted.pid, pid)
  next.release()
})

test('a refreshed auth file is captured and written back before an idle proxy\'s copy is deleted (AC-22)', async (t) => {
  const { binary, stateDir } = scratch(t)
  const pool = openPool(t, { binary, stateDir, idleMs: 100, sweepEveryMs: 50 })
  const key = encodeKey(record('ana@example.com'))
  const refreshed = []
  const lease = await pool.acquire(key, async (refreshedKey) => { refreshed.push(refreshedKey) })
  // Stands in for CLIProxyAPI refreshing the Google OAuth token inside the instance's own copy of
  // the record, while the lease is held.
  writeFileSync(join(stateDir, instanceIdOf(key), 'auth', 'antigravity-ana@example.com.json'), JSON.stringify({ type: 'antigravity', refresh_token: 'refreshed-token' }))
  lease.release()
  assert.equal(await until(() => refreshed.length === 1 && !existsSync(join(stateDir, instanceIdOf(key)))), true)
  const stored = decodeKey(refreshed[0])
  assert.equal(stored.fileName, 'antigravity-ana@example.com.json')
  assert.deepEqual(JSON.parse(Buffer.from(stored.bytes).toString()), { type: 'antigravity', refresh_token: 'refreshed-token' })
})

test("a call through the router writes the refreshed record back to the caller's model account row by id, once (AC-22)", async (t) => {
  const { binary, stateDir } = scratch(t)
  const rewrites = []
  const writeBack = createRefreshWriteBack({ rewrite: async (modelAccountId, secret) => { rewrites.push([modelAccountId, secret]); return true } })
  const router = await openRouter(t, openPool(t, { binary, stateDir, idleMs: 100, sweepEveryMs: 50 }), writeBack.persistFor)
  const key = encodeKey(record('ana@example.com'))
  writeBack.track(key, 'row-ana')
  const answer = await fetch(`${router.url}/v1/models`, { headers: { authorization: `Bearer ${key}` } })
  assert.equal(answer.status, 200)
  await answer.json()
  // Stands in for CLIProxyAPI refreshing the Google token inside the instance's own copy.
  writeFileSync(join(stateDir, instanceIdOf(key), 'auth', 'antigravity-ana@example.com.json'), JSON.stringify({ type: 'antigravity', refresh_token: 'refreshed-token' }))
  assert.equal(await until(() => rewrites.length === 1 && !existsSync(join(stateDir, instanceIdOf(key)))), true)
  const [[modelAccountId, secret]] = rewrites
  assert.equal(modelAccountId, 'row-ana')
  assert.deepEqual(JSON.parse(Buffer.from(decodeKey(secret).bytes).toString()), { type: 'antigravity', refresh_token: 'refreshed-token' })
  await delay(300)
  assert.equal(rewrites.length, 1, 'one refresh, one write')
})

test('an unrefreshed record, or one whose row is not known, writes nothing back', async (t) => {
  const { binary, stateDir } = scratch(t)
  const rewrites = []
  const writeBack = createRefreshWriteBack({ rewrite: async (modelAccountId, secret) => { rewrites.push([modelAccountId, secret]); return true } })
  const router = await openRouter(t, openPool(t, { binary, stateDir, idleMs: 100, sweepEveryMs: 50 }), writeBack.persistFor)
  const known = encodeKey(record('ana@example.com'))
  const unknown = encodeKey(record('bia@example.com'))
  writeBack.track(known, 'row-ana')
  for (const key of [known, unknown]) await (await fetch(`${router.url}/v1/models`, { headers: { authorization: `Bearer ${key}` } })).json()
  assert.equal(await until(() => !existsSync(join(stateDir, instanceIdOf(known))) && !existsSync(join(stateDir, instanceIdOf(unknown)))), true)
  assert.deepEqual(rewrites, [])
})

test('a proxy a crashed Hub left behind is killed at boot, and a stranger pid is left alone', async (t) => {
  const { binary, stateDir } = scratch(t)
  const orphanDir = join(stateDir, 'abcdef0123456789')
  mkdirSync(join(orphanDir, 'auth'), { recursive: true })
  writeFileSync(join(orphanDir, 'config.yaml'), `host: "127.0.0.1"\nport: 0\nauth-dir: ${JSON.stringify(join(orphanDir, 'auth'))}\napi-keys:\n  - "k"\n`)
  const orphan = spawn(binary, ['-config', join(orphanDir, 'config.yaml')], { stdio: 'ignore', detached: true })
  t.after(() => { try { process.kill(orphan.pid, 'SIGKILL') } catch { /* gone */ } })
  writeFileSync(join(orphanDir, 'pid'), String(orphan.pid))
  const stranger = spawn('sleep', ['30'], { stdio: 'ignore' })
  t.after(() => stranger.kill('SIGKILL'))
  const strangerDir = join(stateDir, 'login-0123456789abcdef')
  mkdirSync(strangerDir, { recursive: true })
  writeFileSync(join(strangerDir, 'pid'), String(stranger.pid))
  assert.equal(await until(() => readFileSync(`/proc/${orphan.pid}/cmdline`, 'utf8').includes(binary)), true)

  await createCliproxyPool({ binary, stateDir }).sweepOrphans()
  assert.equal(await until(() => !alive(orphan.pid)), true)
  assert.equal(alive(stranger.pid), true)
  assert.deepEqual(readdirSync(stateDir), [])
})

test('a Hub killed without cleaning up takes its proxies with it', async (t) => {
  const { binary, stateDir } = scratch(t)
  const hub = spawn(process.execPath, ['--input-type=module', '-e', `
    const { createCliproxyPool } = await import(${JSON.stringify(built('builder/google-ai-pro/pool.js'))})
    const { encodeKey } = await import(${JSON.stringify(built('builder/google-ai-pro/credential.js'))})
    const pool = createCliproxyPool({ binary: ${JSON.stringify(binary)}, stateDir: ${JSON.stringify(stateDir)} })
    const lease = await pool.acquire(encodeKey({ fileName: 'antigravity-ana@example.com.json', bytes: new TextEncoder().encode('{"type":"antigravity"}') }))
    const { pid } = await (await fetch(lease.url + '/v1/models', { headers: { authorization: 'Bearer ' + lease.proxyKey } })).json()
    process.stdout.write(String(pid) + '\\n')
    setInterval(() => undefined, 1000)
  `], { stdio: ['ignore', 'pipe', 'inherit'] })
  t.after(() => hub.kill('SIGKILL'))
  let output = ''
  hub.stdout.on('data', (chunk) => { output += chunk })
  assert.equal(await until(() => output.endsWith('\n'), 10_000), true)
  const proxy = Number(output.trim())
  assert.equal(alive(proxy), true)
  hub.kill('SIGKILL')
  assert.equal(await until(() => !alive(proxy)), true)
})

const origin = 'https://conexus.test'
const ana = '22222222-2222-4222-8222-222222222222'
const bia = '55555555-5555-4555-8555-555555555555'
const authentic = {
  headers: { origin, 'x-conexus-csrf': 'csrf-1', 'content-type': 'application/json' },
  cookies: { '__Host-conexus_session': 'session-1', '__Host-conexus_csrf': 'csrf-1' },
}

// The sign-in routes run for real; only model.model_account is a recording stand-in
// (the Postgres-backed store is proven separately in model-account-postgres.test.mjs).
const fakeModelAccounts = () => {
  const own = new Map()
  let sharedAccountId = null
  const writes = []
  const held = (accountId) => own.has(accountId) ? { modelAccountId: `row-${accountId}`, kind: 'google_ai_pro', secret: own.get(accountId) } : null
  // Only Google AI Pro rows exist here; every other provider has none.
  const google = (provider) => provider === 'google-ai-pro'
  const store = {
    hasShared: async (provider) => google(provider) && sharedAccountId !== null,
    usable: async (accountId, provider) => google(provider) ? held(accountId) ?? (sharedAccountId !== null ? held(sharedAccountId) : null) : null,
    connection: async (accountId, provider) => ({ mine: google(provider) && own.has(accountId) ? 'google_ai_pro' : null, shared: google(provider) && sharedAccountId !== null }),
    write: async (accountId, _provider, _kind, key) => { own.set(accountId, key); writes.push({ accountId, key }) },
  }
  return { store, writes, share: (accountId) => { sharedAccountId = accountId } }
}

const createLoginApp = async (t) => {
  const { binary, stateDir } = scratch(t)
  const pool = openPool(t, { binary, stateDir })
  const modelAccounts = fakeModelAccounts()
  let caller = ana
  const app = await createHttpApp({
    registerRoutes: async (instance) => {
      await registerModelAccountRoutes(instance, {
        origin,
        resolveCurrentSession: async (request) => request.cookies['__Host-conexus_session'] ? { account: { accountId: caller } } : null,
        isInstallationAdministrator: async () => false,
        modelAccounts: modelAccounts.store,
        googleAiPro: pool,
        googleAiProAccounts: createGoogleAiProAccounts(modelAccounts.store),
      })
      return []
    },
    staticRoot: null,
  })
  t.after(() => app.close())
  return { app, stateDir, writes: modelAccounts.writes, share: modelAccounts.share, as: (accountId) => { caller = accountId } }
}

const base = '/api/control/model-accounts/google-ai-pro/login'
const callback = (url, overrides = {}) => {
  const state = new URL(url).searchParams.get('state')
  const params = new URLSearchParams({ state, code: 'good', ...overrides })
  return `http://localhost:51121/oauth-callback?${params}`
}
const pollUntilSettled = async (app, loginId) => {
  for (let polls = 0; polls < 100; polls++) {
    const { state } = (await app.inject({ method: 'GET', url: `${base}/${loginId}`, ...authentic })).json()
    if (state !== 'waiting') return state
    await delay(25)
  }
  return 'waiting'
}

test('signing in from Settings stores the record as the person\'s own model.model_account row', async (t) => {
  const { app, stateDir, writes } = await createLoginApp(t)
  const started = await app.inject({ method: 'POST', url: `${base}/start`, ...authentic, payload: {} })
  assert.equal(started.statusCode, 200)
  const { loginId, url } = started.json()
  assert.equal(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth?'), true)

  // The address the forwarder on the Hub's machine redirects to, pasted when that hop fails.
  const forwarded = callback(url).replace('localhost:51121/oauth-callback', '127.0.0.1:40123/antigravity/callback')
  const completed = await app.inject({ method: 'POST', url: `${base}/complete`, ...authentic, payload: { loginId, callbackUrl: forwarded } })
  assert.equal(completed.statusCode, 200)
  assert.equal(await pollUntilSettled(app, loginId), 'succeeded')

  assert.equal(writes.length, 1)
  assert.equal(writes[0].accountId, ana)
  const stored = decodeKey(parseKey(writes[0].key))
  assert.equal(stored.fileName, 'antigravity-person@example.com.json')
  assert.deepEqual(JSON.parse(Buffer.from(stored.bytes).toString()), { type: 'antigravity', refresh_token: 'refresh-from-google' })
  assert.deepEqual(readdirSync(stateDir), [], 'the sign-in proxy and its copy of the record are gone')

  const connection = await app.inject({ method: 'GET', url: '/api/control/model-accounts/google-ai-pro/connection', ...authentic })
  assert.deepEqual(connection.json(), { mine: true, shared: false, administrator: false })
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
    assert.equal(refused.json().type.endsWith('model-login-callback-refused'), true)
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
  assert.equal(busy.json().type.endsWith('model-login-busy'), true)
  assert.deepEqual((await app.inject({ method: 'GET', url: `${base}/${first.loginId}`, ...authentic })).json(), { state: 'expired' }, 'a sign-in is visible only to its person')
  as(ana)
  const second = (await app.inject({ method: 'POST', url: `${base}/start`, ...authentic, payload: {} })).json()
  assert.notEqual(second.loginId, first.loginId)
  assert.deepEqual((await app.inject({ method: 'GET', url: `${base}/${first.loginId}`, ...authentic })).json(), { state: 'expired' })
})

test('the Builder offers the Google AI Pro models only to a person who can use them, own or shared', async (t) => {
  const { app, as, share } = await createLoginApp(t)
  const offered = async (query = '') => (await app.inject({ method: 'GET', url: `/api/control/model-accounts/models${query}`, ...authentic })).json().models.map(({ id }) => id)
  assert.deepEqual([await offered(), await offered('?scope=installation')], [[], []])
  const { loginId, url } = (await app.inject({ method: 'POST', url: `${base}/start`, ...authentic, payload: {} })).json()
  await app.inject({ method: 'POST', url: `${base}/complete`, ...authentic, payload: { loginId, callbackUrl: callback(url) } })
  assert.equal(await pollUntilSettled(app, loginId), 'succeeded')
  const all = ['gemini-3.1-pro-low', 'gemini-pro-agent', 'gemini-3.8-flash-high', 'gemini-3.7-flash-high', 'gemini-3.6-flash-high', 'gemini-3-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'].map((model) => `google-ai-pro/${model}`)
  assert.deepEqual([await offered(), await offered('?scope=installation')], [all, []])
  const named = (await app.inject({ method: 'GET', url: `/api/control/model-accounts/models`, ...authentic })).json().models
  assert.deepEqual(named.slice(0, 3).map(({ modelName }) => modelName), ['gemini-3.1-pro-low', 'gemini-pro-agent', 'gemini-3.8-flash-high'])
  as(bia)
  assert.deepEqual(await offered(), [], 'another person without an account is offered nothing')
  share(ana)
  assert.deepEqual([await offered(), await offered('?scope=installation')], [all, all])
})

test('the sign-in routes need a Hub session, and their writes need the CSRF pair', async (t) => {
  const { app } = await createLoginApp(t)
  const forged = await app.inject({ method: 'POST', url: `${base}/start`, headers: { origin, 'content-type': 'application/json' }, cookies: authentic.cookies, payload: {} })
  assert.equal(forged.statusCode, 403)
  const anonymous = await app.inject({ method: 'GET', url: `${base}/00000000-0000-4000-8000-000000000000`, headers: {} })
  assert.equal(anonymous.statusCode, 401)
})

// Opt-in: runs the pinned CLIProxyAPI itself. It binds Google's callback port 51121 while it runs.
test('the real CLIProxyAPI answers the shapes the pool and the sign-in rely on', { skip: process.env.CONEXUS_CLIPROXY_LIVE_BIN ? false : 'opt-in: CONEXUS_CLIPROXY_LIVE_BIN names the pinned CLIProxyAPI binary' }, async (t) => {
  const binary = process.env.CONEXUS_CLIPROXY_LIVE_BIN
  const stateDir = mkdtempSync(join(tmpdir(), 'conexus-cliproxy-live-'))
  t.after(() => rmSync(stateDir, { recursive: true, force: true }))
  const pool = openPool(t, { binary, stateDir })
  const router = await openRouter(t, pool)
  // A record whose access token has not expired is available as soon as the proxy loads it; the pool waits on the management API's `unavailable` flag for that.
  const current = record('probe@example.com', { email: 'probe@example.com', access_token: 'not-a-token', expired: new Date(Date.now() + 3_600_000).toISOString(), expires_in: 3600, timestamp: Date.now(), project_id: 'probe' })
  const answer = await fetch(`${router.url}/v1/models`, { headers: { authorization: `Bearer ${encodeKey(current)}` } })
  assert.equal(answer.status, 200)
  assert.equal((await answer.json()).object, 'list')

  // An expired token the proxy cannot refresh leaves the account unavailable, which fails the start.
  const strict = await openRouter(t, openPool(t, { binary, stateDir: join(stateDir, 'strict'), authReadyTimeoutMs: 4_000 }))
  const expired = record('old@example.com', { email: 'old@example.com', access_token: 'not-a-token', expired: '2020-01-01T00:00:00Z', expires_in: 3600, timestamp: 1, project_id: 'probe' })
  assert.equal((await fetch(`${strict.url}/v1/models`, { headers: { authorization: `Bearer ${encodeKey(expired)}` } })).status, 503)

  const login = await pool.startLogin()
  const management = (path, body) => fetch(`${login.url}/v0/management${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-management-key': login.managementKey, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).then((response) => response.json())
  const started = await management('/antigravity-auth-url?is_webui=true')
  assert.equal(started.status, 'ok')
  assert.equal(new URL(started.url).searchParams.get('redirect_uri'), 'http://localhost:51121/oauth-callback')
  assert.equal(new URL(started.url).searchParams.get('state'), started.state)
  assert.deepEqual(await management(`/get-auth-status?state=${started.state}`), { status: 'wait' })
  // The forwarder's own redirect form, which a person pastes when the second hop fails.
  assert.deepEqual(await management('/oauth-callback', { provider: 'antigravity', redirect_url: `${login.url}/antigravity/callback?state=${started.state}&code=not-a-code` }), { status: 'ok' })
  assert.equal(await until(async () => (await management(`/get-auth-status?state=${started.state}`)).status === 'error', 15_000), true)
  assert.deepEqual(readdirSync(login.authDir).filter((name) => !name.startsWith('.')), [])
  await login.close()
})
