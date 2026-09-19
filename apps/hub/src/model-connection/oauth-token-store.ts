import { refreshAuthorizationToken } from './anthropic-oauth.js'
import type { OAuthTokenSet } from './anthropic-oauth.js'
import type { CredentialBackend, CredentialCoordinate } from '../platform/credential-backend.js'

export type OAuthTokenStore = Readonly<{
  validate(): void
  getAccessToken(): Promise<string>
}>

export const createUnavailableOAuthTokenStore = (code = 'MODEL_CONNECTION_REQUIRED'): OAuthTokenStore => Object.freeze({
  validate: () => undefined,
  getAccessToken: async () => { throw new Error(code) },
})

export const createBackendOAuthTokenStore = (
  backend: CredentialBackend,
  coordinate: CredentialCoordinate,
  refresh: typeof refreshAuthorizationToken = refreshAuthorizationToken,
  options: Readonly<{
    resolveCurrent?: () => Promise<CredentialCoordinate>
    publishRefresh?: (input: Readonly<{ current: CredentialCoordinate; next: CredentialCoordinate; tokens: OAuthTokenSet }>) => Promise<boolean>
  }> = {},
): OAuthTokenStore => {
  let acquiring: Promise<string> | undefined
  let currentCoordinate = coordinate
  let current: OAuthTokenSet | undefined
  const read = async (requested: CredentialCoordinate): Promise<OAuthTokenSet> => {
    const bytes = await backend.materialize(requested)
    try {
      const value: unknown = JSON.parse(Buffer.from(bytes).toString('utf8'))
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('ANTHROPIC_OAUTH_TOKEN_INVALID')
      const token = value as Record<string, unknown>
      if (typeof token.access !== 'string' || typeof token.refresh !== 'string' || !Number.isFinite(token.expiresAt)) throw new Error('ANTHROPIC_OAUTH_TOKEN_INVALID')
      return { access: token.access, refresh: token.refresh, expiresAt: Number(token.expiresAt) }
    } finally { Buffer.from(bytes).fill(0) }
  }
  const nextCoordinate = (currentValue: CredentialCoordinate): CredentialCoordinate => {
    if (!/^\d+$/.test(currentValue.generation)) throw new Error('CREDENTIAL_GENERATION_REFUSED')
    return { connectionId: currentValue.connectionId, generation: (BigInt(currentValue.generation) + 1n).toString() }
  }
  const rotate = async (currentValue: CredentialCoordinate, tokens: OAuthTokenSet): Promise<boolean> => {
    const next = nextCoordinate(currentValue)
    if (options.publishRefresh) return options.publishRefresh({ current: currentValue, next, tokens })
    const plaintext = Buffer.from(JSON.stringify(tokens), 'utf8')
    try { await backend.publishOrMatch(next, plaintext); return true } finally { plaintext.fill(0) }
  }
  const acquire = async (): Promise<string> => {
    const resolved = await options.resolveCurrent?.() ?? currentCoordinate
    if (resolved.connectionId !== currentCoordinate.connectionId || resolved.generation !== currentCoordinate.generation) {
      currentCoordinate = resolved
      current = undefined
    }
    current ??= await read(currentCoordinate)
    if (Date.now() < current.expiresAt) return current.access
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const refreshed = await refresh(current.refresh)
      if (await rotate(currentCoordinate, refreshed)) {
        currentCoordinate = nextCoordinate(currentCoordinate)
        current = refreshed
        return refreshed.access
      }
      const reconciled = await options.resolveCurrent?.()
      if (!reconciled) throw new Error('CREDENTIAL_REFRESH_RECONCILE_REQUIRED')
      currentCoordinate = reconciled
      current = await read(currentCoordinate)
      if (Date.now() < current.expiresAt) return current.access
    }
    throw new Error('CREDENTIAL_REFRESH_RECONCILE_REQUIRED')
  }
  return Object.freeze({
    validate: () => undefined,
    getAccessToken: async () => {
      acquiring ??= acquire().finally(() => { acquiring = undefined })
      return acquiring
    },
  })
}
