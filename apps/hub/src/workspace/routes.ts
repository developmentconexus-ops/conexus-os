import type { FastifyInstance } from 'fastify'
import { AccountId, WS01 } from '../../../../packages/contract/dist/index.js'
import type { WorkspaceStore } from './store.js'
import { routes } from '../http/access.js'

export type WorkspaceRouteDependencies = Readonly<{
  store: WorkspaceStore
}>

export const registerWorkspaceRoutes = async (
  app: FastifyInstance,
  { store }: WorkspaceRouteDependencies,
): Promise<readonly ['WS-01']> => {
  const route = routes(app)

  route.operation(WS01, async (input, session) => {
    const created = await store.createWorkspace({
      accountId: AccountId.parse(session.account.accountId),
      idempotencyKey: input.headers['idempotency-key'],
      body: input.body,
    })
    return created.reply
  })

  return ['WS-01']
}
