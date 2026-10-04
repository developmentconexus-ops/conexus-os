import type { UsageStats } from '@mastra/core/observability'
import type { FastifyInstance, } from 'fastify'
import { Failure, type FailureCode } from '../platform/failure.js'
import type { BuilderService } from './service.js'
import type { BuilderRunSummary, BuilderStore } from './store.js'
import type { ApplicationArtifactMetadata } from './application-build.js'
import type { HubSessionDigest } from '../identity-access/current-session.js'
import { routes } from '../http/access.js'

const uuid = { type: 'string', format: 'uuid' } as const
const params = { type: 'object', additionalProperties: false, required: ['projectId'], properties: { projectId: uuid } } as const
const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value
// A failure that is already a row passes; anything else is the named fault, with the original as its cause.
const unavailableAs = (code: FailureCode, details: Readonly<Record<string, string>>) => (error: unknown): never => {
  throw error instanceof Failure ? error : new Failure(code, { cause: error, details })
}
const sourceQuery = { type: 'object', additionalProperties: false, required: ['sourceRevision'], properties: { sourceRevision: { type: 'string', pattern: '^[0-9a-f]{40}$' } } } as const
const sourceFileQuery = { type: 'object', additionalProperties: false, required: ['sourceRevision', 'path'], properties: { sourceRevision: { type: 'string', pattern: '^[0-9a-f]{40}$' }, path: { type: 'string', minLength: 1, maxLength: 4096 } } } as const
const sourceCompareQuery = { type: 'object', additionalProperties: false, required: ['baseSourceRevision', 'resultSourceRevision'], properties: { baseSourceRevision: { type: 'string', pattern: '^[0-9a-f]{40}$' }, resultSourceRevision: { type: 'string', pattern: '^[0-9a-f]{40}$' } } } as const

export type BuilderOperationId = 'BLD-08' | 'BLD-09' | 'BLD-23' | 'BLD-24' | 'BLD-25' | 'BLD-26' | 'BLD-29'
export type BuilderSessionSnapshot = Readonly<{
  projectId: string
  workingSourceRevision: string | null
  lastPreviewSourceRevision: string | null
  lastPreviewArtifactRevisionId: string | null
  lastPreviewArtifactDigest: string | null
  runHistory: readonly BuilderRunSummary[]
}>
export type BuilderSessionPort = Readonly<{
  read(input: Readonly<{ accountId: string; projectId: string }>): Promise<BuilderSessionSnapshot>
  readTrace?(input: Readonly<{ accountId: string; projectId: string; builderRunId: string }>): Promise<BuilderTraceSummary>
}>
/** Mastra's `UsageStats` with the three totals always present (null where no span reported one), keeping its cache and reasoning breakdown. */
export type BuilderTraceUsage = Readonly<{ inputTokens: number | null; outputTokens: number | null; totalTokens: number | null }> & Pick<UsageStats, 'inputDetails' | 'outputDetails'>
export type BuilderTraceSpan = Readonly<{
  spanId: string
  parentSpanId: string | null
  spanType: string
  name: string
  startedAt: string
  durationMs: number | null
  error: boolean
  model: string | null
  usage: BuilderTraceUsage | null
}>
export type BuilderTraceScore = Readonly<{ scorer: string; score: number; reason: string | null }>
export type BuilderTraceSummary = Readonly<{
  available: boolean
  traceId: string | null
  spans: readonly BuilderTraceSpan[]
  usage: BuilderTraceUsage | null
  modelCalls: number
  toolCalls: number
  scores: readonly BuilderTraceScore[]
}>
export type BuilderLaunchPreviewPort = (hubSessionDigest: HubSessionDigest, input: Readonly<{
  accountId: string
  projectId: string
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

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: debt: owning wave
export const registerBuilderRoutes = async (app: FastifyInstance, dependencies: Readonly<{
  store: BuilderStore
  service: BuilderService
  session?: BuilderSessionPort
  launchPreview?: BuilderLaunchPreviewPort
}>): Promise<readonly BuilderOperationId[]> => {
  const route = routes(app)

  route.session<{ Params: { projectId: string } }>({ method: 'GET', url: '/api/control/projects/:projectId/builder-session', schema: { params }, handler: async (request, _reply, session) => {
    const accountId = session.account.accountId
    const { projectId } = request.params
    const port = dependencies.session
    if (!port) throw new Failure('BUILDER_SESSION_UNAVAILABLE')
    const read = async () => {
      const snapshot = await port.read({ accountId, projectId })
      const [run, latestCodeChangingRun] = await Promise.all([
        dependencies.store.readBuilderRun({ accountId, projectId }),
        dependencies.store.readLatestCodeChangingBuilderRun({ accountId, projectId }),
      ])
      return {
        projectId: snapshot.projectId,
        latestBuilderRun: run ? { ...run, pendingCalls: dependencies.service.pendingCalls(projectId, run.conversationId) } : null,
        latestCodeChangingRun: latestCodeChangingRun ? {
          baseSourceRevision: latestCodeChangingRun.baseSourceRevision,
          resultSourceRevision: latestCodeChangingRun.resultSourceRevision,
          resultKind: latestCodeChangingRun.resultKind,
        } : null,
        preview: { workingSourceRevision: snapshot.workingSourceRevision, lastGoodSourceRevision: snapshot.lastPreviewSourceRevision, lastGoodArtifactRevisionId: snapshot.lastPreviewArtifactRevisionId, lastGoodArtifactDigest: snapshot.lastPreviewArtifactDigest },
        runHistory: snapshot.runHistory,
      }
    }
    return read().catch(unavailableAs('BUILDER_SESSION_UNAVAILABLE', { projectId }))
  } })

  route.session<{ Params: { projectId: string }; Body: { content: string; conversationId: string } }>({ method: 'POST', url: '/api/control/projects/:projectId/builder-session/messages', schema: {
      params,
      body: { type: 'object', additionalProperties: false, required: ['content', 'conversationId'], properties: { content: { type: 'string', minLength: 1, maxLength: 20_000, pattern: '.*\\S.*' }, conversationId: { type: 'string', minLength: 1, maxLength: 200 } } },
    }, handler: async (request, reply, session) => {
    const accountId = session.account.accountId
    const idempotencyKey = header(request.headers['idempotency-key'])
    if (!idempotencyKey) throw new Failure('IDEMPOTENCY_KEY_REQUIRED')
    const { builderRun, created } = await dependencies.service.sendBuilderMessage({
      accountId, projectId: request.params.projectId,
      conversationId: request.body.conversationId,
      idempotencyKey, content: request.body.content,
    }).catch(unavailableAs('BUILDER_UNAVAILABLE', { projectId: request.params.projectId }))
    return reply.code(created ? 201 : 200).send({ builderRun })
  } })

  route.session<{ Params: { projectId: string; builderRunId: string }; Body: Record<string, never> }>({ method: 'POST', url: '/api/control/projects/:projectId/builder-session/runs/:builderRunId/cancel', schema: {
      params: { type: 'object', additionalProperties: false, required: ['projectId', 'builderRunId'], properties: { projectId: uuid, builderRunId: uuid } },
      body: { type: 'object', additionalProperties: false },
    }, handler: async (request, reply, session) => {
    const accountId = session.account.accountId
    const run = await dependencies.service.cancelBuilderRun({ accountId, projectId: request.params.projectId, builderRunId: request.params.builderRunId })
      .catch(unavailableAs('BUILDER_CANCELLATION_UNAVAILABLE', { projectId: request.params.projectId, builderRunId: request.params.builderRunId }))
    return reply.code(200).send({ builderRun: run })
  } })

  route.session<{ Params: { projectId: string; builderRunId: string } }>({ method: 'GET', url: '/api/control/projects/:projectId/builder-session/runs/:builderRunId/trace', schema: { params: { type: 'object', additionalProperties: false, required: ['projectId', 'builderRunId'], properties: { projectId: uuid, builderRunId: uuid } } }, handler: async (request, _reply, session) => {
    const accountId = session.account.accountId
    const readTrace = dependencies.session?.readTrace?.bind(dependencies.session)
    if (!readTrace) throw new Failure('BUILDER_TRACE_UNAVAILABLE')
    const { projectId, builderRunId } = request.params
    const read = async () => {
      const run = await dependencies.store.readBuilderRun({ accountId, projectId })
      if (!run || run.builderRunId !== builderRunId) throw new Failure('BUILDER_RUN_NOT_FOUND')
      return readTrace({ accountId, projectId, builderRunId })
    }
    return read().catch(unavailableAs('BUILDER_TRACE_UNAVAILABLE', { projectId, builderRunId }))
  } })

  route.session<{ Params: { projectId: string }; Body: Record<string, never> }>({ method: 'POST', url: '/api/control/projects/:projectId/builder-session/preview', schema: {
      params,
      body: { type: 'object', additionalProperties: false },
    }, handler: async (request, reply, session) => {
    const accountId = session.account.accountId
    const { launchPreview } = dependencies
    if (!launchPreview) throw new Failure('PREVIEW_UNAVAILABLE')
    const { projectId } = request.params
    const launch = async () => {
      const subject = await dependencies.store.readPreviewSubject({ accountId, projectId })
      if (!subject?.lastPreviewSourceRevision || !subject.lastPreviewArtifactRevisionId || !subject.lastPreviewArtifactDigest) throw new Failure('PREVIEW_SUBJECT_NOT_FOUND')
      const artifact = await dependencies.service.getApplicationBySource({ accountId, projectId, sourceRevision: subject.lastPreviewSourceRevision })
      if (!artifact || artifact.artifactRevisionId !== subject.lastPreviewArtifactRevisionId || artifact.artifactDigest !== subject.lastPreviewArtifactDigest) throw new Failure('PREVIEW_SUBJECT_NOT_FOUND')
      return launchPreview(session.digest, { accountId, projectId, artifactRevisionId: artifact.artifactRevisionId, artifactDigest: artifact.artifactDigest, artifact })
    }
    const launched = await launch().catch((error: unknown) => {
      if (error instanceof Error && error.message === 'APPLICATION_SUBJECT_REFUSED') throw new Failure('PROJECT_BUILD_DENIED')
      return unavailableAs('PREVIEW_UNAVAILABLE', { projectId })(error)
    })
    return reply.code(201).send(launched)
  } })

  route.session<{ Params: { projectId: string }; Querystring: { sourceRevision: string } }>({ method: 'GET', url: '/api/control/projects/:projectId/source/tree', schema: { params, querystring: sourceQuery }, handler: async (request, _reply, session) => {
      const accountId = session.account.accountId
      return dependencies.service.listSourceTree({ accountId, projectId: request.params.projectId, sourceRevision: request.query.sourceRevision })
        .catch(unavailableAs('BUILDER_SOURCE_UNAVAILABLE', { projectId: request.params.projectId }))
  } })

  route.session<{ Params: { projectId: string }; Querystring: { sourceRevision: string; path: string } }>({ method: 'GET', url: '/api/control/projects/:projectId/source/file', schema: { params, querystring: sourceFileQuery }, handler: async (request, _reply, session) => {
      const accountId = session.account.accountId
      return dependencies.service.getSourceFile({ accountId, projectId: request.params.projectId, sourceRevision: request.query.sourceRevision, path: request.query.path })
        .catch(unavailableAs('BUILDER_SOURCE_UNAVAILABLE', { projectId: request.params.projectId }))
  } })

  route.session<{ Params: { projectId: string }; Querystring: { baseSourceRevision: string; resultSourceRevision: string } }>({ method: 'GET', url: '/api/control/projects/:projectId/source/compare', schema: { params, querystring: sourceCompareQuery }, handler: async (request, _reply, session) => {
      const accountId = session.account.accountId
      return dependencies.service.compareSourceRevisions({
        accountId, projectId: request.params.projectId,
        baseSourceRevision: request.query.baseSourceRevision, resultSourceRevision: request.query.resultSourceRevision,
      }).catch(unavailableAs('BUILDER_SOURCE_UNAVAILABLE', { projectId: request.params.projectId }))
  } })

  return ['BLD-08', 'BLD-09', 'BLD-23', 'BLD-24', 'BLD-25', 'BLD-26', 'BLD-29']
}
