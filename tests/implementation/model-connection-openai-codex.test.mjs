import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

// The ChatGPT sign-in, proved against a fake OpenAI authorization server and a fake Codex
// inference endpoint. No live call is made: no ChatGPT credential exists in this repository, and
// the parts that can only be settled by one is listed in the pull request rather than guessed at
// here.

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = await mkdtemp(resolve(repositoryRoot, 'apps/hub/model-connection-openai-codex-build-'))
test.after(() => rm(buildRoot, { recursive: true, force: true }))

const bundle = (relativeSourcePath) => {
  const outfile = resolve(buildRoot, `${relativeSourcePath.replaceAll('/', '-')}.js`)
  const built = spawnSync(resolve(repositoryRoot, 'node_modules/.bin/esbuild'), [
    resolve(repositoryRoot, relativeSourcePath), `--outfile=${outfile}`, '--bundle', '--platform=node', '--format=esm', '--packages=external', '--log-level=error',
  ], { cwd: repositoryRoot, encoding: 'utf8' })
  if (built.status !== 0) throw new Error(built.stdout || built.stderr)
  return import(pathToFileURL(outfile).href)
}

const oauth = await bundle('apps/hub/src/model-connection/oauth-provider.ts')
const registry = await bundle('apps/hub/src/model-connection/oauth-provider-registry.ts')
const custody = await bundle('apps/hub/src/model-connection/oauth-token-store.ts')
const dispatch = await bundle('apps/hub/src/model-connection/openai-codex-oauth-provider.ts')

const CODEX = registry.OPENAI_CODEX_OAUTH
const ACCOUNT_ID = 'acct_01J8ZK3QYV'
const jwt = (payload) => `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`
const jsonResponse = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

test('the authorize URL is the Codex request, under a Conexus originator rather than a borrowed one', async () => {
  const authorization = await oauth.createAuthorizationRequest(CODEX)
  const url = new URL(authorization.url)
  assert.equal(url.origin, 'https://auth.openai.com')
  assert.equal(url.pathname, '/oauth/authorize')
  assert.equal(url.searchParams.get('client_id'), 'app_EMoamEEZ73f0CkXaXp7hrann')
  assert.equal(url.searchParams.get('response_type'), 'code')
  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:1455/auth/callback')
  assert.equal(url.searchParams.get('scope'), 'openid profile email offline_access api.connectors.read api.connectors.invoke')
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(url.searchParams.get('id_token_add_organizations'), 'true')
  assert.equal(url.searchParams.get('codex_cli_simplified_flow'), 'true')
  assert.equal(url.searchParams.get('state'), authorization.state)
  // Naming somebody else's client would be impersonation and would deny OpenAI the ability to
  // refuse this caller specifically.
  assert.equal(url.searchParams.get('originator'), 'conexus-os')
  assert.equal(url.searchParams.get('originator') === 'codex_cli_rs', false)
  assert.equal(url.searchParams.get('originator') === 'mastracode', false)
  assert.match(authorization.verifier, /^[A-Za-z0-9_-]{43,128}$/)
})

test('the user pastes the redirect URL the browser could not load, and only the matching state is accepted', async () => {
  const authorization = await oauth.createAuthorizationRequest(CODEX)
  const pasted = `http://localhost:1455/auth/callback?code=codex-code&state=${encodeURIComponent(authorization.state)}`
  assert.equal(oauth.extractResultState(CODEX, pasted), authorization.state)
  assert.equal(oauth.parseAuthorizationResult(CODEX, pasted, authorization.state), 'codex-code')
  assert.equal(oauth.parseAuthorizationResult(CODEX, ` ${pasted} `, authorization.state), 'codex-code')

  assert.throws(() => oauth.parseAuthorizationResult(CODEX, `http://localhost:1455/auth/callback?code=codex-code&state=other`, authorization.state), /OPENAI_CODEX_OAUTH_STATE_INVALID/)
  assert.throws(() => oauth.extractResultState(CODEX, 'codex-code#some-state'), /OPENAI_CODEX_OAUTH_AUTHORIZATION_RESULT_INVALID/)
  assert.throws(() => oauth.extractResultState(CODEX, 'http://localhost:1455/auth/callback'), /OPENAI_CODEX_OAUTH_AUTHORIZATION_RESULT_INVALID/)
  assert.throws(() => oauth.extractResultState(CODEX, `https://evil.example/auth/callback?code=c&state=${authorization.state}`), /OPENAI_CODEX_OAUTH_AUTHORIZATION_RESULT_INVALID/)
  assert.throws(() => oauth.extractResultState(CODEX, `http://localhost:1455/other?code=c&state=${authorization.state}`), /OPENAI_CODEX_OAUTH_AUTHORIZATION_RESULT_INVALID/)
})

test('the exchange is form-encoded, carries no state, and takes the account id out of the id_token', async () => {
  let request
  const before = Date.now()
  const tokens = await oauth.exchangeAuthorizationCode(CODEX, {
    code: 'codex-code', state: 'state-fixture', verifier: 'verifier-fixture',
    fetchImpl: async (input, init) => {
      request = { url: String(input), init }
      return jsonResponse({ access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600, id_token: jwt({ chatgpt_account_id: ACCOUNT_ID }) })
    },
  })
  const after = Date.now()
  assert.equal(request.url, 'https://auth.openai.com/oauth/token')
  assert.equal(request.init.redirect, 'manual')
  assert.equal(request.init.headers['content-type'], 'application/x-www-form-urlencoded')
  assert.deepEqual(Object.fromEntries(new URLSearchParams(request.init.body)), {
    grant_type: 'authorization_code',
    client_id: 'app_EMoamEEZ73f0CkXaXp7hrann',
    code: 'codex-code',
    redirect_uri: 'http://localhost:1455/auth/callback',
    code_verifier: 'verifier-fixture',
  })
  assert.equal(tokens.access, 'access-1')
  assert.equal(tokens.refresh, 'refresh-1')
  assert.equal(tokens.accountId, ACCOUNT_ID)
  // 3600 seconds of lifetime less the five-minute skew custody applies at write time.
  assert.ok(tokens.expiresAt >= before + 3_300_000 && tokens.expiresAt <= after + 3_300_000)
})

test('the account id is also read from the namespaced claim, from the access token, and is mandatory', async () => {
  const exchange = (body) => oauth.exchangeAuthorizationCode(CODEX, {
    code: 'codex-code', state: 'state-fixture', verifier: 'verifier-fixture', fetchImpl: async () => jsonResponse(body),
  })
  const namespaced = await exchange({ access_token: 'a', refresh_token: 'r', expires_in: 3600, id_token: jwt({ 'https://api.openai.com/auth': { chatgpt_account_id: ACCOUNT_ID } }) })
  assert.equal(namespaced.accountId, ACCOUNT_ID)

  const fromAccessToken = await exchange({ access_token: jwt({ chatgpt_account_id: ACCOUNT_ID }), refresh_token: 'r', expires_in: 3600, id_token: jwt({ sub: 'nobody' }) })
  assert.equal(fromAccessToken.accountId, ACCOUNT_ID)

  // expires_in has been observed missing, so this provider declares a default rather than failing.
  const defaulted = await exchange({ access_token: 'a', refresh_token: 'r', id_token: jwt({ chatgpt_account_id: ACCOUNT_ID }) })
  assert.ok(defaulted.expiresAt > Date.now())

  // A sign-in that cannot produce an account id is a failed sign-in, not a connection that would
  // be stored and then fail on its first request.
  await assert.rejects(
    exchange({ access_token: 'a', refresh_token: 'r', expires_in: 3600, id_token: jwt({ sub: 'nobody' }) }),
    /OPENAI_CODEX_OAUTH_ACCOUNT_ID_REQUIRED/)
  await assert.rejects(
    exchange({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }),
    /OPENAI_CODEX_OAUTH_ACCOUNT_ID_REQUIRED/)
})

test('the refresh grant is form-encoded and carries the rotated account id forward when the response omits it', async () => {
  let body
  const tokens = await oauth.refreshAuthorizationToken(CODEX, 'refresh-1', async (_input, init) => {
    body = Object.fromEntries(new URLSearchParams(init.body))
    return jsonResponse({ access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 3600 })
  }, ACCOUNT_ID)
  assert.deepEqual(body, { grant_type: 'refresh_token', client_id: 'app_EMoamEEZ73f0CkXaXp7hrann', refresh_token: 'refresh-1' })
  assert.equal(tokens.access, 'access-2')
  assert.equal(tokens.refresh, 'refresh-2')
  assert.equal(tokens.accountId, ACCOUNT_ID)
})

// A token endpoint that behaves the way OpenAI's does: the refresh token rotates, and the one just
// spent stops working. Replaying it is refused rather than quietly re-issued.
const rotatingTokenEndpoint = () => {
  const spent = []
  let accepted = 'refresh-1'
  let issued = 1
  return {
    spent,
    refresh: async (refresh, accountId) => {
      spent.push(refresh)
      if (refresh !== accepted) throw new Error('OPENAI_CODEX_OAUTH_PROVIDER_REFUSED')
      issued += 1
      accepted = `refresh-${issued}`
      return { access: `access-${issued}`, refresh: accepted, expiresAt: Date.now() + 60_000, accountId }
    },
  }
}

// Two token stores over one custody backend and one generation counter stand in for two Hub
// processes holding the same connection.
const sharedCustody = () => {
  const entries = new Map([['connection-fixture:1', Buffer.from(JSON.stringify({ access: 'access-1', refresh: 'refresh-1', expiresAt: 0, accountId: ACCOUNT_ID }))]])
  let generation = '1'
  const backend = {
    async publishOrMatch(coordinate, bytes) { entries.set(`${coordinate.connectionId}:${coordinate.generation}`, Buffer.from(bytes)); return 'PUBLISHED' },
    async materialize(coordinate) {
      const bytes = entries.get(`${coordinate.connectionId}:${coordinate.generation}`)
      if (!bytes) throw new Error('MISSING_FIXTURE_CREDENTIAL')
      return Uint8Array.from(bytes)
    },
  }
  return {
    entries,
    backend,
    persisted: () => JSON.parse(entries.get(`connection-fixture:${generation}`).toString('utf8')),
    currentGeneration: () => generation,
    options: {
      resolveCurrent: async () => ({ connectionId: 'connection-fixture', generation }),
      publishRefresh: async ({ current, next, tokens }) => {
        if (generation !== current.generation) return false
        entries.set(`${next.connectionId}:${next.generation}`, Buffer.from(JSON.stringify(tokens), 'utf8'))
        generation = next.generation
        return true
      },
    },
  }
}

const perConnectionLock = () => {
  let tail = Promise.resolve()
  return (run) => {
    const result = tail.then(run)
    tail = result.then(() => undefined, () => undefined)
    return result
  }
}

test('two Hub processes refreshing at once spend the rotating refresh token exactly once', async () => {
  const shared = sharedCustody()
  const endpoint = rotatingTokenEndpoint()
  const serializeRefresh = perConnectionLock()
  const make = () => custody.createBackendOAuthTokenStore(
    shared.backend, { connectionId: 'connection-fixture', generation: '1' }, endpoint.refresh,
    { codePrefix: 'OPENAI_CODEX_OAUTH', serializeRefresh, ...shared.options })

  const [first, second] = await Promise.all([make().getToken(), make().getToken()])

  // The endpoint saw the expired set's refresh token once. The second process entered the critical
  // section after the first had written, found a live access token, and never called out at all.
  assert.deepEqual(endpoint.spent, ['refresh-1'])
  assert.deepEqual(first, { access: 'access-2', accountId: ACCOUNT_ID })
  assert.deepEqual(second, { access: 'access-2', accountId: ACCOUNT_ID })
  // The token set was persisted before its access token was handed to anybody, so custody holds
  // the refresh token the provider has made current rather than the one it has just retired.
  assert.equal(shared.currentGeneration(), '2')
  const persisted = shared.persisted()
  assert.equal(persisted.access, 'access-2')
  assert.equal(persisted.refresh, 'refresh-2')
  assert.equal(persisted.accountId, ACCOUNT_ID)
})

test('without that serialization the same two processes double-spend the refresh token and one is refused', async () => {
  const shared = sharedCustody()
  const endpoint = rotatingTokenEndpoint()
  const make = () => custody.createBackendOAuthTokenStore(
    shared.backend, { connectionId: 'connection-fixture', generation: '1' }, endpoint.refresh,
    { codePrefix: 'OPENAI_CODEX_OAUTH', ...shared.options })

  const settled = await Promise.allSettled([make().getToken(), make().getToken()])

  assert.deepEqual(endpoint.spent, ['refresh-1', 'refresh-1'])
  assert.deepEqual(settled.map((outcome) => outcome.status), ['fulfilled', 'rejected'])
  assert.match(settled[1].reason.message, /OPENAI_CODEX_OAUTH_PROVIDER_REFUSED/)
})

test('a caller that only has to authenticate a request never receives the refresh token', async () => {
  const shared = sharedCustody()
  const endpoint = rotatingTokenEndpoint()
  const store = custody.createBackendOAuthTokenStore(
    shared.backend, { connectionId: 'connection-fixture', generation: '1' }, endpoint.refresh,
    { codePrefix: 'OPENAI_CODEX_OAUTH', serializeRefresh: perConnectionLock(), ...shared.options })
  assert.deepEqual(Object.keys(await store.getToken()).sort(), ['access', 'accountId'])
})

const codexTokenStore = (accountId = ACCOUNT_ID) => Object.freeze({
  validate: () => undefined,
  getToken: async () => Object.freeze(accountId === null ? { access: 'access-fixture' } : { access: 'access-fixture', accountId }),
})

const driveModel = async (model, fetchImpl) => {
  try { await model.doStream({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }], includeRawChunks: false }) }
  catch (error) { if (!fetchImpl.captured) throw error }
  return fetchImpl.captured
}

const capturingFetch = (respond) => {
  const impl = async (input, init) => {
    impl.captured = { url: String(input instanceof Request ? input.url : input), init }
    return respond()
  }
  return impl
}

test('a Codex request reaches the one Codex endpoint, bearing the OAuth token and the account id', async () => {
  const fetchImpl = capturingFetch(() => new Response('data: {"type":"response.completed"}\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } }))
  const model = dispatch.createOpenAICodexOAuthModel({ tokenStore: codexTokenStore(), modelId: 'gpt-5.3-codex', fetchImpl })
  const captured = await driveModel(model, fetchImpl)

  assert.equal(captured.url, 'https://chatgpt.com/backend-api/codex/responses')
  const headers = new Headers(captured.init.headers)
  assert.equal(headers.get('authorization'), 'Bearer access-fixture')
  assert.equal(headers.get('chatgpt-account-id'), ACCOUNT_ID)
  assert.equal(headers.get('originator'), 'conexus-os')
  assert.equal(headers.get('user-agent'), 'conexus-os')
  assert.equal(headers.get('x-api-key'), null)
  assert.equal(headers.get('content-length'), null)
  assert.equal(captured.init.redirect, 'manual')

  const body = JSON.parse(captured.init.body)
  assert.equal(body.model, 'gpt-5.3-codex')
  assert.equal(body.stream, true)
  assert.equal(body.store, false)
  assert.equal(typeof body.instructions, 'string')
  assert.equal(body.instructions.length > 0, true)
})

test('the settings the backend requires are not the caller to choose, but its instructions are kept', async () => {
  const fetchImpl = capturingFetch(() => new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } }))
  const model = dispatch.createOpenAICodexOAuthModel({ tokenStore: codexTokenStore(), modelId: 'gpt-5.3-codex', fetchImpl })
  try {
    await model.doStream({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      includeRawChunks: false,
      providerOptions: { openai: { instructions: 'Instruções do chamador.', store: true } },
    })
  } catch (error) { if (!fetchImpl.captured) throw error }

  const body = JSON.parse(fetchImpl.captured.init.body)
  assert.equal(body.instructions, 'Instruções do chamador.')
  assert.equal(body.store, false)
  assert.equal(body.stream, true)
})

test('a model id that floats, and an account id that is missing, are both refused before any request', async () => {
  assert.throws(() => dispatch.createOpenAICodexOAuthModel({ tokenStore: codexTokenStore(), modelId: 'codex-mini-latest' }), /PROJECT_MODEL_ID_REFUSED/)
  assert.throws(() => dispatch.createOpenAICodexOAuthModel({ tokenStore: codexTokenStore(), modelId: 'gpt-5.3-*' }), /PROJECT_MODEL_ID_REFUSED/)

  const fetchImpl = capturingFetch(() => new Response('', { status: 200 }))
  const model = dispatch.createOpenAICodexOAuthModel({ tokenStore: codexTokenStore(null), modelId: 'gpt-5.3-codex', fetchImpl })
  await assert.rejects(
    async () => model.doStream({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }], includeRawChunks: false }),
    /OPENAI_CODEX_OAUTH_ACCOUNT_ID_REQUIRED/)
  assert.equal(fetchImpl.captured, undefined)
})

test('the registry names both providers and refuses one it does not carry', () => {
  assert.deepEqual(Object.keys(registry.OAUTH_PROVIDERS).sort(), ['anthropic', 'openai-codex'])
  assert.equal(registry.DEFAULT_OAUTH_PROVIDER_ID, 'anthropic')
  assert.equal(registry.oauthProvider('openai-codex').providerId, 'openai-codex')
  assert.throws(() => registry.oauthProvider('openai'), /MODEL_OAUTH_PROVIDER_UNKNOWN/)
  assert.throws(() => registry.oauthProvider('__proto__'), /MODEL_OAUTH_PROVIDER_UNKNOWN/)
})
