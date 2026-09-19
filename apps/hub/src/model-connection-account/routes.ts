import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { PROVIDER_REGISTRY } from '@mastra/core/llm'
import { sendProblem } from '../http/problem.js'
import type { ModelConnectionStore } from './store.js'
import type { AuthorizationRequest } from '../model-connection/oauth-provider.js'
import type { OAuthTokenSet } from '../model-connection/oauth-token-endpoint.js'
import type { ResolveCurrentSession } from '../identity-access/current-session.js'

// One entry per OAuth provider the sign-in offers. The routes pick a row by name and never learn
// what makes the providers differ.
export type OAuthFlow = Readonly<{
  createAuthorizationRequest(): Promise<AuthorizationRequest>
  extractState(value: string): string
  parse(value: string, state: string): string
  exchange(input: Readonly<{ code: string; state: string; verifier: string; fetchImpl?: typeof fetch }>): Promise<OAuthTokenSet>
}>

const csrfCookie = '__Host-conexus_csrf'
const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value
const uuid = { type: 'string', format: 'uuid' } as const
const mutationProblem = (reply: import('fastify').FastifyReply, error: unknown) => {
  const code = error instanceof Error ? error.message : ''
  if (code.includes('MODEL_OAUTH_PROVIDER_UNKNOWN')) return sendProblem(reply, 422, 'model-connection-provider-unknown', 'That provider is not one the model router knows')
  if (/_OAUTH_(?:PROVIDER_REFUSED|TOKEN_INVALID|ACCOUNT_ID_REQUIRED)/.test(code)) return sendProblem(reply, 422, 'model-authorization-rejected', 'The provider rejected that authorization; start a new authorization')
  if (code.includes('MODEL_CONNECTION_PUBLISH_REFUSED')) return sendProblem(reply, 503, 'model-connection-publish-failed', 'Authorization succeeded but the connection could not be published')
  if (code.includes('DENIED') || code.includes('REFUSED')) return sendProblem(reply, 403, 'model-connection-denied', 'Model connection operation denied')
  if (code.includes('STATE') || code.includes('AUTHORIZATION')) return sendProblem(reply, 422, 'model-authorization-invalid', 'Authorization result invalid')
  return sendProblem(reply, 503, 'model-connection-unavailable', 'Model connection unavailable')
}
const authenticity = async (request: FastifyRequest, reply: import('fastify').FastifyReply, origin: string, resolve: ResolveCurrentSession) => {
  const csrf = header(request.headers['x-conexus-csrf'])
  if (request.headers.origin !== origin || !csrf || csrf !== request.cookies[csrfCookie]) return sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
  const session = await resolve(request, true)
  if (!session) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
  return session
}

export const registerModelConnectionRoutes = async (app: FastifyInstance, dependencies: Readonly<{
  store: ModelConnectionStore
  origin: string
  enabledProviders: readonly string[]
  resolveCurrentSession: ResolveCurrentSession
  oauthFlows: Readonly<Record<string, OAuthFlow>>
  fetchImpl?: typeof fetch
}>): Promise<readonly string[]> => {
  const oauthFlow = (providerId: string): OAuthFlow => {
    const flow = Object.hasOwn(dependencies.oauthFlows, providerId) ? dependencies.oauthFlows[providerId] : undefined
    if (!flow) throw new Error('MODEL_OAUTH_PROVIDER_UNKNOWN')
    return flow
  }
  const oauthProviderId = { type: 'string', minLength: 1, maxLength: 128 } as const
  app.get('/api/control/me/model-connections', async (request, reply) => {
    const session = await dependencies.resolveCurrentSession(request)
    if (!session) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
    return { connections: await dependencies.store.list(session.account.accountId), providers: dependencies.enabledProviders }
  })
  // The provider is named by the caller on both halves of the sign-in rather than stored on the
  // authorization row, so this needs no schema change. It is not a trust boundary: naming the
  // wrong provider produces a state digest that matches no PENDING row, and the exchange that
  // would follow is bound to a verifier the caller never saw.
  app.post<{ Body: { providerId: string } }>('/api/control/me/model-connections/authorization', { schema: { body: { type: 'object', additionalProperties: false, required: ['providerId'], properties: { providerId: oauthProviderId } } } }, async (request, reply) => {
    const session = await authenticity(request, reply, dependencies.origin, dependencies.resolveCurrentSession); if (!session) return reply
    try {
      const authorization = await oauthFlow(request.body.providerId).createAuthorizationRequest()
      return reply.code(201).send(await dependencies.store.startAuthorization({ accountId: session.account.accountId, authorization: { ...authorization, authorizationId: randomUUID() } }))
    } catch (error) { return mutationProblem(reply, error) }
  })
  app.post<{ Body: { result: string; label: string; providerId: string } }>('/api/control/me/model-connections/authorization/complete', { schema: { body: { type: 'object', additionalProperties: false, required: ['providerId', 'result', 'label'], properties: { providerId: oauthProviderId, result: { type: 'string', minLength: 3, maxLength: 8192 }, label: { type: 'string', minLength: 1, maxLength: 120 } } } } }, async (request, reply) => {
    const session = await authenticity(request, reply, dependencies.origin, dependencies.resolveCurrentSession); if (!session) return reply
    try {
      const providerId = request.body.providerId
      const flow = oauthFlow(providerId)
      return reply.code(201).send(await dependencies.store.completeAuthorization({ accountId: session.account.accountId, providerId, result: request.body.result, label: request.body.label, extractState: flow.extractState, parse: flow.parse, exchange: flow.exchange, ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}) }))
    }
    catch (error) { const code = error instanceof Error ? error.message : ''; if (code.includes('MODEL_OAUTH_PROVIDER_UNKNOWN')) return mutationProblem(reply, error); if (code.includes('STATE') || code.includes('AUTHORIZATION_RESULT')) return sendProblem(reply, 422, 'model-authorization-invalid', 'Authorization result invalid'); return mutationProblem(reply, error) }
  })
  // Adding a key. The provider is validated against Mastra's own registry rather than a Conexus
  // list, so Conexus never decides which providers exist. The key is bounded in length only:
  // what counts as a valid key is the provider's business, and the first real request says so.
  app.post<{ Body: { providerId: string; label: string; apiKey: string } }>('/api/control/me/model-connections/api-key', { schema: { body: { type: 'object', additionalProperties: false, required: ['providerId', 'label', 'apiKey'], properties: { providerId: { type: 'string', minLength: 1, maxLength: 128 }, label: { type: 'string', minLength: 1, maxLength: 120 }, apiKey: { type: 'string', minLength: 8, maxLength: 4096 } } } } }, async (request, reply) => {
    const session = await authenticity(request, reply, dependencies.origin, dependencies.resolveCurrentSession); if (!session) return reply
    if (!Object.hasOwn(PROVIDER_REGISTRY, request.body.providerId)) {
      return sendProblem(reply, 422, 'model-connection-provider-unknown', 'That provider is not one the model router knows')
    }
    if (!dependencies.enabledProviders.includes(request.body.providerId)) {
      return sendProblem(reply, 422, 'model-connection-provider-not-enabled', "That provider is not enabled by this deployment's model catalog")
    }
    try { return reply.code(201).send(await dependencies.store.addApiKey({ accountId: session.account.accountId, providerId: request.body.providerId, label: request.body.label, apiKey: request.body.apiKey })) }
    catch (error) { return mutationProblem(reply, error) }
  })
  app.post<{ Body: { connectionId: string } }>('/api/control/me/model-connections/select', { schema: { body: { type: 'object', additionalProperties: false, required: ['connectionId'], properties: { connectionId: uuid } } } }, async (request, reply) => {
    const session = await authenticity(request, reply, dependencies.origin, dependencies.resolveCurrentSession); if (!session) return reply
    try { await dependencies.store.select({ accountId: session.account.accountId, connectionId: request.body.connectionId }); return reply.code(204).send() }
    catch (error) { return mutationProblem(reply, error) }
  })
  app.post<{ Body: { connectionId: string; workspaceId: string } }>('/api/control/me/model-connections/share', { schema: { body: { type: 'object', additionalProperties: false, required: ['connectionId', 'workspaceId'], properties: { connectionId: uuid, workspaceId: uuid } } } }, async (request, reply) => {
    const session = await authenticity(request, reply, dependencies.origin, dependencies.resolveCurrentSession); if (!session) return reply
    try { await dependencies.store.share({ accountId: session.account.accountId, connectionId: request.body.connectionId, workspaceId: request.body.workspaceId }); return reply.code(204).send() }
    catch (error) { return mutationProblem(reply, error) }
  })
  app.post<{ Body: { connectionId: string; workspaceId: string } }>('/api/control/me/model-connections/unshare', { schema: { body: { type: 'object', additionalProperties: false, required: ['connectionId', 'workspaceId'], properties: { connectionId: uuid, workspaceId: uuid } } } }, async (request, reply) => {
    const session = await authenticity(request, reply, dependencies.origin, dependencies.resolveCurrentSession); if (!session) return reply
    try { await dependencies.store.unshare({ accountId: session.account.accountId, connectionId: request.body.connectionId, workspaceId: request.body.workspaceId }); return reply.code(204).send() }
    catch (error) { return mutationProblem(reply, error) }
  })
  app.post<{ Params: { connectionId: string } }>('/api/control/me/model-connections/:connectionId/revoke', { schema: { params: { type: 'object', additionalProperties: false, required: ['connectionId'], properties: { connectionId: uuid } } } }, async (request, reply) => {
    const session = await authenticity(request, reply, dependencies.origin, dependencies.resolveCurrentSession); if (!session) return reply
    try { await dependencies.store.revoke({ accountId: session.account.accountId, connectionId: request.params.connectionId }); return reply.code(204).send() }
    catch (error) { return mutationProblem(reply, error) }
  })
  return ['CLA-01', 'CLA-02', 'CLA-03', 'CLA-04', 'CLA-05', 'CLA-06', 'CLA-07', 'CLA-08']
}
