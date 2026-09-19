import type { FastifyInstance, FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { sendProblem } from '../http/problem.js'
import type { BuilderService } from './service.js'
import type { BuilderRunSummary, BuilderStore } from './store.js'
import type { ApplicationArtifactMetadata } from './application-build.js'
import type { ModelChoice } from '../model-connection/model-catalog.js'
import type { BuilderLiveView } from './runtime.js'

const CSRF_COOKIE = '__Host-conexus_csrf'
const uuid = { type: 'string', format: 'uuid' } as const
const params = { type: 'object', additionalProperties: false, required: ['projectId'], properties: { projectId: uuid } } as const
const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value
const message = (error: unknown): string => error instanceof Error ? error.message : ''
const sourceQuery = { type: 'object', additionalProperties: false, required: ['sourceRevision'], properties: { sourceRevision: { type: 'string', pattern: '^[0-9a-f]{40}$' } } } as const
const sourceFileQuery = { type: 'object', additionalProperties: false, required: ['sourceRevision', 'path'], properties: { sourceRevision: { type: 'string', pattern: '^[0-9a-f]{40}$' }, path: { type: 'string', minLength: 1, maxLength: 4096 } } } as const

export type BuilderOperationId = 'BLD-08' | 'BLD-09' | 'BLD-23' | 'BLD-24' | 'BLD-25' | 'BLD-26'
type ResolveBuilderSession = (request: import('fastify').FastifyRequest, requireCsrf?: boolean) => Promise<Readonly<{ account: Readonly<{ accountId: string }> }> | null>
export type BuilderMessagePart =
  | Readonly<{ kind: 'TEXT'; text: string }>
  | Readonly<{ kind: 'ACTIVITY'; id: string; label: BuilderLiveView['activities'][number]['label']; path?: string; state: 'succeeded' | 'failed' | 'interrupted'; durationMs?: number }>
export type BuilderSessionMessage = Readonly<{
  id: string
  role: 'user' | 'assistant' | 'system'
  createdAt: string
  parts: readonly BuilderMessagePart[]
}>
export type BuilderSessionSnapshot = Readonly<{
  projectId: string
  threadId: string
  messages: readonly BuilderSessionMessage[]
  workingSourceRevision: string | null
  lastPreviewSourceRevision: string | null
  lastPreviewArtifactRevisionId: string | null
  lastPreviewArtifactDigest: string | null
  modelChoices: readonly ModelChoice[]
  runHistory: readonly BuilderRunSummary[]
}>
export type BuilderSessionPort = Readonly<{
  read(input: Readonly<{ accountId: string; projectId: string }>): Promise<BuilderSessionSnapshot>
  readTrace?(input: Readonly<{ accountId: string; projectId: string; builderRunId: string }>): Promise<BuilderTraceSummary>
}>
export type BuilderTraceSummary = Readonly<{
  available: boolean
  traceId: string | null
  spans: readonly Readonly<{ spanType: string; name: string; startedAt: string; durationMs: number | null; error: boolean }>[]
}>
export type BuilderLaunchPreviewPort = (request: FastifyRequest, input: Readonly<{
  accountId: string
  projectId: string
  changeId: string
  builderRunId?: string
  subjectDigest: string
  attemptId: string
  artifactRevisionId: string
  artifactDigest: string
  artifact: ApplicationArtifactMetadata
}> ) => Promise<Readonly<{
  entryUrl: string
  previewUrl: string
  entryGrant: string
  artifactRevisionId: string
  artifactDigest: string
  expiresAt: string
}>>

export const registerBuilderRoutes = async (app: FastifyInstance, dependencies: Readonly<{
  store: BuilderStore
  service: BuilderService
  session?: BuilderSessionPort
  resolveCurrentSession: ResolveBuilderSession
  origin: string
  launchPreview?: BuilderLaunchPreviewPort
}>): Promise<readonly BuilderOperationId[]> => {
  app.get<{ Params: { projectId: string } }>('/api/control/projects/:projectId/builder-session', { schema: { params } }, async (request, reply) => {
    const session = await dependencies.resolveCurrentSession(request)
    if (!session) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
    if (!dependencies.session) return sendProblem(reply, 503, 'builder-session-unavailable', 'Builder Session unavailable')
    try {
      const snapshot = await dependencies.session.read({ accountId: session.account.accountId, projectId: request.params.projectId })
      const [run, latestCodeChangingRun] = await Promise.all([
        dependencies.store.readBuilderRun({ accountId: session.account.accountId, projectId: request.params.projectId }),
        dependencies.store.readLatestCodeChangingBuilderRun({ accountId: session.account.accountId, projectId: request.params.projectId }),
      ])
      return {
        projectId: snapshot.projectId,
        messages: snapshot.messages,
        latestBuilderRun: run,
        latestCodeChangingRun: latestCodeChangingRun ? {
          baseSourceRevision: latestCodeChangingRun.baseSourceRevision,
          resultSourceRevision: latestCodeChangingRun.resultSourceRevision,
          resultKind: latestCodeChangingRun.resultKind,
        } : null,
        preview: { workingSourceRevision: snapshot.workingSourceRevision, lastGoodSourceRevision: snapshot.lastPreviewSourceRevision, lastGoodArtifactRevisionId: snapshot.lastPreviewArtifactRevisionId, lastGoodArtifactDigest: snapshot.lastPreviewArtifactDigest },
        modelChoices: snapshot.modelChoices,
        runHistory: snapshot.runHistory,
        mode: run?.mode ?? 'BUILD',
      }
    } catch (error) {
      if (message(error).includes('NOT_AUTHORIZED')) return sendProblem(reply, 403, 'project-build-denied', 'Project build denied')
      return sendProblem(reply, 503, 'builder-session-unavailable', 'Builder Session unavailable')
    }
  })

  app.post<{ Params: { projectId: string }; Body: { content: string; mode: 'BUILD' | 'PLAN'; modelChoiceId?: string } }>('/api/control/projects/:projectId/builder-session/messages', {
    schema: {
      params,
      body: { type: 'object', additionalProperties: false, required: ['content', 'mode'], properties: { content: { type: 'string', minLength: 1, maxLength: 20_000, pattern: '.*\\S.*' }, mode: { type: 'string', enum: ['BUILD', 'PLAN'] }, modelChoiceId: { type: 'string', minLength: 1, maxLength: 128 } } },
    },
  }, async (request, reply) => {
    const csrf = header(request.headers['x-conexus-csrf'])
    if (request.headers.origin !== dependencies.origin || !csrf || csrf !== request.cookies[CSRF_COOKIE]) return sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
    const session = await dependencies.resolveCurrentSession(request, true)
    if (!session) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
    const idempotencyKey = header(request.headers['idempotency-key'])
    if (!idempotencyKey) return sendProblem(reply, 400, 'idempotency-key-required', 'Idempotency key required')
    try {
      const run = await dependencies.service.createBuilderRun({
        accountId: session.account.accountId, projectId: request.params.projectId,
        idempotencyKey, content: request.body.content, mode: request.body.mode,
        ...(request.body.modelChoiceId ? { modelChoiceId: request.body.modelChoiceId } : {}),
      })
      return reply.code(201).send({ builderRun: run })
    } catch (error) {
      const detail = message(error)
      if (detail.includes('NOT_AUTHORIZED')) return sendProblem(reply, 403, 'project-build-denied', 'Project build denied')
      if (detail.includes('SOURCE_STALE') || detail.includes('PROJECT_BUSY') || detail.includes('IDEMPOTENCY_CONFLICT')) return sendProblem(reply, 409, 'builder-conflict', 'Builder request conflict')
      if (detail.includes('INPUT_REFUSED')) return sendProblem(reply, 422, 'builder-message-refused', 'Builder message refused')
      if (detail.includes('MODEL_CHOICE')) return sendProblem(reply, 422, 'builder-model-choice-refused', 'Builder model choice refused')
      if (detail.includes('CLAUDE_CONNECTION_REQUIRED')) return sendProblem(reply, 422, 'claude-connection-required', 'Connect a Claude account before building')
      return sendProblem(reply, 503, 'builder-unavailable', 'Builder unavailable')
    }
  })

  app.post<{ Params: { projectId: string; builderRunId: string }; Body: Record<string, never> }>('/api/control/projects/:projectId/builder-session/runs/:builderRunId/cancel', {
    schema: {
      params: { type: 'object', additionalProperties: false, required: ['projectId', 'builderRunId'], properties: { projectId: uuid, builderRunId: uuid } },
      body: { type: 'object', additionalProperties: false },
    },
  }, async (request, reply) => {
    const csrf = header(request.headers['x-conexus-csrf'])
    if (request.headers.origin !== dependencies.origin || !csrf || csrf !== request.cookies[CSRF_COOKIE]) return sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
    const session = await dependencies.resolveCurrentSession(request, true)
    if (!session) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
    try {
      const run = await dependencies.service.cancelBuilderRun({ accountId: session.account.accountId, projectId: request.params.projectId, builderRunId: request.params.builderRunId })
      return reply.code(200).send({ builderRun: run })
    } catch (error) {
      const detail = message(error)
      if (detail.includes('NOT_AUTHORIZED') || detail.includes('NOT_FOUND')) return sendProblem(reply, 404, 'builder-run-not-found', 'BuilderRun not found')
      return sendProblem(reply, 503, 'builder-cancellation-unavailable', 'Builder cancellation unavailable')
    }
  })

  app.get<{ Params: { projectId: string; builderRunId: string } }>('/api/control/projects/:projectId/builder-session/runs/:builderRunId/trace', {
    schema: { params: { type: 'object', additionalProperties: false, required: ['projectId', 'builderRunId'], properties: { projectId: uuid, builderRunId: uuid } } },
  }, async (request, reply) => {
    const session = await dependencies.resolveCurrentSession(request)
    if (!session) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
    if (!dependencies.session?.readTrace) return sendProblem(reply, 503, 'builder-trace-unavailable', 'Builder trace unavailable')
    try {
      const run = await dependencies.store.readBuilderRun({ accountId: session.account.accountId, projectId: request.params.projectId })
      if (!run || run.builderRunId !== request.params.builderRunId) return sendProblem(reply, 404, 'builder-run-not-found', 'BuilderRun not found')
      return dependencies.session.readTrace({ accountId: session.account.accountId, projectId: request.params.projectId, builderRunId: request.params.builderRunId })
    } catch (error) {
      if (message(error).includes('NOT_AUTHORIZED')) return sendProblem(reply, 403, 'project-build-denied', 'Project build denied')
      return sendProblem(reply, 503, 'builder-trace-unavailable', 'Builder trace unavailable')
    }
  })

  app.post<{ Params: { projectId: string }; Body: Record<string, never> }>('/api/control/projects/:projectId/builder-session/preview', {
    schema: {
      params,
      body: { type: 'object', additionalProperties: false },
    },
  }, async (request, reply) => {
    const csrf = header(request.headers['x-conexus-csrf'])
    if (request.headers.origin !== dependencies.origin || !csrf || csrf !== request.cookies[CSRF_COOKIE]) return sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
    const session = await dependencies.resolveCurrentSession(request, true)
    if (!session) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
    if (!dependencies.launchPreview) return sendProblem(reply, 503, 'preview-unavailable', 'Preview unavailable')
    try {
      const subject = await dependencies.store.readPreviewSubject({ accountId: session.account.accountId, projectId: request.params.projectId })
      if (!subject?.lastPreviewSourceRevision || !subject.lastPreviewArtifactRevisionId || !subject.lastPreviewArtifactDigest) {
        return sendProblem(reply, 404, 'preview-subject-not-found', 'Preview subject not found')
      }
      const artifact = await dependencies.service.getApplicationBySource({ accountId: session.account.accountId, projectId: request.params.projectId, sourceRevision: subject.lastPreviewSourceRevision })
      if (!artifact || artifact.artifactRevisionId !== subject.lastPreviewArtifactRevisionId || artifact.artifactDigest !== subject.lastPreviewArtifactDigest) return sendProblem(reply, 404, 'preview-subject-not-found', 'Preview subject not found')
      const correlationId = randomUUID()
      const launched = await dependencies.launchPreview(request, {
        accountId: session.account.accountId, projectId: request.params.projectId, changeId: correlationId, builderRunId: correlationId,
        subjectDigest: subject.lastPreviewSourceRevision, attemptId: correlationId, artifactRevisionId: artifact.artifactRevisionId,
        artifactDigest: artifact.artifactDigest, artifact,
      })
      return reply.code(201).send(launched)
    } catch (error) {
      const detail = message(error)
      if (detail.includes('NOT_AUTHORIZED') || detail.includes('SUBJECT_REFUSED')) return sendProblem(reply, 403, 'project-build-denied', 'Project build denied')
      return sendProblem(reply, 503, 'preview-unavailable', 'Preview unavailable')
    }
  })

  app.get<{ Params: { projectId: string; builderRunId: string } }>('/api/control/projects/:projectId/builder-session/runs/:builderRunId/stream', {
    schema: { params: { type: 'object', additionalProperties: false, required: ['projectId', 'builderRunId'], properties: { projectId: uuid, builderRunId: uuid } } },
  }, async (request, reply) => {
    const session = await dependencies.resolveCurrentSession(request)
    if (!session) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')
    try {
      const run = await dependencies.store.readBuilderRun({ accountId: session.account.accountId, projectId: request.params.projectId })
      if (!run || run.builderRunId !== request.params.builderRunId) return sendProblem(reply, 404, 'builder-run-not-found', 'BuilderRun not found')
      const stream = await dependencies.service.observeBuilderRun({ projectId: request.params.projectId, builderRunId: request.params.builderRunId })
      if (!stream) return sendProblem(reply, 410, 'builder-observation-unavailable', 'Live observation unavailable; consult the session')
      const reader = stream.getReader()
      const detach = () => { void reader.cancel().catch(() => {}) }
      reply.raw.once('close', detach)
      const frames = async function* () {
        try {
          for (;;) {
            const frame = await reader.read()
            if (frame.done) return
            yield frame.value
          }
        } finally {
          reply.raw.off('close', detach)
          await reader.cancel().catch(() => {})
          reader.releaseLock()
        }
      }
      return reply.header('content-type', 'text/event-stream; charset=utf-8').header('cache-control', 'no-store').header('x-accel-buffering', 'no').send(Readable.from(frames(), { highWaterMark: 1 }))
    } catch { return sendProblem(reply, 503, 'builder-unavailable', 'Builder unavailable') }
  })

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

  return ['BLD-08', 'BLD-09', 'BLD-23', 'BLD-24', 'BLD-25', 'BLD-26']
}
