import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import { hubJsonWrite, opaque, testListener } from './access/test-listener.mjs'
import { fakeModelAccounts } from './model-accounts-fake.mjs'

const { registerModelAccountRoutes } = await import(hubModuleUrl('builder/model-accounts.js'))
const { Failure } = await import(hubModuleUrl('platform/failure.js'))

const SESSION_TOKEN = opaque('ana')
const ana = '22222222-2222-4222-8222-222222222222'
const authentic = { headers: hubJsonWrite, cookies: { '__Host-conexus_session': SESSION_TOKEN } }
const UNKNOWN_LOGIN = '77777777-7777-4777-8777-777777777777'
const MDL = ['listAvailableModels', 'listModelAccounts', 'setModelAccountApiKey', 'startClaudeModelLogin', 'completeClaudeModelLogin', 'startCodexModelLogin', 'pollCodexModelLogin', 'getGoogleModelConnection', 'startGoogleModelLogin', 'completeGoogleModelLogin', 'getGoogleModelLoginStatus']
const problem = (reply) => reply.json().type.replace('urn:conexus:problem:', '')

const createApp = async (t, dependencies = {}, modelAccounts = fakeModelAccounts().modelAccounts) => {
  let registered
  const { app } = await testListener({
    sessions: { [SESSION_TOKEN]: () => ({ account: { accountId: ana } }) },
    registerRoutes: async (instance) => {
      registered = await registerModelAccountRoutes(instance, { modelAccounts, defaultThinkingLevel: 'medium', ...dependencies })
      return registered
    },
  })
  t.after(() => app.close())
  return { app, registered }
}
const post = (app, url, payload = {}) => app.inject({ method: 'POST', url, ...authentic, payload })
const claudeAuthorization = { start: async () => ({ url: 'https://claude.ai/oauth/authorize', verifier: 'v' }), complete: async () => ({ access: 'a', refresh: 'r', expires: 9_999_999_999_999 }) }
const claude = '/api/control/model-accounts/anthropic/oauth'
const google = '/api/control/model-accounts/google-ai-pro'

test('the model routes register exactly listAvailableModels to getGoogleModelLoginStatus, and no offered model carries hasApiKey', async (t) => {
  const { app, registered } = await createApp(t)
  assert.deepEqual(registered, MDL)
  const models = await app.inject({ method: 'GET', url: '/api/control/model-accounts/models', ...authentic })
  assert.deepEqual([models.statusCode, models.json().models, models.json().defaultThinkingLevel], [200, [], 'medium'])
  assert.doesNotMatch(models.body, /hasApiKey/)
})

test('a sign-in whose credential write is refused answers 200 failed, and a database fault in the same write answers 500', async (t) => {
  const refused = fakeModelAccounts().modelAccounts
  refused.connect = async () => ({ ok: false, reason: 'ACCOUNT_INACTIVE' })
  const { app } = await createApp(t, { claudeAuthorization }, refused)
  const { loginId } = (await post(app, `${claude}/start`)).json()
  const failed = await post(app, `${claude}/complete`, { loginId, code: 'code#v' })
  assert.deepEqual([failed.statusCode, failed.json()], [200, { state: 'failed' }])

  const faulty = fakeModelAccounts().modelAccounts
  faulty.connect = async () => { throw new Error('connection terminated') }
  const second = await createApp(t, { claudeAuthorization }, faulty)
  const started = (await post(second.app, `${claude}/start`)).json()
  const fault = await post(second.app, `${claude}/complete`, { loginId: started.loginId, code: 'code#v' })
  assert.deepEqual([fault.statusCode, problem(fault)], [500, 'INTERNAL_UNEXPECTED'])
})

test('a key write by an inactive account answers ACCOUNT_INACTIVE', async (t) => {
  const inactive = fakeModelAccounts().modelAccounts
  inactive.write = async () => { throw new Failure('ACCOUNT_INACTIVE') }
  const { app } = await createApp(t, {}, inactive)
  const reply = await app.inject({ method: 'PUT', url: '/api/control/model-accounts/anthropic/api-key', ...authentic, payload: { key: `sk-ant-api03-${'x'.repeat(40)}` } })
  assert.deepEqual([reply.statusCode, problem(reply)], [403, 'ACCOUNT_INACTIVE'])
})

test('with no proxy pool the four Google routes answer MODEL_LOGIN_UNAVAILABLE, and the card reads that code', async (t) => {
  const { app } = await createApp(t)
  const replies = await Promise.all([
    app.inject({ method: 'GET', url: `${google}/connection`, ...authentic }),
    post(app, `${google}/login/start`),
    post(app, `${google}/login/complete`, { loginId: UNKNOWN_LOGIN, callbackUrl: 'http://localhost:51121/oauth-callback?state=s&code=c' }),
    post(app, `${google}/login/${UNKNOWN_LOGIN}`),
  ])
  assert.deepEqual(replies.map((reply) => [reply.statusCode, problem(reply)]), Array(4).fill([503, 'MODEL_LOGIN_UNAVAILABLE']))
})

test('a Google start the pool cannot serve is MODEL_LOGIN_UNAVAILABLE, and a well formed unknown handle and a malformed one are both 404', async (t) => {
  const { app } = await createApp(t, { googleAiPro: { startLogin: async () => { throw new Error('proxy down') } } })
  const started = await post(app, `${google}/login/start`)
  assert.deepEqual([started.statusCode, problem(started)], [503, 'MODEL_LOGIN_UNAVAILABLE'])
  const unknown = await post(app, `${google}/login/${UNKNOWN_LOGIN}`)
  assert.deepEqual([unknown.statusCode, problem(unknown)], [404, 'MODEL_LOGIN_NOT_FOUND'])
  const malformed = await post(app, `${google}/login/not-a-handle`)
  assert.deepEqual([malformed.statusCode, problem(malformed)], [404, 'MODEL_LOGIN_NOT_FOUND'])
})

test('a ChatGPT start whose device endpoint fails answers MODEL_LOGIN_UNAVAILABLE', async (t) => {
  const { app } = await createApp(t, { openaiCodexDevice: { start: async () => { throw new Error('OpenAI down') }, poll: async () => ({ status: 'pending' }) } })
  const reply = await post(app, '/api/control/model-accounts/openai-codex/oauth/start')
  assert.deepEqual([reply.statusCode, problem(reply)], [503, 'MODEL_LOGIN_UNAVAILABLE'])
})
