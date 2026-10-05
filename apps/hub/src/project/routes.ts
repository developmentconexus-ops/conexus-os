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
import { Failure } from '../platform/failure.js'
import { errorCode } from '../platform/db.js'
import type { ProjectStore } from './store.js'
import { routes } from '../http/access.js'

const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value
// A path id that is not a UUID reaches PostgreSQL as 22P02: no such Workspace or Project.
const unknownIdAs = (error: unknown, code: 'WORKSPACE_NOT_FOUND' | 'PROJECT_NOT_FOUND'): never => {
  throw errorCode(error) === '22P02' ? new Failure(code) : error
}

export const registerProjectRoutes = async (
  app: FastifyInstance,
  dependencies: Readonly<{
    store: ProjectStore
  }>,
): Promise<readonly ('PRJ-01' | 'PRJ-02' | 'PRJ-03' | 'PRJ-04')[]> => {
  const route = routes(app)

  route.session<{ Params: Prj01Params }>({
    ...PROJECT_GENERATED_ROUTES['PRJ-01'],
    handler: async (request, _reply, session) => {
      const accountId = session.account.accountId
      return dependencies.store.listProjects({ accountId, workspaceId: request.params.workspaceId })
        .catch((error: unknown) => unknownIdAs(error, 'WORKSPACE_NOT_FOUND'))
    },
  })

  route.session<{ Params: Prj02Params }>({
    ...PROJECT_GENERATED_ROUTES['PRJ-02'],
    handler: async (request, _reply, session) => {
      const accountId = session.account.accountId
      const project = await dependencies.store.getProject({ accountId, projectId: request.params.projectId })
        .catch((error: unknown) => unknownIdAs(error, 'PROJECT_NOT_FOUND'))
      if (!project) throw new Failure('PROJECT_NOT_FOUND')
      return project
    },
  })

  route.session<{ Params: Prj03Params; Body: Prj03Body }>({
    ...PROJECT_GENERATED_ROUTES['PRJ-03'],
    handler: async (request, reply, session) => {
      const accountId = session.account.accountId
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

  route.session<{ Params: Prj04Params; Querystring: Prj04Querystring }>({
    ...PROJECT_GENERATED_ROUTES['PRJ-04'],
    handler: async (request, reply, session) => {
      const accountId = session.account.accountId
      await dependencies.store.deleteProject({ accountId, projectId: request.params.projectId, confirmName: request.query.confirmName })
        .catch((error: unknown) => unknownIdAs(error, 'PROJECT_NOT_FOUND'))
      return reply.code(204).send()
    },
  })
  return ['PRJ-01', 'PRJ-02', 'PRJ-03', 'PRJ-04']
}
