import type { FastifyInstance } from 'fastify'
import type { PostgresPool } from '../platform/postgres.js'
import { registerWorkspaceRoutes } from './routes.js'
import { createWorkspaceStore } from './store.js'

export type WorkspaceModule = Readonly<{
  registerWorkspaceRoutes(app: FastifyInstance): Promise<readonly ['WS-01']>
  close(): Promise<void>
}>

export const createWorkspaceModule = ({
  commandPool,
  readPool,
}: Readonly<{
  commandPool: PostgresPool
  readPool: PostgresPool
}>): WorkspaceModule => {
  const store = createWorkspaceStore({ commandPool })
  return Object.freeze({
    registerWorkspaceRoutes: (app: FastifyInstance) => registerWorkspaceRoutes(app, {
      store,
    }),
    close: async () => {
      await Promise.all([commandPool.end(), readPool.end()])
    },
  })
}
