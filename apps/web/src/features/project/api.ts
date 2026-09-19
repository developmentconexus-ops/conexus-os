import { clearAuthorityCache } from '../../app/query-client'
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

export function isProjectAuthenticationRequired(error: unknown): boolean {
  return error instanceof ProjectRequestError && error.status === 401
}
