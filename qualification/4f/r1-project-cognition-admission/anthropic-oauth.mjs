import { randomBytes, timingSafeEqual } from 'node:crypto'

export const ANTHROPIC_OAUTH = Object.freeze({
  clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  authorizeUrl: 'https://claude.ai/oauth/authorize',
  tokenUrl: 'https://console.anthropic.com/v1/oauth/token',
  redirectUri: 'https://console.anthropic.com/oauth/code/callback',
  scopes: 'user:profile user:inference',
})

const EXPIRY_SKEW_MS = 5 * 60 * 1000
const MAX_TOKEN_RESPONSE_BYTES = 16 * 1024

function base64url(bytes) {
  return Buffer.from(bytes).toString('base64url')
}

export async function createAuthorizationRequest() {
  const verifier = base64url(randomBytes(64))
  const state = base64url(randomBytes(32))
  const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  const query = new URLSearchParams({
    code: 'true',
    client_id: ANTHROPIC_OAUTH.clientId,
    response_type: 'code',
    redirect_uri: ANTHROPIC_OAUTH.redirectUri,
    scope: ANTHROPIC_OAUTH.scopes,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  })
  return Object.freeze({ verifier, state, url: `${ANTHROPIC_OAUTH.authorizeUrl}?${query}` })
}

function equalSecret(left, right) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function parseAuthorizationResult(value, expectedState) {
  const separator = value.lastIndexOf('#')
  if (separator < 1) throw new Error('ANTHROPIC_OAUTH_AUTHORIZATION_RESULT_INVALID')
  const code = value.slice(0, separator).trim()
  const state = value.slice(separator + 1).trim()
  if (!code || !state || !equalSecret(state, expectedState)) {
    throw new Error('ANTHROPIC_OAUTH_STATE_INVALID')
  }
  return code
}

async function readBoundedJson(response) {
  if (response.status >= 300 && response.status < 400) throw new Error('ANTHROPIC_OAUTH_REDIRECT_DENIED')
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_TOKEN_RESPONSE_BYTES) {
    await response.body?.cancel()
    throw new Error('ANTHROPIC_OAUTH_RESPONSE_LIMIT_EXCEEDED')
  }
  if (!response.body) throw new Error('ANTHROPIC_OAUTH_RESPONSE_INVALID')
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_TOKEN_RESPONSE_BYTES) {
      await reader.cancel()
      throw new Error('ANTHROPIC_OAUTH_RESPONSE_LIMIT_EXCEEDED')
    }
    chunks.push(value)
  }
  if (!response.ok) throw new Error('ANTHROPIC_OAUTH_PROVIDER_REFUSED')
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new Error('ANTHROPIC_OAUTH_RESPONSE_INVALID')
  }
}

function tokenSet(value, priorRefresh) {
  if (!value || typeof value.access_token !== 'string' || value.access_token.length < 1 ||
      !Number.isFinite(value.expires_in) || value.expires_in <= 0) {
    throw new Error('ANTHROPIC_OAUTH_TOKEN_INVALID')
  }
  const refresh = typeof value.refresh_token === 'string' && value.refresh_token
    ? value.refresh_token
    : priorRefresh
  if (!refresh) throw new Error('ANTHROPIC_OAUTH_TOKEN_INVALID')
  return Object.freeze({
    access: value.access_token,
    refresh,
    expiresAt: Date.now() + (value.expires_in * 1000) - EXPIRY_SKEW_MS,
  })
}

async function tokenRequest(body, { fetchImpl = globalThis.fetch, priorRefresh } = {}) {
  const url = new URL(ANTHROPIC_OAUTH.tokenUrl)
  const response = await fetchImpl(url, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (response.url && new URL(response.url).origin !== url.origin) {
    await response.body?.cancel()
    throw new Error('ANTHROPIC_OAUTH_EGRESS_DENIED')
  }
  return tokenSet(await readBoundedJson(response), priorRefresh)
}

export function exchangeAuthorizationCode({ code, verifier, fetchImpl }) {
  return tokenRequest({
    grant_type: 'authorization_code',
    client_id: ANTHROPIC_OAUTH.clientId,
    code,
    state: verifier,
    redirect_uri: ANTHROPIC_OAUTH.redirectUri,
    code_verifier: verifier,
  }, { fetchImpl })
}

export function refreshAuthorizationToken(refresh, { fetchImpl } = {}) {
  return tokenRequest({
    grant_type: 'refresh_token',
    client_id: ANTHROPIC_OAUTH.clientId,
    refresh_token: refresh,
  }, { fetchImpl, priorRefresh: refresh })
}
