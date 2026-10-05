import type { FastifyInstance } from 'fastify'
import type { PostgresPool } from '../platform/db.js'
import { registerWorkspaceRoutes } from './routes.js'
import { createWorkspaceStore } from './store.js'

export type WorkspaceModule = Readonly<{
  registerWorkspaceRoutes(app: FastifyInstance): Promise<readonly ['WS-01']>
}>

export const createWorkspaceModule = ({ commandPool }: Readonly<{ commandPool: PostgresPool }>): WorkspaceModule => {
  const store = createWorkspaceStore({ commandPool })
  return Object.freeze({
    registerWorkspaceRoutes: (app: FastifyInstance) => registerWorkspaceRoutes(app, {
      store,
    }),
  })
}
