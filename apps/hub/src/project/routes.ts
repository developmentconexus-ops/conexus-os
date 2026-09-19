import type { FastifyInstance, FastifyRequest } from 'fastify'
import { S3_GENERATED_ROUTES } from '../generated/s3-routes.js'
import type {
  Prj01Params,
  Prj02Params,
  Prj03Body,
  Prj03Params,
} from '../generated/s3-routes.js'
import { sendProblem } from '../http/problem.js'
import type { ResolveCurrentSession } from '../identity-access/current-session.js'
import { projectErrorCode } from './errors.js'
import type { ProjectStore } from './store.js'

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
): Promise<readonly ('PRJ-01' | 'PRJ-02' | 'PRJ-03')[]> => {
  app.route<{ Params: Prj01Params }>({
    ...S3_GENERATED_ROUTES['PRJ-01'],
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
        return sendProblem(reply, 500, 'internal-error', 'Internal server error')
      }
    },
  })

  app.route<{ Params: Prj02Params }>({
    ...S3_GENERATED_ROUTES['PRJ-02'],
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
        return sendProblem(reply, 500, 'internal-error', 'Internal server error')
      }
    },
  })

  app.route<{ Params: Prj03Params; Body: Prj03Body }>({
    ...S3_GENERATED_ROUTES['PRJ-03'],
    handler: async (request, reply) => {
      const csrf = header(request.headers['x-conexus-csrf'])
      if (request.headers.origin !== dependencies.origin || !csrf || csrf !== request.cookies[CSRF_COOKIE]) {
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
        if (code === 'RECOVERY_REFUSED' || code === 'SOURCE_DEPENDENCY_REFUSED') {
          return sendProblem(reply, 503, 'project-source-unavailable', 'Project source unavailable')
        }
        if (code === 'IDEMPOTENCY_CONFLICT' || code === 'OUTCOME_UNKNOWN' || code === 'SOURCE_CONFLICT') {
          return sendProblem(reply, 409, 'project-create-conflict', 'Project creation conflict')
        }
        if (driverCode(error) === '22P02') return sendProblem(reply, 404, 'workspace-not-found', 'Workspace not found')
        return sendProblem(reply, 500, 'internal-error', 'Internal server error')
      }
    },
  })
  return ['PRJ-01', 'PRJ-02', 'PRJ-03']
}

