import type { FastifyInstance } from 'fastify'
import { createWorkspace } from '../../../../packages/contract/dist/index.js'
import type { WorkspaceStore } from './store.js'
import { routes } from '../http/access.js'

export type WorkspaceRouteDependencies = Readonly<{
  store: WorkspaceStore
}>

export const registerWorkspaceRoutes = async (
  app: FastifyInstance,
  { store }: WorkspaceRouteDependencies,
): Promise<readonly ['createWorkspace']> => {
  const route = routes(app)

  route.operation(createWorkspace, async (input, session) => {
    const created = await store.createWorkspace({
      accountId: session.account.accountId,
      idempotencyKey: input.headers['idempotency-key'],
      body: input.body,
    })
    return created.reply
  })

  return ['createWorkspace']
}
