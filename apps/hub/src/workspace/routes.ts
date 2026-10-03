import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { ResolveCurrentSession } from '../identity-access/current-session.js'
import { WORKSPACE_GENERATED_ROUTES } from '../generated/workspace-routes.js'
import type { WorkspaceOwnerId, Ws01Body, Ws02Params } from '../generated/workspace-routes.js'
import { Failure } from '../platform/failure.js'
import type { WorkspaceStore } from './store.js'
import { isExactOrigin } from '../platform/origin.js'

const CSRF_COOKIE = '__Host-conexus_csrf'
const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value
// A path id that is not a UUID reaches PostgreSQL as 22P02: no such Workspace.
const unknownWorkspace = (error: unknown): never => {
  throw typeof error === 'object' && error !== null && 'code' in error && error.code === '22P02' ? new Failure('WORKSPACE_NOT_FOUND') : error
}

export type WorkspaceRouteDependencies = Readonly<{
  store: WorkspaceStore
  resolveCurrentSession: ResolveCurrentSession
  config: Readonly<{ origin: string }>
}>

export const registerWorkspaceRoutes = async (
  app: FastifyInstance,
  { store, resolveCurrentSession, config }: WorkspaceRouteDependencies,
): Promise<readonly WorkspaceOwnerId[]> => {
  const authentic = (request: FastifyRequest): void => {
    const requestCsrf = header(request.headers['x-conexus-csrf'])
    if (!isExactOrigin(request.headers.origin, config.origin) || !requestCsrf || requestCsrf !== request.cookies[CSRF_COOKIE]) throw new Failure('REQUEST_AUTHENTICITY_DENIED')
  }
  const signedIn = async (request: FastifyRequest, write = false): Promise<string> => {
    const current = await resolveCurrentSession(request, write)
    if (!current) throw new Failure('AUTHENTICATION_REQUIRED')
    return current.account.accountId
  }

  app.route<{ Body: Ws01Body }>({
    ...WORKSPACE_GENERATED_ROUTES['WS-01'],
    handler: async (request, reply) => {
      authentic(request)
      const accountId = await signedIn(request, true)
      const idempotencyKey = header(request.headers['idempotency-key'])
      if (!idempotencyKey) throw new Failure('IDEMPOTENCY_KEY_REQUIRED')
      const { replayed: _replayed, ...body } = await store.createWorkspace({ accountId, idempotencyKey, name: request.body.name })
      return reply.code(201).send(body)
    },
  })

  app.route<{ Params: Ws02Params }>({
    ...WORKSPACE_GENERATED_ROUTES['WS-02'],
    handler: async (request) => {
      const accountId = await signedIn(request)
      const workspace = await store.getWorkspace({ accountId, workspaceId: request.params.workspaceId }).catch(unknownWorkspace)
      if (!workspace) throw new Failure('WORKSPACE_NOT_FOUND')
      return workspace
    },
  })

  return ['WS-01', 'WS-02']
}
