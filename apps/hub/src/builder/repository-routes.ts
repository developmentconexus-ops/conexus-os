import type { FastifyInstance } from 'fastify'
import { sendProblem } from '../http/problem.js'
import type { ResolveCurrentSession } from '../identity-access/current-session.js'
import { GithubRequestError } from './factory-github.js'
import type { GithubApp } from './factory-github.js'
import type { FactoryRepository } from './factory-runtime.js'
import type { FactoryBindingRecord } from './store.js'

const uuid = { type: 'string', format: 'uuid' } as const
const params = { type: 'object', additionalProperties: false, required: ['projectId'], properties: { projectId: uuid } } as const
const message = (error: unknown): string => error instanceof Error ? error.message : ''

// The "Sobre o Projeto" page's repository link: a Project's bound GitHub repository, and whether
// it currently answers, without ever disclosing why not (a token, an installation id, or a
// GitHub error message).
type ProjectRepositoryState =
  | Readonly<{ state: 'REACHABLE'; fullName: string; url: string }>
  | Readonly<{ state: 'UNREACHABLE' }>

export type ProjectRepositoryPort = Readonly<{
  read(input: Readonly<{ accountId: string; projectId: string }>): Promise<ProjectRepositoryState>
}>

// The Factory binding names the repository row; resolveRepository reads that row (no GitHub
// call); one GitHub call then says whether the repository still answers. A missing binding is
// UNREACHABLE, a bound repository GitHub refuses with 404/403 is UNREACHABLE, and anything else
// (an unresolvable Factory row, a GitHub outage) throws for the route to answer 503.
export const createProjectRepositoryPort = (dependencies: Readonly<{
  readFactoryBinding(input: Readonly<{ accountId: string; projectId: string }>): Promise<FactoryBindingRecord | null>
  resolveRepository(binding: FactoryBindingRecord): Promise<FactoryRepository>
  github: Pick<GithubApp, 'readRepository'>
}>): ProjectRepositoryPort => ({
  read: async ({ accountId, projectId }) => {
    const binding = await dependencies.readFactoryBinding({ accountId, projectId })
    if (!binding) return { state: 'UNREACHABLE' }
    const repository = await dependencies.resolveRepository(binding).catch((error: unknown) => {
      throw error instanceof Error ? error : new Error('BUILDER_FACTORY_UNAVAILABLE')
    })
    try {
      const githubRepository = await dependencies.github.readRepository(repository.installation, repository.slug)
      return { state: 'REACHABLE', fullName: githubRepository.fullName, url: `https://github.com/${githubRepository.fullName}` }
    } catch (error) {
      if (error instanceof GithubRequestError && (error.status === 404 || error.status === 403)) return { state: 'UNREACHABLE' }
      throw new Error('BUILDER_FACTORY_UNAVAILABLE')
    }
  },
})

export type ProjectRepositoryOperationId = 'PRJ-REPOSITORY'

export const registerProjectRepositoryRoutes = async (
  app: FastifyInstance,
  dependencies: Readonly<{
    repository: ProjectRepositoryPort
    resolveCurrentSession: ResolveCurrentSession
  }>,
): Promise<readonly ProjectRepositoryOperationId[]> => {
  app.get<{ Params: { projectId: string } }>(
    '/api/control/projects/:projectId/repository',
    { schema: { params } },
    async (request, reply) => {
      const session = await dependencies.resolveCurrentSession(request)
      if (!session) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      try {
        return await dependencies.repository.read({ accountId: session.account.accountId, projectId: request.params.projectId })
      } catch (error) {
        if (message(error).includes('NOT_AUTHORIZED')) return sendProblem(reply, 403, 'project-build-denied', 'Project build denied')
        return sendProblem(reply, 503, 'repository-state-unavailable', 'Repository state unavailable')
      }
    },
  )
  return ['PRJ-REPOSITORY']
}
