import type { WorkspaceRole } from '@conexus/contract'
import type { ProjectAction, WorkspaceAction } from './types.js'
export const SUBJECT_NOT_FOUND = { workspaceId: 'WORKSPACE_NOT_FOUND', projectId: 'PROJECT_NOT_FOUND' } as const
export type SubjectParam = keyof typeof SUBJECT_NOT_FOUND
export type Malformed<P extends SubjectParam> = { readonly [K in P]: (typeof SUBJECT_NOT_FOUND)[K] }
export type ForbiddenCode = 'MEMBERS_MANAGE_REQUIRED' | 'CONNECTOR_BINDING_MANAGE_REQUIRED' | 'APPLICATION_ACCESS_MANAGE_REQUIRED' | 'PROJECT_DELETE_DENIED'
export type RoleCells = { readonly [R in WorkspaceRole]: 'ALLOWED' | ForbiddenCode }
type WorkspaceRule = Readonly<{ on: 'workspace'; roles: RoleCells }>
type ProjectRule = Readonly<{ on: 'project'; roles: RoleCells; whileDeleting: 'allowed' | 'refused' }>
type Catalog = { readonly [A in WorkspaceAction]: WorkspaceRule } & { readonly [A in ProjectAction]: ProjectRule }
export const ACTIONS = {
  'workspace.read': { on: 'workspace', roles: { owner: 'ALLOWED', member: 'ALLOWED' } },
  'members.manage': { on: 'workspace', roles: { owner: 'ALLOWED', member: 'MEMBERS_MANAGE_REQUIRED' } },
  'members.leave': { on: 'workspace', roles: { owner: 'ALLOWED', member: 'ALLOWED' } },
  'project.create': { on: 'workspace', roles: { owner: 'ALLOWED', member: 'ALLOWED' } },
  'project.read': { on: 'project', roles: { owner: 'ALLOWED', member: 'ALLOWED' }, whileDeleting: 'allowed' },
  'project.build': { on: 'project', roles: { owner: 'ALLOWED', member: 'ALLOWED' }, whileDeleting: 'refused' },
  'connections.bind': { on: 'project', roles: { owner: 'ALLOWED', member: 'CONNECTOR_BINDING_MANAGE_REQUIRED' }, whileDeleting: 'refused' },
  'application.manage': { on: 'project', roles: { owner: 'ALLOWED', member: 'APPLICATION_ACCESS_MANAGE_REQUIRED' }, whileDeleting: 'refused' },
  'project.delete': { on: 'project', roles: { owner: 'ALLOWED', member: 'PROJECT_DELETE_DENIED' }, whileDeleting: 'allowed' },
} as const satisfies Catalog
