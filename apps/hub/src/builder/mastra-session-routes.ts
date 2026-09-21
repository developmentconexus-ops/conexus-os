import type { Mastra } from '@mastra/core/mastra'
import type { BuilderAgentController } from './runtime.js'
import { MastraServer } from '@mastra/fastify'
import { SERVER_ROUTES } from '@mastra/server/server-adapter'
import type { FastifyInstance } from 'fastify'
import { sendProblem } from '../http/problem.js'
import type { ResolveCurrentSession } from '../identity-access/current-session.js'

export const BUILDER_MASTRA_PREFIX = '/api/mastra'
export const BUILDER_CONTROLLER_ID = 'conexus-builder-controller'
const CSRF_COOKIE = '__Host-conexus_csrf'
const SESSION_BASE = '/agent-controller/:controllerId/sessions/:resourceId'
const RUN_SCOPE = /^builder:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// The run owns the turn: a sandbox has to exist before the agent may act, so the browser never
// creates a run's session or sends the opening message here. Everything that observes or steers a
// session that already exists is Mastra's own route, unmodified. A Project's conversations are
// that session's own threads, so creating, listing, renaming and switching them are Mastra's
// routes too and Conexus keeps no conversation store of its own.
const BROWSER_ROUTES: ReadonlySet<string> = new Set([
  'GET /agent-controller/:controllerId/models',
  'GET /agent-controller/:controllerId/modes',
  `GET ${SESSION_BASE}`,
  `GET ${SESSION_BASE}/stream`,
  `GET ${SESSION_BASE}/threads`,
  `POST ${SESSION_BASE}/threads`,
  `PUT ${SESSION_BASE}/threads/:threadId`,
  `GET ${SESSION_BASE}/threads/:threadId/messages`,
  `POST ${SESSION_BASE}/thread`,
  `POST ${SESSION_BASE}/abort`,
  `POST ${SESSION_BASE}/steer`,
  `POST ${SESSION_BASE}/follow-up`,
  `POST ${SESSION_BASE}/model`,
  `POST ${SESSION_BASE}/tool-approval`,
  `POST ${SESSION_BASE}/tool-suspension`,
])

const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value

export const registerBuilderMastraRoutes = async (app: FastifyInstance, { mastra, controller, origin, resolveCurrentSession, admitProjectBuild }: Readonly<{
  mastra: Mastra
  controller: BuilderAgentController
  origin: string
  resolveCurrentSession: ResolveCurrentSession
  admitProjectBuild(input: Readonly<{ accountId: string; projectId: string }>): Promise<boolean>
}>): Promise<void> => {
  await app.register(async (scope) => {
    scope.addHook('preHandler', async (request, reply) => {
      const session = await resolveCurrentSession(request)
      if (!session) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      if (request.method !== 'GET') {
        const csrf = header(request.headers['x-conexus-csrf'])
        if (request.headers.origin !== origin || !csrf || csrf !== request.cookies[CSRF_COOKIE]) {
          return sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
        }
      }
      const params = request.params as Readonly<{ controllerId?: string; resourceId?: string }>
      // Mastra Code names its own controller; the id the browser addresses is the one this module
      // registered it under on the Mastra.
      if (params.controllerId !== BUILDER_CONTROLLER_ID) return sendProblem(reply, 404, 'builder-session-not-found', 'Builder session not found')
      if (params.resourceId !== undefined && !await admitProjectBuild({ accountId: session.account.accountId, projectId: params.resourceId })) {
        return sendProblem(reply, 403, 'project-build-denied', 'Project build denied')
      }
      // Mastra's session routes get-or-create. A run's session carries that run's sandbox, so a
      // browser arriving first would create it without one and the run would inherit the empty shell.
      const { sessionScope } = request.query as Readonly<{ sessionScope?: string }>
      if (sessionScope !== undefined && params.resourceId !== undefined) {
        if (!RUN_SCOPE.test(sessionScope)) return sendProblem(reply, 404, 'builder-session-not-found', 'Builder session not found')
        if (!await controller.getSessionByResource(params.resourceId, sessionScope)) {
          return sendProblem(reply, 409, 'builder-session-not-ready', 'Builder session not ready')
        }
      }
    })
    const server = new MastraServer({ app: scope, mastra, prefix: BUILDER_MASTRA_PREFIX })
    server.registerContextMiddleware()
    for (const route of SERVER_ROUTES) {
      if (BROWSER_ROUTES.has(`${route.method} ${route.path}`)) await server.registerRoute(scope, route, { prefix: BUILDER_MASTRA_PREFIX })
    }
  })
}
