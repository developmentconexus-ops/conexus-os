import type { FastifyInstance } from 'fastify'
import { sendProblem } from '../http/problem.js'
import type { BuilderService } from './service.js'
import type { BuilderSnapshot, BuilderStore } from './store.js'

const CSRF_COOKIE = '__Host-conexus_csrf'
const uuid = { type: 'string', format: 'uuid' } as const
const params = { type: 'object', additionalProperties: false, required: ['projectId'], properties: { projectId: uuid } } as const
const changeParams = { type: 'object', additionalProperties: false, required: ['projectId', 'changeId'], properties: { projectId: uuid, changeId: uuid } } as const
const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value
const message = (error: unknown): string => error instanceof Error ? error.message : ''

export type BuilderOperationId = 'BLD-01' | 'BLD-02' | 'BLD-03' | 'BLD-04' | 'BLD-06' | 'BLD-07' | 'BLD-17'
type ResolveBuilderSession = (request: import('fastify').FastifyRequest, requireCsrf?: boolean) => Promise<Readonly<{ account: Readonly<{ accountId: string }> }> | null>

const current = (snapshot: BuilderSnapshot, operation: BuilderOperationId): unknown => {
  if (operation === 'BLD-02') return snapshot.change
  if (operation === 'BLD-04') return snapshot.plan
  if (operation === 'BLD-06') return snapshot.progress
  if (operation === 'BLD-07') return snapshot.diff
  return snapshot.execution
}

export const registerBuilderRoutes = async (app: FastifyInstance, dependencies: Readonly<{
  store: BuilderStore
  service: BuilderService
  resolveCurrentSession: ResolveBuilderSession
  origin: string
}>): Promise<readonly BuilderOperationId[]> => {
  app.get<{ Params: { projectId: string } }>('/api/control/projects/:projectId/changes', { schema: { params } }, async (request, reply) => {
    const session = await dependencies.resolveCurrentSession(request)
    if (!session) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
    try { return await dependencies.store.listChanges({ accountId: session.account.accountId, projectId: request.params.projectId }) } catch {
      return sendProblem(reply, 503, 'builder-unavailable', 'Builder unavailable')
    }
  })

  app.post<{ Params: { projectId: string }; Body: { intent: string } }>('/api/control/projects/:projectId/changes', {
    schema: {
      params,
      body: { type: 'object', additionalProperties: false, required: ['intent'], properties: { intent: { type: 'string', minLength: 1, maxLength: 20_000, pattern: '.*\\S.*' } } },
    },
  }, async (request, reply) => {
    const csrf = header(request.headers['x-conexus-csrf'])
    if (request.headers.origin !== dependencies.origin || !csrf || csrf !== request.cookies[CSRF_COOKIE]) {
      return sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
    }
    const session = await dependencies.resolveCurrentSession(request, true)
    if (!session) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
    const idempotencyKey = header(request.headers['idempotency-key'])
    if (!idempotencyKey) return sendProblem(reply, 400, 'idempotency-key-required', 'Idempotency key required')
    try {
      const value = await dependencies.service.createChange({
        accountId: session.account.accountId, projectId: request.params.projectId, idempotencyKey, intent: request.body.intent,
      })
      return reply.code(201).send(value)
    } catch (error) {
      const detail = message(error)
      if (detail.includes('NOT_AUTHORIZED')) return sendProblem(reply, 403, 'project-build-denied', 'Project build denied')
      if (detail.includes('BASELINE_REQUIRED') || detail.includes('22P02')) return sendProblem(reply, 404, 'builder-subject-not-found', 'Builder subject not found')
      if (detail.includes('IDEMPOTENCY_CONFLICT') || detail.includes('OUTCOME_UNKNOWN')) return sendProblem(reply, 409, 'change-conflict', 'Change conflict')
      if (detail.includes('INTENT_REFUSED')) return sendProblem(reply, 422, 'change-intent-refused', 'Change intent refused')
      return sendProblem(reply, 503, 'builder-unavailable', 'Builder unavailable')
    }
  })

  const reads: readonly Readonly<{ suffix: string; id: BuilderOperationId; requireSource: boolean }>[] = [
    { suffix: '', id: 'BLD-02', requireSource: false },
    { suffix: '/plan', id: 'BLD-04', requireSource: false },
    { suffix: '/progress', id: 'BLD-06', requireSource: false },
    { suffix: '/diff', id: 'BLD-07', requireSource: true },
    { suffix: '/execution-detail', id: 'BLD-17', requireSource: false },
  ]
  for (const read of reads) {
    app.get<{ Params: { projectId: string; changeId: string } }>(
      `/api/control/projects/:projectId/changes/:changeId${read.suffix}`,
      { schema: { params: changeParams } },
      async (request, reply) => {
        const session = await dependencies.resolveCurrentSession(request)
        if (!session) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
        try {
          const snapshot = await dependencies.store.readSnapshot({
            accountId: session.account.accountId, projectId: request.params.projectId,
            changeId: request.params.changeId, requireSource: read.requireSource,
          })
          const value = snapshot && current(snapshot, read.id)
          if (!value) return sendProblem(reply, 404, 'change-not-found', 'Change not found')
          return value
        } catch {
          return sendProblem(reply, 503, 'builder-unavailable', 'Builder unavailable')
        }
      },
    )
  }
  return ['BLD-01', 'BLD-02', 'BLD-03', 'BLD-04', 'BLD-06', 'BLD-07', 'BLD-17']
}
