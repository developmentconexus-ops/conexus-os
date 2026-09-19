import type { FastifyInstance } from 'fastify'
import type { PostgresPool } from '../platform/postgres.js'
import type { ResolveCurrentSession } from '../identity-access/current-session.js'
import { registerWorkspaceRoutes } from './routes.js'
import { createWorkspaceStore } from './store.js'

export type WorkspaceModule = Readonly<{
  registerWorkspaceRoutes(app: FastifyInstance): Promise<readonly ('WS-01' | 'WS-02')[]>
  close(): Promise<void>
}>

export const createWorkspaceModule = ({
  commandPool,
  readPool,
  origin,
  resolveCurrentSession,
}: Readonly<{
  commandPool: PostgresPool
  readPool: PostgresPool
  origin: string
  resolveCurrentSession: ResolveCurrentSession
}>): WorkspaceModule => {
  const store = createWorkspaceStore({ commandPool, readPool })
  return Object.freeze({
    registerWorkspaceRoutes: (app: FastifyInstance) => registerWorkspaceRoutes(app, {
      store,
      resolveCurrentSession,
      config: { origin },
    }),
    close: async () => {
      await Promise.all([commandPool.end(), readPool.end()])
    },
  })
}
