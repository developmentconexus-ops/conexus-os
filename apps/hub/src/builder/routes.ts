import type { FastifyInstance } from 'fastify'
import { sendProblem } from '../http/problem.js'
import { projectBuildPreview } from './preview.js'
import type { BuilderService } from './service.js'
import type { BuilderSnapshot, BuilderStore } from './store.js'

const CSRF_COOKIE = '__Host-conexus_csrf'
const uuid = { type: 'string', format: 'uuid' } as const
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const params = { type: 'object', additionalProperties: false, required: ['projectId'], properties: { projectId: uuid } } as const
const changeParams = { type: 'object', additionalProperties: false, required: ['projectId', 'changeId'], properties: { projectId: uuid, changeId: uuid } } as const
const findingParams = { type: 'object', additionalProperties: false, required: ['projectId', 'changeId', 'findingId'], properties: { projectId: uuid, changeId: uuid, findingId: uuid } } as const
const evidenceParams = { type: 'object', additionalProperties: false, required: ['projectId', 'changeId', 'evidenceId'], properties: { projectId: uuid, changeId: uuid, evidenceId: uuid } } as const
const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value
const message = (error: unknown): string => error instanceof Error ? error.message : ''

export type BuilderOperationId = 'BLD-01' | 'BLD-02' | 'BLD-03' | 'BLD-04' | 'BLD-06' | 'BLD-07' | 'BLD-08' | 'BLD-09' | 'BLD-10' | 'BLD-11' | 'BLD-12' | 'BLD-13' | 'BLD-14' | 'BLD-15' | 'BLD-17'
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

  const sourceQuery = { type: 'object', additionalProperties: false, required: ['sourceRevision'], properties: {
    sourceRevision: { type: 'string', pattern: '^[0-9a-f]{40}$' },
  } } as const
  app.get<{ Params: { projectId: string }; Querystring: { sourceRevision: string } }>(
    '/api/control/projects/:projectId/source/tree', { schema: { params, querystring: sourceQuery } }, async (request, reply) => {
      const session = await dependencies.resolveCurrentSession(request)
      if (!session) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      try {
        return await dependencies.service.listSourceTree({
          accountId: session.account.accountId, projectId: request.params.projectId,
          sourceRevision: request.query.sourceRevision,
        })
      } catch (error) {
        const detail = message(error)
        if (detail.includes('SUBJECT_NOT_FOUND') || detail.includes('REVISION_NOT_FOUND')) {
          return sendProblem(reply, 404, 'source-revision-not-found', 'Source revision not found')
        }
        return sendProblem(reply, 503, 'builder-source-unavailable', 'Builder source unavailable')
      }
    },
  )

  const previewQuery = { type: 'object', additionalProperties: false, required: [], properties: {
    changeId: { type: 'string', minLength: 1, maxLength: 128 },
  } } as const
  app.get<{ Params: { projectId: string }; Querystring: { changeId?: string } }>(
    '/api/control/projects/:projectId/preview', { schema: { params, querystring: previewQuery } }, async (request, reply) => {
      const session = await dependencies.resolveCurrentSession(request)
      if (!session) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      if (request.query.changeId && !UUID_PATTERN.test(request.query.changeId)) {
        return sendProblem(reply, 404, 'preview-subject-not-found', 'Preview subject not found')
      }
      try {
        const subjectInput = { accountId: session.account.accountId, projectId: request.params.projectId }
        const subject = await dependencies.store.readPreviewSubject(request.query.changeId
          ? { ...subjectInput, changeId: request.query.changeId }
          : subjectInput)
        return subject ? projectBuildPreview(subject) : sendProblem(reply, 404, 'preview-subject-not-found', 'Preview subject not found')
      } catch { return sendProblem(reply, 503, 'builder-preview-unavailable', 'Builder Preview unavailable') }
    },
  )
  const sourceFileQuery = { type: 'object', additionalProperties: false, required: ['sourceRevision', 'path'], properties: {
    sourceRevision: { type: 'string', pattern: '^[0-9a-f]{40}$' },
    path: { type: 'string', minLength: 1, maxLength: 4096 },
  } } as const
  app.get<{ Params: { projectId: string }; Querystring: { sourceRevision: string; path: string } }>(
    '/api/control/projects/:projectId/source/file', { schema: { params, querystring: sourceFileQuery } }, async (request, reply) => {
      const session = await dependencies.resolveCurrentSession(request)
      if (!session) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      try {
        return await dependencies.service.getSourceFile({
          accountId: session.account.accountId, projectId: request.params.projectId,
          sourceRevision: request.query.sourceRevision, path: request.query.path,
        })
      } catch (error) {
        const detail = message(error)
        if (detail.includes('SUBJECT_NOT_FOUND') || detail.includes('NOT_FOUND') ||
          detail.includes('NOT_DISCLOSABLE') || detail.includes('PATH_REFUSED')) {
          return sendProblem(reply, 404, 'source-file-not-found', 'Source file not found')
        }
        return sendProblem(reply, 503, 'builder-source-unavailable', 'Builder source unavailable')
      }
    },
  )

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

  app.get<{ Params: { projectId: string; changeId: string } }>('/api/control/projects/:projectId/changes/:changeId/findings', { schema: { params: changeParams } }, async (request, reply) => {
    const session = await dependencies.resolveCurrentSession(request)
    if (!session) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
    try { return await dependencies.store.listFindings({ accountId: session.account.accountId, ...request.params }) } catch {
      return sendProblem(reply, 503, 'builder-unavailable', 'Builder unavailable')
    }
  })
  app.get<{ Params: { projectId: string; changeId: string; findingId: string } }>('/api/control/projects/:projectId/changes/:changeId/findings/:findingId', { schema: { params: findingParams } }, async (request, reply) => {
    const session = await dependencies.resolveCurrentSession(request)
    if (!session) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
    try {
      const value = await dependencies.store.getFinding({ accountId: session.account.accountId, ...request.params })
      return value ?? sendProblem(reply, 404, 'finding-not-found', 'Finding not found')
    } catch { return sendProblem(reply, 503, 'builder-unavailable', 'Builder unavailable') }
  })
  app.post<{ Params: { projectId: string; changeId: string; findingId: string }; Body: { expectedFindingRevision: string; resolutionEvidenceIds: string[] } }>(
    '/api/control/projects/:projectId/changes/:changeId/findings/:findingId/commands/close', {
      schema: { params: findingParams, body: { type: 'object', additionalProperties: false,
        required: ['expectedFindingRevision', 'resolutionEvidenceIds'], properties: {
          expectedFindingRevision: uuid,
          resolutionEvidenceIds: { type: 'array', minItems: 1, uniqueItems: true, items: uuid },
        } } },
    }, async (request, reply) => {
      const csrf = header(request.headers['x-conexus-csrf'])
      if (request.headers.origin !== dependencies.origin || !csrf || csrf !== request.cookies[CSRF_COOKIE]) {
        return sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
      }
      const session = await dependencies.resolveCurrentSession(request, true)
      if (!session) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      try {
        return await dependencies.store.closeFinding({ accountId: session.account.accountId, ...request.params, ...request.body })
      } catch (error) {
        const detail = message(error)
        if (detail.includes('NOT_AUTHORIZED') || detail.includes('BUILD_AUTHORITY_STALE')) {
          return sendProblem(reply, 403, 'finding-close-denied', 'Finding close denied')
        }
        if (detail.includes('query returned no rows') || detail.includes('NO_DATA_FOUND') || detail.includes('P0002')) {
          return sendProblem(reply, 404, 'finding-not-found', 'Finding not found')
        }
        if (detail.includes('BASELINE_STALE')) return sendProblem(reply, 409, 'finding-baseline-stale', 'Finding Baseline is stale')
        if (detail.includes('REVISION_STALE')) return sendProblem(reply, 412, 'finding-revision-stale', 'Finding revision is stale')
        if (detail.includes('CURRENT_STATE_REFUSED')) return sendProblem(reply, 409, 'finding-state-conflict', 'Finding state conflict')
        if (detail.includes('EVIDENCE_REFUSED')) return sendProblem(reply, 422, 'finding-evidence-refused', 'Resolution Evidence refused')
        return sendProblem(reply, 503, 'builder-unavailable', 'Builder unavailable')
      }
    },
  )
  app.get<{ Params: { projectId: string; changeId: string } }>('/api/control/projects/:projectId/changes/:changeId/evidence', { schema: { params: changeParams } }, async (request, reply) => {
    const session = await dependencies.resolveCurrentSession(request)
    if (!session) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
    try { return await dependencies.store.listEvidence({ accountId: session.account.accountId, ...request.params }) } catch {
      return sendProblem(reply, 503, 'builder-unavailable', 'Builder unavailable')
    }
  })
  app.get<{ Params: { projectId: string; changeId: string; evidenceId: string } }>('/api/control/projects/:projectId/changes/:changeId/evidence/:evidenceId', { schema: { params: evidenceParams } }, async (request, reply) => {
    const session = await dependencies.resolveCurrentSession(request)
    if (!session) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
    try {
      const value = await dependencies.store.getEvidence({ accountId: session.account.accountId, ...request.params })
      return value ?? sendProblem(reply, 404, 'evidence-not-found', 'Evidence not found')
    } catch { return sendProblem(reply, 503, 'builder-unavailable', 'Builder unavailable') }
  })
  return ['BLD-01', 'BLD-02', 'BLD-03', 'BLD-04', 'BLD-06', 'BLD-07', 'BLD-08', 'BLD-09', 'BLD-10', 'BLD-11', 'BLD-12', 'BLD-13', 'BLD-14', 'BLD-15', 'BLD-17']
}
