import type { FastifyInstance } from 'fastify'
import { BLD08, BLD09, BLD23, BLD24, BLD25, BLD26, BLD29, BLD30, type AccountId, type ArtifactRevisionId, type BuilderRunId, type BuilderTraceSummary, type ProjectId, type SourceRevision } from '../../../../packages/contract/dist/index.js'
import { Failure, type FailureCode } from '../platform/failure.js'
import type { BuilderService } from './service.js'
import type { BuilderRunSummary, BuilderStore } from './store.js'
import type { ApplicationArtifactMetadata } from './application-build.js'
import type { HubSessionDigest } from '../identity-access/current-session.js'
import { routes } from '../http/access.js'

// A failure that is already a row passes; anything else is the named fault, with the original as its cause.
const unavailableAs = (code: FailureCode, details: Readonly<Record<string, string>>) => (error: unknown): never => {
  throw error instanceof Failure ? error : new Failure(code, { cause: error, details })
}

export type BuilderOperationId = 'BLD-08' | 'BLD-09' | 'BLD-23' | 'BLD-24' | 'BLD-25' | 'BLD-26' | 'BLD-29' | 'BLD-30'
export type BuilderSessionSnapshot = Readonly<{
  projectId: ProjectId
  workingSourceRevision: SourceRevision | null
  lastPreviewSourceRevision: SourceRevision | null
  lastPreviewArtifactRevisionId: ArtifactRevisionId | null
  lastPreviewArtifactDigest: string | null
  runHistory: readonly BuilderRunSummary[]
}>
export type BuilderSessionPort = Readonly<{
  read(input: Readonly<{ accountId: AccountId; projectId: ProjectId }>): Promise<BuilderSessionSnapshot>
  readTrace?(input: Readonly<{ accountId: AccountId; projectId: ProjectId; builderRunId: BuilderRunId }>): Promise<BuilderTraceSummary>
}>
export type BuilderLaunchPreviewPort = (hubSessionDigest: HubSessionDigest, input: Readonly<{
  accountId: AccountId
  projectId: ProjectId
  artifactRevisionId: ArtifactRevisionId
  artifactDigest: string
  artifact: ApplicationArtifactMetadata
}> ) => Promise<Readonly<{
  entryUrl: string
  previewUrl: string
  entryGrant: string
  artifactRevisionId: ArtifactRevisionId
  artifactDigest: string
  expiresAt: string
}>>

export const registerBuilderRoutes = async (app: FastifyInstance, dependencies: Readonly<{
  store: BuilderStore
  service: BuilderService
  session?: BuilderSessionPort
  launchPreview?: BuilderLaunchPreviewPort
}>): Promise<readonly BuilderOperationId[]> => {
  const route = routes(app)

  route.operation(BLD23, async ({ params }, session) => {
    const accountId = session.account.accountId
    const { projectId } = params
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
        latestBuilderRun: run ? { ...run, pendingCalls: [...dependencies.service.pendingCalls(projectId, run.conversationId)] } : null,
        latestCodeChangingRun: latestCodeChangingRun ? {
          baseSourceRevision: latestCodeChangingRun.baseSourceRevision,
          resultSourceRevision: latestCodeChangingRun.resultSourceRevision,
          resultKind: latestCodeChangingRun.resultKind,
        } : null,
        preview: { workingSourceRevision: snapshot.workingSourceRevision, lastGoodSourceRevision: snapshot.lastPreviewSourceRevision, lastGoodArtifactRevisionId: snapshot.lastPreviewArtifactRevisionId, lastGoodArtifactDigest: snapshot.lastPreviewArtifactDigest },
        runHistory: [...snapshot.runHistory],
      }
    }
    return read().catch(unavailableAs('BUILDER_SESSION_UNAVAILABLE', { projectId }))
  })

  route.operation(BLD24, async ({ params, headers, body }, session) => {
    const { builderRun, created } = await dependencies.service.sendBuilderMessage({
      accountId: session.account.accountId, projectId: params.projectId,
      conversationId: body.conversationId,
      idempotencyKey: headers['idempotency-key'], content: body.content,
    }).catch(unavailableAs('BUILDER_UNAVAILABLE', { projectId: params.projectId }))
    return created ? { status: 201 as const, body: { builderRun } } : { status: 200 as const, body: { builderRun } }
  })

  route.operation(BLD25, async ({ params }, session) => {
    const run = await dependencies.service.cancelBuilderRun({ accountId: session.account.accountId, projectId: params.projectId, builderRunId: params.builderRunId })
      .catch(unavailableAs('BUILDER_CANCELLATION_UNAVAILABLE', { projectId: params.projectId, builderRunId: params.builderRunId }))
    return { builderRun: run }
  })

  route.operation(BLD26, async ({ params }, session) => {
    const accountId = session.account.accountId
    const readTrace = dependencies.session?.readTrace?.bind(dependencies.session)
    if (!readTrace) throw new Failure('BUILDER_TRACE_UNAVAILABLE')
    const { projectId, builderRunId } = params
    const read = async () => {
      if (!await dependencies.store.readPreviewSubject({ accountId, projectId })) throw new Failure('PROJECT_BUILD_DENIED')
      const run = await dependencies.store.readBuilderRun({ accountId, projectId })
      if (run?.builderRunId !== builderRunId) throw new Failure('BUILDER_RUN_NOT_FOUND')
      return readTrace({ accountId, projectId, builderRunId })
    }
    return read().catch(unavailableAs('BUILDER_TRACE_UNAVAILABLE', { projectId, builderRunId }))
  })

  route.operation(BLD30, async ({ params }, session) => {
    const accountId = session.account.accountId
    const { launchPreview } = dependencies
    if (!launchPreview) throw new Failure('PREVIEW_UNAVAILABLE')
    const { projectId } = params
    const subject = await dependencies.store.readLaunchSubject({ accountId, projectId })
    const launch = async () => {
      if (!subject?.lastPreviewSourceRevision || !subject.lastPreviewArtifactRevisionId || !subject.lastPreviewArtifactDigest) throw new Failure('PREVIEW_SUBJECT_NOT_FOUND')
      const artifact = await dependencies.service.getApplicationBySource({ accountId, projectId, sourceRevision: subject.lastPreviewSourceRevision })
      if (!artifact || artifact.artifactRevisionId !== subject.lastPreviewArtifactRevisionId || artifact.artifactDigest !== subject.lastPreviewArtifactDigest) throw new Failure('PREVIEW_SUBJECT_NOT_FOUND')
      return launchPreview(session.digest, { accountId, projectId, artifactRevisionId: subject.lastPreviewArtifactRevisionId, artifactDigest: artifact.artifactDigest, artifact })
    }
    return launch().catch(unavailableAs('PREVIEW_UNAVAILABLE', { projectId }))
  })

  route.operation(BLD08, ({ params, query }, session) =>
    dependencies.service.listSourceTree({ accountId: session.account.accountId, projectId: params.projectId, sourceRevision: query.sourceRevision })
      .catch(unavailableAs('BUILDER_SOURCE_UNAVAILABLE', { projectId: params.projectId })))

  route.operation(BLD09, ({ params, query }, session) =>
    dependencies.service.getSourceFile({ accountId: session.account.accountId, projectId: params.projectId, sourceRevision: query.sourceRevision, path: query.path })
      .catch(unavailableAs('BUILDER_SOURCE_UNAVAILABLE', { projectId: params.projectId })))

  route.operation(BLD29, ({ params, query }, session) =>
    dependencies.service.compareSourceRevisions({
      accountId: session.account.accountId, projectId: params.projectId,
      baseSourceRevision: query.baseSourceRevision, resultSourceRevision: query.resultSourceRevision,
    }).catch(unavailableAs('BUILDER_SOURCE_UNAVAILABLE', { projectId: params.projectId })))

  return ['BLD-08', 'BLD-09', 'BLD-23', 'BLD-24', 'BLD-25', 'BLD-26', 'BLD-29', 'BLD-30']
}
