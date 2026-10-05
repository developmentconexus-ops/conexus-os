import type { FastifyInstance } from 'fastify'
import type { PostgresPool } from '../platform/db.js'
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
  })
}

export const createConfiguredProjectModule = ({
  pool,
  repository,
  deletion,
  thumbnailReader,
}: Readonly<{
  pool: PostgresPool
  repository: ProjectRepositoryPort
  deletion: ProjectDeletionPorts
  thumbnailReader?: ProjectThumbnailReader | undefined
}>): ProjectModule => createProjectModule({
  commandPool: pool,
  readPool: pool,
  repository,
  deletion,
  ...(thumbnailReader ? { thumbnailReader } : {}),
})
