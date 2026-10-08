import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { parseCredential, encodeCredential, parseModelId, toCodexTokens } = await import(hubModuleUrl('model-account/credential.js'))
const google = 'cxagy1.YW50aWdyYXZpdHktc3ludGhldGljLmpzb24.eyJ0eXBlIjoiYW50aWdyYXZpdHkifQ'
const cases = [
  [{ provider: 'anthropic', kind: 'api_key' }, 'sk-ant-xxxxxxxxxxxxxxxxxxxx', 'sk-ant-xxxxxxxxxxxxxxxxxxxx'],
  [{ provider: 'anthropic', kind: 'oauth' }, '{"type":"oauth","access":"access","refresh":"refresh","expires":1}', { access: 'access', refresh: 'refresh', expires: 1 }],
  [{ provider: 'openai-codex', kind: 'oauth' }, '{"type":"oauth","access":"access","refresh":"refresh","expires":1,"accountId":"provider","email":null}', { access: 'access', refresh: 'refresh', expires: 1, accountId: 'provider', email: null }],
  [{ provider: 'google-ai-pro', kind: 'google_ai_pro' }, google, google],
]

for (const [pair, plain, value] of cases) test(`${pair.provider}/${pair.kind} preserves its lawful stored record`, () => {
  const credential = parseCredential(pair, plain)
  assert.deepEqual(credential, { ...pair, value })
  assert.equal(encodeCredential(credential), plain)
  assert.deepEqual(parseCredential(pair, encodeCredential(credential)), { ...pair, value })
})

test('credential edge refuses malformed values and every unlawful provider/kind pair', () => {
  for (const [pair] of cases) for (const plain of ['', 'null', '{', '{}', '123', '[]']) assert.throws(() => parseCredential(pair, plain))
  for (const provider of ['anthropic', 'openai-codex', 'google-ai-pro']) for (const kind of ['api_key', 'oauth', 'google_ai_pro']) {
    if (!cases.some(([pair]) => pair.provider === provider && pair.kind === kind)) assert.throws(() => parseCredential({ provider, kind }, 'example'), { id: 'MODEL_ACCOUNT_KEY_REFUSED' })
  }
  const pair = { provider: 'openai-codex', kind: 'oauth' }
  for (const bad of [
    { type: 'oauth', access: 'a', refresh: 'r', expires: 1, accountId: 'provider' },
    { type: 'oauth', access: 'a', refresh: 'r', expires: 1, accountId: 'provider', email: 7 },
    { type: 'oauth', access: 'a', refresh: 'r', expires: '1', accountId: 'provider', email: null },
    { type: 'key', access: 'a', refresh: 'r', expires: 1, accountId: 'provider', email: null },
  ]) assert.throws(() => parseCredential(pair, JSON.stringify(bad)), { id: 'OPENAI_CODEX_STORED_RECORD_REFUSED' })
})

test('native SDK missing email becomes explicit null without losing provider account identity', () => {
  assert.deepEqual(toCodexTokens({ access: 'a', refresh: 'r', expires: 1, accountId: 'provider' }), { access: 'a', refresh: 'r', expires: 1, accountId: 'provider', email: null })
  assert.throws(() => toCodexTokens({ access: 'a', refresh: 'r', expires: 1 }), { id: 'OPENAI_CODEX_STORED_RECORD_REFUSED' })
})

test('native model identity admits current router prefixes and retains nested native model names', () => {
  for (const model of ['anthropic/claude/example', 'openai/gpt-example', 'google-ai-pro/gemini-example']) assert.equal(parseModelId(model), model)
  for (const model of ['', 'example', 'anthropic/', '/example', 'anthropic/   ', 'mistral/example', 'openai-codex/example']) assert.equal(parseModelId(model), null)
})

test('production credential and model types reject weak brands, pairs, values, omissions and mutation', () => {
  const root = resolve(import.meta.dirname, '../..')
  const result = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', fileURLToPath(import.meta.resolve('./model-account-types.test-d.ts'))], { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
})
