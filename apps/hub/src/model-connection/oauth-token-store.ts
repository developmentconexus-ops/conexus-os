import type { OAuthTokenSet } from './oauth-token-endpoint.js'
import type { CredentialBackend, CredentialCoordinate } from '../platform/credential-backend.js'

// What a dispatching provider is allowed to learn. The refresh token stays inside the store: a
// caller that only has to authenticate one request never needs the credential that mints them.
export type OAuthCredential = Readonly<{ access: string; accountId?: string }>

export type OAuthTokenStore = Readonly<{
  validate(): void
  getToken(): Promise<OAuthCredential>
}>

export type RefreshTokenSet = (refresh: string, accountId?: string) => Promise<OAuthTokenSet>

export const createUnavailableOAuthTokenStore = (code = 'MODEL_CONNECTION_REQUIRED'): OAuthTokenStore => Object.freeze({
  validate: () => undefined,
  getToken: async () => { throw new Error(code) },
})

export const createBackendOAuthTokenStore = (
  backend: CredentialBackend,
  coordinate: CredentialCoordinate,
  refresh: RefreshTokenSet,
  options: Readonly<{
    codePrefix: string
    resolveCurrent?: () => Promise<CredentialCoordinate>
    publishRefresh?: (input: Readonly<{ current: CredentialCoordinate; next: CredentialCoordinate; tokens: OAuthTokenSet }>) => Promise<boolean>
    serializeRefresh?: <T>(run: () => Promise<T>) => Promise<T>
  }>,
): OAuthTokenStore => {
  let acquiring: Promise<OAuthTokenSet> | undefined
  let currentCoordinate = coordinate
  let current: OAuthTokenSet | undefined
  const invalid = () => new Error(`${options.codePrefix}_TOKEN_INVALID`)
  const read = async (requested: CredentialCoordinate): Promise<OAuthTokenSet> => {
    const bytes = await backend.materialize(requested)
    try {
      const value: unknown = JSON.parse(Buffer.from(bytes).toString('utf8'))
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid()
      const token = value as Record<string, unknown>
      if (typeof token.access !== 'string' || typeof token.refresh !== 'string' || !Number.isFinite(token.expiresAt)) throw invalid()
      const accountId = typeof token.accountId === 'string' && token.accountId ? token.accountId : undefined
      return { access: token.access, refresh: token.refresh, expiresAt: Number(token.expiresAt), ...(accountId ? { accountId } : {}) }
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
  const readCurrent = async (): Promise<OAuthTokenSet> => {
    const resolved = await options.resolveCurrent?.() ?? currentCoordinate
    if (resolved.connectionId !== currentCoordinate.connectionId || resolved.generation !== currentCoordinate.generation) {
      currentCoordinate = resolved
      current = undefined
    }
    current ??= await read(currentCoordinate)
    return current
  }
  const acquire = async (): Promise<OAuthTokenSet> => {
    const held = await readCurrent()
    if (Date.now() < held.expiresAt) return held
    // The refresh token rotates. A provider that issues a new one on every refresh invalidates the
    // one just spent, so two callers that both read the same expired set and both call the token
    // endpoint spend it twice: one of them gets a refusal, and whichever write loses the
    // compare-and-swap throws away a refresh token the provider had already made current, leaving
    // custody holding a dead one. Serializing per connection and re-reading inside the critical
    // section means the second caller finds the set the first one persisted and never calls the
    // endpoint at all. The new set is written before its access token is handed back, so nobody
    // can be using a token that custody does not yet know about.
    const serialize = options.serializeRefresh ?? (<T>(run: () => Promise<T>) => run())
    return serialize(async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        current = undefined
        const latest = await readCurrent()
        if (Date.now() < latest.expiresAt) return latest
        const refreshed = await refresh(latest.refresh, latest.accountId)
        if (await rotate(currentCoordinate, refreshed)) {
          currentCoordinate = nextCoordinate(currentCoordinate)
          current = refreshed
          return refreshed
        }
      }
      throw new Error('CREDENTIAL_REFRESH_RECONCILE_REQUIRED')
    })
  }
  return Object.freeze({
    validate: () => undefined,
    getToken: async () => {
      acquiring ??= acquire().finally(() => { acquiring = undefined })
      const token = await acquiring
      return Object.freeze({ access: token.access, ...(token.accountId === undefined ? {} : { accountId: token.accountId }) })
    },
  })
}
