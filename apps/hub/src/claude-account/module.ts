import { readFileSync } from 'node:fs'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { createPostgresPool } from '../platform/postgres.js'
import type { CredentialBackend } from '../platform/credential-backend.js'
import { createAuthorizationRequest, exchangeAuthorizationCode, parseAuthorizationResult, refreshAuthorizationToken } from '../project/anthropic-oauth.js'
import { registerClaudeAccountRoutes } from './routes.js'
import { createClaudeAccountStore } from './store.js'
import { createBackendOAuthTokenStore } from '../project/oauth-token-store.js'
import { createAnthropicOAuthModel } from '../project/anthropic-oauth-provider.js'
import type { MastraLanguageModel } from '@mastra/core/agent'

export type ClaudeCredentialReference = Readonly<{ connectionId: string; generation: string }>
export type ClaudeAccountModule = Readonly<{
  registerRoutes(app: FastifyInstance): Promise<readonly string[]>
  resolveForBuilder(input: Readonly<{ accountId: string; projectId: string }>): Promise<ClaudeCredentialReference>
  createModel(reference: ClaudeCredentialReference, modelId?: string): MastraLanguageModel
  close(): Promise<void>
}>

export type ClaudeAccountDependencies = Readonly<{
  database: Readonly<{ host: string; port: number; database: string }>
  passwordFile: string
  credentialBackend: CredentialBackend
  origin: string
  resolveCurrentSession: (request: FastifyRequest, requireCsrf?: boolean) => Promise<Readonly<{ account: Readonly<{ accountId: string }> }> | null>
  fetchImpl?: typeof globalThis.fetch
}>

export const createClaudeAccountModule = ({ database, passwordFile, credentialBackend, origin, resolveCurrentSession, fetchImpl }: ClaudeAccountDependencies): ClaudeAccountModule => {
  const pool = createPostgresPool({ ...database, user: 'hub_r2_connections', password: readFileSync(passwordFile, 'utf8').trim() })
  const store = createClaudeAccountStore({ pool, credentialBackend })
  const tokenStores = new Map<string, ReturnType<typeof createBackendOAuthTokenStore>>()
  return Object.freeze({
    registerRoutes: (app: FastifyInstance) => registerClaudeAccountRoutes(app, { store, origin, resolveCurrentSession, createAuthorizationRequest, parseAuthorizationResult, exchangeAuthorizationCode, ...(fetchImpl ? { fetchImpl } : {}) }),
    resolveForBuilder: (input) => store.admitForProject(input),
    createModel: (reference, modelId) => {
      let tokenStore = tokenStores.get(reference.connectionId)
      if (!tokenStore) {
        tokenStore = createBackendOAuthTokenStore(credentialBackend, reference, refreshAuthorizationToken, {
          resolveCurrent: async () => {
            const result = await pool.query('SELECT claude_connection.read_current_generation($1) AS generation', [reference.connectionId])
            const value = result.rows[0]?.generation
            if (value === null || value === undefined) throw new Error('CLAUDE_CONNECTION_REVOKED')
            return { connectionId: reference.connectionId, generation: String(value) }
          },
          publishRefresh: async ({ current, next, tokens }) => {
            const plaintext = Buffer.from(JSON.stringify(tokens), 'utf8')
            try { await credentialBackend.publishOrMatch(next, plaintext) }
            catch (error) {
              if (error instanceof Error && error.message === 'CREDENTIAL_GENERATION_CONFLICT') return false
              throw error
            } finally { plaintext.fill(0) }
            const result = await pool.query('SELECT claude_connection.advance_generation($1,$2,$3) AS value', [current.connectionId, current.generation, next.generation])
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
