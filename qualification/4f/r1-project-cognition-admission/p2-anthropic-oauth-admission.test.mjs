import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { lookup } from 'node:dns/promises'
import { chmodSync, lstatSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { after, test } from 'node:test'
import { promisify } from 'node:util'
import {
  ANTHROPIC_OAUTH,
  createAuthorizationRequest,
  exchangeAuthorizationCode,
  parseAuthorizationResult,
} from './anthropic-oauth.mjs'
import {
  ANTHROPIC_API_ORIGIN,
  ANTHROPIC_MODEL_ID,
  ANTHROPIC_OPUS_SUCCESSOR_MODEL_ID,
  CLAUDE_CODE_IDENTITY,
  OAUTH_BETAS,
  createAnthropicOAuthFetch,
  createAnthropicOAuthModel,
} from './anthropic-oauth-provider.mjs'
import { createOAuthTokenStore, DEFAULT_OAUTH_TOKEN_PATH } from './oauth-token-store.mjs'
import { beginNetworkEgressObservation } from './p2-egress-observer.mjs'

process.env.MASTRA_TELEMETRY_DISABLED = '1'

const [{ Agent }, { MastraModelGateway }, { RequestContext }] = await Promise.all([
  import('@mastra/core/agent'),
  import('@mastra/core/llm'),
  import('@mastra/core/request-context'),
])

const temporaryRoots = []
const execFileAsync = promisify(execFile)
after(async () => Promise.all(temporaryRoots.map(path => rm(path, { recursive: true, force: true }))))

async function temporaryTokenPath() {
  const root = await mkdtemp(resolve(tmpdir(), 'conexus-r1c13-p2-'))
  temporaryRoots.push(root)
  return resolve(root, 'credentials', 'anthropic-oauth.json')
}

test('P2-P01 PKCE uses independent state and refuses a substituted callback', async () => {
  const request = await createAuthorizationRequest()
  const url = new URL(request.url)
  assert.equal(url.origin, 'https://claude.ai')
  assert.equal(url.searchParams.get('client_id'), ANTHROPIC_OAUTH.clientId)
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(url.searchParams.get('scope'), 'user:profile user:inference')
  assert.notEqual(request.state, request.verifier)
  assert.equal(parseAuthorizationResult(`code-42#${request.state}`, request.state), 'code-42')
  assert.throws(() => parseAuthorizationResult('code-42#substituted', request.state), /ANTHROPIC_OAUTH_STATE_INVALID/)
})

test('P2-P02 token exchange pins endpoint, denies redirects and never exposes provider bodies', async () => {
  const calls = []
  const tokens = await exchangeAuthorizationCode({
    code: 'code-42', verifier: 'verifier-42',
    fetchImpl: async (input, init) => {
      calls.push({ url: String(input), init })
      return Response.json({ access_token: 'access-42', refresh_token: 'refresh-42', expires_in: 3600 })
    },
  })
  assert.equal(calls[0].url, ANTHROPIC_OAUTH.tokenUrl)
  assert.equal(calls[0].init.redirect, 'manual')
  assert.equal(tokens.access, 'access-42')
  const secretBody = 'provider-secret-body'
  const error = await exchangeAuthorizationCode({
    code: 'code-42', verifier: 'verifier-42',
    fetchImpl: async () => new Response(secretBody, { status: 400 }),
  }).then(() => new Error('unexpected success'), reason => reason)
  assert.equal(error.message, 'ANTHROPIC_OAUTH_PROVIDER_REFUSED')
  assert.doesNotMatch(String(error), new RegExp(secretBody))

  await assert.rejects(exchangeAuthorizationCode({
    code: 'code-42', verifier: 'verifier-42',
    fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://example.invalid' } }),
  }), /ANTHROPIC_OAUTH_REDIRECT_DENIED/)

  await assert.rejects(exchangeAuthorizationCode({
    code: 'code-42', verifier: 'verifier-42',
    fetchImpl: async () => {
      const response = Response.json({ access_token: 'x', refresh_token: 'y', expires_in: 1 })
      Object.defineProperty(response, 'url', { value: 'https://example.invalid/token' })
      return response
    },
  }), /ANTHROPIC_OAUTH_EGRESS_DENIED/)

  await assert.rejects(exchangeAuthorizationCode({
    code: 'code-42', verifier: 'verifier-42',
    fetchImpl: async () => new Response('x'.repeat(17000)),
  }), /ANTHROPIC_OAUTH_RESPONSE_LIMIT_EXCEEDED/)
})

test('P2-P03 external token custody is atomic owner-only and refuses open or symlink files', async () => {
  const filePath = await temporaryTokenPath()
  const store = createOAuthTokenStore({ filePath })
  store.write({ access: 'access-42', refresh: 'refresh-42', expiresAt: Date.now() + 60000 })
  assert.equal(lstatSync(filePath).mode & 0o777, 0o600)
  assert.equal(lstatSync(resolve(filePath, '..')).mode & 0o777, 0o700)
  assert.deepEqual(store.read(), { access: 'access-42', refresh: 'refresh-42', expiresAt: store.read().expiresAt })
  chmodSync(filePath, 0o644)
  assert.throws(() => store.read(), /ANTHROPIC_OAUTH_PERMISSIONS_INVALID/)

  const directoryPath = await temporaryTokenPath()
  const directoryStore = createOAuthTokenStore({ filePath: directoryPath })
  directoryStore.write({ access: 'access-42', refresh: 'refresh-42', expiresAt: Date.now() + 60000 })
  chmodSync(resolve(directoryPath, '..'), 0o755)
  assert.throws(() => directoryStore.read(), /ANTHROPIC_OAUTH_PERMISSIONS_INVALID/)

  const linkPath = await temporaryTokenPath()
  mkdirSync(resolve(linkPath, '..'), { recursive: true, mode: 0o700 })
  const target = `${linkPath}.target`
  writeFileSync(target, '{}', { mode: 0o600 })
  symlinkSync(target, linkPath)
  assert.throws(() => createOAuthTokenStore({ filePath: linkPath }).read(), /ANTHROPIC_OAUTH_CUSTODY_INVALID/)
  assert.equal(DEFAULT_OAUTH_TOKEN_PATH.includes('/.config/conexus/credentials/'), true)
})

test('P2-P04 expired-token refresh is single-flight and persists no duplicate race', async () => {
  const filePath = await temporaryTokenPath()
  let refreshCalls = 0
  const store = createOAuthTokenStore({
    filePath,
    refresh: async refresh => {
      refreshCalls += 1
      await new Promise(resolvePromise => setTimeout(resolvePromise, 10))
      assert.equal(refresh, 'refresh-old')
      return { access: 'access-new', refresh: 'refresh-new', expiresAt: Date.now() + 60000 }
    },
  })
  store.write({ access: 'access-old', refresh: 'refresh-old', expiresAt: 0 })
  assert.deepEqual(await Promise.all([store.getAccessToken(), store.getAccessToken()]), ['access-new', 'access-new'])
  assert.equal(refreshCalls, 1)
  assert.equal(store.read().refresh, 'refresh-new')

  const crossProcessPath = await temporaryTokenPath()
  let crossStoreRefreshes = 0
  const options = {
    filePath: crossProcessPath,
    refresh: async () => {
      crossStoreRefreshes += 1
      await new Promise(resolvePromise => setTimeout(resolvePromise, 30))
      return { access: 'access-cross', refresh: 'refresh-cross', expiresAt: Date.now() + 60000 }
    },
  }
  const first = createOAuthTokenStore(options)
  const second = createOAuthTokenStore(options)
  first.write({ access: 'expired', refresh: 'refresh-old', expiresAt: 0 })
  assert.deepEqual(await Promise.all([first.getAccessToken(), second.getAccessToken()]), ['access-cross', 'access-cross'])
  assert.equal(crossStoreRefreshes, 1)

  const processPath = await temporaryTokenPath()
  const processStore = createOAuthTokenStore({ filePath: processPath })
  const counterPath = `${processPath}.counter`
  processStore.write({ access: 'expired', refresh: 'refresh-old', expiresAt: 0 })
  const worker = resolve(import.meta.dirname, 'p2-refresh-worker.mjs')
  const results = await Promise.all([
    execFileAsync(process.execPath, [worker, processPath, counterPath]),
    execFileAsync(process.execPath, [worker, processPath, counterPath]),
  ])
  assert.ok(results.every(result => result.stdout.trim() === 'access-process'))
  assert.equal(readFileSync(counterPath, 'utf8').trim().split('\n').length, 1)
})

test('P2-P05 transport strips API keys, injects OAuth and identity, merges betas and pins egress', async () => {
  const captured = []
  const oauthFetch = createAnthropicOAuthFetch({
    tokenStore: { getAccessToken: async () => 'access-must-not-leak' },
    maxResponseBytes: 1024,
    fetchImpl: async (input, init) => {
      captured.push({ input: String(input), init })
      return Response.json({ ok: true })
    },
  })
  await oauthFetch(`${ANTHROPIC_API_ORIGIN}v1/messages`, {
    method: 'POST',
    headers: { 'x-api-key': 'api-key-must-be-removed', 'anthropic-beta': 'sdk-beta' },
    body: JSON.stringify({ model: ANTHROPIC_MODEL_ID, system: 'Owner instruction', messages: [] }),
  })
  const headers = new Headers(captured[0].init.headers)
  assert.equal(headers.get('x-api-key'), null)
  assert.equal(headers.get('authorization'), 'Bearer access-must-not-leak')
  for (const beta of [...OAUTH_BETAS, 'sdk-beta']) assert.match(headers.get('anthropic-beta'), new RegExp(beta))
  const requestBody = JSON.parse(captured[0].init.body)
  assert.equal(requestBody.system[0].text, 'Owner instruction')
  assert.equal(requestBody.system[1].text, CLAUDE_CODE_IDENTITY)
  await assert.rejects(oauthFetch('https://example.invalid/v1/messages'), /PROJECT_MODEL_EGRESS_DENIED/)
  assert.equal(captured.length, 1)
})

test('P2-P06 exact closed catalog model is Anthropic Fable 5 with no API-key dependency', () => {
  const lock = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package-lock.json'), 'utf8'))
  assert.equal(lock.packages['node_modules/@ai-sdk/anthropic'].version, '4.0.48')
  assert.equal(ANTHROPIC_MODEL_ID, 'claude-fable-5')
  const model = createAnthropicOAuthModel({ tokenStore: { getAccessToken: async () => 'unused' } })
  assert.equal(model.modelId, ANTHROPIC_MODEL_ID)
  const successor = createAnthropicOAuthModel({
    modelId: ANTHROPIC_OPUS_SUCCESSOR_MODEL_ID,
    tokenStore: { getAccessToken: async () => 'unused' },
  })
  assert.equal(successor.modelId, 'claude-opus-5')
  assert.throws(() => createAnthropicOAuthModel({ modelId: 'claude-opus-latest' }), /PROJECT_MODEL_CATALOG_REFUSED/)
  assert.doesNotMatch(JSON.stringify(lock.packages[''].dependencies), /api-key/i)
})

test('P2-P07 DNS/socket/HTTP observer fires on synthetic canaries and sees no hidden attempt', async () => {
  const server = createServer((_request, response) => response.end('canary'))
  await new Promise((resolvePromise, reject) => server.listen(0, '127.0.0.1', error => error ? reject(error) : resolvePromise()))
  const address = server.address()
  const canaryOrigin = `http://127.0.0.1:${address.port}`
  const observer = beginNetworkEgressObservation()
  try {
    await lookup('localhost')
    const response = await fetch(`${canaryOrigin}/r1c13-egress-canary`)
    await response.body?.cancel()
    await new Promise(resolvePromise => setImmediate(resolvePromise))
    const events = observer.snapshot()
    assert.ok(events.some(event => event.origin === canaryOrigin && event.path === '/r1c13-egress-canary'))
    assert.ok(events.some(event => event.channel === 'performance:dns' && event.hostname === 'localhost'))
    assert.ok(events.some(event => event.channel === 'performance:net' && event.host === '127.0.0.1'))
    assert.ok(events.every(event => (
      event.origin === canaryOrigin ||
      (event.channel === 'performance:dns' && event.hostname === 'localhost') ||
      (event.channel === 'performance:net' && event.host === '127.0.0.1')
    )))
  } finally {
    observer.close()
    await new Promise(resolvePromise => server.close(resolvePromise))
  }
})

test('P2-P08 Mastra Agent resolves the exact catalog entry through the bounded OAuth adapter', async () => {
  const captured = []
  const tokenStore = { getAccessToken: async () => 'access-must-not-leak' }
  const fetchImpl = async (input, init) => {
    captured.push({ url: String(input), init })
    return Response.json({
      id: 'msg_qualification',
      type: 'message',
      role: 'assistant',
      model: ANTHROPIC_MODEL_ID,
      content: [{ type: 'text', text: 'READY' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    })
  }

  class AnthropicOAuthAdmissionGateway extends MastraModelGateway {
    id = 'conexus-anthropic-oauth-admission'
    name = 'Conexus Anthropic OAuth admission gateway'

    resolveLanguageModel({ providerId, modelId }) {
      assert.equal(providerId, 'anthropic')
      assert.equal(modelId, ANTHROPIC_MODEL_ID)
      return createAnthropicOAuthModel({ tokenStore, fetchImpl, maxResponseBytes: 1024 * 1024 })
    }
  }

  const catalog = new Map([[
    'project-fable',
    Object.freeze({ providerId: 'anthropic', modelId: ANTHROPIC_MODEL_ID, enabled: true }),
  ]])
  const gateway = new AnthropicOAuthAdmissionGateway()
  const resolveModel = ({ requestContext }) => {
    const entry = catalog.get(requestContext.get('projectModelAdmissionId'))
    if (!entry?.enabled) throw new Error('PROJECT_MODEL_ADMISSION_UNAVAILABLE')
    return gateway.resolveLanguageModel(entry)
  }
  const context = new RequestContext()
  context.set('projectModelAdmissionId', 'project-fable')
  const agent = new Agent({
    id: 'project-fable-qualification-agent',
    name: 'Project Fable qualification agent',
    instructions: 'Project-owned instruction.',
    model: resolveModel,
    tools: {},
    memory: false,
    editor: false,
  })

  const result = await agent.generate('Reply READY.', {
    requestContext: context,
    maxSteps: 1,
    toolChoice: 'none',
    modelSettings: { maxRetries: 0, maxOutputTokens: 16, timeout: { totalMs: 45000, stepMs: 45000 } },
  })
  assert.equal(result.text, 'READY')
  assert.equal(captured.length, 1)
  assert.equal(new URL(captured[0].url).origin, new URL(ANTHROPIC_API_ORIGIN).origin)
  assert.equal(new URL(captured[0].url).pathname, '/v1/messages')
  assert.equal(captured[0].init.redirect, 'manual')
  const headers = new Headers(captured[0].init.headers)
  assert.equal(headers.get('authorization'), 'Bearer access-must-not-leak')
  assert.equal(headers.get('x-api-key'), null)
  const body = JSON.parse(captured[0].init.body)
  assert.equal(body.model, ANTHROPIC_MODEL_ID)
  assert.equal(body.system[0].text, 'Project-owned instruction.')
  assert.equal(body.system.at(-1).text, CLAUDE_CODE_IDENTITY)
})
