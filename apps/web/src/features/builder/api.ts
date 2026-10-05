import { call } from '../../app/http'
import { routeParam } from '../../app/route-params'
import {
  BLD08, BLD09, BLD23, BLD24, BLD25, BLD26, BLD29, BLD30, BuilderRunId, BuilderRunView, IdempotencyKey, ProjectId, SourceRevision,
  type BuilderRunSummary, type BuilderSession, type BuilderTraceSummary, type PreviewLaunch, type SourceComparison, type SourceFile, type SourceTree,
} from '../../../../../packages/contract/dist/index.js'

export type { BuilderSession, BuilderTraceSummary, PreviewLaunch, SourceComparison, SourceFile, SourceTree }
export type SourceChange = SourceComparison['files'][number]
/** A run row, with the calls its live session waits on when it is the session's latest run. */
export type BuilderRun = BuilderRunSummary & Readonly<{ pendingCalls?: readonly string[] }>
export type BuilderMessageAccepted = Readonly<{ builderRun: BuilderRun }>

const noInput = { query: undefined, headers: undefined, body: undefined } as const
const projectParams = (projectId: string) => ({ projectId: routeParam(ProjectId, projectId) })
const runParams = (projectId: string, builderRunId: string) => ({ ...projectParams(projectId), builderRunId: routeParam(BuilderRunId, builderRunId) })

export const getBuilderSession = (projectId: string): Promise<BuilderSession> => call(BLD23, { params: projectParams(projectId), ...noInput })
export const sendBuilderMessage = async (
  projectId: string, conversationId: string, content: string, idempotencyKey: string,
): Promise<BuilderMessageAccepted> => (await call(BLD24, {
  params: projectParams(projectId), query: undefined,
  headers: { 'idempotency-key': routeParam(IdempotencyKey, idempotencyKey) },
  body: { content, conversationId },
})).body
export const listProjectSourceTree = (projectId: string, sourceRevision: string): Promise<SourceTree> =>
  call(BLD08, { params: projectParams(projectId), query: { sourceRevision: routeParam(SourceRevision, sourceRevision) }, headers: undefined, body: undefined })
export const getProjectSourceFile = (projectId: string, sourceRevision: string, path: string): Promise<SourceFile> =>
  call(BLD09, { params: projectParams(projectId), query: { sourceRevision: routeParam(SourceRevision, sourceRevision), path }, headers: undefined, body: undefined })
export const compareProjectSource = (projectId: string, baseSourceRevision: string, resultSourceRevision: string): Promise<SourceComparison> =>
  call(BLD29, {
    params: projectParams(projectId),
    query: { baseSourceRevision: routeParam(SourceRevision, baseSourceRevision), resultSourceRevision: routeParam(SourceRevision, resultSourceRevision) },
    headers: undefined, body: undefined,
  })
export const launchBuilderPreview = (projectId: string): Promise<PreviewLaunch> =>
  call(BLD30, { params: projectParams(projectId), query: undefined, headers: undefined, body: {} })
export const cancelBuilderRun = (projectId: string, builderRunId: string): Promise<BuilderMessageAccepted> =>
  call(BLD25, { params: runParams(projectId, builderRunId), query: undefined, headers: undefined, body: {} })
export const getBuilderRunTrace = (projectId: string, builderRunId: string): Promise<BuilderTraceSummary> =>
  call(BLD26, { params: runParams(projectId, builderRunId), ...noInput })

/**
 * The run the Hub wrote into its session state, as the builder-session read serves it, or null for
 * anything else. Session state is the controller's free-form map, so it is checked here, once.
 */
export const parseRunState = (value: unknown): BuilderRunView | null => {
  const parsed = BuilderRunView.safeParse(value)
  return parsed.success ? parsed.data : null
}
