import type { FastifyInstance, FastifyRequest } from 'fastify'
import { PROJECT_GENERATED_ROUTES } from '../generated/project-routes.js'
import type {
  Prj01Params,
  Prj02Params,
  Prj03Body,
  Prj03Params,
  Prj04Params,
  Prj04Querystring,
} from '../generated/project-routes.js'
import { Failure } from '../platform/failure.js'
import { errorCode } from '../platform/postgres.js'
import type { ResolveCurrentSession } from '../identity-access/current-session.js'
import type { ProjectStore } from './store.js'
import { isExactOrigin } from '../platform/origin.js'

const CSRF_COOKIE = '__Host-conexus_csrf'
const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value
// A path id that is not a UUID reaches PostgreSQL as 22P02: no such Workspace or Project.
const unknownIdAs = (error: unknown, code: 'WORKSPACE_NOT_FOUND' | 'PROJECT_NOT_FOUND'): never => {
  throw errorCode(error) === '22P02' ? new Failure(code) : error
}

export const registerProjectRoutes = async (
  app: FastifyInstance,
  dependencies: Readonly<{
    store: ProjectStore
    resolveCurrentSession: ResolveCurrentSession
    origin: string
  }>,
): Promise<readonly ('PRJ-01' | 'PRJ-02' | 'PRJ-03' | 'PRJ-04')[]> => {
  const authentic = (request: FastifyRequest): void => {
    const csrf = header(request.headers['x-conexus-csrf'])
    if (!isExactOrigin(request.headers.origin, dependencies.origin) || !csrf || csrf !== request.cookies[CSRF_COOKIE]) throw new Failure('REQUEST_AUTHENTICITY_DENIED')
  }
  const signedIn = async (request: FastifyRequest, write = false): Promise<string> => {
    const current = await dependencies.resolveCurrentSession(request, write)
    if (!current) throw new Failure('AUTHENTICATION_REQUIRED')
    return current.account.accountId
  }

  app.route<{ Params: Prj01Params }>({
    ...PROJECT_GENERATED_ROUTES['PRJ-01'],
    handler: async (request) => {
      const accountId = await signedIn(request)
      return dependencies.store.listProjects({ accountId, workspaceId: request.params.workspaceId })
        .catch((error: unknown) => unknownIdAs(error, 'WORKSPACE_NOT_FOUND'))
    },
  })

  app.route<{ Params: Prj02Params }>({
    ...PROJECT_GENERATED_ROUTES['PRJ-02'],
    handler: async (request) => {
      const accountId = await signedIn(request)
      const project = await dependencies.store.getProject({ accountId, projectId: request.params.projectId })
        .catch((error: unknown) => unknownIdAs(error, 'PROJECT_NOT_FOUND'))
      if (!project) throw new Failure('PROJECT_NOT_FOUND')
      return project
    },
  })

  app.route<{ Params: Prj03Params; Body: Prj03Body }>({
    ...PROJECT_GENERATED_ROUTES['PRJ-03'],
    handler: async (request, reply) => {
      authentic(request)
      const accountId = await signedIn(request, true)
      const idempotencyKey = header(request.headers['idempotency-key'])
      if (!idempotencyKey) throw new Failure('IDEMPOTENCY_KEY_REQUIRED')
      const { replayed: _replayed, ...body } = await dependencies.store.createProject({
        accountId,
        workspaceId: request.params.workspaceId,
        idempotencyKey,
        body: request.body,
      }).catch((error: unknown) => unknownIdAs(error, 'WORKSPACE_NOT_FOUND'))
      return reply.code(201).send(body)
    },
  })

  app.route<{ Params: Prj04Params; Querystring: Prj04Querystring }>({
    ...PROJECT_GENERATED_ROUTES['PRJ-04'],
    handler: async (request, reply) => {
      authentic(request)
      const accountId = await signedIn(request, true)
      await dependencies.store.deleteProject({ accountId, projectId: request.params.projectId, confirmName: request.query.confirmName })
        .catch((error: unknown) => unknownIdAs(error, 'PROJECT_NOT_FOUND'))
      return reply.code(204).send()
    },
  })
  return ['PRJ-01', 'PRJ-02', 'PRJ-03', 'PRJ-04']
}
