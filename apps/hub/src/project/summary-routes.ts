import type { FastifyInstance } from 'fastify'
import { Failure } from '../platform/failure.js'
import { routes } from '../http/access.js'
import type { ProjectStore, ProjectSummaryWithActivity } from './store.js'

const uuid = { type: 'string', format: 'uuid' } as const
const params = { type: 'object', additionalProperties: false, required: ['workspaceId'], properties: { workspaceId: uuid } } as const
const driverCode = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

export type ProjectSummaryOperationId = 'PRJ-SUMMARIES'

// The Projects home reads one Workspace's cards in one call: name, archived flag, the most
// recent Builder activity, and whether a Preview exists to thumbnail. Hand-registered like the
// builder-session routes, because it composes the Project and Builder stores rather than
// projecting one closed 4A/OAS schema.
export const registerProjectSummaryRoutes = async (
  app: FastifyInstance,
  dependencies: Readonly<{
    store: Pick<ProjectStore, 'listProjectSummariesWithActivity'>
  }>,
): Promise<readonly ProjectSummaryOperationId[]> => {
  routes(app).session<{ Params: { workspaceId: string } }>({
    method: 'GET',
    url: '/api/control/workspaces/:workspaceId/project-summaries',
    schema: { params },
    handler: async (request, _reply, current) => {
      const projects: readonly ProjectSummaryWithActivity[] = await dependencies.store.listProjectSummariesWithActivity({
        accountId: current.account.accountId,
        workspaceId: request.params.workspaceId,
      }).catch((error: unknown) => {
        if (driverCode(error) === '22P02') throw new Failure('WORKSPACE_NOT_FOUND')
        throw new Failure('PROJECT_SUMMARIES_UNAVAILABLE', { cause: error, details: { workspaceId: request.params.workspaceId } })
      })
      return { projects }
    },
  })
  return ['PRJ-SUMMARIES']
}
