import type { FastifyInstance } from 'fastify'
import {
  CON01, CON02, CON03, CON04, CON08, CON09, CON10,
  type AccountId, type ConnectionCheckOutcome, type ConnectionId, type Reply, type WorkspaceId,
} from '../../../../packages/contract/dist/index.js'
import { routes } from '../http/access.js'
import type { ConnectorStore } from './store.js'

export type CheckConnection = (input: Readonly<{ accountId: AccountId; workspaceId: WorkspaceId; connectionId: ConnectionId }>) => Promise<ConnectionCheckOutcome>

export const registerConnectorRoutes = async (
  app: FastifyInstance,
  { store, checkConnection }: Readonly<{ store: ConnectorStore; checkConnection: CheckConnection }>,
): Promise<readonly ['CON-01', 'CON-02', 'CON-03', 'CON-04', 'CON-08', 'CON-09', 'CON-10']> => {
  const route = routes(app)

  route.operation(CON01, async (input, session) => ({
    entries: await store.listConnections({ accountId: session.account.accountId, workspaceId: input.params.workspaceId }),
  }))

  route.operation(CON02, async (input, session): Promise<Reply<typeof CON02>> => {
    const { connection, created } = await store.createConnection({ accountId: session.account.accountId, workspaceId: input.params.workspaceId, body: input.body })
    return created ? { status: 201, body: connection } : { status: 200, body: connection }
  })

  route.operation(CON03, async (input, session) => ({
    outcome: await checkConnection({ accountId: session.account.accountId, workspaceId: input.params.workspaceId, connectionId: input.params.connectionId }),
  }))

  route.operation(CON04, async (input, session) => {
    await store.disableConnection({ accountId: session.account.accountId, workspaceId: input.params.workspaceId, connectionId: input.params.connectionId })
    return undefined
  })

  route.operation(CON08, async (input, session) => ({
    entries: await store.listProjectBindings({ accountId: session.account.accountId, projectId: input.params.projectId }),
  }))

  route.operation(CON09, async (input, session): Promise<Reply<typeof CON09>> => {
    const { binding, created } = await store.bindConnection({ accountId: session.account.accountId, projectId: input.params.projectId, body: input.body })
    return created ? { status: 201, body: binding } : { status: 200, body: binding }
  })

  route.operation(CON10, async (input, session) => {
    await store.unbindConnection({ accountId: session.account.accountId, projectId: input.params.projectId, bindingId: input.params.bindingId })
    return undefined
  })

  return ['CON-01', 'CON-02', 'CON-03', 'CON-04', 'CON-08', 'CON-09', 'CON-10']
}
