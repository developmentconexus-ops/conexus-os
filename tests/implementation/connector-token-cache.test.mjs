import assert from 'node:assert/strict'
import { inspect } from 'node:util'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { createTokenCache, AccessToken, Redacted, refreshAt } = await import(hubModuleUrl('connectors/token-cache.js'))
const { AdapterFailure } = await import(hubModuleUrl('connectors/errors.js'))

const CONNECTION = '11111111-1111-4111-8111-111111111111'

const issuer = ({ expiresInSeconds = 3600, delayMs = 0 } = {}) => {
  let issued = 0
  const issue = async () => {
    issued += 1
    const number = issued
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs))
    return { token: new AccessToken(`token-${number}`), expiresInSeconds }
  }
  return { issue, count: () => issued }
}

const bearerOf = async (lease) => (await lease()).bearer()

test('ten concurrent calls on a cold cache cause one issue and share its token', async () => {
  const cache = createTokenCache()
  const { issue, count } = issuer({ delayMs: 20 })
  const seen = await Promise.all(Array.from({ length: 10 }, () => cache.withToken(CONNECTION, issue, bearerOf)))
  assert.equal(count(), 1)
  assert.deepEqual(seen, Array(10).fill('token-1'))
  assert.equal(await cache.withToken(CONNECTION, issue, bearerOf), 'token-1')
  assert.equal(count(), 1)
})

test('a token is refreshed at expires_in minus max(60 s, 10 %), not after it expires', async () => {
  assert.equal(refreshAt(0, 3600), 3_240_000)
  assert.equal(refreshAt(0, 300), 240_000)
  let now = 0
  const cache = createTokenCache({ now: () => now })
  const { issue, count } = issuer({ expiresInSeconds: 3600 })
  assert.equal(await cache.withToken(CONNECTION, issue, bearerOf), 'token-1')
  now = 3_239_999
  assert.equal(await cache.withToken(CONNECTION, issue, bearerOf), 'token-1')
  now = 3_240_000
  assert.equal(await cache.withToken(CONNECTION, issue, bearerOf), 'token-2')
  assert.equal(count(), 2)
})

test('a refused token is dropped and fetched again once, and the call succeeds', async () => {
  const cache = createTokenCache()
  const { issue, count } = issuer()
  const attempts = []
  const work = async (lease) => {
    const token = await lease()
    attempts.push(token.bearer())
    if (token.bearer() === 'token-1') throw new AdapterFailure('TOKEN_REFUSED')
    return 'read'
  }
  assert.equal(await cache.withToken(CONNECTION, issue, work), 'read')
  assert.deepEqual(attempts, ['token-1', 'token-2'])
  assert.equal(count(), 2)
  assert.equal(await cache.withToken(CONNECTION, issue, bearerOf), 'token-2')
})

test('a token refused every time ends in the refusal after exactly two issues', async () => {
  const cache = createTokenCache()
  const { issue, count } = issuer()
  const refuse = async (lease) => { await lease(); throw new AdapterFailure('TOKEN_REFUSED') }
  await assert.rejects(cache.withToken(CONNECTION, issue, refuse), (error) => error instanceof AdapterFailure && error.reason === 'TOKEN_REFUSED')
  assert.equal(count(), 2)
})

test('a refusal of an older token does not drop a newer one another call already holds', async () => {
  let now = 0
  const cache = createTokenCache({ now: () => now })
  const { issue, count } = issuer({ expiresInSeconds: 3600 })
  let releaseStale
  const stale = cache.withToken(CONNECTION, issue, async (lease) => {
    const token = await lease()
    if (token.bearer() === 'token-1') {
      await new Promise((resolve) => { releaseStale = resolve })
      throw new AdapterFailure('TOKEN_REFUSED')
    }
    return token.bearer()
  })
  await new Promise((resolve) => setImmediate(resolve))
  now = 3_240_000
  assert.equal(await cache.withToken(CONNECTION, issue, bearerOf), 'token-2')
  releaseStale()
  assert.equal(await stale, 'token-2')
  assert.equal(count(), 2)
})

test('work refused before it asks for a token never issues one', async () => {
  const cache = createTokenCache()
  const { issue, count } = issuer()
  await assert.rejects(cache.withToken(CONNECTION, issue, async () => { throw new AdapterFailure('SERVICE_REFUSED') }), { message: 'SERVICE_REFUSED' })
  assert.equal(count(), 0)
})

test('a failed issue is not cached, and forget() drops a live token', async () => {
  const cache = createTokenCache()
  let fail = true
  let issued = 0
  const issue = async () => {
    issued += 1
    if (fail) throw new AdapterFailure('AUTHENTICATION_REFUSED')
    return { token: new AccessToken(`token-${issued}`), expiresInSeconds: 3600 }
  }
  await assert.rejects(cache.withToken(CONNECTION, issue, bearerOf), { message: 'AUTHENTICATION_REFUSED' })
  fail = false
  assert.equal(await cache.withToken(CONNECTION, issue, bearerOf), 'token-2')
  cache.forget(CONNECTION)
  assert.equal(await cache.withToken(CONNECTION, issue, bearerOf), 'token-3')
  assert.equal(issued, 3)
})

test('a token and a credential print [redacted] through JSON, inspect and String', () => {
  const token = new AccessToken('eyJ-secret-access-token')
  const credential = new Redacted({ clientId: 'client', clientSecret: 'secret-value', xToken: 'x-token-value' })
  for (const value of [token, credential]) {
    assert.equal(JSON.stringify({ value }), '{"value":"[redacted]"}')
    assert.equal(inspect({ value }), '{ value: [redacted] }')
    assert.equal(String(value), '[redacted]')
    assert.equal(`${value}`, '[redacted]')
  }
  assert.equal(token.bearer(), 'eyJ-secret-access-token')
})
