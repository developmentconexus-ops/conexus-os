import { clearAuthorityCache } from '../../app/query-client'

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
export type BuilderSessionMessage = Readonly<{
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  createdAt: string
}>
export type BuilderSession = Readonly<{
  projectId: string
  messages: readonly BuilderSessionMessage[]
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
  modelChoices: readonly BuilderModelChoice[]
  runHistory?: readonly BuilderRun[]
}>
export type BuilderModelChoice = Readonly<{
  choiceId: string
  label: string
  providerId: string
  modelId: string
  capabilities: readonly string[]
}>
export type BuilderRun = Readonly<{
  builderRunId: string
  projectId: string
  state: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'INTERRUPTED'
  mode: 'BUILD' | 'PLAN'
  baseSourceRevision: string
  resultSourceRevision: string | null
  resultKind: 'RESPONSE_ONLY' | 'SOURCE_CHANGED' | 'SOURCE_CHANGED_BUILD_FAILED' | null
  failureCode: string | null
  modelAdmissionId?: string | null
  modelProviderId?: string | null
  modelId?: string | null
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
  projectId: string, content: string, mode: 'BUILD' | 'PLAN', idempotencyKey: string, modelChoiceId?: string,
): Promise<BuilderMessageAccepted> => {
  const response = await request(`${sessionBase(projectId)}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
    body: JSON.stringify({ content, mode, ...(modelChoiceId ? { modelChoiceId } : {}) }),
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
export const launchBuilderPreview = async (projectId: string): Promise<PreviewLaunch> => {
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

export const getBuilderRunTrace = async (projectId: string, builderRunId: string): Promise<BuilderTraceSummary> => {
  const response = await request(`${sessionBase(projectId)}/runs/${encodeURIComponent(builderRunId)}/trace`)
  if (!response.ok) await reject(response)
  return response.json() as Promise<BuilderTraceSummary>
}
