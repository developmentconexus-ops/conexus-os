import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { sendProblem } from '../http/problem.js'
import type { ClaudeAccountStore } from './store.js'
import type { createAuthorizationRequest } from '../project/anthropic-oauth.js'

const csrfCookie = '__Host-conexus_csrf'
const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value
const uuid = { type: 'string', format: 'uuid' } as const
const mutationProblem = (reply: import('fastify').FastifyReply, error: unknown) => {
  const code = error instanceof Error ? error.message : ''
  if (code.includes('DENIED') || code.includes('REFUSED')) return sendProblem(reply, 403, 'claude-connection-denied', 'Claude connection operation denied')
  if (code.includes('STATE') || code.includes('AUTHORIZATION')) return sendProblem(reply, 422, 'claude-authorization-invalid', 'Claude authorization result invalid')
  return sendProblem(reply, 503, 'claude-connection-unavailable', 'Claude connection unavailable')
}
const authenticity = async (request: FastifyRequest, reply: import('fastify').FastifyReply, origin: string, resolve: (request: FastifyRequest, csrf?: boolean) => Promise<Readonly<{ account: Readonly<{ accountId: string }> }> | null>) => {
  const csrf = header(request.headers['x-conexus-csrf'])
  if (request.headers.origin !== origin || !csrf || csrf !== request.cookies[csrfCookie]) return sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
  const session = await resolve(request, true)
  if (!session) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
  return session
}

export const registerClaudeAccountRoutes = async (app: FastifyInstance, dependencies: Readonly<{
  store: ClaudeAccountStore
  origin: string
  resolveCurrentSession: (request: FastifyRequest, csrf?: boolean) => Promise<Readonly<{ account: Readonly<{ accountId: string }> }> | null>
  createAuthorizationRequest: typeof createAuthorizationRequest
  parseAuthorizationResult: (value: string, state: string) => string
  exchangeAuthorizationCode: (input: Readonly<{ code: string; state: string; verifier: string; fetchImpl?: typeof fetch }>) => Promise<Readonly<{ access: string; refresh: string; expiresAt: number }>>
  fetchImpl?: typeof fetch
}>): Promise<readonly string[]> => {
  app.get('/api/control/me/claude-connections', async (request, reply) => {
    const session = await dependencies.resolveCurrentSession(request)
    if (!session) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
    return { connections: await dependencies.store.list(session.account.accountId) }
  })
  app.post('/api/control/me/claude-connections/authorization', { schema: { body: { type: 'object', additionalProperties: false } } }, async (request, reply) => {
    const session = await authenticity(request, reply, dependencies.origin, dependencies.resolveCurrentSession); if (!session) return reply
    const authorization = await dependencies.createAuthorizationRequest()
    return reply.code(201).send(await dependencies.store.startAuthorization({ accountId: session.account.accountId, authorization: { ...authorization, authorizationId: randomUUID() } }))
  })
  app.post<{ Body: { result: string; label: string } }>('/api/control/me/claude-connections/authorization/complete', { schema: { body: { type: 'object', additionalProperties: false, required: ['result', 'label'], properties: { result: { type: 'string', minLength: 3, maxLength: 8192 }, label: { type: 'string', minLength: 1, maxLength: 120 } } } } }, async (request, reply) => {
    const session = await authenticity(request, reply, dependencies.origin, dependencies.resolveCurrentSession); if (!session) return reply
    try { return reply.code(201).send(await dependencies.store.completeAuthorization({ accountId: session.account.accountId, result: request.body.result, label: request.body.label, parse: dependencies.parseAuthorizationResult, exchange: dependencies.exchangeAuthorizationCode, ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}) })) }
    catch (error) { const code = error instanceof Error ? error.message : ''; if (code.includes('STATE') || code.includes('AUTHORIZATION_RESULT')) return sendProblem(reply, 422, 'claude-authorization-invalid', 'Claude authorization result invalid'); return mutationProblem(reply, error) }
  })
  app.post<{ Body: { connectionId: string } }>('/api/control/me/claude-connections/select', { schema: { body: { type: 'object', additionalProperties: false, required: ['connectionId'], properties: { connectionId: uuid } } } }, async (request, reply) => {
    const session = await authenticity(request, reply, dependencies.origin, dependencies.resolveCurrentSession); if (!session) return reply
    try { await dependencies.store.select({ accountId: session.account.accountId, connectionId: request.body.connectionId }); return reply.code(204).send() }
    catch (error) { return mutationProblem(reply, error) }
  })
  app.post<{ Body: { connectionId: string; accountId: string; workspaceId: string } }>('/api/control/me/claude-connections/share', { schema: { body: { type: 'object', additionalProperties: false, required: ['connectionId', 'accountId', 'workspaceId'], properties: { connectionId: uuid, accountId: uuid, workspaceId: uuid } } } }, async (request, reply) => {
    const session = await authenticity(request, reply, dependencies.origin, dependencies.resolveCurrentSession); if (!session) return reply
    try { await dependencies.store.share({ accountId: session.account.accountId, connectionId: request.body.connectionId, targetAccountId: request.body.accountId, workspaceId: request.body.workspaceId }); return reply.code(204).send() }
    catch (error) { return mutationProblem(reply, error) }
  })
  app.post<{ Params: { connectionId: string } }>('/api/control/me/claude-connections/:connectionId/revoke', { schema: { params: { type: 'object', additionalProperties: false, required: ['connectionId'], properties: { connectionId: uuid } } } }, async (request, reply) => {
    const session = await authenticity(request, reply, dependencies.origin, dependencies.resolveCurrentSession); if (!session) return reply
    try { await dependencies.store.revoke({ accountId: session.account.accountId, connectionId: request.params.connectionId }); return reply.code(204).send() }
    catch (error) { return mutationProblem(reply, error) }
  })
  return ['CLAUDE-01', 'CLAUDE-02', 'CLAUDE-03', 'CLAUDE-04', 'CLAUDE-05', 'CLAUDE-06']
}
