import type { FastifyInstance } from 'fastify'
import type { ResolveCurrentSession } from '../identity-access/current-session.js'
import { S2_GENERATED_ROUTES } from '../generated/s2-routes.js'
import type { S2OwnerId, Ws01Body, Ws02Params } from '../generated/s2-routes.js'
import { sendProblem } from '../http/problem.js'
import { workspaceErrorCode } from './errors.js'
import type { WorkspaceStore } from './store.js'
import { isExactOrigin } from '../platform/origin.js'

const CSRF_COOKIE = '__Host-conexus_csrf'
const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value
const driverCode = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  const code = error.code
  return typeof code === 'string' ? code : undefined
}
const internalFailure = (reply: Parameters<typeof sendProblem>[0]) =>
  sendProblem(reply, 500, 'internal-error', 'Internal server error')

export type WorkspaceRouteDependencies = Readonly<{
  store: WorkspaceStore
  resolveCurrentSession: ResolveCurrentSession
  config: Readonly<{ origin: string }>
}>

export const registerWorkspaceRoutes = async (
  app: FastifyInstance,
  { store, resolveCurrentSession, config }: WorkspaceRouteDependencies,
): Promise<readonly S2OwnerId[]> => {
  app.route<{ Body: Ws01Body }>({
    ...S2_GENERATED_ROUTES['WS-01'],
    handler: async (request, reply) => {
      const requestCsrf = header(request.headers['x-conexus-csrf'])
      if (!isExactOrigin(request.headers.origin, config.origin) || !requestCsrf || requestCsrf !== request.cookies[CSRF_COOKIE]) {
        return sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
      }
      const current = await resolveCurrentSession(request, true)
      if (!current) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      const idempotencyKey = header(request.headers['idempotency-key'])
      if (!idempotencyKey) return sendProblem(reply, 400, 'idempotency-key-required', 'Idempotency key required')
      try {
        const { replayed: _replayed, ...body } = await store.createWorkspace({
          accountId: current.account.accountId,
          idempotencyKey,
          name: request.body.name,
        })
        return reply.code(201).send(body)
      } catch (error) {
        const code = workspaceErrorCode(error)
        if (code === 'IDEMPOTENCY_CONFLICT' || code === 'OUTCOME_UNKNOWN') {
          return sendProblem(reply, 409, code.toLowerCase(), 'Workspace creation conflict')
        }
        return internalFailure(reply)
      }
    },
  })

  app.route<{ Params: Ws02Params }>({
    ...S2_GENERATED_ROUTES['WS-02'],
    handler: async (request, reply) => {
      const current = await resolveCurrentSession(request)
      if (!current) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      try {
        const workspace = await store.getWorkspace({
          accountId: current.account.accountId,
          workspaceId: request.params.workspaceId,
        })
        if (!workspace) return sendProblem(reply, 404, 'workspace-not-found', 'Workspace not found')
        return workspace
      } catch (error) {
        if (driverCode(error) === '22P02') return sendProblem(reply, 404, 'workspace-not-found', 'Workspace not found')
        return internalFailure(reply)
      }
    },
  })

  return ['WS-01', 'WS-02']
}
