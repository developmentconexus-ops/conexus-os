import type { FastifyInstance } from 'fastify'
import { listProjects, getProject, createProject, deleteProject, listProjectSummaries, getProjectThumbnail, type AccountId, type ArtifactRevisionId, type ProjectId } from '@conexus/contract'
import { Failure } from '../platform/failure.js'
import type { ProjectStore } from './store.js'
import { routes } from '../http/access.js'

export type ProjectThumbnailReader = Readonly<{
  readProjectThumbnail(accountId: AccountId, projectId: ProjectId): Promise<Readonly<{ artifactRevisionId: ArtifactRevisionId; bytes: Uint8Array }> | null>
}>

export const registerProjectRoutes = async (
  app: FastifyInstance,
  dependencies: Readonly<{ store: ProjectStore; thumbnailReader: ProjectThumbnailReader }>,
): Promise<readonly ['listProjects', 'getProject', 'createProject', 'deleteProject', 'listProjectSummaries', 'getProjectThumbnail']> => {
  const route = routes(app)
  const { store, thumbnailReader } = dependencies

  route.operation(listProjects, (input, session) =>
    store.listProjects({ accountId: session.account.accountId, workspaceId: input.params.workspaceId }))

  route.operation(getProject, async (input, session) => {
    const project = await store.getProject({ accountId: session.account.accountId, projectId: input.params.projectId })
    if (!project) throw new Failure('PROJECT_NOT_FOUND')
    return project
  })

  route.operation(createProject, async (input, session) => {
    const { reply } = await store.createProject({
      accountId: session.account.accountId,
      workspaceId: input.params.workspaceId,
      idempotencyKey: input.headers['idempotency-key'],
      body: input.body,
    })
    return reply
  })

  route.operation(deleteProject, async (input, session) => {
    await store.deleteProject({ accountId: session.account.accountId, projectId: input.params.projectId, confirmName: input.query.confirmName })
    return undefined
  })

  route.operation(listProjectSummaries, async (input, session) => ({
    projects: await store.listProjectSummariesWithActivity({ accountId: session.account.accountId, workspaceId: input.params.workspaceId })
      .catch((error: unknown) => {
        throw new Failure('PROJECT_SUMMARIES_UNAVAILABLE', { cause: error, details: { workspaceId: input.params.workspaceId } })
      }),
  }))

  route.operation(getProjectThumbnail, async (input, session) => {
    const thumbnail = await thumbnailReader.readProjectThumbnail(session.account.accountId, input.params.projectId)
      .catch((error: unknown) => {
        throw new Failure('PROJECT_THUMBNAIL_UNAVAILABLE', { cause: error, details: { projectId: input.params.projectId } })
      })
    if (!thumbnail) throw new Failure('PROJECT_THUMBNAIL_NOT_FOUND')
    return { bytes: thumbnail.bytes, etag: thumbnail.artifactRevisionId }
  })

  return ['listProjects', 'getProject', 'createProject', 'deleteProject', 'listProjectSummaries', 'getProjectThumbnail']
}
