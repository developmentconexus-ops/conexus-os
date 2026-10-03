import type { FastifyInstance } from 'fastify'
import { PROJECT_GENERATED_ROUTES } from '../generated/project-routes.js'
import type {
  Prj01Params,
  Prj02Params,
  Prj03Body,
  Prj03Params,
  Prj04Params,
  Prj04Querystring,
} from '../generated/project-routes.js'
import { sendProblem } from '../http/problem.js'
import { recordFailure } from '../platform/logger.js'
import type { ResolveCurrentSession } from '../identity-access/current-session.js'
import { type ProjectError, projectErrorCode } from './errors.js'
import type { ProjectStore } from './store.js'
import { isExactOrigin } from '../platform/origin.js'

const CSRF_COOKIE = '__Host-conexus_csrf'
const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value
const driverCode = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

export const registerProjectRoutes = async (
  app: FastifyInstance,
  dependencies: Readonly<{
    store: ProjectStore
    resolveCurrentSession: ResolveCurrentSession
    origin: string
  }>,
): Promise<readonly ('PRJ-01' | 'PRJ-02' | 'PRJ-03' | 'PRJ-04')[]> => {
  app.route<{ Params: Prj01Params }>({
    ...PROJECT_GENERATED_ROUTES['PRJ-01'],
    handler: async (request, reply) => {
      const current = await dependencies.resolveCurrentSession(request)
      if (!current) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      try {
        return await dependencies.store.listProjects({
          accountId: current.account.accountId,
          workspaceId: request.params.workspaceId,
        })
      } catch (error) {
        if (driverCode(error) === '22P02') return sendProblem(reply, 404, 'workspace-not-found', 'Workspace not found')
        recordFailure(request.log, 'PROJECT_ROUTE_FAILED', error, { 'conexus.workspace_id': request.params.workspaceId })
        return sendProblem(reply, 500, 'internal-error', 'Internal server error')
      }
    },
  })

  app.route<{ Params: Prj02Params }>({
    ...PROJECT_GENERATED_ROUTES['PRJ-02'],
    handler: async (request, reply) => {
      const current = await dependencies.resolveCurrentSession(request)
      if (!current) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      try {
        const project = await dependencies.store.getProject({
          accountId: current.account.accountId,
          projectId: request.params.projectId,
        })
        if (!project) return sendProblem(reply, 404, 'project-not-found', 'Project not found')
        return project
      } catch (error) {
        if (driverCode(error) === '22P02') return sendProblem(reply, 404, 'project-not-found', 'Project not found')
        recordFailure(request.log, 'PROJECT_ROUTE_FAILED', error, { 'conexus.project_id': request.params.projectId })
        return sendProblem(reply, 500, 'internal-error', 'Internal server error')
      }
    },
  })

  app.route<{ Params: Prj03Params; Body: Prj03Body }>({
    ...PROJECT_GENERATED_ROUTES['PRJ-03'],
    handler: async (request, reply) => {
      const csrf = header(request.headers['x-conexus-csrf'])
      if (!isExactOrigin(request.headers.origin, dependencies.origin) || !csrf || csrf !== request.cookies[CSRF_COOKIE]) {
        return sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
      }
      const current = await dependencies.resolveCurrentSession(request, true)
      if (!current) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      const idempotencyKey = header(request.headers['idempotency-key'])
      if (!idempotencyKey) return sendProblem(reply, 400, 'idempotency-key-required', 'Idempotency key required')
      try {
        const { replayed: _replayed, ...body } = await dependencies.store.createProject({
          accountId: current.account.accountId,
          workspaceId: request.params.workspaceId,
          idempotencyKey,
          body: request.body,
        })
        return reply.code(201).send(body)
      } catch (error) {
        const code = projectErrorCode(error)
        if (code === 'AUTHORIZATION_DENIED') return sendProblem(reply, 403, 'project-create-denied', 'Project creation denied')
        if (code === 'SOURCE_INPUT_REFUSED') return sendProblem(reply, 422, 'project-source-refused', 'Project source refused')
        if (code === 'REPOSITORY_REFUSED') {
          recordFailure(request.log, 'PROJECT_REPOSITORY_REFUSED', error, { 'conexus.workspace_id': request.params.workspaceId })
          return sendProblem(reply, 503, 'project-repository-unavailable', 'Project repository unavailable', (error as ProjectError).reason ?? undefined)
        }
        if (code === 'IDEMPOTENCY_CONFLICT' || code === 'OUTCOME_UNKNOWN') {
          return sendProblem(reply, 409, 'project-create-conflict', 'Project creation conflict')
        }
        if (driverCode(error) === '22P02') return sendProblem(reply, 404, 'workspace-not-found', 'Workspace not found')
        recordFailure(request.log, 'PROJECT_ROUTE_FAILED', error, { 'conexus.workspace_id': request.params.workspaceId })
        return sendProblem(reply, 500, 'internal-error', 'Internal server error')
      }
    },
  })
  app.route<{ Params: Prj04Params; Querystring: Prj04Querystring }>({
    ...PROJECT_GENERATED_ROUTES['PRJ-04'],
    handler: async (request, reply) => {
      const csrf = header(request.headers['x-conexus-csrf'])
      if (!isExactOrigin(request.headers.origin, dependencies.origin) || !csrf || csrf !== request.cookies[CSRF_COOKIE]) {
        return sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
      }
      const current = await dependencies.resolveCurrentSession(request, true)
      if (!current) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      try {
        await dependencies.store.deleteProject({
          accountId: current.account.accountId,
          projectId: request.params.projectId,
          confirmName: request.query.confirmName,
        })
        return reply.code(204).send()
      } catch (error) {
        const code = projectErrorCode(error)
        if (code === 'AUTHORIZATION_DENIED') return sendProblem(reply, 403, 'project-delete-denied', 'Project deletion denied')
        if (code === 'PROJECT_NOT_FOUND') return sendProblem(reply, 404, 'project-not-found', 'Project not found')
        if (code === 'PROJECT_NAME_MISMATCH') return sendProblem(reply, 409, 'project-name-mismatch', 'Project name confirmation mismatch')
        if (code === 'PROJECT_BUSY') return sendProblem(reply, 409, 'project-busy', 'Project is busy building')
        if (code === 'REPOSITORY_REFUSED') {
          recordFailure(request.log, 'PROJECT_REPOSITORY_REFUSED', error, { 'conexus.project_id': request.params.projectId })
          return sendProblem(reply, 503, 'project-repository-unavailable', 'Project repository unavailable', (error as ProjectError).reason ?? undefined)
        }
        if (code === 'DELETION_INCOMPLETE') {
          recordFailure(request.log, 'PROJECT_DELETION_INCOMPLETE', error, { 'conexus.project_id': request.params.projectId })
          return sendProblem(reply, 503, 'project-deletion-incomplete', 'Project deletion incomplete')
        }
        if (driverCode(error) === '22P02') return sendProblem(reply, 404, 'project-not-found', 'Project not found')
        recordFailure(request.log, 'PROJECT_ROUTE_FAILED', error, { 'conexus.project_id': request.params.projectId })
        return sendProblem(reply, 500, 'internal-error', 'Internal server error')
      }
    },
  })
  return ['PRJ-01', 'PRJ-02', 'PRJ-03', 'PRJ-04']
}

