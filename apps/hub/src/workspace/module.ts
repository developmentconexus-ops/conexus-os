import type { FastifyInstance } from 'fastify'
import type { AccountId } from '../../../../packages/contract/dist/index.js'
import type { Database } from '../platform/db.js'
import { registerWorkspaceRoutes } from './routes.js'
import { createWorkspaceStore } from './store.js'

export type WorkspaceModule = Readonly<{
  registerWorkspaceRoutes(app: FastifyInstance): Promise<readonly ['createWorkspace']>
  listAccessibleWorkspaces(accountId: AccountId): Promise<readonly { workspaceId: string; name: string }[]>
}>

export const createWorkspaceModule = ({ database }: Readonly<{ database: Database }>): WorkspaceModule => {
  const store = createWorkspaceStore(database)
  return Object.freeze({
    registerWorkspaceRoutes: (app: FastifyInstance) => registerWorkspaceRoutes(app, {
      store,
    }),
    listAccessibleWorkspaces: async (accountId: AccountId) => (await store.list(accountId))
      .map((row) => ({ workspaceId: row.workspace_id, name: row.name })),
  })
}
