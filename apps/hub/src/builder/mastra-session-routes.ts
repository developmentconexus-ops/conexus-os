import type { Mastra } from '@mastra/core/mastra'
import type { BuilderAgentController } from './runtime.js'
import { MastraServer } from '@mastra/fastify'
import { SERVER_ROUTES } from '@mastra/server/server-adapter'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { sendProblem } from '../http/problem.js'
import type { ResolveCurrentSession } from '../identity-access/current-session.js'

export const BUILDER_MASTRA_PREFIX = '/api/mastra'
export const FACTORY_MASTRA_PREFIX = '/api/mastra-factory'
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

// Core's steer aborts and then sends, and its follow-up sends at once when the session is idle, so
// both open a turn. A turn belongs to a run, which alone carries the sandbox and the run's settings.
const RUN_TURN_ROUTES: readonly string[] = [`POST ${SESSION_BASE}/steer`, `POST ${SESSION_BASE}/follow-up`]

// On the Factory a conversation is a source-control session row the Hub creates, so the browser
// may not create or switch threads there.
const FACTORY_BROWSER_ROUTES: ReadonlySet<string> = new Set(
  [...BROWSER_ROUTES].filter((route) => route !== `POST ${SESSION_BASE}/threads` && route !== `POST ${SESSION_BASE}/thread`),
)

const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value

type GuardedMount = Readonly<{
  mastra: Mastra
  controller: BuilderAgentController
  prefix: string
  controllerId: string
  routes: ReadonlySet<string>
  origin: string
  resolveCurrentSession: ResolveCurrentSession
  admitResource(input: Readonly<{ accountId: string; resourceId: string }>): Promise<boolean>
  // Runs after Mastra has built the request's context, so the Hub has the last word on it.
  shapeContext?(request: FastifyRequest, accountId: string): void
}>

// The one guard every Mastra mount goes through. Mastra's context middleware merges a
// requestContext taken from the body or the query into the server's, so a caller could name
// another user or Project; only the Hub sets it, and a request carrying one is refused.
const registerGuardedMastraMount = async (app: FastifyInstance, mount: GuardedMount): Promise<void> => {
  const accounts = new WeakMap<FastifyRequest, string>()
  const runTurns = new Set(RUN_TURN_ROUTES.map((route) => route.replace(' ', ` ${mount.prefix}`)))
  await app.register(async (scope) => {
    scope.addHook('preHandler', async (request, reply) => {
      const session = await mount.resolveCurrentSession(request)
      if (!session) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      if (request.method !== 'GET') {
        const csrf = header(request.headers['x-conexus-csrf'])
        if (request.headers.origin !== mount.origin || !csrf || csrf !== request.cookies[CSRF_COOKIE]) {
          return sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
        }
      }
      const body = request.body as Readonly<Record<string, unknown>> | undefined
      if ((request.query as Readonly<Record<string, unknown>>).requestContext !== undefined || (typeof body === 'object' && body !== null && 'requestContext' in body)) {
        return sendProblem(reply, 400, 'request-context-refused', 'Request context is set by the server')
      }
      const params = request.params as Readonly<{ controllerId?: string; resourceId?: string }>
      // Mastra Code names its own controller; the id the browser addresses is the one this module
      // registered it under on the Mastra.
      if (params.controllerId !== mount.controllerId) return sendProblem(reply, 404, 'builder-session-not-found', 'Builder session not found')
      if (params.resourceId !== undefined && !await mount.admitResource({ accountId: session.account.accountId, resourceId: params.resourceId })) {
        return sendProblem(reply, 403, 'project-build-denied', 'Project build denied')
      }
      // Mastra's session routes get-or-create. A run's session carries that run's sandbox, so a
      // browser arriving first would create it without one and the run would inherit the empty shell.
      const { sessionScope } = request.query as Readonly<{ sessionScope?: string }>
      if (sessionScope === undefined && runTurns.has(`${request.method} ${request.routeOptions.url}`)) {
        return sendProblem(reply, 409, 'builder-run-required', 'Only a running Builder run takes a message')
      }
      if (sessionScope !== undefined && params.resourceId !== undefined) {
        if (!RUN_SCOPE.test(sessionScope)) return sendProblem(reply, 404, 'builder-session-not-found', 'Builder session not found')
        if (!await mount.controller.getSessionByResource(params.resourceId, sessionScope)) {
          return sendProblem(reply, 409, 'builder-session-not-ready', 'Builder session not ready')
        }
      }
      accounts.set(request, session.account.accountId)
    })
    const server = new MastraServer({ app: scope, mastra: mount.mastra, prefix: mount.prefix })
    server.registerContextMiddleware()
    const shapeContext = mount.shapeContext
    if (shapeContext) {
      scope.addHook('preHandler', async (request) => {
        const accountId = accounts.get(request)
        if (accountId) shapeContext(request, accountId)
      })
    }
    for (const route of SERVER_ROUTES) {
      if (mount.routes.has(`${route.method} ${route.path}`)) await server.registerRoute(scope, route, { prefix: mount.prefix })
    }
  })
}

export const registerBuilderMastraRoutes = async (app: FastifyInstance, { mastra, controller, origin, resolveCurrentSession, admitProjectBuild }: Readonly<{
  mastra: Mastra
  controller: BuilderAgentController
  origin: string
  resolveCurrentSession: ResolveCurrentSession
  admitProjectBuild(input: Readonly<{ accountId: string; projectId: string }>): Promise<boolean>
}>): Promise<void> => registerGuardedMastraMount(app, {
  mastra, controller, origin, resolveCurrentSession,
  prefix: BUILDER_MASTRA_PREFIX,
  controllerId: BUILDER_CONTROLLER_ID,
  routes: BROWSER_ROUTES,
  admitResource: ({ accountId, resourceId }) => admitProjectBuild({ accountId, projectId: resourceId }),
})

export const registerFactoryMastraRoutes = async (app: FastifyInstance, { mastra, controllerId, controller, origin, orgId, resolveCurrentSession, admitConversation }: Readonly<{
  mastra: Mastra
  controllerId: string
  controller: BuilderAgentController
  origin: string
  orgId: string
  resolveCurrentSession: ResolveCurrentSession
  // A Factory resourceId is a conversation: its session row names the project repository, and the
  // binding names the Project whose build authority the Account must hold.
  admitConversation(input: Readonly<{ accountId: string; conversationId: string }>): Promise<boolean>
}>): Promise<void> => registerGuardedMastraMount(app, {
  mastra, controller, origin, resolveCurrentSession,
  prefix: FACTORY_MASTRA_PREFIX,
  controllerId,
  routes: FACTORY_BROWSER_ROUTES,
  admitResource: ({ accountId, resourceId }) => admitConversation({ accountId, conversationId: resourceId }),
  shapeContext: (request, accountId) => {
    request.requestContext?.set('user', { id: accountId, organizationId: orgId })
  },
})
