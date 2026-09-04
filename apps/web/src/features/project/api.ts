import { clearAuthorityCache } from '../../app/query-client'
import type {
  AskBaselineCandidateResponse,
  ApprovedBaseline,
  CreateProjectInput,
  CreateProjectResponse,
  ProjectBaselineCandidate,
  ProjectRepresentation,
  ProjectSummary,
  RunInceptionInput,
  RunInceptionResponse,
} from '../../generated/project-client'
import { projectClient } from '../../generated/project-client'

export const projectListQueryKey = (workspaceId: string) => ['projects', workspaceId] as const
export const projectQueryKey = (projectId: string) => ['project', projectId] as const
export const baselineCandidateQueryKey = (projectId: string, digest: string) => ['baseline-candidate', projectId, digest] as const
export const approvedBaselineQueryKey = (projectId: string) => ['approved-baseline', projectId] as const

export class ProjectRequestError extends Error {
  constructor(readonly status: number | null) {
    super(status === null ? 'Project request did not complete' : `Project request failed with ${status}`)
  }
}

function reject(response: Response): never {
  if (response.status === 401) clearAuthorityCache()
  throw new ProjectRequestError(response.status)
}

async function responseFrom(request: Promise<Response>): Promise<Response> {
  try {
    return await request
  } catch {
    throw new ProjectRequestError(null)
  }
}

export async function listProjects(workspaceId: string): Promise<ProjectSummary[]> {
  const response = await responseFrom(projectClient.listProjects(workspaceId))
  if (!response.ok) reject(response)
  return response.json() as Promise<ProjectSummary[]>
}

export async function getProject(projectId: string): Promise<ProjectRepresentation> {
  const response = await responseFrom(projectClient.getProject(projectId))
  if (!response.ok) reject(response)
  return response.json() as Promise<ProjectRepresentation>
}

export async function createProject(
  workspaceId: string,
  input: CreateProjectInput,
  idempotencyKey: string,
): Promise<CreateProjectResponse> {
  const response = await responseFrom(projectClient.createProject(workspaceId, input, idempotencyKey))
  if (response.status !== 201) reject(response)
  return response.json() as Promise<CreateProjectResponse>
}

export async function getBaselineCandidate(
  projectId: string,
  candidateBaselineDigest: string,
): Promise<ProjectBaselineCandidate> {
  const response = await responseFrom(projectClient.getBaselineCandidate(projectId, candidateBaselineDigest))
  if (!response.ok) reject(response)
  return response.json() as Promise<ProjectBaselineCandidate>
}

export async function getApprovedBaseline(projectId: string): Promise<ApprovedBaseline> {
  const response = await responseFrom(projectClient.getApprovedBaseline(projectId))
  if (!response.ok) reject(response)
  return response.json() as Promise<ApprovedBaseline>
}

export async function approveBaseline(
  projectId: string,
  candidateBaselineDigest: string,
): Promise<ApprovedBaseline> {
  const response = await responseFrom(projectClient.approveBaseline(projectId, { candidateBaselineDigest }))
  if (!response.ok) reject(response)
  return response.json() as Promise<ApprovedBaseline>
}

export async function askAboutBaselineCandidate(
  projectId: string,
  candidateBaselineDigest: string,
  question: string,
): Promise<AskBaselineCandidateResponse> {
  const response = await responseFrom(projectClient.askAboutBaselineCandidate(
    projectId,
    candidateBaselineDigest,
    { question },
  ))
  if (!response.ok) reject(response)
  const answer = await response.json() as AskBaselineCandidateResponse
  if (answer.candidateBaselineDigest !== candidateBaselineDigest) throw new ProjectRequestError(null)
  return answer
}

export async function runProjectInception(
  projectId: string,
  input: RunInceptionInput,
  idempotencyKey: string,
): Promise<RunInceptionResponse> {
  const response = await responseFrom(projectClient.runInception(projectId, input, idempotencyKey))
  if (!response.ok) reject(response)
  return response.json() as Promise<RunInceptionResponse>
}

export async function refineProjectCandidate(
  projectId: string,
  candidateBaselineDigest: string,
  intent: string,
  reviewFeedback: string,
  idempotencyKey: string,
): Promise<RunInceptionResponse> {
  const candidate = await runProjectInception(projectId, {
    intent,
    priorCandidateBaselineDigest: candidateBaselineDigest,
    reviewFeedback,
  }, idempotencyKey)
  if (candidate.candidateBaselineDigest === candidateBaselineDigest) throw new ProjectRequestError(null)
  return candidate
}

export function isProjectAuthenticationRequired(error: unknown): boolean {
  return error instanceof ProjectRequestError && error.status === 401
}
