import { z } from 'zod'
import type { AccountId, BuilderRunId, ProjectId, WorkspaceId } from '../../../../packages/contract/dist/index.js'
import { AccountId as AccountIdSchema, WorkspaceId as WorkspaceIdSchema } from '../../../../packages/contract/dist/index.js'
import type { AuthenticationGate, CommandGate, Digest, JobName, Mode, ReadTx, Sql, WriteTx } from '../platform/db.js'
import { openGate, sql } from '../platform/db.js'
import { Failure, type FailureCode } from '../platform/failure.js'

/** @public Frozen by spec 0015 section 3; parts 3 to 6 admit through it. */
export type WorkspaceRole = 'owner' | 'member'
export type WorkspaceAction = 'workspace.read' | 'members.manage' | 'members.leave' | 'project.create' | 'project.build'
/** @public Frozen by spec 0015 section 3; parts 3 to 6 admit through it. */
export type ProjectAction = 'project.read' | 'project.build'
/** The commands an installation administrator runs across Workspaces. */
export type AdministratorAction = 'project.delete' | 'connection.manage' | 'administrators.manage'
/** @public Frozen by spec 0015 section 3; parts 3 to 6 admit through it. */
export type Action = WorkspaceAction | ProjectAction | AdministratorAction
/** @public Frozen by spec 0015 section 3; parts 3 to 6 admit through it. */
export type ReadAction = 'workspace.read' | 'project.read'
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
  'project.delete': { outsider: 'PROJECT_DELETE_DENIED', forbidden: 'PROJECT_DELETE_DENIED' },
  'connection.manage': { outsider: 'INSTALLATION_ADMINISTRATOR_REQUIRED', forbidden: 'INSTALLATION_ADMINISTRATOR_REQUIRED' },
  'administrators.manage': { outsider: 'INSTALLATION_ADMINISTRATOR_REQUIRED', forbidden: 'INSTALLATION_ADMINISTRATOR_REQUIRED' },
} as const satisfies { readonly [A in Action]: { readonly outsider: FailureCode; readonly forbidden: FailureCode } }

/** @public Frozen by spec 0015 section 3; parts 3 to 6 admit through it. */
export type Scope =
  | Readonly<{ kind: 'account'; accountId: AccountId }>
  | Readonly<{ kind: 'installation-administrator'; accountId: AccountId; action: AdministratorAction }>
  | Readonly<{ kind: 'workspace'; accountId: AccountId; workspaceId: WorkspaceId; role: WorkspaceRole; action: WorkspaceAction; owners: readonly OwnerRow[] | null }>
  | Readonly<{ kind: 'project'; accountId: AccountId; workspaceId: WorkspaceId; projectId: ProjectId; action: ProjectAction }>
  | Readonly<{ kind: 'application'; accountId: AccountId; projectId: ProjectId; via: 'grant' | 'membership' }>
  | Readonly<{ kind: 'run'; builderRunId: BuilderRunId; accountId: AccountId; owner: RunOwner }>
  | Readonly<{ kind: 'bootstrap'; issuer: string; subject: string }>
  | Readonly<{ kind: 'system'; job: JobName }>

export type AccountScope = Extract<Scope, { kind: 'account' }>
export type ProjectScope<A extends ProjectAction = ProjectAction> = Extract<Scope, { kind: 'project' }> & Readonly<{ action: A }>
export type AdministratorScope<A extends AdministratorAction = AdministratorAction> = Extract<Scope, { kind: 'installation-administrator' }> & Readonly<{ action: A }>
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
const Locked = z.object({ locked: z.number() })
const ProjectOwner = z.object({ workspace_id: WorkspaceIdSchema })
const Owner = z.object({ account_id: AccountIdSchema, active: z.boolean() })
const Access = z.object({ member: z.boolean(), granted: z.boolean() })
const Present = z.object({ present: z.literal(1) })

const refusedActor = (): Failure => new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'GATE_ACTOR_REFUSED' } })

// A command admission takes the actor from its gate: the account of a person's transaction.
const accountGate = (gate: CommandGate): Readonly<{ tx: WriteTx; accountId: AccountId }> => {
  const { tx, actor } = openGate(gate)
  if (actor.kind !== 'account') throw refusedActor()
  return { tx, accountId: actor.accountId }
}

// A read admission takes the actor from the read's own account; it has no transaction to lock with.
const subjectOf = (subject: CommandGate | ReadTx): Readonly<{ tx: ReadTx; writer: WriteTx | null; accountId: AccountId }> => {
  if ('mode' in subject) {
    if (subject.accountId === null) throw refusedActor()
    return { tx: subject, writer: null, accountId: subject.accountId }
  }
  const { tx, accountId } = accountGate(subject)
  return { tx, writer: tx, accountId }
}

const lockAccount = (tx: WriteTx, accountId: AccountId) =>
  tx.maybe(Account, sql`SELECT account_id, active FROM iam.account WHERE account_id = ${accountId} FOR SHARE`)

const lockActiveAccount = async (tx: WriteTx, accountId: AccountId): Promise<void> => {
  const account = await lockAccount(tx, accountId)
  if (!account) throw new Failure('ACCOUNT_NOT_FOUND')
  if (!account.active) throw new Failure('ACCOUNT_INACTIVE')
}

export const admitAccount = async (gate: CommandGate | AuthenticationGate): Promise<Admitted<AccountScope>> => {
  const { tx, actor } = openGate(gate)
  const accountId = actor.kind === 'job' ? null : actor.accountId
  if (accountId === null) throw refusedActor()
  await lockActiveAccount(tx, accountId)
  return new Proof({ kind: 'account', accountId }, tx)
}

const lockOwners = async (tx: WriteTx, workspaceId: WorkspaceId): Promise<readonly OwnerRow[]> => {
  await tx.rows(Locked, sql`
    SELECT 1 AS locked FROM iam.workspace_membership
    WHERE workspace_id = ${workspaceId} AND role = 'owner' ORDER BY account_id FOR UPDATE
  `)
  const owners = await tx.rows(Owner, sql`
    SELECT membership.account_id, account.active FROM iam.workspace_membership AS membership
    JOIN iam.account AS account ON account.account_id = membership.account_id
    WHERE membership.workspace_id = ${workspaceId} AND membership.role = 'owner'
    ORDER BY membership.account_id
  `)
  return owners.map((row) => ({ accountId: row.account_id, active: row.active }))
}

const memberOf = (tx: ReadTx, accountId: AccountId, workspaceId: WorkspaceId, lock: Sql) =>
  tx.maybe(Member, sql`SELECT role FROM iam.workspace_membership WHERE account_id = ${accountId} AND workspace_id = ${workspaceId}${lock}`)

/** @public Frozen by spec 0015 section 3; the first workspace command is part 3. */
export function admitWorkspace<A extends WorkspaceAction>(gate: CommandGate, workspaceId: WorkspaceId, action: A): Promise<Admitted<WorkspaceScope<A>>>
export function admitWorkspace<A extends ReadAction & WorkspaceAction>(tx: ReadTx, workspaceId: WorkspaceId, action: A): Promise<Admitted<WorkspaceScope<A>, 'read'>>
export async function admitWorkspace(subject: CommandGate | ReadTx, workspaceId: WorkspaceId, action: WorkspaceAction): Promise<Admitted<Scope, Mode>> {
  const { tx, writer, accountId } = subjectOf(subject)
  const owners = writer && CHANGES_OWNER_SET.some((candidate) => candidate === action) ? await lockOwners(writer, workspaceId) : null
  if (writer) {
    await lockActiveAccount(writer, accountId)
  } else {
    const account = await tx.maybe(Account, sql`SELECT account_id, active FROM iam.account WHERE account_id = ${accountId}`)
    if (!account) throw new Failure('ACCOUNT_NOT_FOUND')
    if (!account.active) throw new Failure('ACCOUNT_INACTIVE')
  }
  // A leaving member deletes its own row, so it takes it for update; every other action reads it.
  const lock = !writer ? sql`` : action === 'members.leave' ? sql` FOR UPDATE` : sql` FOR SHARE`
  const member = await memberOf(tx, accountId, workspaceId, lock)
  if (!member) throw new Failure(ACTION_REFUSALS[action].outsider)
  if (!ROLE_ALLOWS[member.role].some((allowed) => allowed === action)) throw new Failure(ACTION_REFUSALS[action].forbidden)
  return new Proof({ kind: 'workspace', accountId, workspaceId, role: member.role, action, owners }, tx)
}

/** @public Frozen by spec 0015 section 3; the creator of a workspace founds it. */
export const grantCreatorMembership = async (creator: Admitted<AccountScope>, workspaceId: WorkspaceId): Promise<void> => {
  const founded = await creator.tx.run(sql`
    INSERT INTO iam.workspace_membership (account_id, workspace_id, role)
    SELECT ${creator.scope.accountId}::uuid, ${workspaceId}::uuid, 'owner'
    WHERE NOT EXISTS (SELECT 1 FROM iam.workspace_membership WHERE workspace_id = ${workspaceId}::uuid)`)
  if (founded !== 1) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'WORKSPACE_ALREADY_FOUNDED' } })
}

// A project read is a workspace read of the owning workspace; project.build is its own row in ROLE_ALLOWS.
const requiredAction = (action: ProjectAction): WorkspaceAction => (action === 'project.read' ? 'workspace.read' : action)

// A project with any deletion row is refused, an administrator included: its deletion takes the row for update first.
const liveProject = (projectId: ProjectId, lock: Sql) => sql`
  SELECT workspace_id FROM project.project AS stored
  WHERE stored.project_id = ${projectId}
    AND NOT EXISTS (SELECT 1 FROM project.project_deletion AS deletion WHERE deletion.project_id = stored.project_id)${lock}`

/** @public Frozen by spec 0015 section 3; parts 1, 2 and 4 admit through it. */
export function admitProject<A extends ProjectAction>(gate: CommandGate, projectId: ProjectId, action: A): Promise<Admitted<ProjectScope<A>>>
export function admitProject(tx: ReadTx, projectId: ProjectId, action: 'project.read'): Promise<Admitted<ProjectScope<'project.read'>, 'read'>>
export async function admitProject(subject: CommandGate | ReadTx, projectId: ProjectId, action: ProjectAction): Promise<Admitted<Scope, Mode>> {
  const { tx, writer, accountId } = subjectOf(subject)
  if (writer) await lockActiveAccount(writer, accountId)
  // A read leaves visibility to the reader policy, which still shows an administrator a deletion in progress.
  const found = await tx.maybe(ProjectOwner, !writer ? sql`SELECT workspace_id FROM project.project WHERE project_id = ${projectId}` : liveProject(projectId, sql``))
  if (!found) throw new Failure(ACTION_REFUSALS[action].outsider)
  const member = await memberOf(tx, accountId, found.workspace_id, writer ? sql` FOR SHARE` : sql``)
  if (!member) throw new Failure(ACTION_REFUSALS[action].outsider)
  if (!ROLE_ALLOWS[member.role].some((allowed) => allowed === requiredAction(action))) throw new Failure(ACTION_REFUSALS[action].forbidden)
  if (writer) {
    await writer.maybe(ProjectOwner, liveProject(projectId, sql` FOR SHARE`))
    // A tombstone that committed while the lock waited is invisible to the locked row, so the visibility read runs again in a new statement.
    if (!(await writer.maybe(ProjectOwner, liveProject(projectId, sql``)))) throw new Failure(ACTION_REFUSALS[action].outsider)
  }
  return new Proof({ kind: 'project', accountId, workspaceId: found.workspace_id, projectId, action }, tx)
}

/** @public Frozen by spec 0015 section 3; project deletion and the connection commands admit through it. */
export const admitInstallationAdministrator = async <A extends AdministratorAction>(gate: CommandGate, action: A): Promise<Admitted<AdministratorScope<A>>> => {
  const { tx, accountId } = accountGate(gate)
  if (action === 'administrators.manage') await tx.run(sql`SELECT iam.lock_administrators()`)
  const account = await lockAccount(tx, accountId)
  if (!account?.active) throw new Failure(ACTION_REFUSALS[action].forbidden)
  // A revoke that commits while this waits makes the row fail its predicate when it is read again.
  const tenure = await tx.maybe(Present, sql`
    SELECT 1 AS present FROM iam.installation_administrator WHERE account_id = ${accountId} AND revoked_at IS NULL FOR SHARE`)
  if (!tenure) throw new Failure(ACTION_REFUSALS[action].outsider)
  return new Proof({ kind: 'installation-administrator', accountId, action }, tx)
}

/** @public Frozen by spec 0015 section 3; the application host and the connector broker admit through it. */
export const admitApplication = async (gate: CommandGate, projectId: ProjectId): Promise<Admitted<ApplicationScope>> => {
  const { tx, accountId } = accountGate(gate)
  const refused = new Failure('APPLICATION_NOT_FOUND')
  const account = await lockAccount(tx, accountId)
  if (!account?.active) throw refused
  const found = await tx.maybe(ProjectOwner, liveProject(projectId, sql``))
  if (!found) throw refused
  const member = await memberOf(tx, accountId, found.workspace_id, sql` FOR SHARE`)
  await tx.maybe(ProjectOwner, liveProject(projectId, sql` FOR SHARE`))
  // The grant is the project's child and the purge deletes grants while it holds the project, so it is taken after the project.
  if (!member) {
    await tx.maybe(Present, sql`
      SELECT 1 AS present FROM iam.application_grant
      WHERE account_id = ${accountId} AND project_id = ${projectId} AND revoked_at IS NULL FOR SHARE`)
  }
  const access = await tx.maybe(Access, sql`
    SELECT
      EXISTS (SELECT 1 FROM iam.workspace_membership AS membership
        WHERE membership.account_id = ${accountId} AND membership.workspace_id = stored.workspace_id) AS member,
      EXISTS (SELECT 1 FROM iam.application_grant AS access_grant
        WHERE access_grant.account_id = ${accountId} AND access_grant.project_id = stored.project_id AND access_grant.revoked_at IS NULL) AS granted
    FROM project.project AS stored
    WHERE stored.project_id = ${projectId} AND NOT stored.archived
      AND NOT EXISTS (SELECT 1 FROM project.project_deletion AS deletion WHERE deletion.project_id = stored.project_id)
      AND EXISTS (SELECT 1 FROM iam.application AS application WHERE application.project_id = stored.project_id)`)
  if (!access || !(access.member || access.granted)) throw refused
  return new Proof({ kind: 'application', accountId, projectId, via: access.member ? 'membership' : 'grant' }, tx)
}

/** @public Frozen by spec 0015 section 3; its body is built in part 1. */
export const admitRun = (_gate: CommandGate, _builderRunId: BuilderRunId, _owner: RunOwner): Promise<Admitted<RunScope>> =>
  Promise.reject(new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'ADMIT_RUN_IS_BUILT_IN_PART_1' } }))

/** @public Frozen by spec 0015 section 3; its body is built in part 6. */
export const admitBootstrap = (_gate: AuthenticationGate, _digest: Digest): Promise<Admitted<BootstrapScope>> =>
  Promise.reject(new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'ADMIT_BOOTSTRAP_IS_BUILT_IN_PART_6' } }))

/** @public Frozen by spec 0015 section 3; the jobs and the project purge admit through it. */
export const admitSystem = (gate: CommandGate): Promise<Admitted<SystemScope>> => {
  const { tx, actor } = openGate(gate)
  if (actor.kind !== 'job') return Promise.reject(refusedActor())
  return Promise.resolve(new Proof({ kind: 'system', job: actor.job }, tx))
}
