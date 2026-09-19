import { randomBytes, timingSafeEqual } from 'node:crypto'
import { requestTokenPayload } from './oauth-token-endpoint.js'
import type { OAuthTokenSet } from './oauth-token-endpoint.js'

const EXPIRY_SKEW_MS = 5 * 60 * 1000
const VERIFIER_BYTES = 64
const STATE_BYTES = 32

// How a provider hands the authorization result back, and therefore what the user pastes into the
// Hub. Anthropic hosts a callback page that prints `code#state`. OpenAI registers a loopback
// redirect this Hub cannot receive, so the browser lands on an error page and the user copies the
// whole redirect URL out of the address bar; the Hub reads `code` and `state` from its query.
export type PastedResultShape = 'code-hash-state' | 'redirect-url'

// Where a provider puts the signed-in account's own routing identity. Anthropic has none and
// leaves this unset. OpenAI puts chatgpt_account_id in the id_token, either at the top level or
// under a namespaced claim, and its inference endpoint will not route without it.
export type AccountIdClaim = Readonly<{ claim: string; namespace: string }>

// One row per provider. Every difference the Anthropic flow used to assume - the endpoints, the
// body encoding, whether the exchange echoes state, what the user pastes, whether an account id
// is part of the credential - is a field here rather than a branch at a call site.
export type OAuthProviderDescriptor = Readonly<{
  providerId: string
  codePrefix: string
  clientId: string
  authorizeUrl: string
  tokenUrl: string
  redirectUri: string
  scopes: string
  authorizeParams: Readonly<Record<string, string>>
  tokenEncoding: 'json' | 'form'
  stateInExchange: boolean
  pastedResult: PastedResultShape
  defaultExpiresInSeconds?: number
  accountId?: AccountIdClaim
}>

export type AuthorizationRequest = Readonly<{ verifier: string; state: string; url: string }>

const base64url = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url')

export const createAuthorizationRequest = async (descriptor: OAuthProviderDescriptor): Promise<AuthorizationRequest> => {
  const verifier = base64url(randomBytes(VERIFIER_BYTES))
  const state = base64url(randomBytes(STATE_BYTES))
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
  const query = new URLSearchParams({
    ...descriptor.authorizeParams, client_id: descriptor.clientId, response_type: 'code',
    redirect_uri: descriptor.redirectUri, scope: descriptor.scopes,
    code_challenge: challenge, code_challenge_method: 'S256', state,
  })
  return Object.freeze({ verifier, state, url: `${descriptor.authorizeUrl}?${query}` })
}

const readRedirect = (descriptor: OAuthProviderDescriptor, value: string): Readonly<{ code: string; state: string }> => {
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new Error(`${descriptor.codePrefix}_AUTHORIZATION_RESULT_INVALID`) }
  const expected = new URL(descriptor.redirectUri)
  if (url.origin !== expected.origin || url.pathname !== expected.pathname) throw new Error(`${descriptor.codePrefix}_AUTHORIZATION_RESULT_INVALID`)
  return { code: (url.searchParams.get('code') ?? '').trim(), state: (url.searchParams.get('state') ?? '').trim() }
}

const readHashed = (descriptor: OAuthProviderDescriptor, value: string): Readonly<{ code: string; state: string }> => {
  const separator = value.lastIndexOf('#')
  if (separator < 1) throw new Error(`${descriptor.codePrefix}_AUTHORIZATION_RESULT_INVALID`)
  return { code: value.slice(0, separator).trim(), state: value.slice(separator + 1).trim() }
}

const readResult = (descriptor: OAuthProviderDescriptor, value: string): Readonly<{ code: string; state: string }> =>
  descriptor.pastedResult === 'redirect-url' ? readRedirect(descriptor, value) : readHashed(descriptor, value)

// The state the custody store needs before it can consume the authorization row, recovered from
// the pasted value alone. It is only a lookup key: nothing is trusted until parseAuthorizationResult
// compares it against the state the Hub minted.
export const extractResultState = (descriptor: OAuthProviderDescriptor, value: string): string => {
  const state = readResult(descriptor, value).state
  if (!state) throw new Error(`${descriptor.codePrefix}_AUTHORIZATION_RESULT_INVALID`)
  return state
}

export const parseAuthorizationResult = (descriptor: OAuthProviderDescriptor, value: string, expectedState: string): string => {
  const { code, state } = readResult(descriptor, value)
  const left = Buffer.from(state)
  const right = Buffer.from(expectedState)
  if (!code || !state || left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new Error(`${descriptor.codePrefix}_STATE_INVALID`)
  }
  return code
}

export const exchangeAuthorizationCode = (
  descriptor: OAuthProviderDescriptor,
  input: Readonly<{ code: string; state: string; verifier: string; fetchImpl?: typeof globalThis.fetch }>,
): Promise<OAuthTokenSet> => tokenRequest(descriptor, {
  grant_type: 'authorization_code', client_id: descriptor.clientId, code: input.code,
  ...(descriptor.stateInExchange ? { state: input.state } : {}),
  redirect_uri: descriptor.redirectUri, code_verifier: input.verifier,
}, input.fetchImpl)

export const refreshAuthorizationToken = (
  descriptor: OAuthProviderDescriptor,
  refresh: string,
  fetchImpl?: typeof globalThis.fetch,
  priorAccountId?: string,
): Promise<OAuthTokenSet> => tokenRequest(descriptor, {
  grant_type: 'refresh_token', client_id: descriptor.clientId, refresh_token: refresh,
}, fetchImpl, refresh, priorAccountId)

// The payload is a JWT the provider just handed back over TLS from its own token endpoint, on a
// request this process made. The signature is not verified because the value is used as a routing
// header and never as an authorization decision: a forged one would have to come from the issuer.
const decodeJwtPayload = (token: string): Readonly<Record<string, unknown>> | undefined => {
  const parts = token.split('.')
  if (parts.length !== 3 || !parts[1]) return undefined
  try {
    const value: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    return value as Record<string, unknown>
  } catch { return undefined }
}

const readAccountId = (claim: AccountIdClaim, token: Readonly<Record<string, unknown>>): string | undefined => {
  for (const field of ['id_token', 'access_token'] as const) {
    const raw = token[field]
    if (typeof raw !== 'string' || !raw) continue
    const payload = decodeJwtPayload(raw)
    if (!payload) continue
    const direct = payload[claim.claim]
    if (typeof direct === 'string' && direct) return direct
    const scoped = payload[claim.namespace]
    if (scoped && typeof scoped === 'object' && !Array.isArray(scoped)) {
      const nested = (scoped as Record<string, unknown>)[claim.claim]
      if (typeof nested === 'string' && nested) return nested
    }
  }
  return undefined
}

const tokenRequest = async (
  descriptor: OAuthProviderDescriptor,
  body: Readonly<Record<string, string>>,
  fetchImpl?: typeof globalThis.fetch,
  priorRefresh?: string,
  priorAccountId?: string,
): Promise<OAuthTokenSet> => {
  const encoded = descriptor.tokenEncoding === 'form'
    ? { headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() }
    : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
  const token = await requestTokenPayload({
    url: descriptor.tokenUrl, ...encoded, codePrefix: descriptor.codePrefix,
    ...(fetchImpl ? { fetchImpl } : {}),
  })
  if (typeof token.access_token !== 'string' || !token.access_token) throw new Error(`${descriptor.codePrefix}_TOKEN_INVALID`)
  // A provider that declares a default lifetime is one observed to omit expires_in. A provider
  // without one must say how long the token lives, because guessing would mean using a dead token.
  const seconds = token.expires_in === undefined && descriptor.defaultExpiresInSeconds !== undefined
    ? descriptor.defaultExpiresInSeconds
    : Number.isFinite(token.expires_in) ? Number(token.expires_in) : Number.NaN
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`${descriptor.codePrefix}_TOKEN_INVALID`)
  const refresh = typeof token.refresh_token === 'string' && token.refresh_token ? token.refresh_token : priorRefresh
  if (!refresh) throw new Error(`${descriptor.codePrefix}_TOKEN_INVALID`)
  const expiresAt = Date.now() + seconds * 1000 - EXPIRY_SKEW_MS
  if (!descriptor.accountId) return Object.freeze({ access: token.access_token, refresh, expiresAt })
  const accountId = readAccountId(descriptor.accountId, token) ?? priorAccountId
  if (!accountId) throw new Error(`${descriptor.codePrefix}_ACCOUNT_ID_REQUIRED`)
  return Object.freeze({ access: token.access_token, refresh, expiresAt, accountId })
}
