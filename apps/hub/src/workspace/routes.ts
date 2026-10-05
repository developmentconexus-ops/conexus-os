import type { FastifyInstance } from 'fastify'
import { WORKSPACE_GENERATED_ROUTES } from '../generated/workspace-routes.js'
import type { WorkspaceOwnerId, Ws01Body, Ws02Params } from '../generated/workspace-routes.js'
import { Failure } from '../platform/failure.js'
import type { WorkspaceStore } from './store.js'
import { routes } from '../http/access.js'

const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value
// A path id that is not a UUID reaches PostgreSQL as 22P02: no such Workspace.
const unknownWorkspace = (error: unknown): never => {
  throw typeof error === 'object' && error !== null && 'code' in error && error.code === '22P02' ? new Failure('WORKSPACE_NOT_FOUND') : error
}

export type WorkspaceRouteDependencies = Readonly<{
  store: WorkspaceStore
}>

export const registerWorkspaceRoutes = async (
  app: FastifyInstance,
  { store }: WorkspaceRouteDependencies,
): Promise<readonly WorkspaceOwnerId[]> => {
  const route = routes(app)

  route.session<{ Body: Ws01Body }>({
    ...WORKSPACE_GENERATED_ROUTES['WS-01'],
    handler: async (request, reply, session) => {
      const accountId = session.account.accountId
      const idempotencyKey = header(request.headers['idempotency-key'])
      if (!idempotencyKey) throw new Failure('IDEMPOTENCY_KEY_REQUIRED')
      const { replayed: _replayed, ...body } = await store.createWorkspace({ accountId, idempotencyKey, name: request.body.name })
      return reply.code(201).send(body)
    },
  })

  route.session<{ Params: Ws02Params }>({
    ...WORKSPACE_GENERATED_ROUTES['WS-02'],
    handler: async (request, _reply, session) => {
      const accountId = session.account.accountId
      const workspace = await store.getWorkspace({ accountId, workspaceId: request.params.workspaceId }).catch(unknownWorkspace)
      if (!workspace) throw new Failure('WORKSPACE_NOT_FOUND')
      return workspace
    },
  })

  return ['WS-01', 'WS-02']
}
