import { isThinkingLevelSetting } from '@mastra/code-sdk/thinking'
import type { AgentController } from '@mastra/core/agent-controller'
import type { Mastra } from '@mastra/core/mastra'
import { RequestContext } from '@mastra/core/request-context'
import { MastraServer } from '@mastra/fastify'
import { HTTPException, SERVER_ROUTES } from '@mastra/server/server-adapter'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { ServerResponse } from 'node:http'
import { failureProblem } from '../http/problem.js'
import type { ResolveCurrentSession } from '../identity-access/current-session.js'
import { Failure, failureRow, logFailure, toFailure } from '../platform/failure.js'
import { logger } from '../platform/logger.js'
import { isExactOrigin } from '../platform/origin.js'
import type { ConversationSessions } from './conversation-sessions.js'
import type { BuilderAnswerOutcome } from './service.js'

type ServerRoute = typeof SERVER_ROUTES[number]

/**
 * A route as Mastra's own table names it. The Hub's allowlists are built through this, so a route
 * Mastra renames or drops stops the Hub at boot instead of silently leaving the browser without it.
 */
const mastraRoute = (method: ServerRoute['method'], path: string): string => {
  if (!SERVER_ROUTES.some((route) => route.method === method && route.path === path)) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'BUILDER_MASTRA_ROUTE_MISSING', route: `${method} ${path}` } })
  return `${method} ${path}`
}
const sessionRoute = (method: ServerRoute['method'], suffix = ''): string => mastraRoute(method, `${SESSION_BASE}${suffix}`)

const BUILDER_PREFIX = '/api/builder'
const CSRF_COOKIE = '__Host-conexus_csrf'
const SESSIONS_PATH = '/agent-controller/:controllerId/sessions'
const SESSION_BASE = `${SESSIONS_PATH}/:resourceId`
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const PROJECT_RESOURCE = new RegExp(`^project:(${UUID})$`)
const RUN_SCOPE = new RegExp(`^builder:(${UUID})$`)
const CONVERSATION_SCOPE = new RegExp(`^conversation:(${UUID})$`)

// The run owns every turn: its session exists before its checkout is pinned and its policy set, and
// its settlement awaits the one turn it sent. So the browser never sends a message here, not even a
// steer or a follow-up (both open a turn in core); a new message is a new run. Everything else is
// Mastra's own route, unmodified: a Project's conversations are its threads, listed under the
// Project's resource, and a conversation is created by opening its session on a thread id the
// browser chose. The browser may not switch, rename, clone or delete threads here.
const CREATE_SESSION_ROUTE = mastraRoute('POST', SESSIONS_PATH)
const BROWSER_ROUTES: ReadonlySet<string> = new Set([
  CREATE_SESSION_ROUTE,
  sessionRoute('GET'),
  sessionRoute('GET', '/threads'),
  sessionRoute('GET', '/stream'),
  sessionRoute('GET', '/threads/:threadId/messages'),
  sessionRoute('POST', '/abort'),
  sessionRoute('POST', '/model'),
  sessionRoute('POST', '/tool-approval'),
  sessionRoute('POST', '/tool-suspension'),
  sessionRoute('PUT', '/state'),
])

// Routes that read no session: the resource's threads, and a thread's messages read by id and
// checked against the resource.
const STREAM_ROUTE_KEY = sessionRoute('GET', '/stream')
const SESSIONLESS_ROUTES: ReadonlySet<string> = new Set([sessionRoute('GET', '/threads'), sessionRoute('GET', '/threads/:threadId/messages')])
// A conversation's model changes only between runs (AC-12); a run in flight is refused.
const IDLE_ONLY_ROUTES: ReadonlySet<string> = new Set([sessionRoute('POST', '/model')])

// The Hub is the single writer of tool policy; the browser may only answer for the one pending
// tool call it was shown. Core's approval decision is 'approve' | 'decline' | 'always_allow_category',
// and the third literal grants the tool's whole category for the rest of the session, so it is a
// policy write, not an answer to a call. tool-suspension's resumeData is unknown() and free-form
// (a custom interactive tool could echo the same literal), so both routes are checked alike.
const TOOL_SUSPENSION_KEY = sessionRoute('POST', '/tool-suspension')
const ABORT_KEY = sessionRoute('POST', '/abort')
// The web card reads the problem code to say why its answer did not resume the run.
const ANSWER_REFUSALS: Readonly<Record<Exclude<BuilderAnswerOutcome, 'RESUMED'> | 'UNAVAILABLE', 'TOOL_ANSWER_ALREADY_GIVEN' | 'PARKED_CALL_NOT_FOUND' | 'BUILDER_ANSWER_UNAVAILABLE'>> = {
  ALREADY_ANSWERED: 'TOOL_ANSWER_ALREADY_GIVEN',
  NOT_PARKED: 'PARKED_CALL_NOT_FOUND',
  UNAVAILABLE: 'BUILDER_ANSWER_UNAVAILABLE',
}
const APPROVAL_ANSWER_ROUTES: readonly string[] = [sessionRoute('POST', '/tool-approval'), TOOL_SUSPENSION_KEY]
const POLICY_CHANGING_DECISION = 'always_allow_category'
const carriesPolicyChangingAnswer = (value: unknown): boolean => {
  if (typeof value === 'string') return value === POLICY_CHANGING_DECISION
  if (Array.isArray(value)) return value.some(carriesPolicyChangingAnswer)
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  if (value && typeof value === 'object') return Object.values(value as Readonly<Record<string, unknown>>).some(carriesPolicyChangingAnswer)
  return false
}

// The browser's only session-state write is its own reasoning level; yolo, notifications, and
// smartEditing stay under the Hub's or the operator's own settings surface, never this route.
const STATE_ROUTES: readonly string[] = [sessionRoute('PUT', '/state')]
const isReasoningLevelOnlyState = (body: unknown): boolean => {
  if (typeof body !== 'object' || body === null) return false
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  const bodyKeys = Object.keys(body as Readonly<Record<string, unknown>>)
  if (bodyKeys.length !== 1 || bodyKeys[0] !== 'state') return false
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  const state = (body as Readonly<{ state: unknown }>).state
  if (typeof state !== 'object' || state === null) return false
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  const stateKeys = Object.keys(state as Readonly<Record<string, unknown>>)
  if (stateKeys.length !== 1 || stateKeys[0] !== 'thinkingLevel') return false
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  const level = (state as Readonly<{ thinkingLevel: unknown }>).thinkingLevel
  return isThinkingLevelSetting(level)
}

/**
 * Mastra's session stream enqueues every event whatever the client has read, and the Fastify adapter
 * writes each frame to the response without waiting for `drain`, so a client that stops reading
 * (a hidden tab, a stalled proxy) makes the response's write buffer grow with every whole-state
 * snapshot. A stream whose unsent bytes pass the limit is closed: Mastra's own cancel then
 * unsubscribes it, and the browser opens it again and reads the thread.
 */
const STREAM_BACKLOG_LIMIT_BYTES = 4 * 1024 * 1024
const STREAM_BACKLOG_CHECK_MS = 1_000
type StreamBacklog = Readonly<{ limitBytes: number; checkMs: number }>

const closeWhenBehind = (response: ServerResponse, { limitBytes, checkMs }: StreamBacklog): void => {
  const timer = setInterval(() => { if (response.writableLength > limitBytes) response.destroy() }, checkMs)
  timer.unref()
  response.once('close', () => clearInterval(timer))
}

const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value

/** A projection the Hub applies to what a session route serves: one value, or each event of one stream. */
export type ToolPayloadProjection = Readonly<{ value(value: unknown): unknown; stream(): (event: unknown) => unknown }>

// Both routes serve Mastra's messages unmodified, and the web renders a tool's arguments and result
// as it receives them.
const PROJECTED_ROUTES: ReadonlySet<string> = new Set([sessionRoute('GET', '/stream'), sessionRoute('GET', '/threads/:threadId/messages')])

/**
 * What the browser is served of a failure. Mastra's wire event, and the error part it stores in the
 * assistant message of a failed turn, carry the provider error's name and message, and a provider
 * can echo the account key in that message. The browser knows why a run failed from the run's own
 * failure code, so every error keeps its type and retry fields and loses its text. Retry notices
 * are already built from safe facts and keep theirs.
 */
const FAILURE_MESSAGE = 'MODEL_CALL_FAILED'
const withoutErrorText = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withoutErrorText)
  if (typeof value !== 'object' || value === null) return value
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  const node = value as Readonly<Record<string, unknown>>
  const failure = node.type === 'error' && typeof node.error === 'object' && node.error !== null && node.retryable !== true
  return Object.fromEntries(Object.entries(node).map(([key, item]) => [key, failure && key === 'error' ? { name: 'Error', message: FAILURE_MESSAGE } : withoutErrorText(item)]))
}

type RouteParams = Parameters<ServerRoute['handler']>[0]

// ServerRoute is a union of Mastra's routes, each with its own handler type. A wrapper keeps the
// route's method, path and schemas and replaces only the handler, which no single member type says.
const withHandler = (route: ServerRoute, handler: (params: RouteParams) => Promise<unknown>): ServerRoute =>
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  ({ ...route, handler }) as ServerRoute

const projectedRoute = (route: ServerRoute, projection: ToolPayloadProjection | undefined): ServerRoute =>
  withHandler(route, async (params) => {
    const served: unknown = await route.handler(params)
    if (!(served instanceof ReadableStream)) return projection ? projection.value(withoutErrorText(served)) : withoutErrorText(served)
    const project = projection?.stream() ?? ((event: unknown) => event)
    return served.pipeThrough(new TransformStream({ transform: (event, stream) => stream.enqueue(project(withoutErrorText(event))) }))
  })

// Mastra's adapter answers a handler's throw itself, as `{error: message}`, before Fastify's error
// handler sees it, and a route's own handler has already wrapped the throw in an HTTPException that
// keeps the original's message and stack. This is the one place that turns it into the problem+json
// the Hub's handler sends, through an exception Mastra sends verbatim. A refusal Mastra means (an
// HTTPException with its own response, or a 4xx) stays Mastra's to answer.
const failureRoute = (route: ServerRoute): ServerRoute =>
  withHandler(route, async (params) => {
    try {
      return await route.handler(params)
    } catch (error) {
      if (error instanceof HTTPException && (error.res || error.status < 500)) throw error
      const failure = toFailure(error)
      logFailure(logger, failure)
      const { status } = failureRow(failure)
      throw new HTTPException(status, { res: new Response(JSON.stringify(failureProblem(failure)), { status, headers: { 'content-type': 'application/problem+json' } }) })
    }
  })

/**
 * Mastra's own hook for a request that fails its schemas. The mount answers it as the same
 * problem+json row, so the browser reads one shape. (`server.onError` is not called for the Fastify
 * adapter's own routes, so `failureRoute` stays for handler throws.)
 */
export const mountValidationFailure = (): Readonly<{ status: number; body: unknown }> => {
  const failure = new Failure('REQUEST_VALIDATION_FAILED')
  logFailure(logger, failure)
  return { status: failureRow(failure).status, body: failureProblem(failure) }
}

/** Mastra's adapter logs every 5xx handler throw itself; `failureRoute` already logged it once, with the cause. */
export const mountLogFilter = ({ message }: Readonly<{ message: string }>): boolean => message !== 'Error calling handler'

type BuilderSession = Awaited<ReturnType<AgentController['createSession']>>

const STREAM_ROUTE = sessionRoute('GET', '/stream')

// Mastra's stream stays open, and silent, when the controller deletes the session it follows, and
// the Hub replaces a run's session when the conversation's sandbox changes. Ending the stream is how
// the browser learns to read the run again and follow the session that replaced it.
const closableStream = (served: ReadableStream<unknown>, follow: (close: () => void) => (() => void) | undefined): ReadableStream<unknown> => {
  const reader = served.getReader()
  let unfollow: (() => void) | undefined
  return new ReadableStream({
    start(controller) {
      unfollow = follow(() => {
        unfollow?.()
        void reader.cancel().catch(() => undefined)
        try { controller.close() } catch { /* the browser already left */ }
      })
    },
    async pull(controller) {
      const { done, value } = await reader.read()
      if (!done) return controller.enqueue(value)
      unfollow?.()
      try { controller.close() } catch { /* closed by the session's deletion */ }
    },
    cancel(reason) {
      unfollow?.()
      return reader.cancel(reason)
    },
  })
}

const followedRoute = (route: ServerRoute, controller: AgentController, following: WeakMap<BuilderSession, Set<() => void>>): ServerRoute =>
  withHandler(route, async (params) => {
    const served: unknown = await route.handler(params)
    if (!(served instanceof ReadableStream)) return served
    // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
    const { resourceId, sessionScope } = params as Readonly<{ resourceId?: string; sessionScope?: string }>
    const session = resourceId === undefined ? undefined : await controller.getSessionByResource(resourceId, sessionScope)
    // Mastra's stream sends nothing on subscribe, so a run that changed phase before the browser
    // subscribed (a fast run parks before the page's next try) would go unseen until the slow read.
    // The stream opens with the run the Hub last published, as the state_changed Mastra sends.
    const state = session?.state.get()
    const opening = state && 'conexusRun' in state
      ? served.pipeThrough(new TransformStream({ start: (stream) => { stream.enqueue({ type: 'state_changed', state, changedKeys: ['conexusRun'] }) } }))
      : served
    return closableStream(opening, (close) => {
      if (!session) {
        close()
        return undefined
      }
      const closers = following.get(session) ?? new Set()
      following.set(session, closers)
      closers.add(close)
      return () => { closers.delete(close) }
    })
  })

type GuardedMount = Readonly<{
  mastra: Mastra
  controller: AgentController
  /** Who deletes a conversation's session once the browser stops using it. */
  sessions: ConversationSessions
  streamBacklog?: StreamBacklog
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
  /** The person's answer to the call the conversation's parked run waits on; resumes the run. A second answer to the same call changes nothing. */
  answerParked(input: Readonly<{ accountId: string; projectId: string; conversationId: string; toolCallId: string; resumeData: unknown }>): Promise<BuilderAnswerOutcome>
  toolPayloads?: ToolPayloadProjection
}>

type Admitted = Readonly<{ accountId: string; scope: string | undefined }>

// The one guard the Builder's Mastra mount goes through. Mastra's context middleware merges a
// requestContext taken from the body or the query into the server's, so a caller could name
// another user or Project; only the Hub sets it, and a request carrying one is refused.
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: debt: owning wave
const registerGuardedMastraMount = async (app: FastifyInstance, mount: GuardedMount): Promise<void> => {
  const admitted = new WeakMap<FastifyRequest, Admitted>()
  const route = (request: FastifyRequest): string => `${request.method} ${request.routeOptions.url?.slice(mount.prefix.length) ?? ''}`
  // biome-ignore lint/complexity/noExcessiveLinesPerFunction: debt: owning wave
  await app.register(async (scope) => {
    const following = new WeakMap<BuilderSession, Set<() => void>>()
    const unwatch = mount.controller.onSessionDeleted((session) => {
      for (const close of [...following.get(session) ?? []]) close()
    })
    scope.addHook('onClose', async () => { unwatch() })
    scope.addHook('preHandler', async (request, reply) => {
      const session = await mount.resolveCurrentSession(request)
      if (!session) throw new Failure('AUTHENTICATION_REQUIRED')
      if (request.method !== 'GET') {
        const csrf = header(request.headers['x-conexus-csrf'])
        if (!isExactOrigin(request.headers.origin, mount.origin) || !csrf || csrf !== request.cookies[CSRF_COOKIE]) {
          throw new Failure('REQUEST_AUTHENTICITY_DENIED')
        }
      }
      // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
      const body = request.body as Readonly<Record<string, unknown>> | undefined
      // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
      if ((request.query as Readonly<Record<string, unknown>>).requestContext !== undefined || (typeof body === 'object' && body !== null && 'requestContext' in body)) {
        throw new Failure('REQUEST_CONTEXT_REFUSED')
      }
      const key = route(request)
      if (APPROVAL_ANSWER_ROUTES.includes(key) && carriesPolicyChangingAnswer(body)) {
        throw new Failure('TOOL_ANSWER_REFUSED')
      }
      if (STATE_ROUTES.includes(key) && !isReasoningLevelOnlyState(body)) {
        throw new Failure('SESSION_STATE_REFUSED')
      }
      // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
      const params = request.params as Readonly<{ controllerId?: string; resourceId?: string }>
      if (params.controllerId !== mount.controllerId) throw new Failure('BUILDER_SESSION_NOT_FOUND')
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
        throw new Failure('PROJECT_BUILD_DENIED')
      }
      const resource = `project:${projectId}`
      const sessionScope = creating
        ? (typeof opened.sessionScope === 'string' ? opened.sessionScope : undefined)
        // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
        : (request.query as Readonly<{ sessionScope?: string }>).sessionScope
      if (SESSIONLESS_ROUTES.has(key)) {
        admitted.set(request, { accountId, scope: undefined })
        return undefined
      }
      // A conversation starts when the browser opens its session on the thread id it chose; only
      // a run opens a run's session.
      if (creating) {
        const conversationId = sessionScope === undefined ? undefined : CONVERSATION_SCOPE.exec(sessionScope)?.[1]
        if (!conversationId || opened.threadId !== conversationId) throw new Failure('CONVERSATION_SESSION_REFUSED')
        if (await mount.conversationOwner({ projectId, conversationId }) === 'OTHER') throw new Failure('CONVERSATION_CONFLICT')
        mount.sessions.touch(resource, conversationId)
        admitted.set(request, { accountId, scope: sessionScope })
        return undefined
      }
      // Mastra's session routes get-or-create, so the Hub decides which session a request reaches
      // before Mastra does: the session the Hub runs a conversation's turns in (builder:<id>), which
      // only a run creates, or a conversation's, which the Hub binds to that conversation's thread.
      const runConversation = sessionScope === undefined ? undefined : RUN_SCOPE.exec(sessionScope)?.[1]
      if (runConversation !== undefined) {
        // The answer is not Mastra's to take, even while the parked run's session is live: the Hub
        // resumes the run from the answer, whenever it comes and whichever process asked.
        if (key === TOOL_SUSPENSION_KEY) {
          const answer = typeof body === 'object' && body !== null ? body : {}
          if (typeof answer.toolCallId !== 'string' || answer.toolCallId.length === 0 || answer.toolCallId.length > 200 || !('resumeData' in answer)) {
            throw new Failure('TOOL_ANSWER_REFUSED')
          }
          const outcome = await mount.answerParked({ accountId, projectId, conversationId: runConversation, toolCallId: answer.toolCallId, resumeData: answer.resumeData })
            .catch(() => 'UNAVAILABLE' as const)
          if (outcome === 'RESUMED') return reply.send({ ok: true })
          throw new Failure(ANSWER_REFUSALS[outcome])
        }
        if (IDLE_ONLY_ROUTES.has(key)) throw new Failure('BUILDER_BUSY')
        // Mastra's abort would deny the question a parked run's live session waits on and leave the
        // run parked on nothing; a run stops through the Hub's cancel, which settles both.
        if (key === ABORT_KEY) throw new Failure('BUILDER_RUN_STOP_REFUSED')
        if (!await mount.controller.getSessionByResource(resource, sessionScope)) {
          throw new Failure('BUILDER_SESSION_NOT_READY')
        }
      } else {
        const conversationId = sessionScope === undefined ? undefined : CONVERSATION_SCOPE.exec(sessionScope)?.[1]
        if (!conversationId) throw new Failure('BUILDER_SESSION_NOT_FOUND')
        if (await mount.conversationOwner({ projectId, conversationId }) !== 'PROJECT') throw new Failure('CONVERSATION_NOT_FOUND')
        if (IDLE_ONLY_ROUTES.has(key) && await mount.projectBusy({ accountId, projectId })) {
          throw new Failure('BUILDER_BUSY')
        }
        await bindConversationSession(mount.controller, mount.sessions, resource, conversationId)
      }
      admitted.set(request, { accountId, scope: sessionScope })
      if (key === STREAM_ROUTE_KEY) closeWhenBehind(reply.raw, mount.streamBacklog ?? { limitBytes: STREAM_BACKLOG_LIMIT_BYTES, checkMs: STREAM_BACKLOG_CHECK_MS })
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
      const projected = PROJECTED_ROUTES.has(routeKey) ? projectedRoute(served, mount.toolPayloads) : served
      await server.registerRoute(scope, failureRoute(routeKey === STREAM_ROUTE ? followedRoute(projected, mount.controller, following) : projected), { prefix: mount.prefix })
    }
  })
}

// A conversation's session is bound to its thread and reads the thread's settings again on every
// request, so the model a run changed on the thread is what the browser sees and changes.
// Its observational-memory progress is read again too: only a run's own session observes, so the
// conversation's session learns what that run stored from Mastra's own record.
const bindConversationSession = async (controller: AgentController, sessions: ConversationSessions, resourceId: string, conversationId: string): Promise<BuilderSession> => {
  const session = await sessions.open({ resourceId, conversationId, requestContext: new RequestContext() })
  await session.thread.loadMetadata()
  await controller.loadOMProgress(session)
  return session
}

/**
 * The Builder's native session routes under `/api/builder` (spec 0002, API surface): the ones the
 * browser needs to list and open a Project's conversations, follow a run, answer it, and set a
 * conversation's model, each behind the Hub session and the Project the resource names.
 */
export const registerBuilderSessionRoutes = async (app: FastifyInstance, { mastra, controllerId, controller, sessions, origin, resolveCurrentSession, admitProject, conversationOwner, projectBusy, runContext, answerParked, toolPayloads, streamBacklog }: Readonly<{
  mastra: Mastra
  controllerId: string
  controller: AgentController
  sessions: ConversationSessions
  origin: string
  resolveCurrentSession: ResolveCurrentSession
  admitProject: GuardedMount['admitProject']
  conversationOwner: GuardedMount['conversationOwner']
  projectBusy: GuardedMount['projectBusy']
  runContext: GuardedMount['runContext']
  answerParked: GuardedMount['answerParked']
  /** The Connector owner's projection of `connector_fetch` payloads; absent without a Connector module. */
  toolPayloads?: ToolPayloadProjection
  /** The unsent bytes a stream may hold, and how often they are checked; tests set it small. */
  streamBacklog?: StreamBacklog
}>): Promise<void> => registerGuardedMastraMount(app, {
  mastra, controller, sessions, controllerId, origin, resolveCurrentSession, admitProject, conversationOwner, projectBusy, runContext, answerParked,
  ...(toolPayloads ? { toolPayloads } : {}),
  ...(streamBacklog ? { streamBacklog } : {}),
  prefix: BUILDER_PREFIX,
  routes: BROWSER_ROUTES,
})
