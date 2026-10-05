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
import { createProjectStore } from './store.js'
import type { ProjectRepositoryPort } from './store.js'
import type { ProjectDeletionPorts } from './deletion.js'

export type ProjectModule = Readonly<{
  registerProjectRoutes(app: FastifyInstance): Promise<readonly ('PRJ-01' | 'PRJ-02' | 'PRJ-03' | 'PRJ-04' | ProjectSummaryOperationId | ProjectThumbnailOperationId)[]>
  /** The display name of a Project the account may see, or null when it may not. */
  readProjectName(input: Readonly<{ accountId: string; projectId: string }>): Promise<string | null>
  close(): Promise<void>
}>

const createProjectModule = ({
  commandPool,
  readPool,
  repository,
  deletion,
  thumbnailReader,
}: Readonly<{
  commandPool: PostgresPool
  readPool: PostgresPool
  repository: ProjectRepositoryPort
  deletion: ProjectDeletionPorts
  thumbnailReader?: ProjectThumbnailReader | undefined
}>): ProjectModule => {
  const store = createProjectStore({ commandPool, readPool, repository, deletion })
  return Object.freeze({
    registerProjectRoutes: async (app: FastifyInstance) => [
      ...await registerProjectRoutes(app, { store }),
      ...await registerProjectSummaryRoutes(app, { store }),
      ...(thumbnailReader ? await registerProjectThumbnailRoutes(app, { reader: thumbnailReader }) : []),
    ],
    readProjectName: async (input) => (await store.getProject(input))?.name ?? null,
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
  thumbnailReader,
}: Readonly<{
  database: Readonly<{ host: string; port: number; database: string }>
  project: ProjectRuntimeConfig
  repository: ProjectRepositoryPort
  deletion: ProjectDeletionPorts
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
  ...(thumbnailReader ? { thumbnailReader } : {}),
})
