const TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token'
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
const MAX_BYTES = 16 * 1024
const EXPIRY_SKEW_MS = 5 * 60 * 1000

export type OAuthTokenSet = Readonly<{ access: string; refresh: string; expiresAt: number }>

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
