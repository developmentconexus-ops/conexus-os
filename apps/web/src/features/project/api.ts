import { call, href, query } from '../../app/http'
import { routeParam } from '../../app/route-params'
import {
  ProjectId, PRJ01, PRJ02, PRJ03, PRJ04, PRJ_SUMMARIES, PRJ_THUMBNAIL, WorkspaceId, type IdempotencyKey,
} from '../../../../../packages/contract/dist/index.js'

const noInput = { query: undefined, headers: undefined, body: undefined } as const
const projectParams = (projectId: string) => ({ projectId: routeParam(ProjectId, projectId) })
const workspaceParams = (workspaceId: string) => ({ workspaceId: routeParam(WorkspaceId, workspaceId) })

export const projectsQuery = (workspaceId: string) => query(PRJ01, { params: workspaceParams(workspaceId), ...noInput })
export const projectQuery = (projectId: string) => query(PRJ02, { params: projectParams(projectId), ...noInput })
export const projectSummariesQuery = (workspaceId: string) => query(PRJ_SUMMARIES, { params: workspaceParams(workspaceId), ...noInput })

export const createProject = (workspaceId: string, name: string, idempotencyKey: IdempotencyKey) => call(PRJ03, {
  params: workspaceParams(workspaceId),
  query: undefined,
  headers: { 'idempotency-key': idempotencyKey },
  body: { name, sourceBootstrap: { mode: 'NEW' } },
})

export const deleteProject = (projectId: string, confirmName: string) => call(PRJ04, {
  params: projectParams(projectId), query: { confirmName }, headers: undefined, body: undefined,
})

export const projectThumbnailUrl = (projectId: string) => href(PRJ_THUMBNAIL, { params: projectParams(projectId), ...noInput })
