import { call, href, query } from '../../app/http'
import { routeParam } from '../../app/route-params'
import {
  createProject as createProjectOperation, deleteProject as deleteProjectOperation,
  ProjectId, listProjects, getProject, listProjectSummaries, getProjectThumbnail, WorkspaceId, type IdempotencyKey,
} from '@conexus/contract'

const noInput = { query: undefined, headers: undefined, body: undefined } as const
const projectParams = (projectId: string) => ({ projectId: routeParam(ProjectId, projectId) })
const workspaceParams = (workspaceId: string) => ({ workspaceId: routeParam(WorkspaceId, workspaceId) })

export const projectsQuery = (workspaceId: string) => query(listProjects, { params: workspaceParams(workspaceId), ...noInput })
export const projectQuery = (projectId: string) => query(getProject, { params: projectParams(projectId), ...noInput })
export const projectSummariesQuery = (workspaceId: string) => query(listProjectSummaries, { params: workspaceParams(workspaceId), ...noInput })

export const createProject = (workspaceId: string, name: string, idempotencyKey: IdempotencyKey) => call(createProjectOperation, {
  params: workspaceParams(workspaceId),
  query: undefined,
  headers: { 'idempotency-key': idempotencyKey },
  body: { name, sourceBootstrap: { mode: 'NEW' } },
})

export const deleteProject = (projectId: string, confirmName: string) => call(deleteProjectOperation, {
  params: projectParams(projectId), query: { confirmName }, headers: undefined, body: undefined,
})

export const projectThumbnailUrl = (projectId: string) => href(getProjectThumbnail, { params: projectParams(projectId), ...noInput })
