import type { FastifyInstance } from 'fastify'
import type { AccountId, ProjectId } from '@conexus/contract'
import type { RegistryModule } from '../registry/public.js'
import type { Database } from '../platform/db.js'
import { registerProjectRoutes } from './routes.js'
import type { ProjectThumbnailReader } from './routes.js'
import { createProjectStore } from './store.js'
import type { BuilderProjectPorts, ProjectRepositoryPort } from './store.js'
import type { ProjectDeletionPorts } from './deletion.js'

export type ProjectModule = Readonly<{
  registerProjectRoutes(app: FastifyInstance): ReturnType<typeof registerProjectRoutes>
  /** The display name of a Project the account may see, or null when it may not. */
  readProjectName(input: Readonly<{ accountId: AccountId; projectId: ProjectId }>): Promise<string | null>
}>

export const createConfiguredProjectModule = ({
  database,
  repository,
  deletion,
  builder,
  registry,
  thumbnailReader,
}: Readonly<{
  database: Database
  repository: ProjectRepositoryPort
  deletion: ProjectDeletionPorts
  builder: BuilderProjectPorts
  registry: Pick<RegistryModule, 'readPreviewPresence'>
  thumbnailReader: ProjectThumbnailReader
}>): ProjectModule => {
  const store = createProjectStore({ database, repository, deletion, builder, registry })
  return Object.freeze({
    registerProjectRoutes: (app: FastifyInstance) => registerProjectRoutes(app, { store, thumbnailReader }),
    readProjectName: async (input) => (await store.getProject(input))?.name ?? null,
  })
}
