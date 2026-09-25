import { RequestContext } from '@mastra/core/request-context'
import type { FastifyInstance } from 'fastify'
import { sendProblem } from '../http/problem.js'
import type { ResolveCurrentSession } from '../identity-access/current-session.js'
import { type BuilderAgentController, isUserAuthoredMessage, messageText } from './runtime.js'
import type { FactoryBindingRecord } from './store.js'
import { isExactOrigin } from '../platform/origin.js'

const CSRF_COOKIE = '__Host-conexus_csrf'
const uuid = { type: 'string', format: 'uuid' } as const
const params = { type: 'object', additionalProperties: false, required: ['projectId'], properties: { projectId: uuid } } as const
const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value
const message = (error: unknown): string => error instanceof Error ? error.message : ''

export const conversationBranch = (conversationId: string): string => `conexus/${conversationId}`

type FactorySessionRow = Readonly<{
  sessionId: string
  projectRepositoryId: string
  orgId: string
  title: string | null
  createdAt: Date
}>

// The slice of the Factory's source-control session storage the conversation routes use.
export type FactoryConversationSessions = Readonly<{
  getBySessionId(sessionId: string): Promise<FactorySessionRow | null>
  list(input: Readonly<{ projectRepositoryId: string; viewerUserId: string }>): Promise<readonly FactorySessionRow[]>
}>

// The Factory's own session route, which creates a conversation. Its visibility is the Factory's
// `org` until https://github.com/mastra-ai/mastra/issues/24689 lets the host choose; the operator's
// default is private, and Conexus enforces Project authority on every read meanwhile.
export const FACTORY_SESSION_ROUTE = 'POST /web/github/projects/:id/sessions'

const TITLE_LENGTH = 60
// The first request is among a conversation's first messages; a run note never precedes it.
const FIRST_MESSAGES = 10

// The request's first line, cut on a word so the ellipsis still fits.
const conversationTitle = (request: string): string | null => {
  const line = request.split('\n').map((text) => text.replace(/\s+/g, ' ').trim()).find(Boolean)
  if (!line || line.length <= TITLE_LENGTH) return line ?? null
  const head = line.slice(0, TITLE_LENGTH - 1)
  const space = head.lastIndexOf(' ')
  return `${(space > 0 ? head.slice(0, space) : head).trimEnd()}…`
}

// Mastra Code's observer renames a thread, in English and with no host option to turn it off or
// instruct it (https://github.com/mastra-ai/mastra/issues/24688), and the Factory copies that onto the
// session row. So a conversation's title is derived here from its first request, never read from either.
const readTitle = async (controller: BuilderAgentController, conversationId: string): Promise<string | null> => {
  const { messages } = await controller.queryThreadMessages({
    threadId: conversationId, perPage: FIRST_MESSAGES, page: 0, orderBy: { field: 'createdAt', direction: 'ASC' },
  })
  const first = messages.find(isUserAuthoredMessage)
  return first ? conversationTitle(messageText(first)) : null
}

const projectConversation = (row: FactorySessionRow, title: string | null) => ({
  conversationId: row.sessionId,
  title,
  createdAt: new Date(row.createdAt).toISOString(),
})

export type FactoryConversationOperationId = 'BLD-27' | 'BLD-28'

type OpenThread = (input: Readonly<{ conversationId: string; accountId: string }>) => Promise<void>

// A session with no thread named picks the resource's most recent thread, or creates one with a
// random id. The browser's session on a new conversation would then hold its model on a thread no
// run ever reads, so the Hub opens the conversation's own thread, id and resource both the
// conversation id, before the browser asks for it.
export const openFactoryConversationThread = ({ controller, orgId, applyDefaults }: Readonly<{
  controller: BuilderAgentController
  orgId: string
  applyDefaults?(session: Awaited<ReturnType<BuilderAgentController['createSession']>>, accountId: string): Promise<void>
}>): OpenThread =>
  async ({ conversationId, accountId }) => {
    const requestContext = new RequestContext()
    requestContext.set('user', { id: accountId, organizationId: orgId })
    const session = await controller.createSession({ resourceId: conversationId, ownerId: conversationId, threadId: conversationId, requestContext })
    await applyDefaults?.(session, accountId)
  }

export const registerFactoryConversationRoutes = async (app: FastifyInstance, { readFactoryBinding, sessions, controller, origin, resolveCurrentSession, openThread }: Readonly<{
  readFactoryBinding(input: Readonly<{ accountId: string; projectId: string }>): Promise<FactoryBindingRecord | null>
  sessions: FactoryConversationSessions
  controller: BuilderAgentController
  origin: string
  resolveCurrentSession: ResolveCurrentSession
  openThread: OpenThread
}>): Promise<readonly FactoryConversationOperationId[]> => {
  const boundProject = async (accountId: string, projectId: string): Promise<FactoryBindingRecord | 'DENIED' | 'UNBOUND'> => {
    try {
      return await readFactoryBinding({ accountId, projectId }) ?? 'UNBOUND'
    } catch (error) {
      if (message(error) === 'NOT_AUTHORIZED') return 'DENIED'
      throw error
    }
  }

  app.get<{ Params: { projectId: string } }>('/api/control/projects/:projectId/conversations', { schema: { params } }, async (request, reply) => {
    const session = await resolveCurrentSession(request)
    if (!session) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
    const binding = await boundProject(session.account.accountId, request.params.projectId)
    if (binding === 'DENIED') return sendProblem(reply, 403, 'project-build-denied', 'Project build denied')
    if (binding === 'UNBOUND') return sendProblem(reply, 404, 'factory-project-not-bound', 'Project is not developed through the Factory')
    const rows = await sessions.list({ projectRepositoryId: binding.projectRepositoryId, viewerUserId: session.account.accountId })
    const sorted = [...rows].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    return { conversations: await Promise.all(sorted.map(async (row) => projectConversation(row, await readTitle(controller, row.sessionId)))) }
  })

  app.post<{ Params: { projectId: string }; Body: { conversationId: string } }>('/api/control/projects/:projectId/conversations', {
    schema: {
      params,
      body: { type: 'object', additionalProperties: false, required: ['conversationId'], properties: { conversationId: uuid } },
    },
  }, async (request, reply) => {
    const csrf = header(request.headers['x-conexus-csrf'])
    if (!isExactOrigin(request.headers.origin, origin) || !csrf || csrf !== request.cookies[CSRF_COOKIE]) return sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
    const session = await resolveCurrentSession(request, true)
    if (!session) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
    const binding = await boundProject(session.account.accountId, request.params.projectId)
    if (binding === 'DENIED') return sendProblem(reply, 403, 'project-build-denied', 'Project build denied')
    if (binding === 'UNBOUND') return sendProblem(reply, 404, 'factory-project-not-bound', 'Project is not developed through the Factory')
    const { conversationId } = request.body
    // The client chooses the id, so a retry lands on the session the first attempt created; the
    // Factory's route decides that, and a row read first only tells a retry from a creation.
    const existed = await sessions.getBySessionId(conversationId) !== null
    const answer = await app.inject({
      method: 'POST',
      url: `/web/github/projects/${encodeURIComponent(binding.projectRepositoryId)}/sessions`,
      headers: { cookie: request.headers.cookie ?? '', origin, 'x-conexus-csrf': csrf, 'content-type': 'application/json' },
      payload: { sessionId: conversationId, branch: conversationBranch(conversationId) },
    })
    if (answer.statusCode === 409) return sendProblem(reply, 409, 'conversation-conflict', 'Conversation id already in use')
    if (answer.statusCode !== 200) throw new Error(`FACTORY_SESSION_REFUSED:${answer.statusCode}`)
    const { session: row } = answer.json() as Readonly<{ session: FactorySessionRow }>
    await openThread({ conversationId, accountId: session.account.accountId })
    return reply.code(existed ? 200 : 201).send({ conversation: projectConversation(row, existed ? await readTitle(controller, conversationId) : null) })
  })
  return ['BLD-27', 'BLD-28']
}

export const admitFactoryConversation = ({ sessions, resolveFactoryProject }: Readonly<{
  sessions: Pick<FactoryConversationSessions, 'getBySessionId'>
  resolveFactoryProject(input: Readonly<{ accountId: string; projectRepositoryId: string }>): Promise<string | null>
}>) => async ({ accountId, conversationId }: Readonly<{ accountId: string; conversationId: string }>): Promise<boolean> => {
  const row = await sessions.getBySessionId(conversationId)
  if (!row) return false
  return await resolveFactoryProject({ accountId, projectRepositoryId: row.projectRepositoryId }) !== null
}
