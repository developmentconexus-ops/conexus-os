import { call } from '../../app/http'
import { routeParam } from '../../app/route-params'
import {
  getBuilderSession as getBuilderSessionOperation, sendBuilderMessage as sendBuilderMessageOperation, listProjectSourceTree as listProjectSourceTreeOperation, getProjectSourceFile as getProjectSourceFileOperation, launchBuilderPreview as launchBuilderPreviewOperation, cancelBuilderRun as cancelBuilderRunOperation, getBuilderRunTrace as getBuilderRunTraceOperation,
  compareProjectSourceRevisions, BuilderRunId, ConversationId, BuilderRunView, IdempotencyKey, ProjectId, SourceRevision,
  type BuilderRunSummary, type BuilderSession, type BuilderTraceSummary, type PreviewLaunch, type SourceComparison, type SourceFile, type SourceTree,
} from '@conexus/contract'

export type { BuilderSession, BuilderTraceSummary, PreviewLaunch, SourceComparison, SourceFile, SourceTree }
export type SourceChange = SourceComparison['files'][number]
/** A run row, with the calls its live session waits on when it is the session's latest run. */
export type BuilderRun = BuilderRunSummary & Readonly<{ pendingCalls?: readonly string[] }>
export type BuilderMessageAccepted = Readonly<{ builderRun: BuilderRun }>

const noInput = { query: undefined, headers: undefined, body: undefined } as const
const projectParams = (projectId: string) => ({ projectId: routeParam(ProjectId, projectId) })
const runParams = (projectId: string, builderRunId: string) => ({ ...projectParams(projectId), builderRunId: routeParam(BuilderRunId, builderRunId) })

export const getBuilderSession = (projectId: string): Promise<BuilderSession> => call(getBuilderSessionOperation, { params: projectParams(projectId), ...noInput })
export const sendBuilderMessage = async (
  projectId: string, conversationId: string, content: string, idempotencyKey: string,
): Promise<BuilderMessageAccepted> => (await call(sendBuilderMessageOperation, {
  params: projectParams(projectId), query: undefined,
  headers: { 'idempotency-key': routeParam(IdempotencyKey, idempotencyKey) },
  body: { content, conversationId: routeParam(ConversationId, conversationId) },
})).body
export const listProjectSourceTree = (projectId: string, sourceRevision: string): Promise<SourceTree> =>
  call(listProjectSourceTreeOperation, { params: projectParams(projectId), query: { sourceRevision: routeParam(SourceRevision, sourceRevision) }, headers: undefined, body: undefined })
export const getProjectSourceFile = (projectId: string, sourceRevision: string, path: string): Promise<SourceFile> =>
  call(getProjectSourceFileOperation, { params: projectParams(projectId), query: { sourceRevision: routeParam(SourceRevision, sourceRevision), path }, headers: undefined, body: undefined })
export const compareProjectSource = (projectId: string, baseSourceRevision: string, resultSourceRevision: string): Promise<SourceComparison> =>
  call(compareProjectSourceRevisions, {
    params: projectParams(projectId),
    query: { baseSourceRevision: routeParam(SourceRevision, baseSourceRevision), resultSourceRevision: routeParam(SourceRevision, resultSourceRevision) },
    headers: undefined, body: undefined,
  })
export const launchBuilderPreview = (projectId: string): Promise<PreviewLaunch> =>
  call(launchBuilderPreviewOperation, { params: projectParams(projectId), query: undefined, headers: undefined, body: {} })
export const cancelBuilderRun = (projectId: string, builderRunId: string): Promise<BuilderMessageAccepted> =>
  call(cancelBuilderRunOperation, { params: runParams(projectId, builderRunId), query: undefined, headers: undefined, body: {} })
export const getBuilderRunTrace = (projectId: string, builderRunId: string): Promise<BuilderTraceSummary> =>
  call(getBuilderRunTraceOperation, { params: runParams(projectId, builderRunId), ...noInput })

/**
 * The run the Hub wrote into its session state, as the builder-session read serves it, or null for
 * anything else. Session state is the controller's free-form map, so it is checked here, once.
 */
export const parseRunState = (value: unknown): BuilderRunView | null => {
  const parsed = BuilderRunView.safeParse(value)
  return parsed.success ? parsed.data : null
}
