import { randomBytes, timingSafeEqual } from 'node:crypto'

export const ANTHROPIC_OAUTH = Object.freeze({
  clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  authorizeUrl: 'https://claude.ai/oauth/authorize',
  tokenUrl: 'https://platform.claude.com/v1/oauth/token',
  redirectUri: 'https://platform.claude.com/oauth/code/callback',
  scopes: 'user:profile user:inference',
})
const TOKEN_URL = ANTHROPIC_OAUTH.tokenUrl
const CLIENT_ID = ANTHROPIC_OAUTH.clientId
const MAX_BYTES = 16 * 1024
const EXPIRY_SKEW_MS = 5 * 60 * 1000

export type OAuthTokenSet = Readonly<{ access: string; refresh: string; expiresAt: number }>

const base64url = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url')

export const createAuthorizationRequest = async (): Promise<Readonly<{ verifier: string; state: string; url: string }>> => {
  const verifier = base64url(randomBytes(64))
  const state = base64url(randomBytes(32))
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
  const query = new URLSearchParams({
    code: 'true', client_id: ANTHROPIC_OAUTH.clientId, response_type: 'code',
    redirect_uri: ANTHROPIC_OAUTH.redirectUri, scope: ANTHROPIC_OAUTH.scopes,
    code_challenge: challenge, code_challenge_method: 'S256', state,
  })
  return Object.freeze({ verifier, state, url: `${ANTHROPIC_OAUTH.authorizeUrl}?${query}` })
}

export const parseAuthorizationResult = (value: string, expectedState: string): string => {
  const separator = value.lastIndexOf('#')
  if (separator < 1) throw new Error('ANTHROPIC_OAUTH_AUTHORIZATION_RESULT_INVALID')
  const code = value.slice(0, separator).trim()
  const state = value.slice(separator + 1).trim()
  const left = Buffer.from(state)
  const right = Buffer.from(expectedState)
  if (!code || !state || left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new Error('ANTHROPIC_OAUTH_STATE_INVALID')
  }
  return code
}

export const exchangeAuthorizationCode = (input: Readonly<{ code: string; state: string; verifier: string; fetchImpl?: typeof globalThis.fetch }>): Promise<OAuthTokenSet> =>
  tokenRequest({
    grant_type: 'authorization_code', client_id: ANTHROPIC_OAUTH.clientId,
    code: input.code, state: input.state, redirect_uri: ANTHROPIC_OAUTH.redirectUri,
    code_verifier: input.verifier,
  }, input.fetchImpl)

export const refreshAuthorizationToken = async (
  refresh: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<OAuthTokenSet> => {
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', client_id: CLIENT_ID, refresh_token: refresh }),
  })
  if (response.status >= 300 && response.status < 400) throw new Error('ANTHROPIC_OAUTH_REDIRECT_DENIED')
  if (response.url && new URL(response.url).origin !== new URL(TOKEN_URL).origin) throw new Error('ANTHROPIC_OAUTH_EGRESS_DENIED')
  const declared = response.headers.get('content-length')
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BYTES)) throw new Error('ANTHROPIC_OAUTH_RESPONSE_LIMIT_EXCEEDED')
  if (!response.body) throw new Error('ANTHROPIC_OAUTH_RESPONSE_INVALID')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const item = await reader.read()
    if (item.done) break
    size += item.value.byteLength
    if (size > MAX_BYTES) {
      await reader.cancel()
      throw new Error('ANTHROPIC_OAUTH_RESPONSE_LIMIT_EXCEEDED')
    }
    chunks.push(item.value)
  }
  if (!response.ok) throw new Error('ANTHROPIC_OAUTH_PROVIDER_REFUSED')
  let value: unknown
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new Error('ANTHROPIC_OAUTH_RESPONSE_INVALID') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('ANTHROPIC_OAUTH_TOKEN_INVALID')
  const token = value as Record<string, unknown>
  if (typeof token.access_token !== 'string' || token.access_token.length < 1 ||
    !Number.isFinite(token.expires_in) || Number(token.expires_in) <= 0) throw new Error('ANTHROPIC_OAUTH_TOKEN_INVALID')
  return Object.freeze({
    access: token.access_token,
    refresh: typeof token.refresh_token === 'string' && token.refresh_token ? token.refresh_token : refresh,
    expiresAt: Date.now() + Number(token.expires_in) * 1000 - EXPIRY_SKEW_MS,
  })
}

const tokenRequest = async (
  body: Readonly<Record<string, string>>,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
  priorRefresh?: string,
): Promise<OAuthTokenSet> => {
  const url = new URL(TOKEN_URL)
  const response = await fetchImpl(url, {
    method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  if (response.status >= 300 && response.status < 400) throw new Error('ANTHROPIC_OAUTH_REDIRECT_DENIED')
  if (response.url && new URL(response.url).origin !== url.origin) throw new Error('ANTHROPIC_OAUTH_EGRESS_DENIED')
  const declared = response.headers.get('content-length')
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BYTES)) throw new Error('ANTHROPIC_OAUTH_RESPONSE_LIMIT_EXCEEDED')
  if (!response.body) throw new Error('ANTHROPIC_OAUTH_RESPONSE_INVALID')
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0
  for (;;) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength; if (size > MAX_BYTES) { await reader.cancel(); throw new Error('ANTHROPIC_OAUTH_RESPONSE_LIMIT_EXCEEDED') } chunks.push(item.value) }
  if (!response.ok) throw new Error('ANTHROPIC_OAUTH_PROVIDER_REFUSED')
  let value: unknown
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new Error('ANTHROPIC_OAUTH_RESPONSE_INVALID') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('ANTHROPIC_OAUTH_TOKEN_INVALID')
  const token = value as Record<string, unknown>
  if (typeof token.access_token !== 'string' || !token.access_token || !Number.isFinite(token.expires_in) || Number(token.expires_in) <= 0) throw new Error('ANTHROPIC_OAUTH_TOKEN_INVALID')
  const refresh = typeof token.refresh_token === 'string' && token.refresh_token ? token.refresh_token : priorRefresh
  if (!refresh) throw new Error('ANTHROPIC_OAUTH_TOKEN_INVALID')
  return Object.freeze({ access: token.access_token, refresh, expiresAt: Date.now() + Number(token.expires_in) * 1000 - EXPIRY_SKEW_MS })
}
