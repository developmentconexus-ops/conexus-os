import { z } from 'zod'
import type { AccountId, BuilderRunId, ConnectionId, ProjectId, WorkspaceId } from '../../../../packages/contract/dist/index.js'
import { AccountId as AccountIdSchema, WorkspaceId as WorkspaceIdSchema } from '../../../../packages/contract/dist/index.js'
import type { JobName, Mode, ReadTx, WriteTx } from '../platform/db.js'
import { sql } from '../platform/db.js'
import { Failure, type FailureCode } from '../platform/failure.js'

/** @public Frozen by spec 0015 section 3; parts 3 to 6 admit through it. */
export type WorkspaceRole = 'owner' | 'member'
export type WorkspaceAction = 'workspace.read' | 'members.manage' | 'members.leave' | 'project.create' | 'project.build'
/** @public Frozen by spec 0015 section 3; parts 3 to 6 admit through it. */
export type ProjectAction = 'project.read' | 'project.build' | 'project.delete'
/** @public Frozen by spec 0015 section 3; parts 3 to 6 admit through it. */
export type ConnectionAction = 'connection.read' | 'connection.manage' | 'connection.use'
/** @public Frozen by spec 0015 section 3; parts 3 to 6 admit through it. */
export type Action = WorkspaceAction | ProjectAction | ConnectionAction
/** @public Frozen by spec 0015 section 3; parts 3 to 6 admit through it. */
export type ReadAction = 'workspace.read' | 'project.read' | 'connection.read'
/** @public Frozen by spec 0015 section 3; parts 3 to 6 admit through it. */
export type RunOwner = Readonly<{ ownerId: string }>
/** @public Frozen by spec 0015 section 3; parts 3 to 6 admit through it. */
export type OwnerRow = Readonly<{ accountId: AccountId; active: boolean }>

/** @public Frozen by spec 0015 section 3; parts 3 to 6 admit through it. */
export const ROLE_ALLOWS = {
  owner: ['workspace.read', 'members.manage', 'members.leave', 'project.create', 'project.build'],
  member: ['workspace.read', 'members.leave', 'project.create', 'project.build'],
} as const satisfies { readonly [R in WorkspaceRole]: readonly WorkspaceAction[] }

/** @public Frozen by spec 0015 section 3; parts 3 to 6 admit through it. */
export const CHANGES_OWNER_SET = ['members.manage', 'members.leave'] as const satisfies readonly WorkspaceAction[]
/** @public Frozen by spec 0015 section 3; parts 3 to 6 admit through it. */
export type ChangesOwnerSet = (typeof CHANGES_OWNER_SET)[number]

/** @public Frozen by spec 0015 section 3; parts 3 to 6 admit through it. */
export const ACTION_REFUSALS = {
  'workspace.read': { outsider: 'WORKSPACE_NOT_FOUND', forbidden: 'WORKSPACE_NOT_FOUND' },
  'members.manage': { outsider: 'WORKSPACE_NOT_FOUND', forbidden: 'MEMBERS_MANAGE_REQUIRED' },
  'members.leave': { outsider: 'WORKSPACE_NOT_FOUND', forbidden: 'WORKSPACE_NOT_FOUND' },
  'project.create': { outsider: 'PROJECT_CREATE_DENIED', forbidden: 'PROJECT_CREATE_DENIED' },
  'project.read': { outsider: 'PROJECT_NOT_FOUND', forbidden: 'PROJECT_NOT_FOUND' },
  'project.build': { outsider: 'PROJECT_NOT_FOUND', forbidden: 'PROJECT_NOT_FOUND' },
  'project.delete': { outsider: 'PROJECT_NOT_FOUND', forbidden: 'PROJECT_NOT_FOUND' },
  'connection.read': { outsider: 'CONNECTOR_CONNECTION_NOT_FOUND', forbidden: 'CONNECTOR_CONNECTION_NOT_FOUND' },
  'connection.manage': { outsider: 'CONNECTOR_CONNECTION_NOT_FOUND', forbidden: 'CONNECTOR_CONNECTION_NOT_FOUND' },
  'connection.use': { outsider: 'CONNECTOR_CONNECTION_NOT_AVAILABLE', forbidden: 'CONNECTOR_CONNECTION_NOT_AVAILABLE' },
} as const satisfies { readonly [A in Action]: { readonly outsider: FailureCode; readonly forbidden: FailureCode } }

/** @public Frozen by spec 0015 section 3; parts 3 to 6 admit through it. */
export type Scope =
  | Readonly<{ kind: 'account'; accountId: AccountId }>
  | Readonly<{ kind: 'installation-administrator'; accountId: AccountId }>
  | Readonly<{ kind: 'workspace'; accountId: AccountId; workspaceId: WorkspaceId; role: WorkspaceRole; action: WorkspaceAction; owners: readonly OwnerRow[] | null }>
  | Readonly<{ kind: 'project'; accountId: AccountId; workspaceId: WorkspaceId; projectId: ProjectId; action: ProjectAction }>
  | Readonly<{ kind: 'application'; accountId: AccountId; projectId: ProjectId; via: 'grant' | 'membership' }>
  | Readonly<{ kind: 'connection'; accountId: AccountId; connectionId: ConnectionId; action: ConnectionAction }>
  | Readonly<{ kind: 'run'; builderRunId: BuilderRunId; accountId: AccountId; owner: RunOwner }>
  | Readonly<{ kind: 'bootstrap'; issuer: string; subject: string }>
  | Readonly<{ kind: 'system'; job: JobName }>

export type AccountScope = Extract<Scope, { kind: 'account' }>
export type ProjectScope<A extends ProjectAction = ProjectAction> = Extract<Scope, { kind: 'project' }> & Readonly<{ action: A }>
export type InstallationAdministratorScope = Extract<Scope, { kind: 'installation-administrator' }>
/** @public Frozen by spec 0015 section 3; parts 3 to 6 admit through it. */
export type ApplicationScope = Extract<Scope, { kind: 'application' }>
/** @public Frozen by spec 0015 section 3; parts 3 to 6 admit through it. */
export type RunScope = Extract<Scope, { kind: 'run' }>
export type BootstrapScope = Extract<Scope, { kind: 'bootstrap' }>
/** @public Frozen by spec 0015 section 3; parts 3 to 6 admit through it. */
export type SystemScope = Extract<Scope, { kind: 'system' }>
export type WorkspaceScope<A extends WorkspaceAction> = Extract<Scope, { kind: 'workspace' }> & Readonly<{
  action: A
  owners: A extends ChangesOwnerSet ? readonly OwnerRow[] : null
}>
type TxOf<M extends Mode> = M extends 'write' ? WriteTx : ReadTx

class Proof<S extends Scope, M extends Mode> {
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: type identity is the use
  readonly #brand = true
  constructor(readonly scope: S, readonly tx: TxOf<M>) {}
}
export type Admitted<S extends Scope, M extends Mode = 'write'> = Proof<S, M>

const Account = z.object({ account_id: AccountIdSchema, active: z.boolean() })
const Member = z.object({ role: z.enum(['owner', 'member']) })
const IsAdministrator = z.object({ administrator: z.boolean() })
const Locked = z.object({ locked: z.number() })
const ProjectOwner = z.object({ workspace_id: WorkspaceIdSchema })
const Owner = z.object({ account_id: AccountIdSchema, active: z.boolean() })

const assertActing = (tx: ReadTx, accountId: AccountId): void => {
  if (tx.accountId !== accountId) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'ADMITTED_ACCOUNT_IS_NOT_THE_TRANSACTION_ACCOUNT' } })
}

export const admitAccount = async (tx: WriteTx, accountId: AccountId): Promise<Admitted<AccountScope>> => {
  assertActing(tx, accountId)
  const account = await tx.maybe(Account, sql`SELECT account_id, active FROM iam.account WHERE account_id = ${accountId} FOR SHARE`)
  if (!account) throw new Failure('ACCOUNT_NOT_FOUND')
  if (!account.active) throw new Failure('ACCOUNT_INACTIVE')
  return new Proof({ kind: 'account', accountId }, tx)
}

/** @public Frozen by spec 0015 section 3; the first workspace command is part 3. */
export function admitWorkspace<A extends WorkspaceAction>(tx: WriteTx, accountId: AccountId, workspaceId: WorkspaceId, action: A): Promise<Admitted<WorkspaceScope<A>>>
export function admitWorkspace<A extends ReadAction & WorkspaceAction>(tx: ReadTx, accountId: AccountId, workspaceId: WorkspaceId, action: A): Promise<Admitted<WorkspaceScope<A>, 'read'>>
export async function admitWorkspace(tx: ReadTx, accountId: AccountId, workspaceId: WorkspaceId, action: WorkspaceAction): Promise<Admitted<Scope, Mode>> {
  assertActing(tx, accountId)
  const changesOwners = CHANGES_OWNER_SET.some((candidate) => candidate === action)
  let owners: readonly z.output<typeof Owner>[] | null = null
  if (changesOwners && tx.mode === 'write') {
    await tx.rows(Locked, sql`
      SELECT 1 AS locked FROM iam.workspace_membership
      WHERE workspace_id = ${workspaceId} AND role = 'owner' ORDER BY account_id FOR UPDATE
    `)
    owners = await tx.rows(Owner, sql`
      SELECT membership.account_id, account.active FROM iam.workspace_membership AS membership
      JOIN iam.account AS account ON account.account_id = membership.account_id
      WHERE membership.workspace_id = ${workspaceId} AND membership.role = 'owner'
      ORDER BY membership.account_id
    `)
  }
  const account = await tx.maybe(Account, sql`SELECT account_id, active FROM iam.account WHERE account_id = ${accountId}${tx.mode === 'write' ? sql` FOR SHARE` : sql``}`)
  if (!account) throw new Failure('ACCOUNT_NOT_FOUND')
  if (!account.active) throw new Failure('ACCOUNT_INACTIVE')
  const member = await tx.maybe(Member, sql`SELECT role FROM iam.workspace_membership WHERE account_id = ${accountId} AND workspace_id = ${workspaceId}${tx.mode === 'write' ? sql` FOR SHARE` : sql``}`)
  if (!member) throw new Failure(ACTION_REFUSALS[action].outsider)
  if (!ROLE_ALLOWS[member.role].some((allowed) => allowed === action)) throw new Failure(ACTION_REFUSALS[action].forbidden)
  return new Proof({ kind: 'workspace', accountId, workspaceId, role: member.role, action, owners: owners?.map((row) => ({ accountId: row.account_id, active: row.active })) ?? null }, tx)
}

export const grantCreatorMembership = async (creator: Admitted<AccountScope>, workspaceId: WorkspaceId): Promise<void> => {
  await creator.tx.run(sql`INSERT INTO iam.workspace_membership (account_id, workspace_id, role) VALUES (${creator.scope.accountId}, ${workspaceId}, 'owner')`)
}

// A project read is a workspace read of the owning workspace; project.build is its own row in ROLE_ALLOWS.
const requiredAction = (action: Exclude<ProjectAction, 'project.delete'>): WorkspaceAction => (action === 'project.read' ? 'workspace.read' : action)

/** @public Frozen by spec 0015 section 3; parts 1, 2 and 4 admit through it. */
export function admitProject<A extends Exclude<ProjectAction, 'project.delete'>>(tx: WriteTx, accountId: AccountId, projectId: ProjectId, action: A): Promise<Admitted<ProjectScope<A>>>
export function admitProject(tx: ReadTx, accountId: AccountId, projectId: ProjectId, action: 'project.read'): Promise<Admitted<ProjectScope<'project.read'>, 'read'>>
export async function admitProject(tx: ReadTx, accountId: AccountId, projectId: ProjectId, action: Exclude<ProjectAction, 'project.delete'>): Promise<Admitted<Scope, Mode>> {
  assertActing(tx, accountId)
  const locked = tx.mode === 'write' ? sql` FOR SHARE` : sql``
  if (tx.mode === 'write') {
    const account = await tx.maybe(Account, sql`SELECT account_id, active FROM iam.account WHERE account_id = ${accountId} FOR SHARE`)
    if (!account) throw new Failure('ACCOUNT_NOT_FOUND')
    if (!account.active) throw new Failure('ACCOUNT_INACTIVE')
  }
  const found = await tx.maybe(ProjectOwner, sql`SELECT workspace_id FROM project.project WHERE project_id = ${projectId}`)
  if (!found) throw new Failure(ACTION_REFUSALS[action].outsider)
  const member = await tx.maybe(Member, sql`SELECT role FROM iam.workspace_membership WHERE account_id = ${accountId} AND workspace_id = ${found.workspace_id}${locked}`)
  if (!member) throw new Failure(ACTION_REFUSALS[action].outsider)
  if (!ROLE_ALLOWS[member.role].some((allowed) => allowed === requiredAction(action))) throw new Failure(ACTION_REFUSALS[action].forbidden)
  let workspaceId = found.workspace_id
  if (tx.mode === 'write') {
    const row = await tx.maybe(ProjectOwner, sql`SELECT workspace_id FROM project.project WHERE project_id = ${projectId} FOR SHARE`)
    if (!row) throw new Failure(ACTION_REFUSALS[action].outsider)
    workspaceId = row.workspace_id
    // A tombstone that committed while the lock waited is invisible to the locked row, so the visibility read runs again on a new snapshot.
    if (!(await tx.maybe(ProjectOwner, sql`SELECT workspace_id FROM project.project WHERE project_id = ${projectId}`))) throw new Failure(ACTION_REFUSALS[action].outsider)
  }
  return new Proof({ kind: 'project', accountId, workspaceId, projectId, action }, tx)
}

/** @public Frozen by spec 0015 section 3; project deletion is the only caller. */
export const admitProjectDeletion = async (tx: WriteTx, accountId: AccountId): Promise<Admitted<InstallationAdministratorScope>> => {
  if (tx.accountId !== null) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'PROJECT_DELETION_ADMITS_IN_A_SYSTEM_TRANSACTION' } })
  await tx.maybe(Account, sql`SELECT account_id, active FROM iam.account WHERE account_id = ${accountId} FOR SHARE`)
  const administrator = await tx.one(IsAdministrator, sql`SELECT iam.is_installation_administrator(${accountId}) AS administrator`, 'INTERNAL_UNEXPECTED')
  if (!administrator.administrator) throw new Failure('PROJECT_DELETE_DENIED')
  return new Proof({ kind: 'installation-administrator', accountId }, tx)
}
