import type { FastifyInstance } from 'fastify'
import { createPostgresPool } from '../platform/postgres.js'
import type { PostgresPool } from '../platform/postgres.js'
import type { ProjectRuntimeConfig } from '../platform/config.js'
import { readSecretFile } from '../platform/secrets.js'
import { registerProjectRoutes } from './routes.js'
import { registerProjectSummaryRoutes } from './summary-routes.js'
import type { ProjectSummaryOperationId } from './summary-routes.js'
import { registerProjectThumbnailRoutes } from './thumbnail-routes.js'
import type { ProjectThumbnailOperationId, ProjectThumbnailReader } from './thumbnail-routes.js'
import type { ResolveCurrentSession } from '../identity-access/current-session.js'
import { createProjectStore } from './store.js'
import type { ProjectRepositoryPort } from './store.js'
import type { ProjectDeletionPorts } from './deletion.js'

export type ProjectModule = Readonly<{
  registerProjectRoutes(app: FastifyInstance): Promise<readonly ('PRJ-01' | 'PRJ-02' | 'PRJ-03' | 'PRJ-04' | ProjectSummaryOperationId | ProjectThumbnailOperationId)[]>
  close(): Promise<void>
}>

const createProjectModule = ({
  commandPool,
  readPool,
  repository,
  deletion,
  origin,
  resolveCurrentSession,
  thumbnailReader,
}: Readonly<{
  commandPool: PostgresPool
  readPool: PostgresPool
  repository: ProjectRepositoryPort
  deletion: ProjectDeletionPorts
  origin: string
  resolveCurrentSession: ResolveCurrentSession
  thumbnailReader?: ProjectThumbnailReader | undefined
}>): ProjectModule => {
  const store = createProjectStore({ commandPool, readPool, repository, deletion })
  return Object.freeze({
    registerProjectRoutes: async (app: FastifyInstance) => [
      ...await registerProjectRoutes(app, { store, resolveCurrentSession, origin }),
      ...await registerProjectSummaryRoutes(app, { store, resolveCurrentSession }),
      ...(thumbnailReader ? await registerProjectThumbnailRoutes(app, { reader: thumbnailReader, resolveCurrentSession }) : []),
    ],
    close: async () => {
      await Promise.all([commandPool.end(), readPool.end()])
    },
  })
}

export const createConfiguredProjectModule = ({
  database,
  project,
  repository,
  deletion,
  origin,
  resolveCurrentSession,
  thumbnailReader,
}: Readonly<{
  database: Readonly<{ host: string; port: number; database: string }>
  project: ProjectRuntimeConfig
  repository: ProjectRepositoryPort
  deletion: ProjectDeletionPorts
  origin: string
  resolveCurrentSession: ResolveCurrentSession
  thumbnailReader?: ProjectThumbnailReader | undefined
}>): ProjectModule => createProjectModule({
  commandPool: createPostgresPool({
    ...database,
    user: 'hub_project_command',
    password: readSecretFile(project.commandPasswordFile),
  }),
  readPool: createPostgresPool({
    ...database,
    user: 'hub_project_read',
    password: readSecretFile(project.readPasswordFile),
  }),
  repository,
  deletion,
  origin,
  resolveCurrentSession,
  ...(thumbnailReader ? { thumbnailReader } : {}),
})
