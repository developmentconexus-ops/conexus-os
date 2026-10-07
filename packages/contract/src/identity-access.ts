import { z } from 'zod'
import type { FailureCode } from './failures.generated.js'
import { AccountId, GrantId, IdempotencyKey, InvitationId, ProjectId, WorkspaceId } from './ids.js'
import { operation } from './operation.js'
import { WorkspaceName } from './workspace.js'

/** The one parse of an email the Hub accepts: trimmed and lowercased, so a Workspace and an email name one invitation. */
export const EmailAddress = z.string().trim().toLowerCase().pipe(z.email()).brand<'EmailAddress'>()
export type EmailAddress = z.output<typeof EmailAddress>

export const DisplayName = z.string().min(1).regex(/\S/).meta({ id: 'DisplayName' })
export const WorkspaceRole = z.enum(['owner', 'member']).meta({ id: 'WorkspaceRole' })
export type WorkspaceRole = z.output<typeof WorkspaceRole>
export const InvitationState = z.enum(['PENDING', 'EXPIRED']).meta({ id: 'InvitationState' })
export type InvitationState = z.output<typeof InvitationState>

export const AccountSummary = z.object({ accountId: AccountId, displayName: DisplayName }).meta({ id: 'AccountSummary' })
export type AccountSummary = z.output<typeof AccountSummary>

/** The signed in person's own account, with the email of their latest verified sign in. */
export const SessionAccount = z.object({ accountId: AccountId, displayName: DisplayName, email: EmailAddress.optional() }).meta({ id: 'SessionAccount' })
export type SessionAccount = z.output<typeof SessionAccount>

export const Session = z.object({
  account: SessionAccount,
  administrator: z.boolean(),
  workspaces: z.array(z.object({ workspaceId: WorkspaceId, name: WorkspaceName })),
}).meta({ id: 'Session' })
export type Session = z.output<typeof Session>

export const WorkspaceMemberEntry = z.object({
  kind: z.literal('member'),
  accountId: AccountId,
  displayName: DisplayName,
  email: EmailAddress.optional(),
  role: WorkspaceRole,
  since: z.iso.datetime(),
}).meta({ id: 'WorkspaceMemberEntry' })
export type WorkspaceMemberEntry = z.output<typeof WorkspaceMemberEntry>

export const WorkspaceInvitationEntry = z.object({
  kind: z.literal('invitation'),
  invitationId: InvitationId,
  email: EmailAddress,
  role: WorkspaceRole,
  invitedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  state: InvitationState,
}).meta({ id: 'WorkspaceInvitationEntry' })
export type WorkspaceInvitationEntry = z.output<typeof WorkspaceInvitationEntry>

export const WorkspaceRoster = z.object({
  viewerRole: WorkspaceRole,
  entries: z.array(z.discriminatedUnion('kind', [WorkspaceMemberEntry, WorkspaceInvitationEntry])),
}).meta({ id: 'WorkspaceRoster' })
export type WorkspaceRoster = z.output<typeof WorkspaceRoster>

export const ApplicationGrantEntry = z.object({
  kind: z.literal('grant'),
  grantId: GrantId,
  accountId: AccountId,
  displayName: DisplayName,
  email: EmailAddress.optional(),
  grantedAt: z.iso.datetime(),
}).meta({ id: 'ApplicationGrantEntry' })
export type ApplicationGrantEntry = z.output<typeof ApplicationGrantEntry>

export const ApplicationInvitationEntry = z.object({
  kind: z.literal('invitation'),
  invitationId: InvitationId,
  email: EmailAddress,
  invitedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  state: InvitationState,
}).meta({ id: 'ApplicationInvitationEntry' })
export type ApplicationInvitationEntry = z.output<typeof ApplicationInvitationEntry>

export const ApplicationAccess = z.object({
  address: z.url().optional(),
  entries: z.array(z.discriminatedUnion('kind', [ApplicationGrantEntry, ApplicationInvitationEntry])),
}).meta({ id: 'ApplicationAccess' })
export type ApplicationAccess = z.output<typeof ApplicationAccess>

const administratorFields = { accountId: AccountId, displayName: DisplayName, email: EmailAddress.optional(), grantedAt: z.iso.datetime() }
export const AdministratorEntry = z.discriminatedUnion('grantedVia', [
  z.object({ ...administratorFields, grantedVia: z.literal('OPERATOR_BOOTSTRAP') }),
  z.object({ ...administratorFields, grantedVia: z.literal('ADMINISTRATOR'), grantedBy: AccountSummary }),
]).meta({ id: 'AdministratorEntry' })
export type AdministratorEntry = z.output<typeof AdministratorEntry>

/** Why the Hub's no access page says a person cannot enter; each is a failure row with its text. */
export const HUB_NO_ACCESS_REASONS = ['SIGN_IN_EXPIRED', 'SIGN_IN_FAILED', 'IDENTITY_EMAIL_NOT_VERIFIED', 'IDENTITY_NOT_ELIGIBLE', 'ACCOUNT_INACTIVE'] as const satisfies readonly FailureCode[]
export const HubNoAccessReason = z.enum(HUB_NO_ACCESS_REASONS).meta({ id: 'HubNoAccessReason' })
export type HubNoAccessReason = z.output<typeof HubNoAccessReason>

/** The `reason` query values of an application's no access page. */
export const ApplicationNoAccessReason = z.enum(['EMAIL_NOT_VERIFIED', 'NOT_GRANTED', 'SIGN_IN_FAILED']).meta({ id: 'ApplicationNoAccessReason' })
export type ApplicationNoAccessReason = z.output<typeof ApplicationNoAccessReason>
/** The failure row whose text each application no access reason shows. */
export const APPLICATION_NO_ACCESS_TEXT = {
  EMAIL_NOT_VERIFIED: 'APPLICATION_EMAIL_NOT_VERIFIED',
  NOT_GRANTED: 'APPLICATION_NO_ACCESS',
  SIGN_IN_FAILED: 'APPLICATION_SIGN_IN_FAILED',
} as const satisfies Record<ApplicationNoAccessReason, FailureCode>

const keyed = z.looseObject({ 'idempotency-key': IdempotencyKey })
const workspaceParam = z.object({ workspaceId: WorkspaceId })
const projectParam = z.object({ projectId: ProjectId })

export const getSession = operation({
  id: 'getSession', summary: 'Read the signed in account, whether it administers the installation, and its Workspaces.', access: 'session', method: 'GET', path: '/api/session',
  params: null, query: null, headers: null, body: null,
  success: { 200: Session },
  effects: [], failures: ['IDENTITY_PROVIDER_UNAVAILABLE'], malformed: null,
})

export const endSession = operation({
  id: 'endSession', summary: 'End the Hub session of this browser, its Previews with it, and ask Keycloak to end its own.', access: 'sign-out', method: 'DELETE', path: '/api/session',
  params: null, query: null, headers: null, body: null,
  success: { 204: null },
  effects: ['clear-session-cookie'], failures: [], malformed: null,
})

export const getWorkspaceRoster = operation({
  id: 'getWorkspaceRoster', summary: 'Read the members and the invitations of a Workspace, and the reader\'s own role.', access: 'session', method: 'GET', path: '/api/control/workspaces/:workspaceId/roster',
  params: workspaceParam, query: null, headers: null, body: null,
  success: { 200: WorkspaceRoster },
  effects: [], failures: [], malformed: { workspaceId: 'WORKSPACE_NOT_FOUND' },
})

export const inviteWorkspaceMember = operation({
  id: 'inviteWorkspaceMember', summary: 'Invite an email into a Workspace with a role; the pair is the natural key, so a new invitation of the same email refreshes it and answers 200; a new one answers 201. Owner only.', access: 'session', method: 'POST', path: '/api/control/workspaces/:workspaceId/invitations',
  params: workspaceParam, query: null, headers: keyed,
  body: z.object({ email: EmailAddress, role: WorkspaceRole }).strict(),
  success: { 200: WorkspaceInvitationEntry, 201: WorkspaceInvitationEntry },
  effects: [], failures: ['MEMBERS_MANAGE_REQUIRED', 'ACCOUNT_INACTIVE', 'ACCOUNT_NOT_FOUND'],
  malformed: { workspaceId: 'WORKSPACE_NOT_FOUND', email: 'EMAIL_INVALID' },
})

export const removeWorkspaceMember = operation({
  id: 'removeWorkspaceMember', summary: 'Remove a member from a Workspace, which withdraws every right the membership gave. An owner removes anyone; a member removes only themselves.', access: 'session', method: 'DELETE', path: '/api/control/workspaces/:workspaceId/members/:accountId',
  params: z.object({ workspaceId: WorkspaceId, accountId: AccountId }), query: null, headers: null, body: null,
  success: { 204: null },
  effects: [], failures: ['MEMBERS_MANAGE_REQUIRED', 'LAST_OWNER', 'ACCOUNT_INACTIVE', 'ACCOUNT_NOT_FOUND'],
  malformed: { workspaceId: 'WORKSPACE_NOT_FOUND', accountId: 'ROSTER_ENTRY_NOT_FOUND' },
})

export const cancelWorkspaceInvitation = operation({
  id: 'cancelWorkspaceInvitation', summary: 'Cancel an invitation into a Workspace that nobody has claimed. Owner only.', access: 'session', method: 'DELETE', path: '/api/control/workspaces/:workspaceId/invitations/:invitationId',
  params: z.object({ workspaceId: WorkspaceId, invitationId: InvitationId }), query: null, headers: null, body: null,
  success: { 204: null },
  effects: [], failures: ['MEMBERS_MANAGE_REQUIRED', 'ACCOUNT_INACTIVE', 'ACCOUNT_NOT_FOUND'],
  malformed: { workspaceId: 'WORKSPACE_NOT_FOUND', invitationId: 'ROSTER_ENTRY_NOT_FOUND' },
})

export const setWorkspaceMemberRole = operation({
  id: 'setWorkspaceMemberRole', summary: 'Set the role of a member of a Workspace; the Workspace keeps at least one owner. Owner only.', access: 'session', method: 'PUT', path: '/api/control/workspaces/:workspaceId/members/:accountId',
  params: z.object({ workspaceId: WorkspaceId, accountId: AccountId }), query: null, headers: null,
  body: z.object({ role: WorkspaceRole }).strict(),
  success: { 200: WorkspaceMemberEntry },
  effects: [], failures: ['MEMBERS_MANAGE_REQUIRED', 'LAST_OWNER', 'ACCOUNT_INACTIVE', 'ACCOUNT_NOT_FOUND'],
  malformed: { workspaceId: 'WORKSPACE_NOT_FOUND', accountId: 'ROSTER_ENTRY_NOT_FOUND' },
})

export const getApplicationAccess = operation({
  id: 'getApplicationAccess', summary: 'Read the address of a Project\'s application and who may use it besides the members of its Workspace. Owner only.', access: 'session', method: 'GET', path: '/api/control/projects/:projectId/application-access',
  params: projectParam, query: null, headers: null, body: null,
  success: { 200: ApplicationAccess },
  effects: [], failures: ['APPLICATION_ACCESS_MANAGE_REQUIRED'], malformed: { projectId: 'PROJECT_NOT_FOUND' },
})

export const grantApplicationAccess = operation({
  id: 'grantApplicationAccess', summary: 'Invite an email to a Project\'s application; the first grant fixes the application\'s address. The person\'s next sign in claims it. A new invitation answers 201, a refreshed one 200. Owner only.', access: 'session', method: 'POST', path: '/api/control/projects/:projectId/application-access',
  params: projectParam, query: null, headers: keyed,
  body: z.object({ email: EmailAddress }).strict(),
  success: { 200: ApplicationInvitationEntry, 201: ApplicationInvitationEntry },
  effects: [], failures: ['APPLICATION_ACCESS_MANAGE_REQUIRED', 'DATABASE_BUSY', 'ACCOUNT_INACTIVE', 'ACCOUNT_NOT_FOUND'],
  malformed: { projectId: 'PROJECT_NOT_FOUND', email: 'EMAIL_INVALID' },
})

const applicationEntryFailures = ['APPLICATION_ACCESS_MANAGE_REQUIRED', 'ACCOUNT_INACTIVE', 'ACCOUNT_NOT_FOUND'] as const satisfies readonly FailureCode[]

export const revokeApplicationGrant = operation({
  id: 'revokeApplicationGrant', summary: 'Revoke a person\'s grant to a Project\'s application; their next request to it is refused. Owner only.', access: 'session', method: 'DELETE', path: '/api/control/projects/:projectId/application-access/grants/:grantId',
  params: z.object({ projectId: ProjectId, grantId: GrantId }), query: null, headers: null, body: null,
  success: { 204: null },
  effects: [], failures: applicationEntryFailures, malformed: { projectId: 'PROJECT_NOT_FOUND', grantId: 'APPLICATION_ACCESS_ENTRY_NOT_FOUND' },
})

export const cancelApplicationInvitation = operation({
  id: 'cancelApplicationInvitation', summary: 'Cancel an invitation to a Project\'s application that nobody has claimed. Owner only.', access: 'session', method: 'DELETE', path: '/api/control/projects/:projectId/application-access/invitations/:invitationId',
  params: z.object({ projectId: ProjectId, invitationId: InvitationId }), query: null, headers: null, body: null,
  success: { 204: null },
  effects: [], failures: applicationEntryFailures, malformed: { projectId: 'PROJECT_NOT_FOUND', invitationId: 'APPLICATION_ACCESS_ENTRY_NOT_FOUND' },
})

export const listInstallationAdministrators = operation({
  id: 'listInstallationAdministrators', summary: 'List the installation administrators and how each became one; installation administrator only.', access: 'session', method: 'GET', path: '/api/control/installation/administrators',
  params: null, query: null, headers: null, body: null,
  success: { 200: z.object({ administrators: z.array(AdministratorEntry) }) },
  effects: [], failures: ['INSTALLATION_ADMINISTRATOR_REQUIRED'], malformed: null,
})

export const addInstallationAdministrator = operation({
  id: 'addInstallationAdministrator', summary: 'Make the one active account with this email an installation administrator: 201 when it gets a tenure, 200 with the tenure it already holds. Installation administrator only.', access: 'session', method: 'POST', path: '/api/control/installation/administrators',
  params: null, query: null, headers: keyed,
  body: z.object({ email: EmailAddress }).strict(),
  success: { 200: AdministratorEntry, 201: AdministratorEntry },
  effects: [], failures: ['INSTALLATION_ADMINISTRATOR_REQUIRED', 'ACCOUNT_NOT_FOUND', 'ACCOUNT_EMAIL_AMBIGUOUS'],
  malformed: { email: 'EMAIL_INVALID' },
})

export const removeInstallationAdministrator = operation({
  id: 'removeInstallationAdministrator', summary: 'End an account\'s tenure as installation administrator; the installation keeps at least one. Installation administrator only.', access: 'session', method: 'DELETE', path: '/api/control/installation/administrators/:accountId',
  params: z.object({ accountId: AccountId }), query: null, headers: null, body: null,
  success: { 204: null },
  effects: [], failures: ['INSTALLATION_ADMINISTRATOR_REQUIRED', 'LAST_INSTALLATION_ADMINISTRATOR'],
  malformed: { accountId: 'INSTALLATION_ADMINISTRATOR_NOT_FOUND' },
})
