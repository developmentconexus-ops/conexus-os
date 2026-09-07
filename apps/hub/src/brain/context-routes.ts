import type { FastifyInstance } from 'fastify'
import { R2_GENERATED_ROUTES } from '../generated/r2-routes.js'
import type { R2HubBRN14Contract } from '../generated/r2-routes.js'
import { sendProblem } from '../http/problem.js'
import type { ProjectBrainContextResolver, ProjectBrainContextResult } from './context.js'
import type { ResolveBrainSession } from './routes.js'

const respond = (reply: Parameters<typeof sendProblem>[0], result: ProjectBrainContextResult) => {
  if (result.status === 'FOUND') return result.value
  if (result.status === 'DENIED') {
    return sendProblem(reply, 403, 'project-brain-context-read-denied', 'Project Brain context read denied')
  }
  if (result.status === 'NOT_FOUND') {
    return sendProblem(reply, 404, 'project-brain-context-not-found', 'Project Brain context not found')
  }
  return sendProblem(reply, 503, 'project-brain-context-unavailable', 'Project Brain context unavailable')
}

export const registerProjectBrainContextRoutes = async (
  app: FastifyInstance,
  dependencies: Readonly<{
    resolver: ProjectBrainContextResolver
    resolveCurrentSession: ResolveBrainSession
  }>,
): Promise<readonly ['BRN-14']> => {
  app.route<{ Params: R2HubBRN14Contract['params'] }>({
    ...R2_GENERATED_ROUTES['BRN-14'],
    handler: async (request, reply) => {
      const session = await dependencies.resolveCurrentSession(request)
      if (!session) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      return respond(reply, await dependencies.resolver.resolve({
        accountId: session.account.accountId,
        projectId: request.params.projectId,
        purpose: 'READ',
      }))
    },
  })

  return ['BRN-14']
}
