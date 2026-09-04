import type { FastifyInstance, FastifyRequest } from 'fastify'
import { S2_GENERATED_ROUTES } from '../generated/s2-routes.js'
import type { S2OwnerId, Ws01Body, Ws02Params } from '../generated/s2-routes.js'
import { sendProblem } from '../http/problem.js'
import { workspaceErrorCode } from './errors.js'
import type { WorkspaceStore } from './store.js'

const CSRF_COOKIE = '__Host-conexus_csrf'
const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value
const exactOrigin = (request: FastifyRequest, configuredOrigin: string): boolean => request.headers.origin === configuredOrigin
const driverCode = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  const code = error.code
  return typeof code === 'string' ? code : undefined
}
const internalFailure = (reply: Parameters<typeof sendProblem>[0]) =>
  sendProblem(reply, 500, 'internal-error', 'Internal server error')

export type WorkspaceSession = Readonly<{
  account: Readonly<{ accountId: string }>
  issuer: string
  subject: string
}>
export type ResolveWorkspaceSession = (
  request: FastifyRequest,
  requireCsrf?: boolean,
) => Promise<WorkspaceSession | null>

export type WorkspaceRouteDependencies = Readonly<{
  store: WorkspaceStore
  resolveCurrentSession: ResolveWorkspaceSession
  config: Readonly<{ origin: string; operatorIssuer: string; operatorSubject: string }>
}>

export const registerWorkspaceRoutes = async (
  app: FastifyInstance,
  { store, resolveCurrentSession, config }: WorkspaceRouteDependencies,
): Promise<readonly S2OwnerId[]> => {
  app.route<{ Body: Ws01Body }>({
    ...S2_GENERATED_ROUTES['WS-01'],
    handler: async (request, reply) => {
      const requestCsrf = header(request.headers['x-conexus-csrf'])
      if (!exactOrigin(request, config.origin) || !requestCsrf || requestCsrf !== request.cookies[CSRF_COOKIE]) {
        return sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
      }
      const current = await resolveCurrentSession(request, true)
      if (!current) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      if (current.issuer !== config.operatorIssuer || current.subject !== config.operatorSubject) {
        return sendProblem(reply, 403, 'platform-operator-required', 'Platform operator required')
      }
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
