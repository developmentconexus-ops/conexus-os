import { hubCall, hubFetch } from '../../app/http'
import { BUILDER_RUN_PHASES, BUILDER_RUN_RESULT_KINDS, BUILDER_RUN_STATES, type BuilderRunPhase, type BuilderRunResultKind, type BuilderRunState } from '../../generated/builder-run-vocabulary'
export type SourceTree = Readonly<{
  sourceRevision: string
  entries: readonly Readonly<{ path: string; kind: 'FILE' | 'DIRECTORY' }>[]
}>
export type SourceFile = Readonly<{ sourceRevision: string; path: string; content: string }>
export type PreviewLaunch = Readonly<{
  entryUrl: string
  previewUrl: string
  entryGrant: string
  artifactRevisionId: string
  artifactDigest: string
  expiresAt: string
}>
export type BuilderSession = Readonly<{
  projectId: string
  latestBuilderRun: BuilderRun | null
  latestCodeChangingRun: Readonly<{
    baseSourceRevision: string
    resultSourceRevision: string
    resultKind: Exclude<BuilderRunResultKind, 'RESPONSE_ONLY'>
  }> | null
  preview: Readonly<{
    workingSourceRevision: string | null
    lastGoodSourceRevision: string | null
    lastGoodArtifactRevisionId: string | null
    lastGoodArtifactDigest: string | null
  }>
  runHistory?: readonly BuilderRun[]
}>
export type BuilderRun = Readonly<{
  builderRunId: string
  projectId: string
  state: BuilderRunState
  phase: BuilderRunPhase | null
  baseSourceRevision: string
  resultSourceRevision: string | null
  resultKind: BuilderRunResultKind | null
  failureCode: string | null
  requestText: string | null
  createdAt: string
  conversationId: string
  cancellationRequested?: boolean
  /** The calls the run's live session waits on while the run waits on the person. */
  pendingCalls?: readonly string[]
}>
export type BuilderMessageAccepted = Readonly<{ builderRun: BuilderRun }>
type BuilderTraceUsage = Readonly<{ inputTokens: number | null; outputTokens: number | null; totalTokens: number | null }>
type BuilderTraceSpan = Readonly<{
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
type BuilderTraceScore = Readonly<{ scorer: string; score: number; reason: string | null }>
export type BuilderTraceSummary = Readonly<{
  available: boolean
  traceId: string | null
  spans: readonly BuilderTraceSpan[]
  usage: BuilderTraceUsage | null
  modelCalls: number
  toolCalls: number
  scores: readonly BuilderTraceScore[]
}>

const request = (url: string, init: RequestInit = {}, expected: Parameters<typeof hubCall>[1] = 'ok'): Promise<Response> => hubCall(hubFetch(url, init), expected)
const sourceBase = (projectId: string) => `/api/control/projects/${encodeURIComponent(projectId)}/source`
const sessionBase = (projectId: string) => `/api/control/projects/${encodeURIComponent(projectId)}/builder-session`

export const getBuilderSession = async (projectId: string): Promise<BuilderSession> => {
  const response = await request(sessionBase(projectId))
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  return response.json() as Promise<BuilderSession>
}
export const sendBuilderMessage = async (
  projectId: string, conversationId: string, content: string, idempotencyKey: string,
): Promise<BuilderMessageAccepted> => {
  const response = await request(`${sessionBase(projectId)}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
    body: JSON.stringify({ content, conversationId }),
  }, [200, 201])
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  return response.json() as Promise<BuilderMessageAccepted>
}
export const listProjectSourceTree = async (projectId: string, sourceRevision: string): Promise<SourceTree> => {
  const query = new URLSearchParams({ sourceRevision })
  const response = await request(`${sourceBase(projectId)}/tree?${query}`)
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  return response.json() as Promise<SourceTree>
}
export const getProjectSourceFile = async (projectId: string, sourceRevision: string, path: string): Promise<SourceFile> => {
  const query = new URLSearchParams({ sourceRevision, path })
  const response = await request(`${sourceBase(projectId)}/file?${query}`)
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  return response.json() as Promise<SourceFile>
}
export type SourceChange = Readonly<{ path: string; status: 'ADDED' | 'REMOVED' | 'MODIFIED' | 'RENAMED'; previousPath: string | null }>
export type SourceComparison = Readonly<{ baseSourceRevision: string; resultSourceRevision: string; files: readonly SourceChange[] }>
export const compareProjectSource = async (projectId: string, baseSourceRevision: string, resultSourceRevision: string): Promise<SourceComparison> => {
  const query = new URLSearchParams({ baseSourceRevision, resultSourceRevision })
  const response = await request(`${sourceBase(projectId)}/compare?${query}`)
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  return response.json() as Promise<SourceComparison>
}
export const launchBuilderPreview =async (projectId: string): Promise<PreviewLaunch> => {
  const response = await request(`${sessionBase(projectId)}/preview`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  }, 201)
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  return response.json() as Promise<PreviewLaunch>
}

export const cancelBuilderRun = async (projectId: string, builderRunId: string): Promise<BuilderMessageAccepted> => {
  const response = await request(`${sessionBase(projectId)}/runs/${encodeURIComponent(builderRunId)}/cancel`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  })
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  return response.json() as Promise<BuilderMessageAccepted>
}

export const getBuilderRunTrace =async (projectId: string, builderRunId: string): Promise<BuilderTraceSummary> => {
  const response = await request(`${sessionBase(projectId)}/runs/${encodeURIComponent(builderRunId)}/trace`)
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  return response.json() as Promise<BuilderTraceSummary>
}

const RUN_STATES: ReadonlySet<unknown> = new Set(BUILDER_RUN_STATES)
const RUN_PHASES: ReadonlySet<unknown> = new Set([...BUILDER_RUN_PHASES, null])
const RESULT_KINDS: ReadonlySet<unknown> = new Set([...BUILDER_RUN_RESULT_KINDS, null])
const isText = (value: unknown): value is string => typeof value === 'string'
const isTextOrNull = (value: unknown): boolean => value === null || typeof value === 'string'

/**
 * The run the Hub wrote into its session state, as the builder-session read serves it, or null for
 * anything else. Session state is the controller's free-form map, so it is checked here, once.
 */
export const parseRunState = (value: unknown): BuilderRun | null => {
  if (typeof value !== 'object' || value === null) return null
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  const run = value as Record<string, unknown>
  const valid = isText(run.builderRunId) && isText(run.projectId) && isText(run.conversationId) && isText(run.baseSourceRevision) && isText(run.createdAt)
    && RUN_STATES.has(run.state) && RUN_PHASES.has(run.phase) && RESULT_KINDS.has(run.resultKind)
    && isTextOrNull(run.resultSourceRevision) && isTextOrNull(run.failureCode) && isTextOrNull(run.requestText)
    && (run.cancellationRequested === undefined || typeof run.cancellationRequested === 'boolean')
    && (run.pendingCalls === undefined || (Array.isArray(run.pendingCalls) && run.pendingCalls.every(isText)))
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  return valid ? run as BuilderRun : null
}
