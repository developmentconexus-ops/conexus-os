import type { FastifyInstance } from 'fastify'
import { AccountId, ProjectId } from '../../../../packages/contract/dist/index.js'
import type { Database } from '../platform/db.js'
import { registerProjectRoutes } from './routes.js'
import type { ProjectThumbnailReader } from './routes.js'
import { createProjectStore } from './store.js'
import type { ProjectRepositoryPort } from './store.js'
import type { BuilderProjectPorts, ProjectDeletionPorts } from './deletion.js'

export type ProjectModule = Readonly<{
  registerProjectRoutes(app: FastifyInstance): ReturnType<typeof registerProjectRoutes>
  /** The display name of a Project the account may see, or null when it may not. */
  readProjectName(input: Readonly<{ accountId: string; projectId: string }>): Promise<string | null>
}>

export const createConfiguredProjectModule = ({
  database,
  repository,
  deletion,
  builder,
  thumbnailReader,
}: Readonly<{
  database: Database
  repository: ProjectRepositoryPort
  deletion: ProjectDeletionPorts
  builder: BuilderProjectPorts
  thumbnailReader?: ProjectThumbnailReader | undefined
}>): ProjectModule => {
  const store = createProjectStore({ database, repository, deletion, builder })
  return Object.freeze({
    registerProjectRoutes: (app: FastifyInstance) => registerProjectRoutes(app, { store, thumbnailReader }),
    readProjectName: async (input) => (await store.getProject({ accountId: AccountId.parse(input.accountId), projectId: ProjectId.parse(input.projectId) }))?.name ?? null,
  })
}
