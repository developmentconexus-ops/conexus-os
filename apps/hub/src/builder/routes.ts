import type { FastifyInstance } from 'fastify'
import { BLD08, BLD09, BLD23, BLD24, BLD25, BLD26, BLD29, BLD30, type AccountId, type ArtifactDigest, type ArtifactRevisionId, type BuilderRunId, type BuilderRunSummary, type BuilderSession, type BuilderTraceSummary, type PreviewLaunch, type ProjectId } from '../../../../packages/contract/dist/index.js'
import { Failure } from '../platform/failure.js'
import type { BuilderService } from './service.js'
import type { BuilderStore } from './store.js'
import type { ApplicationArtifactMetadata } from './application-build.js'
import type { HubSessionDigest } from '../identity-access/current-session.js'
import { routes } from '../http/access.js'

export type BuilderOperationId = 'BLD-08' | 'BLD-09' | 'BLD-23' | 'BLD-24' | 'BLD-25' | 'BLD-26' | 'BLD-29' | 'BLD-30'
export type BuilderSessionPort = Readonly<{
  read(input: Readonly<{ accountId: AccountId; projectId: ProjectId }>): Promise<Readonly<{ preview: BuilderSession['preview']; runHistory: readonly BuilderRunSummary[] }>>
  readTrace(input: Readonly<{ accountId: AccountId; projectId: ProjectId; builderRunId: BuilderRunId }>): Promise<BuilderTraceSummary>
}>
export type BuilderLaunchPreviewPort = (hubSessionDigest: HubSessionDigest, input: Readonly<{
  accountId: AccountId
  projectId: ProjectId
  artifactRevisionId: ArtifactRevisionId
  artifactDigest: ArtifactDigest
  artifact: ApplicationArtifactMetadata
}>) => Promise<PreviewLaunch>

export const registerBuilderRoutes = async (app: FastifyInstance, dependencies: Readonly<{
  store: BuilderStore
  service: BuilderService
  session: BuilderSessionPort
  launchPreview?: BuilderLaunchPreviewPort
}>): Promise<readonly BuilderOperationId[]> => {
  const route = routes(app)

  route.operation(BLD23, async ({ params }, session) => {
    const accountId = session.account.accountId
    const { projectId } = params
    const snapshot = await dependencies.session.read({ accountId, projectId })
    const [run, latestCodeChangingRun] = await Promise.all([
      dependencies.store.readBuilderRun({ accountId, projectId }),
      dependencies.store.readLatestCodeChangingBuilderRun({ accountId, projectId }),
    ])
    return {
      projectId,
      latestBuilderRun: run ? { ...run, pendingCalls: [...dependencies.service.pendingCalls(projectId, run.conversationId)] } : null,
      latestCodeChangingRun: latestCodeChangingRun ? {
        baseSourceRevision: latestCodeChangingRun.baseSourceRevision,
        resultSourceRevision: latestCodeChangingRun.resultSourceRevision,
        resultKind: latestCodeChangingRun.resultKind,
      } : null,
      preview: snapshot.preview,
      runHistory: [...snapshot.runHistory],
    }
  })

  route.operation(BLD24, async ({ params, headers, body }, session) => {
    const { builderRun, created } = await dependencies.service.sendBuilderMessage({
      accountId: session.account.accountId, projectId: params.projectId,
      conversationId: body.conversationId,
      idempotencyKey: headers['idempotency-key'], content: body.content,
    })
    return created ? { status: 201 as const, body: { builderRun } } : { status: 200 as const, body: { builderRun } }
  })

  route.operation(BLD25, async ({ params }, session) => ({
    builderRun: await dependencies.service.cancelBuilderRun({ accountId: session.account.accountId, projectId: params.projectId, builderRunId: params.builderRunId }),
  }))

  route.operation(BLD26, async ({ params }, session) => {
    const accountId = session.account.accountId
    const { projectId, builderRunId } = params
    if (!await dependencies.store.readPreviewSubject({ accountId, projectId })) throw new Failure('PROJECT_BUILD_DENIED')
    const run = await dependencies.store.readBuilderRun({ accountId, projectId })
    if (run?.builderRunId !== builderRunId) throw new Failure('BUILDER_RUN_NOT_FOUND')
    return dependencies.session.readTrace({ accountId, projectId, builderRunId })
  })

  route.operation(BLD30, async ({ params }, session) => {
    const accountId = session.account.accountId
    const { launchPreview } = dependencies
    if (!launchPreview) throw new Failure('PREVIEW_UNAVAILABLE')
    const { projectId } = params
    const subject = await dependencies.store.readLaunchSubject({ accountId, projectId })
    if (!subject?.lastPreviewSourceRevision || !subject.lastPreviewArtifactRevisionId || !subject.lastPreviewArtifactDigest) throw new Failure('PREVIEW_SUBJECT_NOT_FOUND')
    const artifact = await dependencies.service.getApplicationBySource({ accountId, projectId, sourceRevision: subject.lastPreviewSourceRevision })
    if (!artifact || artifact.artifactRevisionId !== subject.lastPreviewArtifactRevisionId || artifact.artifactDigest !== subject.lastPreviewArtifactDigest) throw new Failure('PREVIEW_SUBJECT_NOT_FOUND')
    return launchPreview(session.digest, { accountId, projectId, artifactRevisionId: subject.lastPreviewArtifactRevisionId, artifactDigest: subject.lastPreviewArtifactDigest, artifact })
  })

  route.operation(BLD08, ({ params, query }, session) =>
    dependencies.service.listSourceTree({ accountId: session.account.accountId, projectId: params.projectId, sourceRevision: query.sourceRevision }))

  route.operation(BLD09, ({ params, query }, session) =>
    dependencies.service.getSourceFile({ accountId: session.account.accountId, projectId: params.projectId, sourceRevision: query.sourceRevision, path: query.path }))

  route.operation(BLD29, ({ params, query }, session) =>
    dependencies.service.compareSourceRevisions({
      accountId: session.account.accountId, projectId: params.projectId,
      baseSourceRevision: query.baseSourceRevision, resultSourceRevision: query.resultSourceRevision,
    }))

  return ['BLD-08', 'BLD-09', 'BLD-23', 'BLD-24', 'BLD-25', 'BLD-26', 'BLD-29', 'BLD-30']
}
