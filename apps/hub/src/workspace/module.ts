import type { FastifyInstance } from 'fastify'
import type { PostgresPool } from '../platform/postgres.js'
import { registerWorkspaceRoutes } from './routes.js'
import type { ResolveWorkspaceSession } from './routes.js'
import { createWorkspaceStore } from './store.js'

export type WorkspaceModule = Readonly<{
  registerWorkspaceRoutes(app: FastifyInstance): Promise<readonly ('WS-01' | 'WS-02')[]>
  close(): Promise<void>
}>

export const createWorkspaceModule = ({
  commandPool,
  readPool,
  origin,
  operatorIssuer,
  operatorSubject,
  resolveCurrentSession,
}: Readonly<{
  commandPool: PostgresPool
  readPool: PostgresPool
  origin: string
  operatorIssuer: string
  operatorSubject: string
  resolveCurrentSession: ResolveWorkspaceSession
}>): WorkspaceModule => {
  const store = createWorkspaceStore({ commandPool, readPool })
  return Object.freeze({
    registerWorkspaceRoutes: (app: FastifyInstance) => registerWorkspaceRoutes(app, {
      store,
      resolveCurrentSession,
      config: { origin, operatorIssuer, operatorSubject },
    }),
    close: async () => {
      await Promise.all([commandPool.end(), readPool.end()])
    },
  })
}
