import { z } from 'zod'
import type { AccountId, BuilderRunId, ProjectId, WorkspaceId } from '@conexus/contract'
import { AccountId as AccountIdSchema, ProjectId as ProjectIdSchema, SUBJECT_NOT_FOUND, WorkspaceId as WorkspaceIdSchema, WorkspaceRole } from '@conexus/contract'
import { OPEN_RUN_STATES } from '../generated/builder-run-vocabulary.js'
import type { AuthenticationGate, CommandGate, JobName, Mode, ReadGate, ReadTx, Sql, TxQueries, WriteTx } from '../platform/db.js'
import { openGate, openReadGate, readOnlyView, sql } from '../platform/db.js'
import { Failure, type FailureCode } from '../platform/failure.js'
import { type Receipted, receipted } from '../platform/receipt.js'

/** @public Frozen by spec 0015 section 3; parts 3 to 6 admit through it. */
export type { WorkspaceRole }
export type WorkspaceAction = 'workspace.read' | 'members.manage' | 'members.leave' | 'project.create'
export type ProjectAction = 'project.read' | 'project.build' | 'connections.bind' | 'application.manage' | 'project.delete'
type AdministratorAction = 'connection.manage' | 'administrators.manage'
export type ReadAction = 'workspace.read' | 'project.read' | 'project.build' | 'connections.bind' | 'application.manage'
export type RunOwner = Readonly<{ ownerId: string }>
export type OwnerRow = Readonly<{ accountId: AccountId; active: boolean }>

type ForbiddenCode = 'MEMBERS_MANAGE_REQUIRED' | 'CONNECTOR_BINDING_MANAGE_REQUIRED' | 'APPLICATION_ACCESS_MANAGE_REQUIRED' | 'PROJECT_DELETE_DENIED'
type RoleCell = 'ALLOWED' | ForbiddenCode
type WorkspaceRule = Readonly<{ on: 'workspace'; roles: Readonly<Record<WorkspaceRole, RoleCell>> }>
type ProjectRule = Readonly<{ on: 'project'; roles: Readonly<Record<WorkspaceRole, RoleCell>>; whileDeleting: 'allowed' | 'refused' }>
type AdministratorRule = Readonly<{ on: 'administrator'; refusal: 'INSTALLATION_ADMINISTRATOR_REQUIRED' }>
type ActionCatalog = { readonly [A in WorkspaceAction]: WorkspaceRule } & { readonly [A in ProjectAction]: ProjectRule } & { readonly [A in AdministratorAction]: AdministratorRule }
export type AdministratorInput = Readonly<{ action: 'administrators.manage' }> | Readonly<{ action: 'connection.manage'; workspaceId: WorkspaceId }>

const ACTIONS = {
  'workspace.read': { on: 'workspace', roles: { owner: 'ALLOWED', member: 'ALLOWED' } },
  'members.manage': { on: 'workspace', roles: { owner: 'ALLOWED', member: 'MEMBERS_MANAGE_REQUIRED' } },
  'members.leave': { on: 'workspace', roles: { owner: 'ALLOWED', member: 'ALLOWED' } },
  'project.create': { on: 'workspace', roles: { owner: 'ALLOWED', member: 'ALLOWED' } },
  'project.read': { on: 'project', roles: { owner: 'ALLOWED', member: 'ALLOWED' }, whileDeleting: 'allowed' },
  'project.build': { on: 'project', roles: { owner: 'ALLOWED', member: 'ALLOWED' }, whileDeleting: 'refused' },
  'connections.bind': { on: 'project', roles: { owner: 'ALLOWED', member: 'CONNECTOR_BINDING_MANAGE_REQUIRED' }, whileDeleting: 'refused' },
  'application.manage': { on: 'project', roles: { owner: 'ALLOWED', member: 'APPLICATION_ACCESS_MANAGE_REQUIRED' }, whileDeleting: 'refused' },
  'project.delete': { on: 'project', roles: { owner: 'ALLOWED', member: 'PROJECT_DELETE_DENIED' }, whileDeleting: 'allowed' },
  'connection.manage': { on: 'administrator', refusal: 'INSTALLATION_ADMINISTRATOR_REQUIRED' },
  'administrators.manage': { on: 'administrator', refusal: 'INSTALLATION_ADMINISTRATOR_REQUIRED' },
} as const satisfies ActionCatalog

const CHANGES_OWNER_SET = ['members.manage', 'members.leave'] as const satisfies readonly WorkspaceAction[]
type ChangesOwnerSet = (typeof CHANGES_OWNER_SET)[number]

export type Scope =
  | Readonly<{ kind: 'account'; accountId: AccountId }>
  | Readonly<{ kind: 'installation-administrator'; accountId: AccountId; action: 'administrators.manage' }>
  | Readonly<{ kind: 'installation-administrator'; accountId: AccountId; action: 'connection.manage'; workspaceId: WorkspaceId }>
  | { [A in WorkspaceAction]: Readonly<{ kind: 'workspace'; accountId: AccountId; workspaceId: WorkspaceId; role: WorkspaceRole; action: A }> & (A extends ChangesOwnerSet ? Readonly<{ owners: readonly OwnerRow[] }> : object) }[WorkspaceAction]
  | Readonly<{ kind: 'project'; accountId: AccountId; workspaceId: WorkspaceId; projectId: ProjectId; role: WorkspaceRole; action: ProjectAction }>
  | Readonly<{ kind: 'application'; accountId: AccountId; projectId: ProjectId; via: 'grant' | 'membership' }>
  | Readonly<{ kind: 'run'; builderRunId: BuilderRunId; accountId: AccountId; projectId: ProjectId; owner: RunOwner; via: 'account' | 'executor' }>
  | Readonly<{ kind: 'bootstrap'; issuer: string; subject: string }>
  | Readonly<{ kind: 'system'; job: JobName }>

export type AccountScope = Extract<Scope, { kind: 'account' }>
export type ProjectScope<A extends ProjectAction = ProjectAction> = Extract<Scope, { kind: 'project' }> & Readonly<{ action: A }>
export type AdministratorScope<A extends AdministratorAction = AdministratorAction> = Extract<Scope, { kind: 'installation-administrator'; action: A }>
export type ApplicationScope = Extract<Scope, { kind: 'application' }>
export type RunScope = Extract<Scope, { kind: 'run' }>
export type BootstrapScope = Extract<Scope, { kind: 'bootstrap' }>
/** The provider pair that is a person's identity. */
export type ProviderIdentity = Readonly<{ issuer: string; subject: string }>
const ConfiguredIdentitySchema = z.object({ issuer: z.string().min(1), subject: z.string().min(1) }).brand<'ConfiguredIdentity'>()
/** The operator's configured identity, the only one that may found an installation. */
export type ConfiguredIdentity = z.output<typeof ConfiguredIdentitySchema>
/** Made once at boot from the configured issuer and subject. */
export const configuredIdentity = (identity: ProviderIdentity): ConfiguredIdentity => ConfiguredIdentitySchema.parse(identity)
export type SystemScope<J extends JobName = JobName> = Extract<Scope, { kind: 'system' }> & Readonly<{ job: J }>
export type WorkspaceScope<A extends WorkspaceAction> = Extract<Scope, { kind: 'workspace'; action: A }>
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

/** An account row's id and whether it is active, the one shape every lock and lookup of an account reads. */
export const ActiveAccount = z.object({ account_id: AccountIdSchema, active: z.boolean() })
/** The row an existence check selects as `1 AS present`. */
export const Present = z.object({ present: z.literal(1) })
const Member = z.object({ role: WorkspaceRole })
const Locked = z.object({ locked: z.number() })
const ProjectWorkspace = z.object({ workspace_id: WorkspaceIdSchema })
const ProjectAccess = ProjectWorkspace.extend({ role: WorkspaceRole })
const Access = z.object({ member: z.boolean(), granted: z.boolean() })

type RefusalReason = 'OUTSIDER' | 'FORBIDDEN' | 'TOMBSTONE' | 'INACTIVE'
/** An admission refusal answers its code and nothing else; the reason reaches the log only, so an outsider learns nothing from the response. */
const refuse = (code: FailureCode, refusal: RefusalReason): Failure => new Failure(code, { details: { refusal } })

// Only the refusal path asks: a project with a deletion row is a tombstone, any other refusal is an outsider.
const missingProject = async (tx: TxQueries, projectId: ProjectId): Promise<RefusalReason> =>
  (await tx.maybe(Present, sql`SELECT 1 AS present FROM project.project_deletion WHERE project_id = ${projectId}`)) ? 'TOMBSTONE' : 'OUTSIDER'

const refusedActor = (): Failure => new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'GATE_ACTOR_REFUSED' } })

// A command admission takes the actor from its gate: the account of a person's transaction, or the account an authentication lookup bound.
const accountGate = (gate: CommandGate | AuthenticationGate): Readonly<{ tx: WriteTx; accountId: AccountId }> => {
  const { tx, actor } = openGate(gate)
  if (actor.kind === 'job' || actor.accountId === null) throw refusedActor()
  return { tx, accountId: actor.accountId }
}

// A read admission takes the actor from the read's own account; it has no transaction to lock with.
const subjectOf = (gate: ReadGate | CommandGate): Readonly<{ tx: ReadTx | WriteTx; writer: WriteTx | null; accountId: AccountId }> => {
  if (gate.mode === 'read') {
    const tx = openReadGate(gate)
    if (tx.accountId === null) throw refusedActor()
    return { tx, writer: null, accountId: tx.accountId }
  }
  const { tx, accountId } = accountGate(gate)
  return { tx, writer: tx, accountId }
}

const lockAccount = (tx: WriteTx, accountId: AccountId) =>
  tx.maybe(ActiveAccount, sql`SELECT account_id, active FROM iam.account WHERE account_id = ${accountId} FOR SHARE`)

const lockActiveAccount = async (tx: WriteTx, accountId: AccountId): Promise<void> => {
  const account = await lockAccount(tx, accountId)
  if (!account) throw new Failure('ACCOUNT_NOT_FOUND')
  if (!account.active) throw new Failure('ACCOUNT_INACTIVE')
}

export function admitAccount(gate: ReadGate): Promise<Admitted<AccountScope, 'read'>>
export function admitAccount(gate: CommandGate | AuthenticationGate): Promise<Admitted<AccountScope>>
export async function admitAccount(gate: ReadGate): Promise<Admitted<AccountScope, 'read'>>
export async function admitAccount(gate: CommandGate | AuthenticationGate): Promise<Admitted<AccountScope>>
export async function admitAccount(gate: ReadGate | CommandGate | AuthenticationGate): Promise<Admitted<AccountScope, Mode>> {
  if (gate.mode === 'read') {
    const tx = openReadGate(gate)
    if (tx.accountId === null) throw refusedActor()
    const account = await tx.maybe(ActiveAccount, sql`SELECT account_id, active FROM iam.account WHERE account_id = ${tx.accountId}`)
    if (!account) throw new Failure('ACCOUNT_NOT_FOUND')
    if (!account.active) throw new Failure('ACCOUNT_INACTIVE')
    return new Proof({ kind: 'account', accountId: tx.accountId }, tx)
  }
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
  const owners = await tx.rows(ActiveAccount, sql`
    SELECT membership.account_id, account.active FROM iam.workspace_membership AS membership
    JOIN iam.account AS account ON account.account_id = membership.account_id
    WHERE membership.workspace_id = ${workspaceId} AND membership.role = 'owner'
    ORDER BY membership.account_id
  `)
  return owners.map((row) => ({ accountId: row.account_id, active: row.active }))
}

const memberOf = (tx: TxQueries, accountId: AccountId, workspaceId: WorkspaceId, lock: Sql) =>
  tx.maybe(Member, sql`SELECT role FROM iam.workspace_membership WHERE account_id = ${accountId} AND workspace_id = ${workspaceId}${lock}`)

export function admitWorkspace<A extends ReadAction & WorkspaceAction>(gate: ReadGate, input: Readonly<{ workspaceId: WorkspaceId; action: A }>): Promise<Admitted<WorkspaceScope<A>, 'read'>>
export function admitWorkspace<A extends WorkspaceAction>(gate: CommandGate, input: Readonly<{ workspaceId: WorkspaceId; action: A }>): Promise<Admitted<WorkspaceScope<A>>>
export async function admitWorkspace(gate: ReadGate | CommandGate, input: Readonly<{ workspaceId: WorkspaceId; action: WorkspaceAction }>): Promise<Admitted<Scope, Mode>> {
  const { tx, writer, accountId } = subjectOf(gate)
  const { workspaceId, action } = input
  const rule = ACTIONS[action]
  // An outsider is refused before any lock, so it never holds a Workspace's owner rows; the locked read below decides.
  if (writer && !(await memberOf(writer, accountId, workspaceId, sql``))) throw refuse(SUBJECT_NOT_FOUND.workspaceId, 'OUTSIDER')
  const owners = writer && CHANGES_OWNER_SET.some((candidate) => candidate === action) ? await lockOwners(writer, workspaceId) : null
  // A read leaves the account to the membership policy, which hides an inactive account's memberships, so it reads as an outsider.
  if (writer) await lockActiveAccount(writer, accountId)
  else await requireActiveReadAccount(tx, accountId)
  // A leaving member deletes its own row, so it takes it for update; every other action reads it.
  const lock = !writer ? sql`` : action === 'members.leave' ? sql` FOR UPDATE` : sql` FOR SHARE`
  const member = await memberOf(tx, accountId, workspaceId, lock)
  if (!member) throw refuse(SUBJECT_NOT_FOUND.workspaceId, 'OUTSIDER')
  const permission = rule.roles[member.role]
  if (permission !== 'ALLOWED') throw refuse(permission, 'FORBIDDEN')
  if (action === 'members.manage' || action === 'members.leave') {
    if (!owners) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'OWNER_SET_NOT_LOCKED' } })
    return new Proof({ kind: 'workspace', accountId, workspaceId, role: member.role, action, owners }, tx)
  }
  return new Proof({ kind: 'workspace', accountId, workspaceId, role: member.role, action }, tx)
}

const requireActiveReadAccount = async (tx: TxQueries, accountId: AccountId): Promise<void> => {
  const account = await tx.maybe(ActiveAccount, sql`SELECT account_id, active FROM iam.account WHERE account_id = ${accountId}`)
  if (!account) throw new Failure('ACCOUNT_NOT_FOUND')
  if (!account.active) throw new Failure('ACCOUNT_INACTIVE')
}

export const grantCreatorMembership = async (creator: Admitted<AccountScope>, workspaceId: WorkspaceId): Promise<void> => {
  const founded = await creator.tx.run(sql`
    INSERT INTO iam.workspace_membership (account_id, workspace_id, role)
    SELECT ${creator.scope.accountId}::uuid, ${workspaceId}::uuid, 'owner'
    WHERE NOT EXISTS (SELECT 1 FROM iam.workspace_membership WHERE workspace_id = ${workspaceId}::uuid)`)
  if (founded !== 1) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'WORKSPACE_ALREADY_FOUNDED' } })
}

/** The one spelling of "this Project is not being deleted", over a `project.project` alias. */
export const notInDeletion = (project: Sql) => sql`NOT EXISTS (SELECT 1 FROM project.project_deletion AS deletion WHERE deletion.project_id = ${project}.project_id)`

// A project with any deletion row is refused, an administrator included: its deletion takes the row for update first.
const ProjectSubject = ProjectWorkspace.extend({ deleting: z.boolean() })
const projectSubject = (projectId: ProjectId, lock: Sql) => sql`
  SELECT stored.workspace_id, EXISTS (SELECT 1 FROM project.project_deletion AS deletion WHERE deletion.project_id = stored.project_id) AS deleting
  FROM project.project AS stored WHERE stored.project_id = ${projectId}${lock}`
const liveProject = (projectId: ProjectId, lock: Sql) => sql`
  SELECT workspace_id FROM project.project AS stored
  WHERE stored.project_id = ${projectId} AND ${notInDeletion(sql`stored`)}${lock}`

/**
 * Takes a live Project FOR SHARE, so a purge waits, and reads it again in a new statement: a tombstone
 * that committed while the lock waited is invisible to the locked row. False when it is being deleted.
 */
const lockProject = async (tx: WriteTx, projectId: ProjectId): Promise<z.output<typeof ProjectSubject> | null> => {
  await tx.maybe(ProjectSubject, projectSubject(projectId, sql` FOR SHARE`))
  return tx.maybe(ProjectSubject, projectSubject(projectId, sql``))
}
const lockLiveProject = async (tx: WriteTx, projectId: ProjectId): Promise<boolean> => {
  await tx.maybe(ProjectWorkspace, liveProject(projectId, sql` FOR SHARE`))
  return (await tx.maybe(ProjectWorkspace, liveProject(projectId, sql``))) !== null
}

export function admitProject<A extends ProjectAction>(gate: CommandGate, input: Readonly<{ projectId: ProjectId; action: A }>): Promise<Admitted<ProjectScope<A>>>
export function admitProject<A extends ReadAction & ProjectAction>(gate: ReadGate, input: Readonly<{ projectId: ProjectId; action: A }>): Promise<Admitted<ProjectScope<A>, 'read'>>
export async function admitProject(gate: ReadGate | CommandGate, input: Readonly<{ projectId: ProjectId; action: ProjectAction }>): Promise<Admitted<Scope, Mode>> {
  const { tx, writer, accountId } = subjectOf(gate)
  const { projectId, action } = input
  if (writer) await lockActiveAccount(writer, accountId)
  else await requireActiveReadAccount(tx, accountId)
  const rule = ACTIONS[action]
  if (rule.on !== 'project') throw new Failure('INTERNAL_UNEXPECTED')
  const found = await tx.maybe(ProjectSubject, projectSubject(projectId, sql``))
  if (!found) throw refuse(SUBJECT_NOT_FOUND.projectId, await missingProject(tx, projectId))
  const member = await memberOf(tx, accountId, found.workspace_id, writer ? sql` FOR SHARE` : sql``)
  if (!member) throw refuse(SUBJECT_NOT_FOUND.projectId, 'OUTSIDER')
  const permission = rule.roles[member.role]
  if (permission !== 'ALLOWED') throw refuse(permission, 'FORBIDDEN')
  const current = writer ? await lockProject(writer, projectId) : found
  if (!current) throw refuse(SUBJECT_NOT_FOUND.projectId, 'OUTSIDER')
  if (current.deleting && rule.whileDeleting === 'refused') throw refuse('PROJECT_DELETING', 'TOMBSTONE')
  return new Proof({ kind: 'project', accountId, workspaceId: current.workspace_id, projectId, role: member.role, action }, tx)
}

export function admitInstallationAdministrator(gate: CommandGate, input: Extract<AdministratorInput, { action: 'administrators.manage' }>): Promise<Admitted<AdministratorScope<'administrators.manage'>>>
export function admitInstallationAdministrator(gate: CommandGate, input: Extract<AdministratorInput, { action: 'connection.manage' }>): Promise<Admitted<AdministratorScope<'connection.manage'>>>
export function admitInstallationAdministrator(gate: ReadGate, input: Extract<AdministratorInput, { action: 'administrators.manage' }>): Promise<Admitted<AdministratorScope<'administrators.manage'>, 'read'>>
export function admitInstallationAdministrator(gate: ReadGate, input: Extract<AdministratorInput, { action: 'connection.manage' }>): Promise<Admitted<AdministratorScope<'connection.manage'>, 'read'>>
export async function admitInstallationAdministrator(gate: ReadGate | CommandGate, input: AdministratorInput): Promise<Admitted<Scope, Mode>> {
  const { action } = input
  const refusal = ACTIONS[action].refusal
  const { tx, writer, accountId } = subjectOf(gate)
  if (!writer) {
    await requireActiveReadAccount(tx, accountId)
    const tenure = await tx.maybe(Present, sql`SELECT 1 AS present FROM iam.installation_administrator WHERE account_id = ${accountId} AND revoked_at IS NULL`)
    if (!tenure) throw refuse(refusal, 'OUTSIDER')
    if (action === 'connection.manage') {
      const exists = await tx.maybe(Present, sql`SELECT 1 AS present FROM workspace.workspace WHERE workspace_id = ${input.workspaceId}`)
      if (!exists) throw refuse(SUBJECT_NOT_FOUND.workspaceId, 'OUTSIDER')
      return new Proof({ kind: 'installation-administrator', accountId, action, workspaceId: input.workspaceId }, tx)
    }
    return new Proof({ kind: 'installation-administrator', accountId, action }, tx)
  }
  const commandTx = writer
  if (action === 'administrators.manage') await commandTx.run(sql`SELECT iam.lock_administrators()`)
  const account = await lockAccount(commandTx, accountId)
  if (!account?.active) throw refuse(refusal, 'INACTIVE')
  // A revoke that commits while this waits makes the row fail its predicate when it is read again.
  const tenure = await commandTx.maybe(Present, sql`
    SELECT 1 AS present FROM iam.installation_administrator WHERE account_id = ${accountId} AND revoked_at IS NULL FOR SHARE`)
  if (!tenure) throw refuse(refusal, 'OUTSIDER')
  if (action === 'connection.manage') {
    const exists = await commandTx.maybe(Present, sql`SELECT 1 AS present FROM workspace.workspace WHERE workspace_id = ${input.workspaceId}`)
    if (!exists) throw refuse(SUBJECT_NOT_FOUND.workspaceId, 'OUTSIDER')
    return new Proof({ kind: 'installation-administrator', accountId, action, workspaceId: input.workspaceId }, tx)
  }
  return new Proof({ kind: 'installation-administrator', accountId, action }, tx)
}

export const readAdministratorFlag = async (proof: Admitted<AccountScope, 'read'>): Promise<boolean> =>
  (await proof.tx.maybe(Present, sql`SELECT 1 AS present FROM iam.installation_administrator WHERE account_id = ${proof.scope.accountId} AND revoked_at IS NULL`)) !== null

const applicationAccess = (accountId: AccountId, projectId: ProjectId) => sql`
  SELECT
    EXISTS (SELECT 1 FROM iam.workspace_membership AS membership
      WHERE membership.account_id = ${accountId} AND membership.workspace_id = stored.workspace_id) AS member,
    EXISTS (SELECT 1 FROM iam.application_grant AS access_grant
      WHERE access_grant.account_id = ${accountId} AND access_grant.project_id = stored.project_id AND access_grant.revoked_at IS NULL) AS granted
  FROM project.project AS stored
  WHERE stored.project_id = ${projectId} AND NOT stored.archived
    AND EXISTS (SELECT 1 FROM iam.account AS account WHERE account.account_id = ${accountId} AND account.active)
    AND ${notInDeletion(sql`stored`)}
    AND EXISTS (SELECT 1 FROM iam.application AS application WHERE application.project_id = stored.project_id)`

export const admitApplication = async (gate: CommandGate | AuthenticationGate, projectId: ProjectId): Promise<Admitted<ApplicationScope>> => {
  const { tx, accountId } = accountGate(gate)
  const account = await lockAccount(tx, accountId)
  if (!account?.active) throw refuse('APPLICATION_NOT_FOUND', 'INACTIVE')
  const found = await tx.maybe(ProjectWorkspace, liveProject(projectId, sql``))
  if (!found) throw refuse('APPLICATION_NOT_FOUND', await missingProject(tx, projectId))
  const member = await memberOf(tx, accountId, found.workspace_id, sql` FOR SHARE`)
  if (!(await lockLiveProject(tx, projectId))) throw refuse('APPLICATION_NOT_FOUND', 'TOMBSTONE')
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
 * served read that changes nothing. A command that writes in its transaction admits instead. An
 * authentication gate must have bound an account.
 */
export const checkApplication = async (gate: CommandGate | AuthenticationGate, projectId: ProjectId): Promise<Checked<ApplicationScope>> => {
  const { tx, accountId } = accountGate(gate)
  const access = await tx.maybe(Access, applicationAccess(accountId, projectId))
  if (!access || !(access.member || access.granted)) throw refuse('APPLICATION_NOT_FOUND', await missingProject(tx, projectId))
  return new Checked({ kind: 'application', accountId, projectId, via: access.member ? 'membership' : 'grant' }, readOnlyView(tx))
}

const projectAccess = (accountId: AccountId, projectId: ProjectId) => sql`
  SELECT stored.workspace_id, membership.role FROM project.project AS stored
  JOIN iam.workspace_membership AS membership ON membership.workspace_id = stored.workspace_id AND membership.account_id = ${accountId}
  WHERE stored.project_id = ${projectId}
    AND EXISTS (SELECT 1 FROM iam.account AS account WHERE account.account_id = ${accountId} AND account.active)
    AND ${notInDeletion(sql`stored`)}`

/** The Preview's twin of checkApplication: the account's membership of the Project's Workspace and no deletion row, in one statement that locks no row. */
export const checkProject = async (gate: CommandGate | AuthenticationGate, projectId: ProjectId): Promise<Checked<ProjectScope<'project.read'>>> => {
  const { tx, accountId } = accountGate(gate)
  const found = await tx.maybe(ProjectAccess, projectAccess(accountId, projectId))
  if (!found) throw refuse('PROJECT_NOT_FOUND', await missingProject(tx, projectId))
  return new Checked({ kind: 'project', accountId, workspaceId: found.workspace_id, projectId, role: found.role, action: 'project.read' }, readOnlyView(tx))
}

const RunRow = z.object({ project_id: ProjectIdSchema, account_id: AccountIdSchema, owner_id: z.string().nullable() })
const RunPlace = z.object({ project_id: ProjectIdSchema, account_id: AccountIdSchema, workspace_id: WorkspaceIdSchema.nullable() })

const notAdmitted = (): Failure => new Failure('BUILDER_RUN_NOT_ADMITTED')

// A run row is locked by its own id, after the Project: the purge takes the Project first, so the order never crosses.
const lockedRun = async (tx: WriteTx, builderRunId: BuilderRunId, projectId: ProjectId, owner: RunOwner): Promise<z.output<typeof RunRow>> => {
  if (!(await lockLiveProject(tx, projectId))) throw notAdmitted()
  const run = await tx.maybe(RunRow, sql`SELECT project_id, account_id, owner_id::text AS owner_id FROM builder.builder_run WHERE builder_run_id = ${builderRunId} AND state = ANY(${OPEN_RUN_STATES}::text[]) FOR UPDATE`)
  if (!run || run.project_id !== projectId || run.owner_id !== owner.ownerId) throw notAdmitted()
  return run
}

/**
 * The admission of a run the executor owns. Under a person's transaction it also requires the
 * account's build authority; under `system('builder-executor')` the run's owner is the only proof.
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
    if (place.workspace_id === null) throw notAdmitted()
    const account = await lockAccount(tx, place.account_id)
    if (!account?.active) throw notAdmitted()
    const member = await memberOf(tx, place.account_id, place.workspace_id, sql` FOR SHARE`)
    if (!member || ACTIONS['project.build'].roles[member.role] !== 'ALLOWED') throw notAdmitted()
    const run = await lockedRun(tx, builderRunId, place.project_id, owner)
    return new Proof({ kind: 'run', builderRunId, accountId: run.account_id, projectId: place.project_id, owner, via: 'executor' }, tx)
  }
  if (place.account_id !== actor.accountId || place.workspace_id === null) throw notAdmitted()
  await lockActiveAccount(tx, actor.accountId)
  const member = await memberOf(tx, actor.accountId, place.workspace_id, sql` FOR SHARE`)
  if (!member) throw refuse(SUBJECT_NOT_FOUND.projectId, 'OUTSIDER')
  const permission = ACTIONS['project.build'].roles[member.role]
  if (permission !== 'ALLOWED') throw refuse(permission, 'FORBIDDEN')
  const run = await lockedRun(tx, builderRunId, place.project_id, owner)
  return new Proof({ kind: 'run', builderRunId, accountId: run.account_id, projectId: place.project_id, owner, via: 'account' }, tx)
}

const NoAccount = z.object({ empty: z.boolean() })

/**
 * The founding of an installation: under the administrators' table lock, a proof only while no account exists.
 * Null means an account exists now, so a parallel first sign in of the same person founded it first.
 */
export const admitBootstrap = async (gate: AuthenticationGate, identity: ConfiguredIdentity): Promise<Admitted<BootstrapScope> | null> => {
  const { tx, actor } = openGate(gate)
  if (actor.kind !== 'authentication' || actor.accountId !== null) throw refusedActor()
  await tx.run(sql`SELECT iam.lock_administrators()`)
  const { empty } = await tx.one(NoAccount, sql`SELECT NOT EXISTS (SELECT 1 FROM iam.account) AS empty`, 'INTERNAL_UNEXPECTED')
  return empty ? new Proof({ kind: 'bootstrap', issuer: identity.issuer, subject: identity.subject }, tx) : null
}

type ReceiptScope = AccountScope | WorkspaceScope<WorkspaceAction> | ProjectScope | AdministratorScope

/** The receipt of a keyed command, whose authority is derived from its proof's scope and never passed. */
export const receiptOf = (proof: Admitted<ReceiptScope>): Receipted => {
  const { scope } = proof
  switch (scope.kind) {
    case 'account': return receipted(proof.tx, { kind: 'account', accountId: scope.accountId })
    case 'workspace':
    case 'project': return receipted(proof.tx, { kind: 'workspace', workspaceId: scope.workspaceId, accountId: scope.accountId })
    case 'installation-administrator': return receipted(proof.tx, { kind: 'installation', accountId: scope.accountId })
  }
}

export const admitSystem = <J extends JobName>(gate: CommandGate, job: J): Promise<Admitted<SystemScope<J>>> => {
  const { tx, actor } = openGate(gate)
  if (actor.kind !== 'job') return Promise.reject(refusedActor())
  if (actor.job !== job) return Promise.reject(new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'GATE_JOB_MISMATCH' } }))
  return Promise.resolve(new Proof({ kind: 'system', job }, tx))
}
