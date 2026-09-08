import { clearAuthorityCache } from '../../app/query-client'

export type Change = Readonly<{
  changeId: string; projectId: string; intent: string; baselineDigest: string
  planningDepth: 'DIRECT'; rigorProfile: 'CONTROLLED'; state: string
}>
export type ChangeSummary = Pick<Change, 'changeId' | 'projectId' | 'intent' | 'state'>
export type ChangePlan = Readonly<{
  planRevision: string; planningDepth: 'DIRECT'; rigorProfile: 'CONTROLLED'
  items: readonly Readonly<{ itemId: string; summary: string; state: string }>[]
  dependencyEdges: readonly unknown[]; acceptanceLinks: readonly unknown[]
  blockers: readonly string[]; unknowns: readonly string[]; progress: string
}>
export type ChangeProgress = Readonly<{
  planRevision: string; items: readonly Readonly<{ itemId: string; summary: string; state: string }>[]; overallState: string
}>
export type ChangeDiff = Readonly<{ baseSourceRevision: string; candidateSourceRevision: string; patch: string }>
export type SourceTree = Readonly<{
  sourceRevision: string; entries: readonly Readonly<{ path: string; kind: 'FILE' | 'DIRECTORY' }>[]
}>
export type SourceFile = Readonly<{ sourceRevision: string; path: string; content: string }>
export type ChangeFinding = Readonly<{
  findingId: string; changeId: string; findingRevision: string; state: 'OPEN' | 'CLOSED'; summary: string
}>
export type ChangeEvidence = Readonly<{
  evidenceId: string; changeId: string; claim: string; subjectDigest: string
  provenance: readonly string[]
}>

export class BuilderRequestError extends Error {
  constructor(readonly status: number | null) { super(status === null ? 'Builder request did not complete' : `Builder request failed with ${status}`) }
}

const csrf = () => document.cookie.split('; ').find((item) => item.startsWith('__Host-conexus_csrf='))?.split('=').slice(1).join('=')
const request = async (url: string, init: RequestInit = {}): Promise<Response> => {
  try {
    const method = (init.method ?? 'GET').toUpperCase()
    return await fetch(url, {
      ...init, credentials: 'same-origin',
      headers: { ...(init.headers ?? {}), ...(method === 'POST' ? { 'x-conexus-csrf': decodeURIComponent(csrf() ?? '') } : {}) },
    })
  } catch { throw new BuilderRequestError(null) }
}
const reject = (response: Response): never => {
  if (response.status === 401) clearAuthorityCache()
  throw new BuilderRequestError(response.status)
}
const base = (projectId: string) => `/api/control/projects/${encodeURIComponent(projectId)}/changes`
const sourceBase = (projectId: string) => `/api/control/projects/${encodeURIComponent(projectId)}/source`

export const listChanges = async (projectId: string): Promise<ChangeSummary[]> => {
  const response = await request(base(projectId))
  if (!response.ok) reject(response)
  return response.json() as Promise<ChangeSummary[]>
}
export const createChange = async (projectId: string, intent: string, idempotencyKey: string): Promise<Change> => {
  const response = await request(base(projectId), {
    method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey }, body: JSON.stringify({ intent }),
  })
  if (response.status !== 201) reject(response)
  return response.json() as Promise<Change>
}
export const getChange = async (projectId: string, changeId: string): Promise<Change> => {
  const response = await request(`${base(projectId)}/${encodeURIComponent(changeId)}`)
  if (!response.ok) reject(response)
  return response.json() as Promise<Change>
}
export const getChangePlan = async (projectId: string, changeId: string): Promise<ChangePlan> => {
  const response = await request(`${base(projectId)}/${encodeURIComponent(changeId)}/plan`)
  if (!response.ok) reject(response)
  return response.json() as Promise<ChangePlan>
}
export const getChangeProgress = async (projectId: string, changeId: string): Promise<ChangeProgress> => {
  const response = await request(`${base(projectId)}/${encodeURIComponent(changeId)}/progress`)
  if (!response.ok) reject(response)
  return response.json() as Promise<ChangeProgress>
}
export const getChangeDiff = async (projectId: string, changeId: string): Promise<ChangeDiff> => {
  const response = await request(`${base(projectId)}/${encodeURIComponent(changeId)}/diff`)
  if (!response.ok) reject(response)
  return response.json() as Promise<ChangeDiff>
}
export const listProjectSourceTree = async (projectId: string, sourceRevision: string): Promise<SourceTree> => {
  const query = new URLSearchParams({ sourceRevision })
  const response = await request(`${sourceBase(projectId)}/tree?${query}`)
  if (!response.ok) reject(response)
  return response.json() as Promise<SourceTree>
}
export const getProjectSourceFile = async (projectId: string, sourceRevision: string, path: string): Promise<SourceFile> => {
  const query = new URLSearchParams({ sourceRevision, path })
  const response = await request(`${sourceBase(projectId)}/file?${query}`)
  if (!response.ok) reject(response)
  return response.json() as Promise<SourceFile>
}
export const listChangeFindings = async (projectId: string, changeId: string): Promise<ChangeFinding[]> => {
  const response = await request(`${base(projectId)}/${encodeURIComponent(changeId)}/findings`)
  if (!response.ok) reject(response)
  return response.json() as Promise<ChangeFinding[]>
}
export const listChangeEvidence = async (projectId: string, changeId: string): Promise<ChangeEvidence[]> => {
  const response = await request(`${base(projectId)}/${encodeURIComponent(changeId)}/evidence`)
  if (!response.ok) reject(response)
  return response.json() as Promise<ChangeEvidence[]>
}
export const closeChangeFinding = async (
  projectId: string, changeId: string, findingId: string,
  expectedFindingRevision: string, resolutionEvidenceIds: readonly string[],
): Promise<ChangeFinding> => {
  const response = await request(`${base(projectId)}/${encodeURIComponent(changeId)}/findings/${encodeURIComponent(findingId)}/commands/close`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedFindingRevision, resolutionEvidenceIds }),
  })
  if (!response.ok) reject(response)
  return response.json() as Promise<ChangeFinding>
}
