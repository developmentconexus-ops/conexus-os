import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import { codexModel } from './codex-model.mjs'
const { createCodexLogin } = await import(hubModuleUrl('model-account/openai-codex/login.js'))
const account = { accountId: '10000000-0000-4000-8000-000000000001' }
const other = { accountId: '10000000-0000-4000-8000-000000000002' }
const tokens = { access: 'synthetic-access', refresh: 'synthetic-refresh', expires: 9_999_999_999_999, accountId: 'synthetic-provider-account', email: null }

function deviceFixture() {
  let now = 1000
  let answered = false
  const pending = { deviceAuthId: 'synthetic-device', userCode: 'ABCD-1234', url: 'https://auth.openai.com/codex/device', intervalMs: 1000, deadlineAt: 2000 }
  const writes = []
  const login = createCodexLogin({ now: () => now, device: { start: async () => pending, poll: async () => answered ? { status: 'success', credentials: tokens } : { status: 'pending' } },
    connect: async (caller, credentials) => { writes.push([caller.accountId, credentials]); return { ok: true, result: undefined } } })
  return { login, writes, answer: () => { answered = true }, expire: () => { now = 2000 } }
}

test('Codex device handoff preserves the native code/interval, owner, waiting state and one successful write', async () => {
  const f = deviceFixture()
  const handoff = await f.login.start(account)
  assert.deepEqual([handoff.url, handoff.userCode, handoff.intervalMs, handoff.expiresAt], ['https://auth.openai.com/codex/device', 'ABCD-1234', 1000, 2000])
  assert.equal(await f.login.poll(other, handoff.loginId), 'expired')
  assert.equal(await f.login.poll(account, handoff.loginId), 'waiting')
  f.answer()
  assert.equal(await f.login.poll(account, handoff.loginId), 'succeeded')
  assert.equal(await f.login.poll(account, handoff.loginId), 'succeeded')
  assert.deepEqual(f.writes, [[account.accountId, tokens]])
})

test('a later Codex attempt replaces the previous one and the native deadline expires it', async () => {
  const f = deviceFixture()
  const previous = await f.login.start(account)
  const current = await f.login.start(account)
  assert.equal(await f.login.poll(account, previous.loginId), 'expired')
  f.expire()
  assert.equal(await f.login.poll(account, current.loginId), 'expired')
})

test('Codex concurrent polls share the native device request and normalize native missing email to null', async () => {
  let polls = 0
  let release
  const pending = new Promise((resolve) => { release = resolve })
  const writes = []
  const { email: _email, ...nativeTokens } = tokens
  const login = createCodexLogin({ device: { start: async () => ({ deviceAuthId: 'device', url: 'https://auth.openai.com/codex/device', userCode: 'CODE', intervalMs: 1000, deadlineAt: 9_999_999_999_999 }), poll: async () => { polls++; await pending; return { status: 'success', credentials: nativeTokens } } }, connect: async (_caller, credentials) => { writes.push(credentials); return { ok: true, result: undefined } } })
  const handoff = await login.start(account)
  const a = login.poll(account, handoff.loginId), b = login.poll(account, handoff.loginId)
  release()
  assert.deepEqual(await Promise.all([a, b]), ['succeeded', 'succeeded'])
  assert.equal(polls, 1)
  assert.deepEqual(writes, [tokens])
})

test('the native Codex model uses the bearer and provider account, preserves reasoning summary and removes max_output_tokens', async (t) => {
  const seen = []
  const original = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    seen.push({ url: request.url, authorization: request.headers.get('authorization'), account: request.headers.get('chatgpt-account-id'), originator: request.headers.get('originator'), body: await request.json() })
    return new Response('synthetic refusal', { status: 418 })
  }
  t.after(() => { globalThis.fetch = original })
  const model = await codexModel('gpt-5.6-sol', tokens)
  await assert.rejects(model.doStream({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'oi' }] }], maxOutputTokens: 24000 }))
  assert.equal(seen.length, 1)
  assert.deepEqual([seen[0].url, seen[0].authorization, seen[0].account, seen[0].body.reasoning, seen[0].body.max_output_tokens], ['https://chatgpt.com/backend-api/codex/responses', 'Bearer synthetic-access', 'synthetic-provider-account', { effort: 'medium', summary: 'auto' }, undefined])
})
