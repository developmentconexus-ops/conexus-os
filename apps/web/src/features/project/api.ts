import { hubCall } from '../../app/http'
import type {
  CreateProjectInput,
  CreateProjectResponse,
  ProjectRepresentation,
  ProjectSummary,
} from '../../generated/project-client'
import { projectClient } from '../../generated/project-client'
import type { BuilderRunResultKind, BuilderRunState } from '../../generated/builder-run-vocabulary'

export const projectListQueryKey = (workspaceId: string) => ['projects', workspaceId] as const
export const projectQueryKey = (projectId: string) => ['project', projectId] as const

export async function listProjects(workspaceId: string): Promise<ProjectSummary[]> {
  const response = await hubCall(projectClient.listProjects(workspaceId))
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  return response.json() as Promise<ProjectSummary[]>
}

export type ProjectCardSummary = Readonly<{
  projectId: string
  name: string
  archived: boolean
  lastActivityAt: string
  latestRun: Readonly<{ state: BuilderRunState; resultKind: BuilderRunResultKind | null }> | null
  hasPreview: boolean
  deleting: boolean
}>
export const projectSummariesQueryKey = (workspaceId: string) => ['project-summaries', workspaceId] as const

const getJson = async <T>(url: string): Promise<T> => {
  // biome-ignore lint/style/noRestrictedGlobals: debt: owning wave
  const response = await hubCall(fetch(url, { credentials: 'same-origin' }))
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  return response.json() as Promise<T>
}

export const listProjectSummaries = async (workspaceId: string): Promise<readonly ProjectCardSummary[]> =>
  (await getJson<{ projects: ProjectCardSummary[] }>(`/api/control/workspaces/${encodeURIComponent(workspaceId)}/project-summaries`)).projects

export async function getProject(projectId: string): Promise<ProjectRepresentation> {
  const response = await hubCall(projectClient.getProject(projectId))
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  return response.json() as Promise<ProjectRepresentation>
}

export async function createProject(
  workspaceId: string,
  input: CreateProjectInput,
  idempotencyKey: string,
): Promise<CreateProjectResponse> {
  const response = await hubCall(projectClient.createProject(workspaceId, input, idempotencyKey), 201)
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  return response.json() as Promise<CreateProjectResponse>
}

export async function deleteProject(projectId: string, confirmName: string): Promise<void> {
  await hubCall(projectClient.deleteProject(projectId, confirmName), 204)
}

export const projectThumbnailUrl = (projectId: string) => `/api/control/projects/${encodeURIComponent(projectId)}/thumbnail`
