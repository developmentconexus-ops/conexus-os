import { hubFetch } from '../../app/http'
import { clearAuthorityCache } from '../../app/query-client'
import { type BuilderFailureCategory, isBuilderFailureCategory } from './failure-reasons'
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
    resultKind: 'SOURCE_CHANGED' | 'SOURCE_CHANGED_BUILD_FAILED'
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
  state: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'INTERRUPTED'
  phase: 'PREPARING' | 'AGENT' | 'PARKED' | 'SOURCE_ADMISSION' | 'COMPILING' | 'FINALIZING' | null
  baseSourceRevision: string
  resultSourceRevision: string | null
  resultKind: 'RESPONSE_ONLY' | 'SOURCE_CHANGED' | 'SOURCE_CHANGED_BUILD_FAILED' | null
  failureCode: string | null
  failureCategory: BuilderFailureCategory | null
  requestText: string | null
  createdAt: string
  conversationId: string
  cancellationRequested?: boolean
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

export class BuilderRequestError extends Error {
  constructor(readonly status: number | null, readonly problemType: string | null = null) {
    super(status === null ? 'Builder request did not complete' : `Builder request failed with ${status}`)
  }
}

const request = async (url: string, init: RequestInit = {}): Promise<Response> => {
  try {
    return await hubFetch(url, init)
  } catch {
    throw new BuilderRequestError(null)
  }
}
const readProblemType = async (response: Response): Promise<string | null> => {
  const body: unknown = await response.json().catch(() => null)
  if (typeof body !== 'object' || body === null || !('type' in body) || typeof body.type !== 'string') return null
  return body.type
}

const reject = async (response: Response): Promise<never> => {
  if (response.status === 401) clearAuthorityCache()
  throw new BuilderRequestError(response.status, await readProblemType(response))
}
const sourceBase = (projectId: string) => `/api/control/projects/${encodeURIComponent(projectId)}/source`
const sessionBase = (projectId: string) => `/api/control/projects/${encodeURIComponent(projectId)}/builder-session`

export const getBuilderSession = async (projectId: string): Promise<BuilderSession> => {
  const response = await request(sessionBase(projectId))
  if (!response.ok) await reject(response)
  return response.json() as Promise<BuilderSession>
}
export const sendBuilderMessage = async (
  projectId: string, conversationId: string, content: string, idempotencyKey: string,
): Promise<BuilderMessageAccepted> => {
  const response = await request(`${sessionBase(projectId)}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
    body: JSON.stringify({ content, conversationId }),
  })
  if (response.status !== 201) await reject(response)
  return response.json() as Promise<BuilderMessageAccepted>
}
export const listProjectSourceTree = async (projectId: string, sourceRevision: string): Promise<SourceTree> => {
  const query = new URLSearchParams({ sourceRevision })
  const response = await request(`${sourceBase(projectId)}/tree?${query}`)
  if (!response.ok) await reject(response)
  return response.json() as Promise<SourceTree>
}
export const getProjectSourceFile = async (projectId: string, sourceRevision: string, path: string): Promise<SourceFile> => {
  const query = new URLSearchParams({ sourceRevision, path })
  const response = await request(`${sourceBase(projectId)}/file?${query}`)
  if (!response.ok) await reject(response)
  return response.json() as Promise<SourceFile>
}
export type SourceChange = Readonly<{ path: string; status: 'ADDED' | 'REMOVED' | 'MODIFIED' | 'RENAMED'; previousPath: string | null }>
export type SourceComparison = Readonly<{ baseSourceRevision: string; resultSourceRevision: string; files: readonly SourceChange[] }>
export const compareProjectSource = async (projectId: string, baseSourceRevision: string, resultSourceRevision: string): Promise<SourceComparison> => {
  const query = new URLSearchParams({ baseSourceRevision, resultSourceRevision })
  const response = await request(`${sourceBase(projectId)}/compare?${query}`)
  if (!response.ok) await reject(response)
  return response.json() as Promise<SourceComparison>
}
export const launchBuilderPreview =async (projectId: string): Promise<PreviewLaunch> => {
  const response = await request(`${sessionBase(projectId)}/preview`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  })
  if (response.status !== 201) await reject(response)
  return response.json() as Promise<PreviewLaunch>
}

export const cancelBuilderRun = async (projectId: string, builderRunId: string): Promise<BuilderMessageAccepted> => {
  const response = await request(`${sessionBase(projectId)}/runs/${encodeURIComponent(builderRunId)}/cancel`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  })
  if (!response.ok) await reject(response)
  return response.json() as Promise<BuilderMessageAccepted>
}

export const getBuilderRunTrace =async (projectId: string, builderRunId: string): Promise<BuilderTraceSummary> => {
  const response = await request(`${sessionBase(projectId)}/runs/${encodeURIComponent(builderRunId)}/trace`)
  if (!response.ok) await reject(response)
  return response.json() as Promise<BuilderTraceSummary>
}

const RUN_STATES: ReadonlySet<unknown> = new Set(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'INTERRUPTED'])
const RUN_PHASES: ReadonlySet<unknown> = new Set(['PREPARING', 'AGENT', 'PARKED', 'SOURCE_ADMISSION', 'COMPILING', 'FINALIZING', null])
const RESULT_KINDS: ReadonlySet<unknown> = new Set(['RESPONSE_ONLY', 'SOURCE_CHANGED', 'SOURCE_CHANGED_BUILD_FAILED', null])
const isText = (value: unknown): value is string => typeof value === 'string'
const isTextOrNull = (value: unknown): boolean => value === null || typeof value === 'string'

/**
 * The run the Hub wrote into its session state, as the builder-session read serves it, or null for
 * anything else. Session state is the controller's free-form map, so it is checked here, once.
 */
export const parseRunState = (value: unknown): BuilderRun | null => {
  if (typeof value !== 'object' || value === null) return null
  const run = value as Record<string, unknown>
  const valid = isText(run.builderRunId) && isText(run.projectId) && isText(run.conversationId) && isText(run.baseSourceRevision) && isText(run.createdAt)
    && RUN_STATES.has(run.state) && RUN_PHASES.has(run.phase) && RESULT_KINDS.has(run.resultKind)
    && isTextOrNull(run.resultSourceRevision) && isTextOrNull(run.failureCode) && (run.failureCategory === null || isBuilderFailureCategory(run.failureCategory)) && isTextOrNull(run.requestText)
    && (run.cancellationRequested === undefined || typeof run.cancellationRequested === 'boolean')
  return valid ? run as BuilderRun : null
}
