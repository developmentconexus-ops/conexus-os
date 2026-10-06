import { z } from 'zod'
import { BUILDER_RUN_RESULT_KINDS, BUILDER_RUN_STATES } from './builder-run-vocabulary.js'
import { IdempotencyKey, ProjectId, ProjectRevision, WorkspaceId } from './ids.js'
import { operation } from './operation.js'

export const ProjectName = z.string().min(1).regex(/\S/).meta({ id: 'ProjectName' })
export type ProjectName = z.output<typeof ProjectName>

export const ProjectListItem = z.object({
  projectId: ProjectId,
  workspaceId: WorkspaceId,
  name: ProjectName,
  archived: z.boolean(),
}).meta({ id: 'ProjectListItem' })
export type ProjectListItem = z.output<typeof ProjectListItem>

const ProjectLive = z.object({
  projectId: ProjectId,
  workspaceId: WorkspaceId,
  name: ProjectName,
  projectRevision: ProjectRevision,
  archived: z.boolean(),
  deleting: z.boolean(),
}).meta({ id: 'ProjectLive' })

// A project an installation administrator is deleting, after its row was purged and before the deletion finished.
const ProjectPurged = z.object({
  projectId: ProjectId,
  workspaceId: WorkspaceId,
  name: ProjectName,
  projectRevision: z.literal(''),
  archived: z.literal(false),
  deleting: z.literal(true),
}).meta({ id: 'ProjectPurged' })

export const ProjectDetail = z.union([ProjectLive, ProjectPurged]).meta({ id: 'ProjectDetail' })
export type ProjectDetail = z.output<typeof ProjectDetail>

export const ProjectCreated = z.object({
  projectId: ProjectId,
  workspaceId: WorkspaceId,
  name: ProjectName,
  projectRevision: ProjectRevision,
  archived: z.literal(false),
}).meta({ id: 'ProjectCreated' })
export type ProjectCreated = z.output<typeof ProjectCreated>

export const ProjectSourceBootstrap = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('NEW') }).strict(),
  z.object({ mode: z.literal('EXISTING_GIT'), repositoryLocator: z.string().min(1).regex(/\S/) }).strict(),
]).meta({ id: 'ProjectSourceBootstrap' })

export const ProjectCard = z.object({
  projectId: ProjectId,
  name: ProjectName,
  archived: z.boolean(),
  lastActivityAt: z.string(),
  latestRun: z.object({
    state: z.enum(BUILDER_RUN_STATES),
    resultKind: z.enum(BUILDER_RUN_RESULT_KINDS).nullable(),
  }).nullable(),
  hasPreview: z.boolean(),
  deleting: z.boolean(),
}).meta({ id: 'ProjectCard' })
export type ProjectCard = z.output<typeof ProjectCard>

const workspaceParam = z.object({ workspaceId: WorkspaceId })
const projectParam = z.object({ projectId: ProjectId })

export const listProjects = operation({
  id: 'listProjects', summary: 'List the Projects of a Workspace.', access: 'session', method: 'GET', path: '/api/control/workspaces/:workspaceId/projects',
  params: workspaceParam, query: null, headers: null, body: null,
  success: { 200: z.array(ProjectListItem) },
  effects: [], failures: [], malformed: { workspaceId: 'WORKSPACE_NOT_FOUND' },
})

export const getProject = operation({
  id: 'getProject', summary: 'Read one Project the Account may open.', access: 'session', method: 'GET', path: '/api/control/projects/:projectId',
  params: projectParam, query: null, headers: null, body: null,
  success: { 200: ProjectDetail },
  effects: [], failures: [], malformed: { projectId: 'PROJECT_NOT_FOUND' },
})

export const createProject = operation({
  id: 'createProject', summary: 'Create a Project with its source and initial access, once per idempotency key.', access: 'session', method: 'POST', path: '/api/control/workspaces/:workspaceId/projects',
  params: workspaceParam, query: null,
  headers: z.looseObject({ 'idempotency-key': IdempotencyKey }),
  body: z.object({ name: ProjectName, sourceBootstrap: ProjectSourceBootstrap }).strict(),
  success: { 201: ProjectCreated },
  effects: [],
  failures: ['PROJECT_CREATE_DENIED', 'PROJECT_SOURCE_REFUSED', 'PROJECT_REPOSITORY_UNAVAILABLE', 'ACCOUNT_INACTIVE', 'ACCOUNT_NOT_FOUND'],
  malformed: { workspaceId: 'WORKSPACE_NOT_FOUND' },
})

export const deleteProject = operation({
  id: 'deleteProject', summary: 'Delete a Project, its data and its repository; installation administrator only.', access: 'session', method: 'DELETE', path: '/api/control/projects/:projectId',
  params: projectParam, query: z.object({ confirmName: z.string().min(1) }), headers: null, body: null,
  success: { 204: null },
  effects: [],
  failures: ['PROJECT_DELETE_DENIED', 'PROJECT_NAME_MISMATCH', 'PROJECT_BUSY', 'PROJECT_DELETION_INCOMPLETE'],
  malformed: { projectId: 'PROJECT_NOT_FOUND' },
})

export const listProjectSummaries = operation({
  id: 'listProjectSummaries', summary: 'List the Projects of a Workspace with their latest Builder activity and whether a Preview exists.', access: 'session', method: 'GET', path: '/api/control/workspaces/:workspaceId/project-summaries',
  params: workspaceParam, query: null, headers: null, body: null,
  success: { 200: z.object({ projects: z.array(ProjectCard) }) },
  effects: [], failures: ['PROJECT_SUMMARIES_UNAVAILABLE'], malformed: { workspaceId: 'WORKSPACE_NOT_FOUND' },
})

export const getProjectThumbnail = operation({
  id: 'getProjectThumbnail', summary: 'Read the captured thumbnail of a Project application, as an image.', access: 'session', method: 'GET', path: '/api/control/projects/:projectId/thumbnail',
  params: projectParam, query: null, headers: null, body: null,
  success: { 200: { mediaType: 'image/png', maxBytes: 512_000, cache: 'revalidate-private' } },
  effects: [], failures: ['PROJECT_THUMBNAIL_NOT_FOUND', 'PROJECT_THUMBNAIL_UNAVAILABLE'], malformed: { projectId: 'PROJECT_NOT_FOUND' },
})
