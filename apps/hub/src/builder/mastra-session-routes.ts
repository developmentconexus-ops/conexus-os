import type { AgentController } from '@mastra/core/agent-controller'
import type { Mastra } from '@mastra/core/mastra'
import { RequestContext } from '@mastra/core/request-context'
import { MastraServer } from '@mastra/fastify'
import { SERVER_ROUTES } from '@mastra/server/server-adapter'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { sendProblem } from '../http/problem.js'
import type { ResolveCurrentSession } from '../identity-access/current-session.js'
import { isExactOrigin } from '../platform/origin.js'

const BUILDER_PREFIX = '/api/builder'
const CSRF_COOKIE = '__Host-conexus_csrf'
const SESSION_BASE = '/agent-controller/:controllerId/sessions/:resourceId'
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const PROJECT_RESOURCE = new RegExp(`^project:(${UUID})$`)
const RUN_SCOPE = new RegExp(`^builder:${UUID}$`)
const CONVERSATION_SCOPE = new RegExp(`^conversation:(${UUID})$`)

// The run owns every turn: its session exists before its checkout is pinned and its policy set, and
// its settlement awaits the one turn it sent. So the browser never sends a message here, not even a
// steer or a follow-up (both open a turn in core); a new message is a new run. Everything else is
// Mastra's own route, unmodified: a Project's conversations are its threads, listed under the
// Project's resource, and a conversation is created by opening its session on a thread id the
// browser chose. The browser may not switch, rename, clone or delete threads here.
const CREATE_SESSION_ROUTE = 'POST /agent-controller/:controllerId/sessions'
const BROWSER_ROUTES: ReadonlySet<string> = new Set([
  'GET /agent-controller/:controllerId/modes',
  CREATE_SESSION_ROUTE,
  `GET ${SESSION_BASE}`,
  `GET ${SESSION_BASE}/threads`,
  `GET ${SESSION_BASE}/stream`,
  `GET ${SESSION_BASE}/threads/:threadId/messages`,
  `POST ${SESSION_BASE}/abort`,
  `POST ${SESSION_BASE}/mode`,
  `POST ${SESSION_BASE}/model`,
  `POST ${SESSION_BASE}/tool-approval`,
  `POST ${SESSION_BASE}/tool-suspension`,
  `PUT ${SESSION_BASE}/state`,
])

// Routes that read no session: the resource's threads, and a thread's messages read by id and
// checked against the resource.
const SESSIONLESS_ROUTES: ReadonlySet<string> = new Set([`GET ${SESSION_BASE}/threads`, `GET ${SESSION_BASE}/threads/:threadId/messages`])
// A conversation's settings change only between runs (AC-5); a run in flight is refused.
const IDLE_ONLY_ROUTES: ReadonlySet<string> = new Set([`POST ${SESSION_BASE}/mode`])

// The Hub is the single writer of tool policy; the browser may only answer for the one pending
// tool call it was shown. Core's approval decision is 'approve' | 'decline' | 'always_allow_category',
// and the third literal grants the tool's whole category for the rest of the session, so it is a
// policy write, not an answer to a call. tool-suspension's resumeData is unknown() and free-form
// (a custom interactive tool could echo the same literal), so both routes are checked alike.
const APPROVAL_ANSWER_ROUTES: readonly string[] = [`POST ${SESSION_BASE}/tool-approval`, `POST ${SESSION_BASE}/tool-suspension`]
const POLICY_CHANGING_DECISION = 'always_allow_category'
const carriesPolicyChangingAnswer = (value: unknown): boolean => {
  if (typeof value === 'string') return value === POLICY_CHANGING_DECISION
  if (Array.isArray(value)) return value.some(carriesPolicyChangingAnswer)
  if (value && typeof value === 'object') return Object.values(value as Readonly<Record<string, unknown>>).some(carriesPolicyChangingAnswer)
  return false
}

// The browser's only session-state write is its own reasoning level; yolo, notifications, and
// smartEditing stay under the Hub's or the operator's own settings surface, never this route.
const STATE_ROUTES: readonly string[] = [`PUT ${SESSION_BASE}/state`]
const ALLOWED_THINKING_LEVELS: ReadonlySet<string> = new Set(['low', 'medium', 'high', 'xhigh'])
const isReasoningLevelOnlyState = (body: unknown): boolean => {
  if (typeof body !== 'object' || body === null) return false
  const bodyKeys = Object.keys(body as Readonly<Record<string, unknown>>)
  if (bodyKeys.length !== 1 || bodyKeys[0] !== 'state') return false
  const state = (body as Readonly<{ state: unknown }>).state
  if (typeof state !== 'object' || state === null) return false
  const stateKeys = Object.keys(state as Readonly<Record<string, unknown>>)
  if (stateKeys.length !== 1 || stateKeys[0] !== 'thinkingLevel') return false
  const level = (state as Readonly<{ thinkingLevel: unknown }>).thinkingLevel
  return typeof level === 'string' && ALLOWED_THINKING_LEVELS.has(level)
}

const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value

/** A projection the Hub applies to what a session route serves: one value, or each event of one stream. */
export type ToolPayloadProjection = Readonly<{ value(value: unknown): unknown; stream(): (event: unknown) => unknown }>

// Both routes serve Mastra's messages unmodified, and the web renders a tool's arguments and result
// as it receives them.
const PROJECTED_ROUTES: ReadonlySet<string> = new Set([`GET ${SESSION_BASE}/stream`, `GET ${SESSION_BASE}/threads/:threadId/messages`])

type ServerRoute = typeof SERVER_ROUTES[number]

const projectedRoute = (route: ServerRoute, projection: ToolPayloadProjection): ServerRoute => ({
  ...route,
  handler: async (params: Parameters<ServerRoute['handler']>[0]) => {
    const served: unknown = await route.handler(params)
    if (!(served instanceof ReadableStream)) return projection.value(served)
    const project = projection.stream()
    return served.pipeThrough(new TransformStream({ transform: (event, stream) => stream.enqueue(project(event)) }))
  },
} as ServerRoute)

type BuilderSession = Awaited<ReturnType<AgentController['createSession']>>

type GuardedMount = Readonly<{
  mastra: Mastra
  controller: AgentController
  prefix: string
  controllerId: string
  routes: ReadonlySet<string>
  origin: string
  resolveCurrentSession: ResolveCurrentSession
  /** Whether the Account may build this Project. */
  admitProject(input: Readonly<{ accountId: string; projectId: string }>): Promise<boolean>
  /** Whose thread the conversation id is: this Project's, another resource's, or nobody's yet. */
  conversationOwner(input: Readonly<{ projectId: string; conversationId: string }>): Promise<'PROJECT' | 'OTHER' | 'NONE'>
  /** Whether the Project has a run queued or in flight. */
  projectBusy(input: Readonly<{ accountId: string; projectId: string }>): Promise<boolean>
  /** The live run's context, which every request the mount serves that run's session carries. */
  runContext(scope: string): ((requestContext: RequestContext) => void) | undefined
  toolPayloads?: ToolPayloadProjection
}>

type Admitted = Readonly<{ accountId: string; scope: string | undefined }>

// The one guard the Builder's Mastra mount goes through. Mastra's context middleware merges a
// requestContext taken from the body or the query into the server's, so a caller could name
// another user or Project; only the Hub sets it, and a request carrying one is refused.
const registerGuardedMastraMount = async (app: FastifyInstance, mount: GuardedMount): Promise<void> => {
  const admitted = new WeakMap<FastifyRequest, Admitted>()
  const route = (request: FastifyRequest): string => `${request.method} ${request.routeOptions.url?.slice(mount.prefix.length) ?? ''}`
  await app.register(async (scope) => {
    scope.addHook('preHandler', async (request, reply) => {
      const session = await mount.resolveCurrentSession(request)
      if (!session) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      if (request.method !== 'GET') {
        const csrf = header(request.headers['x-conexus-csrf'])
        if (!isExactOrigin(request.headers.origin, mount.origin) || !csrf || csrf !== request.cookies[CSRF_COOKIE]) {
          return sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
        }
      }
      const body = request.body as Readonly<Record<string, unknown>> | undefined
      if ((request.query as Readonly<Record<string, unknown>>).requestContext !== undefined || (typeof body === 'object' && body !== null && 'requestContext' in body)) {
        return sendProblem(reply, 400, 'request-context-refused', 'Request context is set by the server')
      }
      const key = route(request)
      if (APPROVAL_ANSWER_ROUTES.includes(key) && carriesPolicyChangingAnswer(body)) {
        return sendProblem(reply, 400, 'tool-answer-refused', 'Only approve or decline is accepted for a pending tool call')
      }
      if (STATE_ROUTES.includes(key) && !isReasoningLevelOnlyState(body)) {
        return sendProblem(reply, 400, 'session-state-refused', 'Only the reasoning level may be set')
      }
      const params = request.params as Readonly<{ controllerId?: string; resourceId?: string }>
      if (params.controllerId !== mount.controllerId) return sendProblem(reply, 404, 'builder-session-not-found', 'Builder session not found')
      const accountId = session.account.accountId
      // Opening a session names its resource, scope and thread in the body; every other session
      // route names them in the path and the query.
      const creating = key === CREATE_SESSION_ROUTE
      const opened = creating && typeof body === 'object' && body !== null ? body : {}
      const resourceId = creating ? (typeof opened.resourceId === 'string' ? opened.resourceId : undefined) : params.resourceId
      if (resourceId === undefined && !creating) {
        admitted.set(request, { accountId, scope: undefined })
        return undefined
      }
      // Every conversation of a Project lives under the Project's own resource.
      const projectId = resourceId === undefined ? undefined : PROJECT_RESOURCE.exec(resourceId)?.[1]
      if (!projectId || !await mount.admitProject({ accountId, projectId })) {
        return sendProblem(reply, 403, 'project-build-denied', 'Project build denied')
      }
      const resource = `project:${projectId}`
      const sessionScope = creating
        ? (typeof opened.sessionScope === 'string' ? opened.sessionScope : undefined)
        : (request.query as Readonly<{ sessionScope?: string }>).sessionScope
      if (SESSIONLESS_ROUTES.has(key)) {
        admitted.set(request, { accountId, scope: undefined })
        return undefined
      }
      // A conversation starts when the browser opens its session on the thread id it chose; only
      // a run opens a run's session.
      if (creating) {
        const conversationId = sessionScope === undefined ? undefined : CONVERSATION_SCOPE.exec(sessionScope)?.[1]
        if (!conversationId || opened.threadId !== conversationId) return sendProblem(reply, 400, 'conversation-session-refused', 'A conversation session opens on its own thread')
        if (await mount.conversationOwner({ projectId, conversationId }) === 'OTHER') return sendProblem(reply, 409, 'conversation-conflict', 'Conversation id already in use')
        admitted.set(request, { accountId, scope: sessionScope })
        return undefined
      }
      // Mastra's session routes get-or-create, so the Hub decides which session a request reaches
      // before Mastra does: a run's own session, which only its run creates, or a conversation's,
      // which the Hub binds to that conversation's thread.
      if (sessionScope !== undefined && RUN_SCOPE.test(sessionScope)) {
        if (IDLE_ONLY_ROUTES.has(key)) return sendProblem(reply, 409, 'builder-busy', 'O modo só muda quando o Builder está parado')
        if (!await mount.controller.getSessionByResource(resource, sessionScope)) {
          return sendProblem(reply, 409, 'builder-session-not-ready', 'Builder session not ready')
        }
      } else {
        const conversationId = sessionScope === undefined ? undefined : CONVERSATION_SCOPE.exec(sessionScope)?.[1]
        if (!conversationId) return sendProblem(reply, 404, 'builder-session-not-found', 'Builder session not found')
        if (await mount.conversationOwner({ projectId, conversationId }) !== 'PROJECT') return sendProblem(reply, 404, 'conversation-not-found', 'Conversation not found')
        if (IDLE_ONLY_ROUTES.has(key) && await mount.projectBusy({ accountId, projectId })) {
          return sendProblem(reply, 409, 'builder-busy', 'O modo só muda quando o Builder está parado')
        }
        await bindConversationSession(mount.controller, resource, sessionScope as string, conversationId)
      }
      admitted.set(request, { accountId, scope: sessionScope })
      return undefined
    })
    const server = new MastraServer({ app: scope, mastra: mount.mastra, prefix: mount.prefix })
    server.registerContextMiddleware()
    // Runs after Mastra has built the request's context, so the Hub has the last word on it.
    scope.addHook('preHandler', async (request) => {
      const entry = admitted.get(request)
      if (!entry || !request.requestContext) return
      request.requestContext.set('user', { id: entry.accountId })
      const bind = entry.scope === undefined ? undefined : mount.runContext(entry.scope)
      bind?.(request.requestContext)
    })
    for (const served of SERVER_ROUTES) {
      const routeKey = `${served.method} ${served.path}`
      if (!mount.routes.has(routeKey)) continue
      await server.registerRoute(scope, mount.toolPayloads && PROJECTED_ROUTES.has(routeKey) ? projectedRoute(served, mount.toolPayloads) : served, { prefix: mount.prefix })
    }
  })
}

// A conversation's session is bound to its thread and reads the thread's settings again on every
// request, so the mode or model a run changed on the thread is what the browser sees and changes.
const bindConversationSession = async (controller: AgentController, resourceId: string, scope: string, conversationId: string): Promise<BuilderSession> => {
  const session = await controller.createSession({ resourceId, scope, threadId: conversationId, requestContext: new RequestContext() })
  await session.thread.loadMetadata()
  return session
}

/**
 * The Builder's native session routes under `/api/builder` (spec 0002, API surface): the ones the
 * browser needs to list and open a Project's conversations, follow a run, answer it, and set a
 * conversation's mode and model, each behind the Hub session and the Project the resource names.
 */
export const registerBuilderSessionRoutes = async (app: FastifyInstance, { mastra, controllerId, controller, origin, resolveCurrentSession, admitProject, conversationOwner, projectBusy, runContext, toolPayloads }: Readonly<{
  mastra: Mastra
  controllerId: string
  controller: AgentController
  origin: string
  resolveCurrentSession: ResolveCurrentSession
  admitProject: GuardedMount['admitProject']
  conversationOwner: GuardedMount['conversationOwner']
  projectBusy: GuardedMount['projectBusy']
  runContext: GuardedMount['runContext']
  /** The Connector owner's projection of `connector_fetch` payloads; absent without a Connector module. */
  toolPayloads?: ToolPayloadProjection
}>): Promise<void> => registerGuardedMastraMount(app, {
  mastra, controller, controllerId, origin, resolveCurrentSession, admitProject, conversationOwner, projectBusy, runContext,
  ...(toolPayloads ? { toolPayloads } : {}),
  prefix: BUILDER_PREFIX,
  routes: BROWSER_ROUTES,
})
