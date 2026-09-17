import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')

const compile = async (t) => {
  const buildRoot = await mkdtemp(resolve(repositoryRoot, 'apps/hub/claude-account-build-'))
  t.after(() => rm(buildRoot, { recursive: true, force: true }))
  const result = spawnSync(resolve(repositoryRoot, 'node_modules/.bin/esbuild'), [
    resolve(repositoryRoot, 'apps/hub/src/project/oauth-token-store.ts'),
    resolve(repositoryRoot, 'apps/hub/src/project/anthropic-oauth.ts'),
    `--outdir=${buildRoot}`, '--bundle', '--platform=node', '--format=esm', '--packages=external', '--log-level=error',
  ], { cwd: repositoryRoot, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stdout || result.stderr)
  return {
    oauth: await import(pathToFileURL(resolve(buildRoot, 'anthropic-oauth.js')).href),
    store: await import(pathToFileURL(resolve(buildRoot, 'oauth-token-store.js')).href),
  }
}

test('Claude OAuth builds the admitted PKCE request and rejects a mismatched provider state', async (t) => {
  const { oauth } = await compile(t)
  const authorization = await oauth.createAuthorizationRequest()
  const url = new URL(authorization.url)
  assert.equal(url.origin, 'https://claude.ai')
  assert.equal(url.pathname, '/oauth/authorize')
  assert.equal(url.searchParams.get('code'), 'true')
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(url.searchParams.get('state'), authorization.state)
  assert.equal(url.searchParams.get('scope'), 'user:profile user:inference')
  assert.equal(oauth.parseAuthorizationResult(`provider-code#${authorization.state}`, authorization.state), 'provider-code')
  assert.throws(() => oauth.parseAuthorizationResult(`provider-code#wrong`, authorization.state), /ANTHROPIC_OAUTH_STATE_INVALID/)
})

test('Claude OAuth exchange uses the qualified provider protocol and bounds the response', async (t) => {
  const { oauth } = await compile(t)
  let request
  const response = new Response(JSON.stringify({ access_token: 'access-fixture', refresh_token: 'refresh-fixture', expires_in: 3600 }), {
    status: 200, headers: { 'content-type': 'application/json' },
  })
  const tokens = await oauth.exchangeAuthorizationCode({ code: 'provider-code', state: 'state-fixture', verifier: 'verifier-fixture', fetchImpl: async (input, init) => {
    request = { input: String(input), init }
    return response
  } })
  assert.equal(request.input, 'https://console.anthropic.com/v1/oauth/token')
  assert.equal(request.init.redirect, 'manual')
  const body = JSON.parse(request.init.body)
  assert.deepEqual(body, {
    grant_type: 'authorization_code',
    client_id: oauth.ANTHROPIC_OAUTH.clientId,
    code: 'provider-code',
    state: 'state-fixture',
    redirect_uri: oauth.ANTHROPIC_OAUTH.redirectUri,
    code_verifier: 'verifier-fixture',
  })
  assert.equal(tokens.access, 'access-fixture')
  assert.equal(tokens.refresh, 'refresh-fixture')
  await assert.rejects(
    oauth.exchangeAuthorizationCode({ code: 'provider-code', state: 'state-fixture', verifier: 'verifier-fixture', fetchImpl: async () => new Response('x'.repeat(16 * 1024 + 1), { status: 200 }) }),
    /ANTHROPIC_OAUTH_RESPONSE_LIMIT_EXCEEDED|ANTHROPIC_OAUTH_TOKEN_INVALID/,
  )
})

test('Claude credential custody reads an admitted generation and rotates only through the next generation', async (t) => {
  const { store } = await compile(t)
  const entries = new Map()
  const backend = {
    async write(coordinate, bytes) { entries.set(`${coordinate.connectionId}:${coordinate.generation}`, Buffer.from(bytes)) },
    async publishOrMatch(coordinate, bytes) { const key = `${coordinate.connectionId}:${coordinate.generation}`; const existed = entries.has(key); if (!existed) entries.set(key, Buffer.from(bytes)); return existed ? 'MATCHED_EXISTING' : 'PUBLISHED' },
    idempotencyDigest: () => 'fixture',
    async materialize(coordinate) { const bytes = entries.get(`${coordinate.connectionId}:${coordinate.generation}`); if (!bytes) throw new Error('MISSING_FIXTURE_CREDENTIAL'); return Uint8Array.from(bytes) },
  }
  await backend.write({ connectionId: 'connection-fixture', generation: '1' }, Buffer.from(JSON.stringify({ access: 'access-1', refresh: 'refresh-1', expiresAt: Date.now() + 60_000 })))
  const tokenStore = store.createBackendOAuthTokenStore(backend, { connectionId: 'connection-fixture', generation: '1' })
  assert.equal(await tokenStore.getAccessToken(), 'access-1')
  assert.doesNotThrow(() => tokenStore.validate())

  entries.set('connection-fixture:1', Buffer.from(JSON.stringify({ access: 'expired', refresh: 'refresh-1', expiresAt: 0 })))
  const refreshed = store.createBackendOAuthTokenStore(
    backend,
    { connectionId: 'connection-fixture', generation: '1' },
    async (refresh) => { assert.equal(refresh, 'refresh-1'); return { access: 'access-2', refresh: 'refresh-2', expiresAt: Date.now() + 60_000 } },
  )
  assert.equal(await refreshed.getAccessToken(), 'access-2')
  assert.match(new TextDecoder().decode(entries.get('connection-fixture:2')), /access-2/)
})

test('Claude credential acquisition rechecks the active generation before using a cached token', async (t) => {
  const { store } = await compile(t)
  const entries = new Map([
    ['connection-fixture:1', Buffer.from(JSON.stringify({ access: 'access-1', refresh: 'refresh-1', expiresAt: Date.now() + 60_000 }))],
    ['connection-fixture:2', Buffer.from(JSON.stringify({ access: 'access-2', refresh: 'refresh-2', expiresAt: Date.now() + 60_000 }))],
  ])
  let generation = '1'
  const backend = {
    async publishOrMatch() { return 'PUBLISHED' },
    async materialize(coordinate) { return Uint8Array.from(entries.get(`${coordinate.connectionId}:${coordinate.generation}`)) },
  }
  const tokenStore = store.createBackendOAuthTokenStore(backend, { connectionId: 'connection-fixture', generation }, undefined, {
    resolveCurrent: async () => ({ connectionId: 'connection-fixture', generation }),
  })
  assert.equal(await tokenStore.getAccessToken(), 'access-1')
  generation = '2'
  assert.equal(await tokenStore.getAccessToken(), 'access-2')
})
