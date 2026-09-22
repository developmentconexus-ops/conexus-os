import { RequestContext } from '@mastra/core/request-context'
import type { FastifyInstance } from 'fastify'
import { sendProblem } from '../http/problem.js'
import type { ResolveCurrentSession } from '../identity-access/current-session.js'
import type { BuilderAgentController } from './runtime.js'
import type { FactoryBindingRecord } from './store.js'

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
  create(input: Readonly<{
    sessionId: string
    projectRepositoryId: string
    orgId: string
    userId: string
    branch: string
    baseBranch: string
    title?: string
    visibility: 'org'
  }>): Promise<FactorySessionRow>
}>

const projectConversation = (row: FactorySessionRow) => ({
  conversationId: row.sessionId,
  title: row.title,
  createdAt: new Date(row.createdAt).toISOString(),
})

export type FactoryConversationOperationId = 'BLD-27' | 'BLD-28'

type OpenThread = (input: Readonly<{ conversationId: string; accountId: string }>) => Promise<void>

// A session with no thread named picks the resource's most recent thread, or creates one with a
// random id. The browser's session on a new conversation would then hold its model on a thread no
// run ever reads, so the Hub opens the conversation's own thread, id and resource both the
// conversation id, before the browser asks for it.
export const openFactoryConversationThread = ({ controller, orgId }: Readonly<{ controller: BuilderAgentController; orgId: string }>): OpenThread =>
  async ({ conversationId, accountId }) => {
    const requestContext = new RequestContext()
    requestContext.set('user', { id: accountId, organizationId: orgId })
    await controller.createSession({ resourceId: conversationId, ownerId: conversationId, threadId: conversationId, requestContext })
  }

export const registerFactoryConversationRoutes = async (app: FastifyInstance, { readFactoryBinding, defaultBranchOf, sessions, orgId, origin, resolveCurrentSession, openThread }: Readonly<{
  readFactoryBinding(input: Readonly<{ accountId: string; projectId: string }>): Promise<FactoryBindingRecord | null>
  defaultBranchOf(binding: FactoryBindingRecord): Promise<string>
  sessions: FactoryConversationSessions
  orgId: string
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
    return { conversations: [...rows].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()).map(projectConversation) }
  })

  app.post<{ Params: { projectId: string }; Body: { conversationId: string; title?: string } }>('/api/control/projects/:projectId/conversations', {
    schema: {
      params,
      body: { type: 'object', additionalProperties: false, required: ['conversationId'], properties: { conversationId: uuid, title: { type: 'string', minLength: 1, maxLength: 200 } } },
    },
  }, async (request, reply) => {
    const csrf = header(request.headers['x-conexus-csrf'])
    if (request.headers.origin !== origin || !csrf || csrf !== request.cookies[CSRF_COOKIE]) return sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
    const session = await resolveCurrentSession(request, true)
    if (!session) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
    const binding = await boundProject(session.account.accountId, request.params.projectId)
    if (binding === 'DENIED') return sendProblem(reply, 403, 'project-build-denied', 'Project build denied')
    if (binding === 'UNBOUND') return sendProblem(reply, 404, 'factory-project-not-bound', 'Project is not developed through the Factory')
    const { conversationId, title } = request.body
    // The client chooses the id, so a retry lands on the row the first attempt wrote.
    const existing = await sessions.getBySessionId(conversationId)
    if (existing) {
      if (existing.projectRepositoryId !== binding.projectRepositoryId) return sendProblem(reply, 409, 'conversation-conflict', 'Conversation id already in use')
      await openThread({ conversationId, accountId: session.account.accountId })
      return reply.code(200).send({ conversation: projectConversation(existing) })
    }
    // The shape the Factory's own session route writes, so its workspace resolver reads it unchanged.
    const created = await sessions.create({
      sessionId: conversationId,
      projectRepositoryId: binding.projectRepositoryId,
      orgId,
      userId: session.account.accountId,
      branch: conversationBranch(conversationId),
      baseBranch: await defaultBranchOf(binding),
      ...(title ? { title } : {}),
      visibility: 'org',
    })
    await openThread({ conversationId, accountId: session.account.accountId })
    return reply.code(201).send({ conversation: projectConversation(created) })
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
