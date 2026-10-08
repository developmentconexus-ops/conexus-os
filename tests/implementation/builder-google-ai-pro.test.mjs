import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { hubModuleUrl } from './hub-build.mjs'

const { GoogleAiProKey, encodeCredential } = await import(hubModuleUrl('model-account/credential.js'))

const built = hubModuleUrl
const { encodeKey, decodeKey, instanceIdOf } = await import(built('model-account/credential.js'))
const { createCliproxyPool, verifyCliproxyBinary } = await import(built('model-account/google-ai-pro/pool.js'))
const { startModelRouter } = await import(built('model-account/google-ai-pro/router.js'))
const { createRefreshWriteBack } = await import(built('model-account/google-ai-pro/write-back.js'))

const record = (account, extra = {}) => ({ fileName: `antigravity-${account}.json`, bytes: new TextEncoder().encode(JSON.stringify({ type: 'antigravity', refresh_token: `refresh-${account}`, ...extra })) })
const ana = encodeKey(record('ana@example.com'))
const bia = encodeKey(record('bia@example.com'))

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

// A call on Gemini's own API through the router, with the person's credential as its key.
const gemini = (router, path, key, init = {}) =>
  fetch(`${router.url}/v1beta/${path}`, { ...init, headers: { ...key ? { 'x-goog-api-key': key } : {}, 'content-type': 'application/json', ...init.headers } })
const generate = (router, key, model = 'gemini-3.1-pro-low') =>
  gemini(router, `models/${model}:streamGenerateContent?alt=sse`, key, { method: 'POST', body: JSON.stringify({ contents: [] }) })

const alive = (pid) => {
  try { process.kill(pid, 0); return true } catch { return false }
}

// An idle sweep per poll: the router releases its lease when the response ends, which the test cannot see.
const sweptUntil = (pool, predicate) => until(async () => { await pool.sweepIdle(new AbortController().signal); return predicate() })
const until = async (predicate, ms = 5_000) => {
  for (const deadline = Date.now() + ms; Date.now() < deadline; await delay(25)) if (await predicate()) return true
  return false
}

test('a credential carries the auth record whole, and only a well-formed Antigravity record parses', () => {
  const key = encodeKey(record('ana@example.com'))
  assert.equal(key.startsWith('cxagy1.'), true)
  assert.equal(GoogleAiProKey.parse(key), key)
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
  ]) assert.equal(GoogleAiProKey.safeParse(refused).success, false, refused)
  assert.throws(() => encodeKey({ fileName: '.oauth-antigravity-state.oauth', bytes: new Uint8Array([1]) }), { id: 'GOOGLE_AI_PRO_RECORD_REFUSED' })
})

test('the proxy config a person\'s proxy starts with sets no payload rule: the request itself asks Gemini for its thinking', async (t) => {
  const { binary, stateDir } = scratch(t)
  const router = await openRouter(t, openPool(t, { binary, stateDir }))
  const key = encodeKey(record('ana@example.com'))
  assert.equal((await gemini(router, 'models', key)).status, 200)
  const config = readFileSync(join(stateDir, instanceIdOf(key), 'config.yaml'), 'utf8')
    .replace(/^port: \d+$/m, 'port: PORT').replace(/^ {2}- ".+"$/m, '  - "KEY"')
  assert.equal(config, [
    'host: "127.0.0.1"',
    'port: PORT',
    `auth-dir: ${JSON.stringify(join(stateDir, instanceIdOf(key), 'auth'))}`,
    'api-keys:',
    '  - "KEY"',
    'remote-management:',
    '  allow-remote: false',
    '  secret-key: ""',
    '  disable-control-panel: true',
    'usage-statistics-enabled: false',
    'logging-to-file: false',
    '',
  ].join('\n'))
})

test('a binary whose sha256 differs from the pinned one is refused', async (t) => {
  const { binary } = scratch(t)
  const pinned = createHash('sha256').update(readFileSync(binary)).digest('hex')
  await verifyCliproxyBinary(binary, pinned)
  await assert.rejects(verifyCliproxyBinary(binary, '0'.repeat(64)), { id: 'GOOGLE_AI_PRO_BINARY_REFUSED' })
  await assert.rejects(verifyCliproxyBinary(join(binary, 'missing'), pinned), { id: 'GOOGLE_AI_PRO_BINARY_REFUSED' })
})

test('two people reach two proxies holding only their own record, and one person reuses one', async (t) => {
  const { binary, stateDir } = scratch(t)
  const router = await openRouter(t, openPool(t, { binary, stateDir }))
  const models = async (key) => {
    const answer = await gemini(router, 'models', key)
    assert.equal(answer.status, 200)
    return answer.json()
  }
  const first = await models(ana)
  const second = await models(bia)
  const again = await models(ana)
  assert.deepEqual(first.models.map((model) => model.displayName), ['antigravity-ana@example.com.json'])
  assert.deepEqual(second.models.map((model) => model.displayName), ['antigravity-bia@example.com.json'])
  assert.equal(again.pid, first.pid)
  assert.notEqual(second.pid, first.pid)
  assert.deepEqual(readdirSync(stateDir).sort(), [instanceIdOf(ana), instanceIdOf(bia)].sort())
})

test('concurrent first calls for one person start one proxy', async (t) => {
  const { binary, stateDir } = scratch(t)
  const router = await openRouter(t, openPool(t, { binary, stateDir }))
  const key = encodeKey(record('ana@example.com'))
  const answers = await Promise.all([1, 2, 3].map(() => gemini(router, 'models', key).then((answer) => answer.json())))
  assert.equal(new Set(answers.map((answer) => answer.pid)).size, 1)
})

test('a call without a usable Gemini API key is refused with 401 and starts nothing, a bearer included', async (t) => {
  const { binary, stateDir } = scratch(t)
  const router = await openRouter(t, openPool(t, { binary, stateDir }))
  const key = encodeKey(record('ana@example.com'))
  for (const headers of [{}, { 'x-goog-api-key': 'sk-not-a-record' }, { authorization: `Bearer ${key}` }]) {
    const answer = await fetch(`${router.url}/v1beta/models/gemini-3-flash:streamGenerateContent`, { method: 'POST', headers, body: '{}' })
    assert.equal(answer.status, 401)
    assert.deepEqual(await answer.json(), { error: { code: 401, message: 'Conecte o Google AI Pro nas Configurações.', status: 'UNAUTHENTICATED' } })
  }
  assert.equal(existsSync(stateDir), false)
})

test("the router serves Gemini's API only: the OpenAI-compatible path is not found", async (t) => {
  const { binary, stateDir } = scratch(t)
  const router = await openRouter(t, openPool(t, { binary, stateDir }))
  const answer = await fetch(`${router.url}/v1/chat/completions`, { method: 'POST', headers: { 'x-goog-api-key': encodeKey(record('ana@example.com')) }, body: '{}' })
  assert.equal(answer.status, 404)
  assert.equal(existsSync(stateDir), false)
})

test('a streamed answer reaches the caller before the proxy finishes it', async (t) => {
  const { binary, stateDir } = scratch(t)
  const router = await openRouter(t, openPool(t, { binary, stateDir }))
  const key = encodeKey(record('ana@example.com'))
  const answer = await generate(router, key)
  assert.equal(answer.headers.get('content-type'), 'text/event-stream')
  const reader = answer.body.getReader()
  const started = Date.now()
  const first = new TextDecoder().decode((await reader.read()).value)
  assert.equal(Date.now() - started < 500, true, 'first event arrived before the proxy ended the stream')
  assert.equal(first, 'data: {"files":["antigravity-ana@example.com.json"]}\n\n')
  let rest = ''
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) rest += new TextDecoder().decode(chunk.value)
  assert.equal(rest, 'data: {"candidates":[{"finishReason":"STOP"}]}\n\n')
})

test('a call waits for the proxy to accept the stored sign-in, which it refreshes after it is listening', async (t) => {
  const { binary, stateDir } = scratch(t)
  const router = await openRouter(t, openPool(t, { binary, stateDir }))
  const key = encodeKey(record('ana@example.com', { unavailableForMs: 800 }))
  const answer = await generate(router, key)
  assert.equal(answer.status, 200)
  assert.equal((await answer.text()).endsWith('data: {"candidates":[{"finishReason":"STOP"}]}\n\n'), true)
})

test('a proxy that never accepts the stored sign-in fails the start and is not kept', async (t) => {
  const { binary, stateDir } = scratch(t)
  const pool = openPool(t, { binary, stateDir, authReadyTimeoutMs: 600 })
  const router = await openRouter(t, pool)
  const answer = await generate(router, encodeKey(record('ana@example.com', { unavailableForMs: -1 })))
  assert.equal(answer.status, 503)
  assert.deepEqual(await answer.json(), { error: { code: 503, message: 'O Google AI Pro não iniciou.', status: 'UNAVAILABLE' } })
  assert.deepEqual(readdirSync(stateDir), [])
})

test('a proxy 401 becomes a reconnect message', async (t) => {
  const { binary, stateDir } = scratch(t)
  const router = await openRouter(t, openPool(t, { binary, stateDir }))
  const answer = await generate(router, encodeKey(record('ana@example.com')), 'unauthorized')
  assert.equal(answer.status, 401)
  assert.deepEqual(await answer.json(), { error: { code: 401, message: 'Reconecte o Google AI Pro nas Configurações.', status: 'UNAUTHENTICATED' } })
})

test('an idle proxy stops and its directory is removed', async (t) => {
  const { binary, stateDir } = scratch(t)
  const pool = openPool(t, { binary, stateDir, idleMs: 0 })
  const key = encodeKey(record('ana@example.com'))
  const lease = await pool.acquire(key)
  const { pid } = await (await fetch(`${lease.url}/v1/models`, { headers: { authorization: `Bearer ${lease.proxyKey}` } })).json()
  await pool.sweepIdle(new AbortController().signal)
  assert.equal(alive(pid), true, 'a leased proxy is never stopped')
  lease.release()
  await pool.sweepIdle(new AbortController().signal)
  assert.equal(await until(() => !alive(pid) && !existsSync(join(stateDir, instanceIdOf(key)))), true)
  const next = await pool.acquire(key)
  const restarted = await (await fetch(`${next.url}/v1/models`, { headers: { authorization: `Bearer ${next.proxyKey}` } })).json()
  assert.notEqual(restarted.pid, pid)
  next.release()
})

test('a refreshed auth file is captured and written back before an idle proxy\'s copy is deleted (AC-22)', async (t) => {
  const { binary, stateDir } = scratch(t)
  const pool = openPool(t, { binary, stateDir, idleMs: 0 })
  const key = encodeKey(record('ana@example.com'))
  const refreshed = []
  const lease = await pool.acquire(key, async (refreshedKey) => { refreshed.push(refreshedKey) })
  // Stands in for CLIProxyAPI refreshing the Google OAuth token inside the instance's own copy of
  // the record, while the lease is held.
  writeFileSync(join(stateDir, instanceIdOf(key), 'auth', 'antigravity-ana@example.com.json'), JSON.stringify({ type: 'antigravity', refresh_token: 'refreshed-token' }))
  lease.release()
  await pool.sweepIdle(new AbortController().signal)
  assert.equal(await until(() => refreshed.length === 1 && !existsSync(join(stateDir, instanceIdOf(key)))), true)
  const stored = decodeKey(refreshed[0])
  assert.equal(stored.fileName, 'antigravity-ana@example.com.json')
  assert.deepEqual(JSON.parse(Buffer.from(stored.bytes).toString()), { type: 'antigravity', refresh_token: 'refreshed-token' })
})

test('explicit pool and router close stop the proxy, write refreshed bytes, remove state, and close the listener', async (t) => {
  const { binary, stateDir } = scratch(t)
  const pool = openPool(t, { binary, stateDir })
  const router = await openRouter(t, pool)
  const key = encodeKey(record('ana@example.com'))
  const refreshed = []
  const lease = await pool.acquire(key, async (refreshedKey) => { refreshed.push(refreshedKey) })
  const { pid } = await (await fetch(`${lease.url}/v1/models`, { headers: { authorization: `Bearer ${lease.proxyKey}` } })).json()
  const instanceDir = join(stateDir, instanceIdOf(key))
  const refreshedBytes = JSON.stringify({ type: 'antigravity', refresh_token: 'refreshed-at-close' })
  writeFileSync(join(instanceDir, 'auth', 'antigravity-ana@example.com.json'), refreshedBytes)
  lease.release()

  await pool.close()
  assert.equal(alive(pid), false)
  assert.equal(existsSync(instanceDir), false)
  assert.equal(refreshed.length, 1)
  const stored = decodeKey(refreshed[0])
  assert.equal(stored.fileName, 'antigravity-ana@example.com.json')
  assert.equal(Buffer.from(stored.bytes).toString(), refreshedBytes)

  await router.close()
  await assert.rejects(fetch(`${router.url}/v1beta/models`), (error) => error.cause?.code === 'ECONNREFUSED')
})

test("a call through the router writes the refreshed record back to the caller's model account row by id, once (AC-22)", async (t) => {
  const { binary, stateDir } = scratch(t)
  const rewrites = []
  const heldRow = { held: { row: { modelAccountId: '30000000-0000-4000-8000-000000000001' } }, persist: async (credential) => { const secret = encodeCredential(credential); rewrites.push(['row-ana', secret]); return { ok: true, result: { state: 'stored' } } } }
  const writeBack = createRefreshWriteBack()
  const pool = openPool(t, { binary, stateDir, idleMs: 0 })
  const router = await openRouter(t, pool, writeBack.persistFor)
  const key = encodeKey(record('ana@example.com'))
  writeBack.track(key, heldRow)
  const answer = await gemini(router, 'models', key)
  assert.equal(answer.status, 200)
  await answer.json()
  // Stands in for CLIProxyAPI refreshing the Google token inside the instance's own copy.
  writeFileSync(join(stateDir, instanceIdOf(key), 'auth', 'antigravity-ana@example.com.json'), JSON.stringify({ type: 'antigravity', refresh_token: 'refreshed-token' }))
  assert.equal(await sweptUntil(pool, () => rewrites.length === 1 && !existsSync(join(stateDir, instanceIdOf(key)))), true)
  const [[modelAccountId, secret]] = rewrites
  assert.equal(modelAccountId, 'row-ana')
  assert.deepEqual(JSON.parse(Buffer.from(decodeKey(secret).bytes).toString()), { type: 'antigravity', refresh_token: 'refreshed-token' })
  await pool.sweepIdle(new AbortController().signal)
  assert.equal(rewrites.length, 1, 'one refresh, one write')
})

test('an unrefreshed record, or one whose row is not known, writes nothing back', async (t) => {
  const { binary, stateDir } = scratch(t)
  const rewrites = []
  const heldRow = { held: { row: { modelAccountId: '30000000-0000-4000-8000-000000000001' } }, persist: async (credential) => { const secret = encodeCredential(credential); rewrites.push(['row-ana', secret]); return { ok: true, result: { state: 'stored' } } } }
  const writeBack = createRefreshWriteBack()
  const pool = openPool(t, { binary, stateDir, idleMs: 0 })
  const router = await openRouter(t, pool, writeBack.persistFor)
  const known = encodeKey(record('ana@example.com'))
  const unknown = encodeKey(record('bia@example.com'))
  writeBack.track(known, heldRow)
  for (const key of [known, unknown]) await (await gemini(router, 'models', key)).json()
  assert.equal(await sweptUntil(pool, () => !existsSync(join(stateDir, instanceIdOf(known))) && !existsSync(join(stateDir, instanceIdOf(unknown)))), true)
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
    const { createCliproxyPool } = await import(${JSON.stringify(built('model-account/google-ai-pro/pool.js'))})
    const { encodeKey } = await import(${JSON.stringify(built('model-account/credential.js'))})
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


// Opt-in: runs the pinned CLIProxyAPI itself. It binds Google's callback port 51121 while it runs.
test('the real CLIProxyAPI answers the shapes the pool and the sign-in rely on', { skip: process.env.CONEXUS_CLIPROXY_LIVE_BIN ? false : 'opt-in: CONEXUS_CLIPROXY_LIVE_BIN names the pinned CLIProxyAPI binary' }, async (t) => {
  const binary = process.env.CONEXUS_CLIPROXY_LIVE_BIN
  const stateDir = mkdtempSync(join(tmpdir(), 'conexus-cliproxy-live-'))
  t.after(() => rmSync(stateDir, { recursive: true, force: true }))
  const pool = openPool(t, { binary, stateDir })
  const router = await openRouter(t, pool)
  // A record whose access token has not expired is available as soon as the proxy loads it; the pool waits on the management API's `unavailable` flag for that.
  const current = record('probe@example.com', { email: 'probe@example.com', access_token: 'not-a-token', expired: new Date(Date.now() + 3_600_000).toISOString(), expires_in: 3600, timestamp: Date.now(), project_id: 'probe' })
  const answer = await gemini(router, 'models', encodeKey(current))
  assert.equal(answer.status, 200)
  assert.equal(Array.isArray((await answer.json()).models), true)

  // An expired token the proxy cannot refresh leaves the account unavailable, which fails the start.
  const strict = await openRouter(t, openPool(t, { binary, stateDir: join(stateDir, 'strict'), authReadyTimeoutMs: 4_000 }))
  const expired = record('old@example.com', { email: 'old@example.com', access_token: 'not-a-token', expired: '2020-01-01T00:00:00Z', expires_in: 3600, timestamp: 1, project_id: 'probe' })
  assert.equal((await gemini(strict, 'models', encodeKey(expired))).status, 503)

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
