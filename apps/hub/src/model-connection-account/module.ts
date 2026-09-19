import { readFileSync } from 'node:fs'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { createPostgresPool } from '../platform/postgres.js'
import type { CredentialBackend } from '../platform/credential-backend.js'
import { createAuthorizationRequest, exchangeAuthorizationCode, parseAuthorizationResult, refreshAuthorizationToken } from '../model-connection/anthropic-oauth.js'
import { registerModelConnectionRoutes } from './routes.js'
import { createModelConnectionStore } from './store.js'
import type { ModelCredentialReference } from './store.js'
export type { ModelCredentialReference } from './store.js'
import { createBackendOAuthTokenStore } from '../model-connection/oauth-token-store.js'
import { createAnthropicOAuthModel } from '../model-connection/anthropic-oauth-provider.js'
import type { ResolvedBuilderModel } from '../model-connection/model-catalog.js'
import type { ResolveCurrentSession } from '../identity-access/current-session.js'

export type ModelConnectionModule = Readonly<{
  registerRoutes(app: FastifyInstance): Promise<readonly string[]>
  resolveForBuilder(input: Readonly<{ accountId: string; projectId: string }>): Promise<ModelCredentialReference>
  createModel(reference: ModelCredentialReference, modelId?: string): Promise<ResolvedBuilderModel>
  close(): Promise<void>
}>

export type ModelConnectionDependencies = Readonly<{
  database: Readonly<{ host: string; port: number; database: string }>
  passwordFile: string
  credentialBackend: CredentialBackend
  enabledProviders: readonly string[]
  origin: string
  resolveCurrentSession: ResolveCurrentSession
  fetchImpl?: typeof globalThis.fetch
}>

export const createModelConnectionModule = ({ database, passwordFile, credentialBackend, enabledProviders, origin, resolveCurrentSession, fetchImpl }: ModelConnectionDependencies): ModelConnectionModule => {
  const pool = createPostgresPool({ ...database, user: 'hub_r2_connections', password: readFileSync(passwordFile, 'utf8').trim() })
  const store = createModelConnectionStore({ pool, credentialBackend })
  const tokenStores = new Map<string, ReturnType<typeof createBackendOAuthTokenStore>>()
  return Object.freeze({
    registerRoutes: (app: FastifyInstance) => registerModelConnectionRoutes(app, { store, origin, enabledProviders, resolveCurrentSession, createAuthorizationRequest, parseAuthorizationResult, exchangeAuthorizationCode, ...(fetchImpl ? { fetchImpl } : {}) }),
    resolveForBuilder: (input) => store.admitForProject(input),
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
      let tokenStore = tokenStores.get(reference.connectionId)
      if (!tokenStore) {
        tokenStore = createBackendOAuthTokenStore(credentialBackend, reference, refreshAuthorizationToken, {
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
      return createAnthropicOAuthModel({ tokenStore, ...(modelId ? { modelId } : {}) })
    },
    close: () => pool.end(),
  })
}
