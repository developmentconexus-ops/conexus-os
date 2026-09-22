import { clearAuthorityCache } from '../../app/query-client'
import type { BuilderFailureCategory } from './failure-reasons'
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
  mode: 'BUILD' | 'PLAN'
  runHistory?: readonly BuilderRun[]
}>
export type BuilderRun = Readonly<{
  builderRunId: string
  projectId: string
  state: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'INTERRUPTED'
  phase: 'PREPARING' | 'AGENT' | 'SOURCE_ADMISSION' | 'COMPILING' | 'FINALIZING' | null
  mode: 'BUILD' | 'PLAN'
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
export type BuilderTraceSummary = Readonly<{
  available: boolean
  traceId: string | null
  spans: readonly Readonly<{ spanType: string; name: string; startedAt: string; durationMs: number | null; error: boolean }>[]
}>

export class BuilderRequestError extends Error {
  constructor(readonly status: number | null, readonly problemType: string | null = null) {
    super(status === null ? 'Builder request did not complete' : `Builder request failed with ${status}`)
  }
}

const csrf = () => document.cookie.split('; ').find((item) => item.startsWith('__Host-conexus_csrf='))?.split('=').slice(1).join('=')
const request = async (url: string, init: RequestInit = {}): Promise<Response> => {
  try {
    const method = (init.method ?? 'GET').toUpperCase()
    return await fetch(url, {
      ...init,
      credentials: 'same-origin',
      headers: { ...(init.headers ?? {}), ...(method === 'POST' ? { 'x-conexus-csrf': decodeURIComponent(csrf() ?? '') } : {}) },
    })
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
  projectId: string, conversationId: string, content: string, mode: 'BUILD' | 'PLAN', idempotencyKey: string,
): Promise<BuilderMessageAccepted> => {
  const response = await request(`${sessionBase(projectId)}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
    body: JSON.stringify({ content, mode, conversationId }),
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

type FactoryConversation = Readonly<{ conversationId: string; title: string | null; createdAt: string }>
const conversationsUrl = (projectId: string) => `/api/control/projects/${encodeURIComponent(projectId)}/conversations`
const asConversation = (entry: FactoryConversation) => ({ id: entry.conversationId, title: entry.title })

export const listFactoryConversations = async (projectId: string): Promise<readonly Readonly<{ id: string; title: string | null }>[]> => {
  const response = await request(conversationsUrl(projectId))
  if (!response.ok) await reject(response)
  return ((await response.json()) as { conversations: readonly FactoryConversation[] }).conversations.map(asConversation)
}

// The browser chooses the id, so a retry of a lost response lands on the row the first attempt wrote.
export const createFactoryConversation = async (projectId: string, conversationId: string): Promise<Readonly<{ id: string; title: string | null }>> => {
  const response = await request(conversationsUrl(projectId), {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conversationId }),
  })
  if (response.status !== 201 && response.status !== 200) await reject(response)
  return asConversation(((await response.json()) as { conversation: FactoryConversation }).conversation)
}

export const getBuilderRunTrace =async (projectId: string, builderRunId: string): Promise<BuilderTraceSummary> => {
  const response = await request(`${sessionBase(projectId)}/runs/${encodeURIComponent(builderRunId)}/trace`)
  if (!response.ok) await reject(response)
  return response.json() as Promise<BuilderTraceSummary>
}
