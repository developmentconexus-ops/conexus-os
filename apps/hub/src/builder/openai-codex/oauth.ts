// Copied from @mastra/code-sdk 1.8.3, dist/auth/providers/openai-codex.js: the device-code sign-in
// (startCodexDeviceLogin, pollCodexDeviceLogin), the code-for-token exchange, the refresh
// (refreshOpenAICodexToken) and the token claim readers they use. Licensed under the Apache
// License, Version 2.0 (http://www.apache.org/licenses/LICENSE-2.0); see @mastra/code-sdk's
// LICENSE.md. Logic and wire values are unchanged. Not ported: the browser flow, which needs a
// callback server on localhost:1455 of the machine the person signs in from, and the console
// logging of failures, since a Hub log is not the place for a sign-in's diagnostics. Only the
// file's home becomes Conexus's.

/** A ChatGPT subscription's tokens as Mastra Code stores them (`OAuthCredentials` minus its `type`). */
export type CodexTokens = Readonly<{ access: string; refresh: string; expires: number; accountId: string; email?: string }>

/** A device sign-in waiting for the person, serializable between polls. */
export type CodexDevicePending = Readonly<{
  deviceAuthId: string
  userCode: string
  url: string
  intervalMs: number
  deadlineAt: number
}>

export type CodexDevicePoll =
  | Readonly<{ status: 'pending'; nextPollMs: number }>
  | Readonly<{ status: 'complete'; credentials: CodexTokens }>
  | Readonly<{ status: 'failed'; error: string }>

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const ISSUER = 'https://auth.openai.com'
const TOKEN_URL = `${ISSUER}/oauth/token`
const DEVICE_USER_CODE_URL = `${ISSUER}/api/accounts/deviceauth/usercode`
const DEVICE_TOKEN_URL = `${ISSUER}/api/accounts/deviceauth/token`
const DEVICE_AUTHORIZE_URL = `${ISSUER}/codex/device`
const DEVICE_REDIRECT_URI = `${ISSUER}/deviceauth/callback`
const DEFAULT_TOKEN_EXPIRES_IN_SECONDS = 3600
const DEVICE_AUTH_TIMEOUT_MS = 900 * 1e3
const OAUTH_REQUEST_TIMEOUT_MS = 15e3
const JWT_CLAIM_PATH = 'https://api.openai.com/auth'

type Claims = Record<string, unknown> & { [JWT_CLAIM_PATH]?: Record<string, unknown> }
type TokenResult = Readonly<{ type: 'success'; access: string; refresh: string; expires: number; idToken?: string }> | Readonly<{ type: 'failed' }>
type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string }

function requestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MS)
  return signal ? AbortSignal.any([timeout, signal]) : timeout
}

function decodeJwt(token: string): Claims | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = parts[1] ?? ''
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=')
    const decoded = atob(padded)
    return JSON.parse(decoded) as Claims
  } catch {
    return null
  }
}

function extractAccountIdFromClaims(payload: Claims | null): string | null {
  if (!payload) return null
  const accountId = payload.chatgpt_account_id ?? payload[JWT_CLAIM_PATH]?.chatgpt_account_id
  return typeof accountId === 'string' && accountId.length > 0 ? accountId : null
}

function getAccountId(tokens: Readonly<{ access: string; idToken?: string }>, fallback?: string): string | undefined {
  const fromIdToken = tokens.idToken ? extractAccountIdFromClaims(decodeJwt(tokens.idToken)) : null
  if (fromIdToken) return fromIdToken
  const fromAccessToken = extractAccountIdFromClaims(decodeJwt(tokens.access))
  if (fromAccessToken) return fromAccessToken
  return fallback
}

function requireAccountId(tokens: Readonly<{ access: string; idToken?: string }>, fallback?: string): string {
  const accountId = getAccountId(tokens, fallback)
  if (!accountId) throw new Error('Failed to extract ChatGPT account id from OpenAI Codex token')
  return accountId
}

function extractEmailFromClaims(payload: Claims): string | null {
  const email = payload.email ?? payload[JWT_CLAIM_PATH]?.email
  return typeof email === 'string' && email.length > 0 ? email : null
}

function getEmailFromTokens(tokens: Readonly<{ access: string; idToken?: string }>): string | undefined {
  const fromIdToken = tokens.idToken ? extractEmailFromClaims(decodeJwt(tokens.idToken) ?? {}) : null
  if (fromIdToken) return fromIdToken
  return extractEmailFromClaims(decodeJwt(tokens.access) ?? {}) ?? undefined
}

function tokenResponseToResult(json: TokenResponse): TokenResult {
  if (!json.access_token || !json.refresh_token) return { type: 'failed' }
  return {
    type: 'success',
    access: json.access_token,
    refresh: json.refresh_token,
    expires: Date.now() + (json.expires_in ?? DEFAULT_TOKEN_EXPIRES_IN_SECONDS) * 1e3,
    ...(json.id_token ? { idToken: json.id_token } : {}),
  }
}

async function exchangeAuthorizationCode(code: string, verifier: string, redirectUri: string, signal?: AbortSignal): Promise<TokenResult> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    signal: requestSignal(signal),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
    }),
  })
  if (!response.ok) return { type: 'failed' }
  return tokenResponseToResult(await response.json() as TokenResponse)
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResult> {
  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      signal: requestSignal(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
      }),
    })
    if (!response.ok) return { type: 'failed' }
    return tokenResponseToResult(await response.json() as TokenResponse)
  } catch {
    return { type: 'failed' }
  }
}

/**
 * Start a Codex device-code login: request a user code and return the
 * serializable pending state for subsequent polls.
 */
export async function startCodexDeviceLogin(options?: Readonly<{ signal?: AbortSignal }>): Promise<CodexDevicePending> {
  const response = await fetch(DEVICE_USER_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'mastracode' },
    body: JSON.stringify({ client_id: CLIENT_ID, originator: 'mastracode' }),
    signal: requestSignal(options?.signal),
  })
  if (!response.ok) throw new Error(`Failed to initiate OpenAI Codex device authorization: ${response.status}`)
  const deviceData = await response.json() as { device_auth_id?: string; user_code?: string; usercode?: string; interval?: number | string }
  const userCode = deviceData.user_code ?? deviceData.usercode
  if (!deviceData.device_auth_id || !userCode) throw new Error('OpenAI Codex device authorization response missing required fields')
  const intervalSeconds = typeof deviceData.interval === 'number' ? deviceData.interval : Number.parseInt(deviceData.interval ?? '', 10) || 5
  return {
    deviceAuthId: deviceData.device_auth_id,
    userCode,
    url: DEVICE_AUTHORIZE_URL,
    intervalMs: Math.max(intervalSeconds, 1) * 1e3,
    deadlineAt: Date.now() + DEVICE_AUTH_TIMEOUT_MS,
  }
}

/**
 * Perform exactly one upstream poll for a pending Codex device login.
 * The Codex device endpoint signals "still pending" via HTTP 403/404 (it is
 * not an RFC 8628 error-JSON endpoint); on success it returns the
 * authorization code plus server-held PKCE verifier, which we exchange
 * immediately for credentials. Never throws for flow-level conditions.
 */
export async function pollCodexDeviceLogin(pending: CodexDevicePending, options?: Readonly<{ signal?: AbortSignal }>): Promise<CodexDevicePoll> {
  if (Date.now() >= pending.deadlineAt) return { status: 'failed', error: 'OpenAI Codex device authorization timed out after 15 minutes' }
  const pollResponse = await fetch(DEVICE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'mastracode' },
    body: JSON.stringify({ device_auth_id: pending.deviceAuthId, user_code: pending.userCode }),
    signal: requestSignal(options?.signal),
  })
  if (pollResponse.ok) {
    const data = await pollResponse.json() as { authorization_code?: string; code_verifier?: string }
    if (!data.authorization_code || !data.code_verifier) return { status: 'failed', error: 'OpenAI Codex device token response missing required fields' }
    const tokenResult = await exchangeAuthorizationCode(data.authorization_code, data.code_verifier, DEVICE_REDIRECT_URI, options?.signal)
    if (tokenResult.type !== 'success') return { status: 'failed', error: 'Token exchange failed' }
    let accountId: string
    try {
      accountId = requireAccountId(tokenResult)
    } catch (error) {
      return { status: 'failed', error: error instanceof Error ? error.message : String(error) }
    }
    const email = getEmailFromTokens(tokenResult)
    return {
      status: 'complete',
      credentials: { access: tokenResult.access, refresh: tokenResult.refresh, expires: tokenResult.expires, accountId, ...(email ? { email } : {}) },
    }
  }
  if (pollResponse.status !== 403 && pollResponse.status !== 404) return { status: 'failed', error: `OpenAI Codex device authorization failed: ${pollResponse.status}` }
  return { status: 'pending', nextPollMs: pending.intervalMs }
}

/** Refresh OpenAI Codex OAuth token */
export async function refreshOpenAICodexToken(refreshToken: string, previousAccountId?: string, previousEmail?: string): Promise<CodexTokens> {
  const result = await refreshAccessToken(refreshToken)
  if (result.type !== 'success') throw new Error('Failed to refresh OpenAI Codex token')
  const accountId = requireAccountId(result, previousAccountId)
  const email = getEmailFromTokens(result) ?? previousEmail
  return { access: result.access, refresh: result.refresh, expires: result.expires, accountId, ...(email ? { email } : {}) }
}
