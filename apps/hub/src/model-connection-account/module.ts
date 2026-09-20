import { readFileSync } from 'node:fs'
import type { FastifyInstance } from 'fastify'
import { createPostgresPool } from '../platform/postgres.js'
import type { CredentialBackend } from '../platform/credential-backend.js'
import { createAuthorizationRequest, exchangeAuthorizationCode, extractResultState, parseAuthorizationResult, refreshAuthorizationToken } from '../model-connection/oauth-provider.js'
import { ANTHROPIC_OAUTH, OAUTH_PROVIDERS, OPENAI_CODEX_OAUTH, oauthProvider } from '../model-connection/oauth-provider-registry.js'
import { registerModelConnectionRoutes } from './routes.js'
import type { OAuthFlow } from './routes.js'
import { createModelConnectionStore } from './store.js'
import type { ModelCredentialReference } from './store.js'
export type { ModelCredentialReference } from './store.js'
import { createBackendOAuthTokenStore } from '../model-connection/oauth-token-store.js'
import type { OAuthTokenStore } from '../model-connection/oauth-token-store.js'
import { createAnthropicOAuthModel } from '../model-connection/anthropic-oauth-provider.js'
import { createOpenAICodexOAuthModel, listOpenAICodexModels } from '../model-connection/openai-codex-oauth-provider.js'
import type { ResolvedBuilderModel } from '../model-connection/resolved-model.js'
import { modelOffers } from '../model-connection/paid-models.js'
import type { ModelOffer } from '../model-connection/paid-models.js'
import type { ResolveCurrentSession } from '../identity-access/current-session.js'

export type ModelConnectionModule = Readonly<{
  registerRoutes(app: FastifyInstance): Promise<readonly string[]>
  resolveForBuilder(input: Readonly<{ accountId: string; projectId: string }>): Promise<ModelCredentialReference>
  listModelOffers(input: Readonly<{ accountId: string; projectId: string }>): Promise<readonly ModelOffer[]>
  createModel(reference: ModelCredentialReference, modelId?: string): Promise<ResolvedBuilderModel>
  close(): Promise<void>
}>

export type ModelConnectionDependencies = Readonly<{
  database: Readonly<{ host: string; port: number; database: string }>
  passwordFile: string
  credentialBackend: CredentialBackend
  origin: string
  resolveCurrentSession: ResolveCurrentSession
  fetchImpl?: typeof globalThis.fetch
}>

// One row per OAuth provider, naming the only thing a provider cannot express as descriptor data:
// how its credential becomes a Mastra model. Everything else about the provider lives in the
// descriptor registry, so adding a third provider adds a row here and a row there.
const OAUTH_MODELS: Readonly<Record<string, (input: Readonly<{ tokenStore: OAuthTokenStore; modelId?: string }>) => ResolvedBuilderModel>> = Object.freeze({
  [ANTHROPIC_OAUTH.providerId]: createAnthropicOAuthModel,
  [OPENAI_CODEX_OAUTH.providerId]: createOpenAICodexOAuthModel,
})

// A provider that publishes what an account may run is asked, rather than assumed from a registry.
type AccountCatalog = (input: Readonly<{ tokenStore: OAuthTokenStore; fetchImpl?: typeof globalThis.fetch }>) => Promise<readonly Readonly<{ modelId: string; label: string }>[]>
const OAUTH_ACCOUNT_CATALOGS: Readonly<Record<string, AccountCatalog>> = Object.freeze({
  [OPENAI_CODEX_OAUTH.providerId]: listOpenAICodexModels,
})
const ACCOUNT_CATALOG_TTL_MS = 10 * 60_000

export const createModelConnectionModule = ({ database, passwordFile, credentialBackend, origin, resolveCurrentSession, fetchImpl }: ModelConnectionDependencies): ModelConnectionModule => {
  const credentials = { ...database, user: 'hub_model_connection', password: readFileSync(passwordFile, 'utf8').trim() }
  const pool = createPostgresPool(credentials)
  // A refresh lock is held across a call to the provider, and the work it guards issues its own
  // queries. Taking both from one pool would let enough simultaneous refreshes hold every client
  // and leave the writes they are about to make with nothing to run on, so the lock gets a pool of
  // its own. Exhausting that one only makes refreshes queue, which is what it is for.
  const lockPool = createPostgresPool(credentials)
  const store = createModelConnectionStore({ pool, credentialBackend })
  const tokenStores = new Map<string, OAuthTokenStore>()
  const accountCatalogs = new Map<string, Readonly<{ readAt: number; models: readonly Readonly<{ modelId: string; label: string }>[] }>>()
  const oauthFlows: Readonly<Record<string, OAuthFlow>> = Object.freeze(Object.fromEntries(
    Object.values(OAUTH_PROVIDERS).map((descriptor) => [descriptor.providerId, Object.freeze({
      createAuthorizationRequest: () => createAuthorizationRequest(descriptor),
      extractState: (value: string) => extractResultState(descriptor, value),
      parse: (value: string, state: string) => parseAuthorizationResult(descriptor, value, state),
      exchange: (input: Readonly<{ code: string; state: string; verifier: string; fetchImpl?: typeof fetch }>) => exchangeAuthorizationCode(descriptor, input),
    })]),
  ))
  // Custody's compare-and-swap decides who wins a refresh, but it decides it after both writers
  // have already called the token endpoint. A provider whose refresh token rotates invalidates the
  // one just spent, so the loser's call either fails or strands a token custody never stored. This
  // lock makes the refresh itself the critical section: the second Hub process blocks, then reads
  // the set the first one persisted and does not call the provider at all. It is held only across
  // a refresh, which the five-minute expiry skew makes rare.
  const serializeRefresh = (connectionId: string) => async <T>(run: () => Promise<T>): Promise<T> => {
    const key = `conexus:model-connection-refresh:${connectionId}`
    const client = await lockPool.connect()
    try {
      await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [key])
      try { return await run() } finally { await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [key]) }
    } finally { client.release() }
  }
  const tokenStoreFor = (reference: ModelCredentialReference, descriptor: ReturnType<typeof oauthProvider>): OAuthTokenStore => {
    let tokenStore = tokenStores.get(reference.connectionId)
    if (!tokenStore) {
      tokenStore = createBackendOAuthTokenStore(credentialBackend, reference,
        (refresh, accountId) => refreshAuthorizationToken(descriptor, refresh, fetchImpl, accountId), {
          codePrefix: descriptor.codePrefix,
          serializeRefresh: serializeRefresh(reference.connectionId),
          resolveCurrent: async () => {
            const result = await pool.query('SELECT model_connection.read_current_generation($1) AS generation', [reference.connectionId])
            const value = result.rows[0]?.generation
            if (value === null || value === undefined) throw new Error('MODEL_CONNECTION_REVOKED')
            return { connectionId: reference.connectionId, generation: String(value) }
          },
          publishRefresh: async ({ current, next, tokens }) => {
            const plaintext = Buffer.from(JSON.stringify(tokens), 'utf8')
            try { await credentialBackend.publishOrMatch(next, plaintext) }
            catch (error) {
              if (error instanceof Error && error.message === 'CREDENTIAL_GENERATION_CONFLICT') return false
              throw error
            } finally { plaintext.fill(0) }
            const result = await pool.query('SELECT model_connection.advance_generation($1,$2,$3) AS value', [current.connectionId, current.generation, next.generation])
            return result.rows[0]?.value === true
          },
        })
      tokenStores.set(reference.connectionId, tokenStore)
    }
    return tokenStore
  }
  // The catalog is read with the connection's own token, kept for ten minutes, and its last good
  // answer outlives a failed read, so an outage at the provider narrows nothing the person could
  // already choose. With no answer ever, the descriptor's own list is what is offered.
  const accountCatalog = async (reference: ModelCredentialReference, providerId: string): Promise<readonly Readonly<{ modelId: string; label: string }>[] | undefined> => {
    const read = OAUTH_ACCOUNT_CATALOGS[providerId]
    if (!read) return undefined
    const known = accountCatalogs.get(reference.connectionId)
    if (known && Date.now() - known.readAt < ACCOUNT_CATALOG_TTL_MS) return known.models
    try {
      const models = await read({ tokenStore: tokenStoreFor(reference, oauthProvider(providerId)), ...(fetchImpl ? { fetchImpl } : {}) })
      if (models.length === 0) return known?.models
      accountCatalogs.set(reference.connectionId, { readAt: Date.now(), models })
      return models
    } catch (error) {
      process.emitWarning(error instanceof Error ? error.message : 'unknown', { code: 'MODEL_ACCOUNT_CATALOG_UNAVAILABLE' })
      return known?.models
    }
  }
  return Object.freeze({
    registerRoutes: (app: FastifyInstance) => registerModelConnectionRoutes(app, { store, origin, resolveCurrentSession, oauthFlows, ...(fetchImpl ? { fetchImpl } : {}) }),
    resolveForBuilder: (input) => store.admitForProject(input),
    // What this account can actually pay for in this Project. admit_for_project already applies
    // ownership, the workspace share, ACTIVE state and the account's own preference, so asking it
    // once per provider is the same decision the run will make, taken early enough to offer.
    listModelOffers: async ({ accountId, projectId }) => {
      const connections = await store.list(accountId)
      const providerIds = [...new Set(connections.map((connection) => connection.providerId))].sort()
      const admitted = await Promise.all(providerIds.map((providerId) =>
        store.admitForProject({ accountId, projectId, providerId }).catch((error: unknown) => {
          if (error instanceof Error && error.message === 'MODEL_CONNECTION_REQUIRED') return undefined
          throw error
        })))
      const offered = await Promise.all(admitted.map(async (reference) => {
        const connection = reference && connections.find((candidate) => candidate.connectionId === reference.connectionId)
        if (!reference || !connection) return []
        const catalog = connection.credentialKind === 'OAUTH_TOKEN_SET' ? await accountCatalog(reference, connection.providerId) : undefined
        return modelOffers({
          connectionId: connection.connectionId,
          connectionLabel: connection.label,
          providerId: connection.providerId,
          credentialKind: connection.credentialKind,
        }, catalog)
      }))
      return Object.freeze(offered.flat())
    },
    createModel: async (reference, modelId) => {
      const credential = (await pool.query<{ provider_id: string; credential_kind: string }>(
        'SELECT provider_id, credential_kind FROM model_connection.read_connection_credential($1)',
        [reference.connectionId])).rows[0]
      if (!credential) throw new Error('MODEL_CONNECTION_REVOKED')
      if (credential.credential_kind === 'API_KEY') {
        if (!modelId) throw new Error('MODEL_CONNECTION_MODEL_REQUIRED')
        // Decrypted at call time and handed straight to the router. It is never written to the
        // RequestContext, the run row, a span, a log or a problem response.
        const plaintext = await credentialBackend.materialize(reference)
        try {
          return Object.freeze({
            id: `${credential.provider_id}/${modelId}` as `${string}/${string}`,
            apiKey: Buffer.from(plaintext).toString('utf8'),
          })
        } finally { plaintext.fill(0) }
      }
      const descriptor = oauthProvider(credential.provider_id)
      const tokenStore = tokenStoreFor(reference, descriptor)
      const build = OAUTH_MODELS[descriptor.providerId]
      if (!build) throw new Error('MODEL_OAUTH_PROVIDER_UNKNOWN')
      return build({ tokenStore, ...(modelId ? { modelId } : {}) })
    },
    close: async () => { await Promise.all([pool.end(), lockPool.end()]) },
  })
}
