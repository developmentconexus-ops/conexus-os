import type { FastifyInstance } from 'fastify'
import { listProjectSourceTree, getProjectSourceFile, getBuilderSession, sendBuilderMessage, cancelBuilderRun, getBuilderRunTrace, compareProjectSourceRevisions, launchBuilderPreview, type AccountId, type BuilderRunId, type BuilderRunSummary, type BuilderSession, type BuilderTraceSummary, type PreviewLaunch, type ProjectId } from '@conexus/contract'
import { Failure } from '../platform/failure.js'
import type { BuilderService } from './service.js'
import type { BuilderStore } from './store.js'
import type { ServedLaunch } from './application-build.js'
import type { HubSessionDigest } from '../identity-access/current-session.js'
import { routes } from '../http/access.js'

export type BuilderOperationId = 'listProjectSourceTree' | 'getProjectSourceFile' | 'getBuilderSession' | 'sendBuilderMessage' | 'cancelBuilderRun' | 'getBuilderRunTrace' | 'compareProjectSourceRevisions' | 'launchBuilderPreview'
export type BuilderSessionPort = Readonly<{
  read(input: Readonly<{ accountId: AccountId; projectId: ProjectId }>): Promise<Readonly<{ preview: BuilderSession['preview']; runHistory: readonly BuilderRunSummary[] }>>
  readTrace(input: Readonly<{ accountId: AccountId; projectId: ProjectId; builderRunId: BuilderRunId }>): Promise<BuilderTraceSummary>
}>
export type BuilderLaunchPreviewPort = (hubSessionDigest: HubSessionDigest, input: Readonly<{
  accountId: AccountId
  projectId: ProjectId
  launch: ServedLaunch
}>) => Promise<PreviewLaunch>

export const registerBuilderRoutes = async (app: FastifyInstance, dependencies: Readonly<{
  store: BuilderStore
  service: BuilderService
  session: BuilderSessionPort
  launchPreview?: BuilderLaunchPreviewPort
}>): Promise<readonly BuilderOperationId[]> => {
  const route = routes(app)

  route.operation(getBuilderSession, async ({ params }, session) => {
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

  route.operation(sendBuilderMessage, async ({ params, headers, body }, session) => {
    const { builderRun, created } = await dependencies.service.sendBuilderMessage({
      accountId: session.account.accountId, projectId: params.projectId,
      conversationId: body.conversationId,
      idempotencyKey: headers['idempotency-key'], content: body.content,
    })
    return created ? { status: 201 as const, body: { builderRun } } : { status: 200 as const, body: { builderRun } }
  })

  route.operation(cancelBuilderRun, async ({ params }, session) => ({
    builderRun: await dependencies.service.cancelBuilderRun({ accountId: session.account.accountId, projectId: params.projectId, builderRunId: params.builderRunId }),
  }))

  route.operation(getBuilderRunTrace, async ({ params }, session) => {
    const accountId = session.account.accountId
    const { projectId, builderRunId } = params
    if (!await dependencies.store.readPreviewSubject({ accountId, projectId })) throw new Failure('PROJECT_BUILD_DENIED')
    const run = await dependencies.store.readBuilderRun({ accountId, projectId })
    if (run?.builderRunId !== builderRunId) throw new Failure('BUILDER_RUN_NOT_FOUND')
    return dependencies.session.readTrace({ accountId, projectId, builderRunId })
  })

  route.operation(launchBuilderPreview, async ({ params }, session) => {
    const accountId = session.account.accountId
    const { launchPreview } = dependencies
    if (!launchPreview) throw new Failure('PREVIEW_UNAVAILABLE')
    const { projectId } = params
    const launch = await dependencies.store.readLaunchSubject({ accountId, projectId })
    if (!launch) throw new Failure('PREVIEW_SUBJECT_NOT_FOUND')
    return launchPreview(session.digest, { accountId, projectId, launch })
  })

  route.operation(listProjectSourceTree, ({ params, query }, session) =>
    dependencies.service.listSourceTree({ accountId: session.account.accountId, projectId: params.projectId, sourceRevision: query.sourceRevision }))

  route.operation(getProjectSourceFile, ({ params, query }, session) =>
    dependencies.service.getSourceFile({ accountId: session.account.accountId, projectId: params.projectId, sourceRevision: query.sourceRevision, path: query.path }))

  route.operation(compareProjectSourceRevisions, ({ params, query }, session) =>
    dependencies.service.compareSourceRevisions({
      accountId: session.account.accountId, projectId: params.projectId,
      baseSourceRevision: query.baseSourceRevision, resultSourceRevision: query.resultSourceRevision,
    }))

  return ['listProjectSourceTree', 'getProjectSourceFile', 'getBuilderSession', 'sendBuilderMessage', 'cancelBuilderRun', 'getBuilderRunTrace', 'compareProjectSourceRevisions', 'launchBuilderPreview']
}
