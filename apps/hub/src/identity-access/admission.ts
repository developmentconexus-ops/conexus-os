import { z } from 'zod'
import type { AccountId, BuilderRunId, ProjectId, WorkspaceId } from '../../../../packages/contract/dist/index.js'
import { AccountId as AccountIdSchema, ProjectId as ProjectIdSchema, WorkspaceId as WorkspaceIdSchema } from '../../../../packages/contract/dist/index.js'
import { OPEN_RUN_STATES } from '../generated/builder-run-vocabulary.js'
import type { AuthenticationGate, CommandGate, Digest, JobName, Mode, ReadTx, Sql, TxQueries, WriteTx } from '../platform/db.js'
import { openGate, readOnlyView, sql } from '../platform/db.js'
import { Failure, type FailureCode } from '../platform/failure.js'

/** @public Frozen by spec 0015 section 3; parts 3 to 6 admit through it. */
export const WORKSPACE_ROLES = ['owner', 'member'] as const
/** @public Frozen by spec 0015 section 3; parts 3 to 6 admit through it. */
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number]
export type WorkspaceAction = 'workspace.read' | 'members.manage' | 'members.leave' | 'project.create' | 'project.build' | 'connections.bind'
/** @public Frozen by spec 0015 section 3; parts 3 to 6 admit through it. */
export type ProjectAction = 'project.read' | 'project.build' | 'connections.bind'
/** The commands an installation administrator runs across Workspaces. */
export type AdministratorAction = 'project.delete' | 'connection.manage' | 'administrators.manage'
/** @public Frozen by spec 0015 section 3; parts 3 to 6 admit through it. */
export type Action = WorkspaceAction | ProjectAction | AdministratorAction
/** @public Frozen by spec 0015 section 3; parts 3 to 6 admit through it. */
export type ReadAction = 'workspace.read' | 'project.read' | 'connections.bind'
/** @public Frozen by spec 0015 section 3; parts 3 to 6 admit through it. */
export type RunOwner = Readonly<{ ownerId: string }>
/** @public Frozen by spec 0015 section 3; parts 3 to 6 admit through it. */
export type OwnerRow = Readonly<{ accountId: AccountId; active: boolean }>

/** @public Frozen by spec 0015 section 3; parts 3 to 6 admit through it. */
export const ROLE_ALLOWS = {
  owner: ['workspace.read', 'members.manage', 'members.leave', 'project.create', 'project.build', 'connections.bind'],
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
  'project.build': { outsider: 'PROJECT_BUILD_DENIED', forbidden: 'PROJECT_BUILD_DENIED' },
  'connections.bind': { outsider: 'PROJECT_NOT_FOUND', forbidden: 'CONNECTOR_BINDING_MANAGE_REQUIRED' },
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
  | Readonly<{ kind: 'run'; builderRunId: BuilderRunId; accountId: AccountId; projectId: ProjectId; owner: RunOwner; via: 'account' | 'executor' }>
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
export type SystemScope<J extends JobName = JobName> = Extract<Scope, { kind: 'system' }> & Readonly<{ job: J }>
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

/**
 * The proof of a read that changes nothing. A separate class from Proof, so no port that needs an
 * Admitted accepts it, and its transaction is a ReadTx that only selects: insert, update, delete, merge and the row lock clauses
 * are refused in the SQL text. A SQL function that writes, called from a SELECT, is not stopped there. It holds no row lock.
 */
class Checked<S extends Scope> {
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: type identity is the use
  readonly #checked = true
  constructor(readonly scope: S, readonly tx: ReadTx) {}
}
export type { Checked }

const Account = z.object({ account_id: AccountIdSchema, active: z.boolean() })
const Member = z.object({ role: z.enum(WORKSPACE_ROLES) })
const Locked = z.object({ locked: z.number() })
const ProjectWorkspace = z.object({ workspace_id: WorkspaceIdSchema })
const Access = z.object({ member: z.boolean(), granted: z.boolean() })
const Present = z.object({ present: z.literal(1) })

type RefusalReason = 'OUTSIDER' | 'FORBIDDEN' | 'TOMBSTONE' | 'INACTIVE'
/** An admission refusal answers its code and nothing else; the reason reaches the log only, so an outsider learns nothing from the response. */
const refuse = (code: FailureCode, refusal: RefusalReason): Failure => new Failure(code, { details: { refusal } })

// Only the refusal path asks: a project with a deletion row is a tombstone, any other refusal is an outsider.
const missingProject = async (tx: TxQueries, projectId: ProjectId): Promise<RefusalReason> =>
  (await tx.maybe(Present, sql`SELECT 1 AS present FROM project.project_deletion WHERE project_id = ${projectId}`)) ? 'TOMBSTONE' : 'OUTSIDER'

const refusedActor = (): Failure => new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'GATE_ACTOR_REFUSED' } })

// A command admission takes the actor from its gate: the account of a person's transaction.
const accountGate = (gate: CommandGate): Readonly<{ tx: WriteTx; accountId: AccountId }> => {
  const { tx, actor } = openGate(gate)
  if (actor.kind !== 'account') throw refusedActor()
  return { tx, accountId: actor.accountId }
}

// A read admission takes the actor from the read's own account; it has no transaction to lock with.
const subjectOf = (subject: CommandGate | ReadTx): Readonly<{ tx: ReadTx | WriteTx; writer: WriteTx | null; accountId: AccountId }> => {
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
  const owners = await tx.rows(Account, sql`
    SELECT membership.account_id, account.active FROM iam.workspace_membership AS membership
    JOIN iam.account AS account ON account.account_id = membership.account_id
    WHERE membership.workspace_id = ${workspaceId} AND membership.role = 'owner'
    ORDER BY membership.account_id
  `)
  return owners.map((row) => ({ accountId: row.account_id, active: row.active }))
}

const memberOf = (tx: TxQueries, accountId: AccountId, workspaceId: WorkspaceId, lock: Sql) =>
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
  if (!member) throw refuse(ACTION_REFUSALS[action].outsider, 'OUTSIDER')
  if (!ROLE_ALLOWS[member.role].some((allowed) => allowed === action)) throw refuse(ACTION_REFUSALS[action].forbidden, 'FORBIDDEN')
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
export function admitProject<A extends ReadAction & ProjectAction>(tx: ReadTx, projectId: ProjectId, action: A): Promise<Admitted<ProjectScope<A>, 'read'>>
export async function admitProject(subject: CommandGate | ReadTx, projectId: ProjectId, action: ProjectAction): Promise<Admitted<Scope, Mode>> {
  const { tx, writer, accountId } = subjectOf(subject)
  if (writer) await lockActiveAccount(writer, accountId)
  // A read leaves visibility to the reader policy, which still shows an administrator a deletion in progress.
  const found = await tx.maybe(ProjectWorkspace, !writer ? sql`SELECT workspace_id FROM project.project WHERE project_id = ${projectId}` : liveProject(projectId, sql``))
  if (!found) throw refuse(ACTION_REFUSALS[action].outsider, await missingProject(tx, projectId))
  const member = await memberOf(tx, accountId, found.workspace_id, writer ? sql` FOR SHARE` : sql``)
  if (!member) throw refuse(ACTION_REFUSALS[action].outsider, 'OUTSIDER')
  if (!ROLE_ALLOWS[member.role].some((allowed) => allowed === requiredAction(action))) throw refuse(ACTION_REFUSALS[action].forbidden, 'FORBIDDEN')
  if (writer) {
    await writer.maybe(ProjectWorkspace, liveProject(projectId, sql` FOR SHARE`))
    // A tombstone that committed while the lock waited is invisible to the locked row, so the visibility read runs again in a new statement.
    if (!(await writer.maybe(ProjectWorkspace, liveProject(projectId, sql``)))) throw refuse(ACTION_REFUSALS[action].outsider, 'TOMBSTONE')
  }
  return new Proof({ kind: 'project', accountId, workspaceId: found.workspace_id, projectId, action }, tx)
}

/** Whether the acting account of a read holds an open tenure and is active: the one owner of that fact for a read, which the reader policies answer through rls.acting_installation_administrator(). */
export const isInstallationAdministrator = async (tx: ReadTx): Promise<boolean> =>
  (await tx.one(z.object({ administrator: z.boolean() }), sql`SELECT rls.acting_installation_administrator() AS administrator`, 'INTERNAL_UNEXPECTED')).administrator

/** @public Frozen by spec 0015 section 3; project deletion and the connection commands admit through it. */
export const admitInstallationAdministrator = async <A extends AdministratorAction>(gate: CommandGate, action: A): Promise<Admitted<AdministratorScope<A>>> => {
  const { tx, accountId } = accountGate(gate)
  if (action === 'administrators.manage') await tx.run(sql`SELECT iam.lock_administrators()`)
  const account = await lockAccount(tx, accountId)
  if (!account?.active) throw refuse(ACTION_REFUSALS[action].forbidden, 'INACTIVE')
  // A revoke that commits while this waits makes the row fail its predicate when it is read again.
  const tenure = await tx.maybe(Present, sql`
    SELECT 1 AS present FROM iam.installation_administrator WHERE account_id = ${accountId} AND revoked_at IS NULL FOR SHARE`)
  if (!tenure) throw refuse(ACTION_REFUSALS[action].outsider, 'OUTSIDER')
  return new Proof({ kind: 'installation-administrator', accountId, action }, tx)
}

const applicationAccess = (accountId: AccountId, projectId: ProjectId) => sql`
  SELECT
    EXISTS (SELECT 1 FROM iam.workspace_membership AS membership
      WHERE membership.account_id = ${accountId} AND membership.workspace_id = stored.workspace_id) AS member,
    EXISTS (SELECT 1 FROM iam.application_grant AS access_grant
      WHERE access_grant.account_id = ${accountId} AND access_grant.project_id = stored.project_id AND access_grant.revoked_at IS NULL) AS granted
  FROM project.project AS stored
  WHERE stored.project_id = ${projectId} AND NOT stored.archived
    AND EXISTS (SELECT 1 FROM iam.account AS account WHERE account.account_id = ${accountId} AND account.active)
    AND NOT EXISTS (SELECT 1 FROM project.project_deletion AS deletion WHERE deletion.project_id = stored.project_id)
    AND EXISTS (SELECT 1 FROM iam.application AS application WHERE application.project_id = stored.project_id)`

/** @public Frozen by spec 0015 section 3; the application host and the connector broker admit through it. */
export const admitApplication = async (gate: CommandGate, projectId: ProjectId): Promise<Admitted<ApplicationScope>> => {
  const { tx, accountId } = accountGate(gate)
  const account = await lockAccount(tx, accountId)
  if (!account?.active) throw refuse('APPLICATION_NOT_FOUND', 'INACTIVE')
  const found = await tx.maybe(ProjectWorkspace, liveProject(projectId, sql``))
  if (!found) throw refuse('APPLICATION_NOT_FOUND', await missingProject(tx, projectId))
  const member = await memberOf(tx, accountId, found.workspace_id, sql` FOR SHARE`)
  await tx.maybe(ProjectWorkspace, liveProject(projectId, sql` FOR SHARE`))
  // The grant is the project's child and the purge deletes grants while it holds the project, so it is taken after the project.
  if (!member) {
    await tx.maybe(Present, sql`
      SELECT 1 AS present FROM iam.application_grant
      WHERE account_id = ${accountId} AND project_id = ${projectId} AND revoked_at IS NULL FOR SHARE`)
  }
  const access = await tx.maybe(Access, applicationAccess(accountId, projectId))
  if (!access || !(access.member || access.granted)) throw refuse('APPLICATION_NOT_FOUND', await missingProject(tx, projectId))
  return new Proof({ kind: 'application', accountId, projectId, via: access.member ? 'membership' : 'grant' }, tx)
}

/**
 * The same access and deletion rule as admitApplication, in one statement that locks no row, for a
 * served read that changes nothing. A command that writes in its transaction admits instead.
 * @public Frozen by spec 0015 section 3; the served application reads and the connector broker use it.
 */
export const checkApplication = async (gate: CommandGate, projectId: ProjectId): Promise<Checked<ApplicationScope>> => {
  const { tx, accountId } = accountGate(gate)
  const access = await tx.maybe(Access, applicationAccess(accountId, projectId))
  if (!access || !(access.member || access.granted)) throw refuse('APPLICATION_NOT_FOUND', await missingProject(tx, projectId))
  return new Checked({ kind: 'application', accountId, projectId, via: access.member ? 'membership' : 'grant' }, readOnlyView(tx))
}

const RunRow = z.object({ project_id: ProjectIdSchema, account_id: AccountIdSchema, owner_id: z.string().nullable() })
const RunPlace = z.object({ project_id: ProjectIdSchema, account_id: AccountIdSchema, workspace_id: WorkspaceIdSchema.nullable() })

const notAdmitted = (): Failure => new Failure('BUILDER_RUN_NOT_ADMITTED')

// A run row is locked by its own id, after the Project: the purge takes the Project first, so the order never crosses.
const lockedRun = async (tx: WriteTx, builderRunId: BuilderRunId, projectId: ProjectId, owner: RunOwner): Promise<z.output<typeof RunRow>> => {
  await tx.maybe(ProjectWorkspace, liveProject(projectId, sql` FOR SHARE`))
  const run = await tx.maybe(RunRow, sql`SELECT project_id, account_id, owner_id::text AS owner_id FROM builder.builder_run WHERE builder_run_id = ${builderRunId} AND state = ANY(${OPEN_RUN_STATES}::text[]) FOR UPDATE`)
  if (!run || run.project_id !== projectId || run.owner_id !== owner.ownerId) throw notAdmitted()
  // A tombstone that committed while the locks waited is invisible to the locked rows, so the visibility read runs again in a new statement.
  if (!(await tx.maybe(ProjectWorkspace, liveProject(projectId, sql``)))) throw notAdmitted()
  return run
}

/**
 * The admission of a run the executor owns. Under a person's transaction it also requires the
 * account's build authority; under `system('builder-executor')` the run's owner is the only proof.
 * @public Frozen by spec 0015 section 3; parts 1, 4 and 5 admit through it.
 */
export const admitRun = async (gate: CommandGate, builderRunId: BuilderRunId, owner: RunOwner): Promise<Admitted<RunScope>> => {
  const { tx, actor } = openGate(gate)
  if (actor.kind === 'authentication' || (actor.kind === 'job' && actor.job !== 'builder-executor')) throw refusedActor()
  const place = await tx.maybe(RunPlace, sql`
    SELECT run.project_id, run.account_id, stored.workspace_id FROM builder.builder_run AS run
    LEFT JOIN project.project AS stored ON stored.project_id = run.project_id
    WHERE run.builder_run_id = ${builderRunId}`)
  if (!place) throw notAdmitted()
  if (actor.kind === 'job') {
    const run = await lockedRun(tx, builderRunId, place.project_id, owner)
    return new Proof({ kind: 'run', builderRunId, accountId: run.account_id, projectId: place.project_id, owner, via: 'executor' }, tx)
  }
  if (place.account_id !== actor.accountId || place.workspace_id === null) throw notAdmitted()
  await lockActiveAccount(tx, actor.accountId)
  const member = await memberOf(tx, actor.accountId, place.workspace_id, sql` FOR SHARE`)
  if (!member) throw refuse(ACTION_REFUSALS['project.build'].outsider, 'OUTSIDER')
  if (!ROLE_ALLOWS[member.role].some((allowed) => allowed === 'project.build')) throw refuse(ACTION_REFUSALS['project.build'].forbidden, 'FORBIDDEN')
  const run = await lockedRun(tx, builderRunId, place.project_id, owner)
  return new Proof({ kind: 'run', builderRunId, accountId: run.account_id, projectId: place.project_id, owner, via: 'account' }, tx)
}

/** @public Frozen by spec 0015 section 3; its body is built in part 6. */
export const admitBootstrap = (_gate: AuthenticationGate, _digest: Digest): Promise<Admitted<BootstrapScope>> =>
  Promise.reject(new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'ADMIT_BOOTSTRAP_IS_BUILT_IN_PART_6' } }))

/** @public Frozen by spec 0015 section 3; the jobs and the project purge admit through it. */
export const admitSystem = <J extends JobName>(gate: CommandGate, job: J): Promise<Admitted<SystemScope<J>>> => {
  const { tx, actor } = openGate(gate)
  if (actor.kind !== 'job') return Promise.reject(refusedActor())
  if (actor.job !== job) return Promise.reject(new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'GATE_JOB_MISMATCH' } }))
  return Promise.resolve(new Proof({ kind: 'system', job }, tx))
}
