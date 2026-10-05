import type { FastifyInstance } from 'fastify'
import { AccountId } from '../../../../packages/contract/dist/index.js'
import type { Database } from '../platform/db.js'
import { registerWorkspaceRoutes } from './routes.js'
import { createWorkspaceStore } from './store.js'

export type WorkspaceModule = Readonly<{
  registerWorkspaceRoutes(app: FastifyInstance): Promise<readonly ['WS-01']>
  listAccessibleWorkspaces(accountId: string): Promise<readonly { workspaceId: string; name: string }[]>
}>

export const createWorkspaceModule = ({ database }: Readonly<{ database: Database }>): WorkspaceModule => {
  const store = createWorkspaceStore(database)
  return Object.freeze({
    registerWorkspaceRoutes: (app: FastifyInstance) => registerWorkspaceRoutes(app, {
      store,
    }),
    listAccessibleWorkspaces: async (accountId: string) => (await store.list(AccountId.parse(accountId)))
      .map((row) => ({ workspaceId: row.workspace_id, name: row.name })),
  })
}
