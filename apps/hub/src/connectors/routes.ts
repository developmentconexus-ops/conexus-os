import type { FastifyInstance } from 'fastify'
import {
  listWorkspaceConnections, createWorkspaceConnection, checkWorkspaceConnection, disableWorkspaceConnection, listProjectConnectionBindings, bindProjectConnection, unbindProjectConnection,
  type AccountId, type ConnectionCheckOutcome, type ConnectionId, type Reply, type WorkspaceId,
} from '@conexus/contract'
import { routes } from '../http/access.js'
import type { ConnectorStore } from './store.js'

export type CheckConnection = (input: Readonly<{ accountId: AccountId; workspaceId: WorkspaceId; connectionId: ConnectionId }>) => Promise<ConnectionCheckOutcome>

export const registerConnectorRoutes = async (
  app: FastifyInstance,
  { store, checkConnection }: Readonly<{ store: ConnectorStore; checkConnection: CheckConnection }>,
): Promise<readonly ['listWorkspaceConnections', 'createWorkspaceConnection', 'checkWorkspaceConnection', 'disableWorkspaceConnection', 'listProjectConnectionBindings', 'bindProjectConnection', 'unbindProjectConnection']> => {
  const route = routes(app)

  route.operation(listWorkspaceConnections, async (input, session) => ({
    entries: await store.listConnections({ accountId: session.account.accountId, workspaceId: input.params.workspaceId }),
  }))

  route.operation(createWorkspaceConnection, async (input, session): Promise<Reply<typeof createWorkspaceConnection>> => {
    const { connection, created } = await store.createConnection({ accountId: session.account.accountId, workspaceId: input.params.workspaceId, body: input.body })
    return created ? { status: 201, body: connection } : { status: 200, body: connection }
  })

  route.operation(checkWorkspaceConnection, async (input, session) => ({
    outcome: await checkConnection({ accountId: session.account.accountId, workspaceId: input.params.workspaceId, connectionId: input.params.connectionId }),
  }))

  route.operation(disableWorkspaceConnection, async (input, session) => {
    await store.disableConnection({ accountId: session.account.accountId, workspaceId: input.params.workspaceId, connectionId: input.params.connectionId })
    return undefined
  })

  route.operation(listProjectConnectionBindings, async (input, session) => ({
    entries: await store.listProjectBindings({ accountId: session.account.accountId, projectId: input.params.projectId }),
  }))

  route.operation(bindProjectConnection, async (input, session): Promise<Reply<typeof bindProjectConnection>> => {
    const { binding, created } = await store.bindConnection({ accountId: session.account.accountId, projectId: input.params.projectId, body: input.body })
    return created ? { status: 201, body: binding } : { status: 200, body: binding }
  })

  route.operation(unbindProjectConnection, async (input, session) => {
    await store.unbindConnection({ accountId: session.account.accountId, projectId: input.params.projectId, bindingId: input.params.bindingId })
    return undefined
  })

  return ['listWorkspaceConnections', 'createWorkspaceConnection', 'checkWorkspaceConnection', 'disableWorkspaceConnection', 'listProjectConnectionBindings', 'bindProjectConnection', 'unbindProjectConnection']
}
