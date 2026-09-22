import type { FastifyInstance } from 'fastify'
import { sendProblem } from '../http/problem.js'
import type { ResolveCurrentSession } from '../identity-access/current-session.js'
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
    resolveCurrentSession: ResolveCurrentSession
  }>,
): Promise<readonly ProjectSummaryOperationId[]> => {
  app.get<{ Params: { workspaceId: string } }>(
    '/api/control/workspaces/:workspaceId/project-summaries',
    { schema: { params } },
    async (request, reply) => {
      const current = await dependencies.resolveCurrentSession(request)
      if (!current) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      try {
        const projects: readonly ProjectSummaryWithActivity[] = await dependencies.store.listProjectSummariesWithActivity({
          accountId: current.account.accountId,
          workspaceId: request.params.workspaceId,
        })
        return { projects }
      } catch (error) {
        if (driverCode(error) === '22P02') return sendProblem(reply, 404, 'workspace-not-found', 'Workspace not found')
        return sendProblem(reply, 503, 'project-summaries-unavailable', 'Project summaries unavailable')
      }
    },
  )
  return ['PRJ-SUMMARIES']
}
