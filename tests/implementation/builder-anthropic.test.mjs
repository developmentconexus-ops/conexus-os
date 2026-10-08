import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import { providerModel } from './native-model-fixture.mjs'
const { createClaudeLogin } = await import(hubModuleUrl('model-account/anthropic/login.js'))
const account = { accountId: '10000000-0000-4000-8000-000000000001' }
const other = { accountId: '10000000-0000-4000-8000-000000000002' }
const key = `sk-ant-api03-${'x'.repeat(40)}`
const tokens = { access: 'synthetic-access', refresh: 'synthetic-refresh', expires: 9_999_999_999_999 }
const prompt = [{ role: 'user', content: [{ type: 'text', text: 'oi' }] }]

for (const kind of ['api_key', 'oauth']) {
  test(`the native Anthropic ${kind} leaf keeps Messages headers, model, OAuth identity and betas`, async (t) => {
    const model = await providerModel({ credential: { provider: 'anthropic', kind, value: kind === 'api_key' ? key : tokens }, modelId: 'anthropic/claude-opus-5-5' })
    const sent = []
    const original = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init)
      sent.push({ url: request.url, key: request.headers.get('x-api-key'), bearer: request.headers.get('authorization'), betas: request.headers.get('anthropic-beta'), body: await request.json() })
      return new Response('synthetic refusal', { status: 418 })
    }
    t.after(() => { globalThis.fetch = original })
    await assert.rejects(model.doStream({ prompt }))
    assert.equal(sent.length, 1)
    assert.deepEqual([sent[0].url, sent[0].key, sent[0].bearer, sent[0].body.model], ['https://api.anthropic.com/v1/messages', kind === 'api_key' ? key : null, kind === 'oauth' ? 'Bearer synthetic-access' : null, 'claude-opus-5-5'])
    if (kind === 'oauth') {
      assert.deepEqual(sent[0].betas.split(',').slice(0, 2), ['oauth-2025-04-20', 'claude-code-20250219'])
      assert.equal(sent[0].body.system[0].text, "You are Claude Code, Anthropic's official CLI for Claude.")
    }
  })
}

test('Claude paste attempts belong to one person, retain a rejected paste and replace an earlier attempt', async () => {
  const written = []
  let now = 1000
  const login = createClaudeLogin({ now: () => now,
    authorization: { start: async () => ({ url: 'https://claude.ai/oauth/authorize', verifier: 'synthetic-verifier' }), complete: async (code) => { if (code !== 'good') throw new Error('synthetic refusal'); return tokens } },
    connect: async (caller, credential) => { written.push([caller.accountId, credential]); return { ok: true, result: undefined } },
  })
  const first = await login.start(account)
  assert.equal(await login.complete(other, first.loginId, 'good'), 'expired')
  assert.equal(await login.complete(account, first.loginId, 'bad'), 'failed')
  assert.equal(await login.complete(account, first.loginId, 'good'), 'succeeded')
  assert.deepEqual(written, [[account.accountId, tokens]])
  const replaced = await login.start(account)
  const current = await login.start(account)
  assert.equal(await login.complete(account, replaced.loginId, 'good'), 'expired')
  now += 10 * 60_000
  assert.equal(await login.complete(account, current.loginId, 'good'), 'expired')
})

test('Claude admission refusal completes failed; a database fault propagates after native authorization', async () => {
  const authorization = { start: async () => ({ url: 'https://claude.ai/oauth/authorize', verifier: 'v' }), complete: async () => tokens }
  const refused = createClaudeLogin({ authorization, connect: async () => ({ ok: false, error: { code: 'ACCOUNT_INACTIVE' } }) })
  assert.equal(await refused.complete(account, (await refused.start(account)).loginId, 'code'), 'failed')
  const fault = new Error('synthetic database fault')
  const failed = createClaudeLogin({ authorization, connect: async () => { throw fault } })
  await assert.rejects(failed.complete(account, (await failed.start(account)).loginId, 'code'), (error) => error === fault)
})
