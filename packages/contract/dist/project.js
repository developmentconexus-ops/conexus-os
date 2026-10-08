import { z } from 'zod';
import { BUILDER_RUN_RESULT_KINDS, BUILDER_RUN_STATES } from './builder-run-vocabulary.js';
import { IdempotencyKey, ProjectId, ProjectRevision, WorkspaceId } from './ids.js';
import { operation, SUBJECT_NOT_FOUND } from './operation.js';
export const ProjectName = z.string().min(1).regex(/\S/).meta({ id: 'ProjectName' });
const ProjectIdentity = z.object({
    projectId: ProjectId,
    workspaceId: WorkspaceId,
    name: ProjectName,
});
const ProjectLiveState = z.object({
    state: z.literal('live'),
    projectRevision: ProjectRevision,
    archived: z.boolean(),
});
const ProjectDeletingState = z.object({ state: z.literal('deleting') });
export const ProjectListRow = z.discriminatedUnion('state', [
    ProjectIdentity.extend({ state: z.literal('live'), archived: z.boolean() }),
    ProjectIdentity.extend(ProjectDeletingState.shape),
]).meta({ id: 'ProjectListRow' });
export const ProjectDetail = z.discriminatedUnion('state', [
    ProjectIdentity.extend(ProjectLiveState.shape),
    ProjectIdentity.extend(ProjectDeletingState.shape),
]).meta({ id: 'ProjectDetail' });
export const ProjectCreated = z.object({
    projectId: ProjectId,
    workspaceId: WorkspaceId,
    name: ProjectName,
    projectRevision: ProjectRevision,
    archived: z.literal(false),
}).meta({ id: 'ProjectCreated' });
export const ProjectSourceBootstrap = z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('NEW') }).strict(),
    z.object({ mode: z.literal('EXISTING_GIT'), repositoryLocator: z.string().min(1).regex(/\S/) }).strict(),
]).meta({ id: 'ProjectSourceBootstrap' });
const ProjectCardIdentity = ProjectIdentity.pick({ projectId: true, name: true });
const ProjectActivity = z.object({
    lastActivityAt: z.string(),
    latestRun: z.object({
        state: z.enum(BUILDER_RUN_STATES),
        resultKind: z.enum(BUILDER_RUN_RESULT_KINDS).nullable(),
    }).nullable(),
    hasPreview: z.boolean(),
});
export const ProjectCard = z.discriminatedUnion('state', [
    ProjectCardIdentity.extend({ state: z.literal('live'), archived: z.boolean(), ...ProjectActivity.shape }),
    ProjectCardIdentity.extend(ProjectDeletingState.shape),
]).meta({ id: 'ProjectCard' });
const workspaceParam = z.object({ workspaceId: WorkspaceId });
const projectParam = z.object({ projectId: ProjectId });
export const listProjects = operation({
    id: 'listProjects', summary: 'List the Projects of a Workspace.', access: 'session', method: 'GET', path: '/api/control/workspaces/:workspaceId/projects',
    params: workspaceParam, query: null, headers: null, body: null,
    success: { 200: z.array(ProjectListRow) },
    effects: [], failures: [], malformed: { workspaceId: SUBJECT_NOT_FOUND.workspaceId },
});
export const getProject = operation({
    id: 'getProject', summary: 'Read one Project the Account may open.', access: 'session', method: 'GET', path: '/api/control/projects/:projectId',
    params: projectParam, query: null, headers: null, body: null,
    success: { 200: ProjectDetail },
    effects: [], failures: [], malformed: { projectId: SUBJECT_NOT_FOUND.projectId },
});
export const createProject = operation({
    id: 'createProject', summary: 'Create a Project with its source and initial access, once per idempotency key.', access: 'session', method: 'POST', path: '/api/control/workspaces/:workspaceId/projects',
    params: workspaceParam, query: null,
    headers: z.looseObject({ 'idempotency-key': IdempotencyKey }),
    body: z.object({ name: ProjectName, sourceBootstrap: ProjectSourceBootstrap }).strict(),
    success: { 201: ProjectCreated },
    effects: [],
    failures: ['PROJECT_SOURCE_REFUSED', 'PROJECT_REPOSITORY_UNAVAILABLE', 'ACCOUNT_INACTIVE', 'ACCOUNT_NOT_FOUND'],
    malformed: { workspaceId: SUBJECT_NOT_FOUND.workspaceId },
});
export const deleteProject = operation({
    id: 'deleteProject', summary: 'Delete a Project, its data and its repository; Workspace owners only.', access: 'session', method: 'DELETE', path: '/api/control/projects/:projectId',
    params: projectParam, query: z.object({ confirmName: z.string().min(1) }), headers: null, body: null,
    success: { 204: null },
    effects: [],
    failures: ['PROJECT_DELETE_DENIED', 'PROJECT_NAME_MISMATCH', 'PROJECT_BUSY', 'PROJECT_DELETION_INCOMPLETE'],
    malformed: { projectId: SUBJECT_NOT_FOUND.projectId },
});
export const listProjectSummaries = operation({
    id: 'listProjectSummaries', summary: 'List the Projects of a Workspace with their latest Builder activity and whether a Preview exists.', access: 'session', method: 'GET', path: '/api/control/workspaces/:workspaceId/project-summaries',
    params: workspaceParam, query: null, headers: null, body: null,
    success: { 200: z.object({ projects: z.array(ProjectCard) }) },
    effects: [], failures: [], malformed: { workspaceId: SUBJECT_NOT_FOUND.workspaceId },
});
export const getProjectThumbnail = operation({
    id: 'getProjectThumbnail', summary: 'Read the captured thumbnail of a Project application, as an image.', access: 'session', method: 'GET', path: '/api/control/projects/:projectId/thumbnail',
    params: projectParam, query: null, headers: null, body: null,
    success: { 200: { mediaType: 'image/png', maxBytes: 512_000, cache: 'revalidate-private' } },
    effects: [], failures: ['PROJECT_THUMBNAIL_NOT_FOUND'], malformed: { projectId: SUBJECT_NOT_FOUND.projectId },
});
