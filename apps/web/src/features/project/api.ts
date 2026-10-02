import { clearAuthorityCache } from '../../app/query-client'
import { deleteFailureMessage } from './delete-problem'
import type {
  CreateProjectInput,
  CreateProjectResponse,
  ProjectRepresentation,
  ProjectSummary,
} from '../../generated/project-client'
import { projectClient } from '../../generated/project-client'

export const projectListQueryKey = (workspaceId: string) => ['projects', workspaceId] as const
export const projectQueryKey = (projectId: string) => ['project', projectId] as const

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

type ProjectRunState = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'INTERRUPTED'
export type ProjectCardSummary = Readonly<{
  projectId: string
  name: string
  archived: boolean
  lastActivityAt: string
  latestRun: Readonly<{ state: ProjectRunState; resultKind: 'RESPONSE_ONLY' | 'SOURCE_CHANGED' | 'SOURCE_CHANGED_BUILD_FAILED' | null }> | null
  hasPreview: boolean
  deleting: boolean
}>
export const projectSummariesQueryKey = (workspaceId: string) => ['project-summaries', workspaceId] as const

const getJson = async <T>(url: string): Promise<T> => {
  const response = await responseFrom(fetch(url, { credentials: 'same-origin' }))
  if (!response.ok) reject(response)
  return response.json() as Promise<T>
}

export const listProjectSummaries = async (workspaceId: string): Promise<readonly ProjectCardSummary[]> =>
  (await getJson<{ projects: ProjectCardSummary[] }>(`/api/control/workspaces/${encodeURIComponent(workspaceId)}/project-summaries`)).projects

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

class ProjectDeleteError extends Error {
  constructor(readonly status: number, readonly type: string | null = null) {
    super(`Project deletion failed with ${status}`)
  }
}

export async function deleteProject(projectId: string, confirmName: string): Promise<void> {
  const response = await responseFrom(projectClient.deleteProject(projectId, confirmName))
  if (response.status === 204) return
  if (response.status === 401) clearAuthorityCache()
  const problem = await response.json().catch(() => null) as { type?: string } | null
  throw new ProjectDeleteError(response.status, problem?.type ?? null)
}

export function projectDeleteMessage(error: unknown): string {
  if (!(error instanceof ProjectDeleteError)) return 'O servidor não respondeu desta vez. Nada foi excluído.'
  return deleteFailureMessage(error.status, error.type)
}

export const projectThumbnailUrl = (projectId: string) => `/api/control/projects/${encodeURIComponent(projectId)}/thumbnail`
