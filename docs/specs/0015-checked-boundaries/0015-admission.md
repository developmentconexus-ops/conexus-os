# 0015. Child: the admission proof and the split wall

Part of [spec 0015](index.md). Covers who may act: the typed proof every command requires, the
admission functions that make it, the lock order, the two database roles a transaction runs as (a
reader under Row Level Security and a command role under the proof), the second wall on writes, the
callers that do not act for a signed in person, and the two cases the move must keep (`createWorkspace` and the
concurrent revoke). Satisfies AC-7 to AC-9 of the umbrella. Revision 5 replaces section 4 and the
policy rules of revision 4; what it deleted is listed in section 9. Revision 5.1 answers the two
interrogations of revision 5, and revision 5.2 answers the confirmation of 5.1; what each changed and
why is listed in section 11.

## Summary

A command cannot run without a proof that only an admission function can make, and that function
locks the rows it read inside the command's own transaction, in the same order today's functions lock
them, so a forgotten check does not compile and a revoke cannot slip between the check and the write.
Reads and commands get different walls. A person's read runs as `hub_reader`, which may only `SELECT`
and sees only the rows the policies show the acting account, so a list query that forgets its filter
still returns only those rows. A command runs as `hub_command`, whose one policy per table is
`USING (true) WITH CHECK (true)`: the proof decides what it may touch, and composite tenant keys,
column grants and lints hold what the database can hold. Spike 2 showed that a typed read without the
filter compiled and leaked, which is why reads keep the database wall. The census of revision 4 showed
that every hole the reviews found sat in a write, lock, credential or system branch, which is why
commands no longer have one.

## 1. The proof

```ts
// identity-access/admission.ts. Proof is not exported; only the admit functions construct it.
class Proof<S extends Scope, M extends Mode> {
  readonly #brand = true
  constructor(readonly scope: S, readonly tx: TxOf<M>) {}
}
export type Admitted<S extends Scope, M extends Mode = 'write'> = Proof<S, M>
type TxOf<M extends Mode> = M extends 'write' ? WriteTx : ReadTx   // data child, section 1
```

A class with a `#private` field is nominal in TypeScript: an object literal, a spread copy with a
changed `workspaceId`, `undefined`, a member proof where an owner proof is due, and a project proof
where a workspace proof is due all fail `tsc` (spike 2, cases 17 to 33). A symbol keyed object was
copyable by spread, so it is not used. The mode is real structure: `WriteTx` has `run` and
`mode: 'write'`, `ReadTx` has neither, so a read proof is not assignable where a write proof is due
(a write proof may be used for a read). Only a cast passes, and Biome's `noUnsafeTypeAssertion`
refuses it. `.agents/skills/conexus-development/references/shapes.md` allows a class only for `Error`,
`Failure` or a library base; it gains "or a nominal proof whose constructor is private to its module".

```ts
type WorkspaceRole = 'owner' | 'member'          // the iam.workspace_role values, lowercase
type WorkspaceAction = 'workspace.read' | 'members.manage' | 'members.leave' | 'project.create' | 'project.build'
type ProjectAction = 'project.read' | 'project.build'
type AdministratorAction = 'project.delete' | 'connection.manage' | 'administrators.manage'   // closed: the commands an installation administrator runs across Workspaces
type JobName = 'iam-reaper' | 'project-purge' | 'builder-executor'   // closed list, one per caller of system()
type RunOwner = { readonly ownerId: string }   // builder_run.owner_id, the executor instance's randomUUID, as today; the heartbeat stays a column

type Scope =
  | { readonly kind: 'account'; readonly accountId: AccountId }
  | { readonly kind: 'installation-administrator'; readonly accountId: AccountId; readonly action: AdministratorAction }
  | { readonly kind: 'workspace'; readonly accountId: AccountId; readonly workspaceId: WorkspaceId; readonly role: WorkspaceRole; readonly action: WorkspaceAction; readonly owners: readonly OwnerRow[] | null }
  | { readonly kind: 'project'; readonly accountId: AccountId; readonly workspaceId: WorkspaceId; readonly projectId: ProjectId; readonly action: ProjectAction }
  | { readonly kind: 'application'; readonly accountId: AccountId; readonly projectId: ProjectId; readonly via: 'grant' | 'membership' }
  | { readonly kind: 'run'; readonly builderRunId: BuilderRunId; readonly accountId: AccountId; readonly projectId: ProjectId; readonly owner: RunOwner; readonly via: 'account' | 'executor' }
  | { readonly kind: 'bootstrap'; readonly issuer: string; readonly subject: string }   // from a ConfiguredIdentity; not a receipt scope
  | { readonly kind: 'system'; readonly job: JobName }
```

```ts
type Action = WorkspaceAction | ProjectAction | AdministratorAction
type ReadAction = 'workspace.read' | 'project.read' | 'connections.bind' | 'application.manage'   // the actions a read admission may name; the last two are owner only in ROLE_ALLOWS
type ChangesOwnerSet = (typeof CHANGES_OWNER_SET)[number]
type AccountScope = Extract<Scope, { kind: 'account' }>
type ProjectScope<A extends ProjectAction = ProjectAction> = Extract<Scope, { kind: 'project' }> & { readonly action: A }
type AdministratorScope<A extends AdministratorAction> = Extract<Scope, { kind: 'installation-administrator' }> & { readonly action: A }
type ApplicationScope = Extract<Scope, { kind: 'application' }>
type RunScope = Extract<Scope, { kind: 'run' }>
type BootstrapScope = Extract<Scope, { kind: 'bootstrap' }>
type SystemScope<J extends JobName = JobName> = Extract<Scope, { kind: 'system' }> & { readonly job: J }
type OwnerRow = { readonly accountId: AccountId; readonly active: boolean }
// owners is the locked owner set for an action in CHANGES_OWNER_SET, and null for every other action:
type WorkspaceScope<A extends WorkspaceAction> = Extract<Scope, { kind: 'workspace' }> & {
  readonly action: A
  readonly owners: A extends ChangesOwnerSet ? readonly OwnerRow[] : null
}
```

Revision 5 removes two things from this union. The `connection` variant and `ConnectionAction` go:
no admission makes them, and the connection commands are a workspace owner's action or an
administrator's. `project.delete` leaves `ProjectAction` for `AdministratorAction`, because today
only an installation administrator deletes a project (`project/deletion.ts:40-53`). `JobName` loses
`'migration'`: migrations run on the provisioning connection, and no caller in `apps/hub/src` names it.

`members.leave` names what today's `iam.remove_workspace_member` allows a member to do to itself (it
admits `workspace.read` when the actor is the member). The action lists above are the ones today's
functions check; each part may add the actions its operations check, and a new action is a row of
`ROLE_ALLOWS` and of `ACTION_REFUSALS`, not a change to this union's shape.

**Read actions that only an owner may take** (HQ decision, revision 5.3). `ReadAction` names four
actions: `'workspace.read'`, `'project.read'`, `'connections.bind'` (part 2, `listProjectConnectionBindings`) and
`'application.manage'` (part 6, IAM-11). The last two are owner only through `ROLE_ALLOWS`. The read
overload of `admitProject` takes any action that is both a `ReadAction` and a `ProjectAction`. So a
list that only an owner may read stays a `read()`: the route walk of section 10 is unchanged, and no
part opens a command transaction just to get an owner check. The rule for the next such list is the
same: a list that only a role may read is a read action.

**A read only proof for served reads.** `Checked` is a second nominal class, apart from `Admitted`. Only `checkApplication` makes one (section 2), and its `tx` is a `ReadTx`.

```ts
export class Checked<S extends Scope> {
  readonly #brand = true
  constructor(readonly scope: S, readonly tx: ReadTx) {}
}
```

A served read port takes `Checked<ApplicationScope>`. A command port takes an `Admitted`, which a `Checked` is not, so no command port accepts it, and a `ReadTx` has no `run`, so a read port cannot write.

**The run scope carries the Project and the path.** `RunScope` has `projectId`, read from the run row by
`admitRun`, and `via`, `'account'` under `transaction(run.accountId)` and `'executor'` under `system('builder-executor')`. Part 1 adds both. The two paths check different things, and the scope records which one admitted, as `ApplicationScope.via` does. Every run scoped statement then filters by `proof.scope.projectId`, as the
scoped read rule below asks, and part 4's retention takes its Project from the proof and not from a
second read of the run row.

**Ids.** The ids of the admitted scope come only from the proof. An id the command creates or acts on
inside that scope is an argument (`grantCreatorMembership(creator, workspaceId)`,
`removeMember(owner, member)`). A command never takes a second id of the scope's own kind.

**Every command read is scoped.** The command role sees every row, so a read by exact id that does
not name the scope would answer another tenant's row. The rule: every statement a command runs on a
tenant table filters by a scope column taken from the proof (`proof.scope.projectId` or
`proof.scope.workspaceId`), and an argument id is only ever a second condition beside it. A child
table whose parent carries the tenant through a composite key (section 5) is scoped by the project id
alone. What proves the rule is the per operation cross tenant test of section 10: each operation runs
as a member or grantee of tenant A with tenant B's ids, answers its not found or refused code, and
changes no row.

## 2. Admission and locks

```ts
// A command admission takes no accountId: it reads the actor from the gate. A read admission reads it from ReadTx.accountId.
export function admitAccount(gate: CommandGate | AuthenticationGate): Promise<Admitted<AccountScope>>
export function admitWorkspace<A extends WorkspaceAction>(gate: CommandGate, workspaceId: WorkspaceId, action: A): Promise<Admitted<WorkspaceScope<A>>>
export function admitWorkspace<A extends ReadAction & WorkspaceAction>(tx: ReadTx, workspaceId: WorkspaceId, action: A): Promise<Admitted<WorkspaceScope<A>, 'read'>>
export function admitProject<A extends ProjectAction>(gate: CommandGate, projectId: ProjectId, action: A): Promise<Admitted<ProjectScope<A>>>
export function admitProject<A extends ReadAction & ProjectAction>(tx: ReadTx, projectId: ProjectId, action: A): Promise<Admitted<ProjectScope<A>, 'read'>>
export function admitInstallationAdministrator<A extends AdministratorAction>(gate: CommandGate, action: A): Promise<Admitted<AdministratorScope<A>>>
export function isInstallationAdministrator(tx: ReadTx): Promise<boolean>   // a fact, not a proof: listWorkspaceConnections (part 2), IAM-14 and IAM-15 (part 6)
export function admitApplication(gate: CommandGate | AuthenticationGate, projectId: ProjectId): Promise<Admitted<ApplicationScope>>   // built in part 0b; an authentication gate must have bound an account (part 6)
export function checkApplication(gate: CommandGate | AuthenticationGate, projectId: ProjectId): Promise<Checked<ApplicationScope>>   // an authentication gate must have bound an account (part 6); built in part 0b: served reads, no row lock, ReadTx only
export function admitRun(gate: CommandGate, builderRunId: BuilderRunId, owner: RunOwner): Promise<Admitted<RunScope>>   // body in part 1
export function admitBootstrap(gate: AuthenticationGate, identity: ConfiguredIdentity): Promise<Admitted<BootstrapScope> | null>   // part 6
export function admitSystem<J extends JobName>(gate: CommandGate, job: J): Promise<Admitted<SystemScope<J>>>
export const ROLE_ALLOWS: { readonly [R in WorkspaceRole]: readonly WorkspaceAction[] }  // iam.role_allows as a table
export const CHANGES_OWNER_SET = ['members.manage', 'members.leave'] as const satisfies readonly WorkspaceAction[]
```

`CommandGate` is what `database.transaction` and `database.system` hand their callbacks, and
`AuthenticationGate` what `database.authenticate` hands its callback (data child, section 1). A gate
has no query method. It is a class with a `#private` field whose constructor is private to `db.ts`, so
an object literal or a spread copy fails `tsc`, as for the proof. `db.ts` keeps, in a module
`WeakMap`, the gate's `WriteTx` and its actor: the account of a `transaction`, the job of a `system`,
and for `authenticate` the account a digest lookup resolved, or none. `openGate(gate)` returns that
record and is importable only by `identity-access/admission.ts` and `identity-access/authentication.ts`. So a command transaction can do
nothing before its admission, the `WriteTx` reaches the command only as `proof.tx`, and the account
travels once: the entry binds it, and the admission reads it. This matters more now than in revision
4: the command role sees every row, so a read inside a command transaction before admission would not
be bounded by any policy.

What the gate stops is a statement before some admission. It does not choose which admission: a
command handed the wrong proof type fails `tsc` because of the proof's scope type, not because of the
gate. The scope type and the scoped read rule of section 1 are what keep a command inside its tenant.

Each admission checks the actor kind it accepts and throws `INTERNAL_UNEXPECTED` with invariant
`GATE_ACTOR_REFUSED` on another: `admitAccount` takes an account gate or an authentication gate whose
lookup resolved an account; `admitWorkspace`, `admitProject`, `admitInstallationAdministrator` and
`admitApplication` take an account gate; `admitRun` takes an account gate or the job
`'builder-executor'`; `admitSystem` takes a job gate and `job`, throws the same invariant when the gate's job is not `job` (the one runtime check), and puts the job in the scope, so a port that needs one job takes `Admitted<SystemScope<'project-purge'>>` and a proof of another job fails `tsc`; `admitBootstrap`
takes an authentication gate. A read admission whose `ReadTx.accountId` is null throws the same.

The admission takes its locks only in a command transaction: `FOR SHARE OF` the account and the
membership (and the project for `admitProject`), as `iam.admit_workspace` does today
(`0009_remove_model_connections.sql`); in a read transaction it takes no lock, because
PostgreSQL refuses `FOR SHARE` in a READ ONLY transaction (25006, spike 2) and `hub_reader` holds no
privilege that permits a lock (42501 on `FOR SHARE`, `FOR UPDATE`, `FOR NO KEY UPDATE` and
`FOR KEY SHARE`, spike `authz-redesign/spike/spike.md:49-59`). Then it decides in TypeScript over
`ROLE_ALLOWS`. Refusals come from one table in `admission.ts`, keyed by action:

```ts
export const ACTION_REFUSALS: { readonly [A in Action]: { readonly outsider: FailureCode; readonly forbidden: FailureCode } }
// e.g. 'members.manage': { outsider: 'WORKSPACE_NOT_FOUND', forbidden: 'MEMBERS_MANAGE_REQUIRED' }
//      'project.create': { outsider: 'PROJECT_CREATE_DENIED', forbidden: 'PROJECT_CREATE_DENIED' }   (today's 403 for both)
//      'project.delete': { outsider: 'PROJECT_DELETE_DENIED', forbidden: 'PROJECT_DELETE_DENIED' }   (admission.ts:170 today)
//      'connection.manage', 'administrators.manage': both 'INSTALLATION_ADMINISTRATOR_REQUIRED' (connectors/routes.ts:51,86 today)
```

An account that is not `active` is `ACCOUNT_INACTIVE`; an account that is not a member gets the
action's `outsider` code (404, so an outsider cannot tell a missing workspace from one it may not see);
a member without the role gets its `forbidden` code. Each row keeps the code today's function raises;
a part that changes one says so in its child spec.

**The fresh read after a lock wait.** Under READ COMMITTED a row locked `FOR SHARE` after a wait is
returned as it now is, but the rest of the statement used the snapshot taken before the wait. So an
admission that waited on a lock reads its visibility rule again in a new statement. On the command
role no policy hides anything, so that rule is SQL in the admission itself. Revision 4 had this read
lean on the project policy (`admission.ts:159-160` in the built code); revision 5 writes the tombstone
predicate into the query.

**Every admission that reaches a project locks it and reads it again.** `admitProject`,
`admitApplication` and `admitRun` each take the project row `FOR SHARE` (or `FOR UPDATE` for an
action that changes it) and then, in a new statement, read the project with the deletion predicate:
a project with any `project.project_deletion` row is refused (`PROJECT_NOT_FOUND`, or the
admission's own code). Since a deletion takes the project `FOR UPDATE` before it writes its tombstone
and the purge takes it `FOR UPDATE` before it deletes (section 6), an admitted command and a deletion
serialize on the project row, and the one that waited sees the other's commit.

**The deletion rule is stricter than today, on purpose.** Today `iam.admit_project` lets an
installation administrator act on a project whose deletion has started and not completed
(`0030_project_deletion.sql:51-56`, the `NOT iam.is_installation_administrator` exception), and the
built project policy carries the same exception (`0064_project_owner.sql:19-25`). Revision 5.1 drops
that exception for every command admission: any deletion row refuses, for an administrator too. The
deletion's own steps never pass through `admitProject` (they run under
`admitInstallationAdministrator`, then `system`), so nothing that needs the exception loses it. Reads
keep it: an administrator still sees a deletion in progress through the reader policy (section 4.2,
rule 4). This is the rule part 6 already took for application access (`s1-build/part6/hq-decisions-rev4.md:2-4`,
decision 1: no administrator exception, since application access is not part of deletion recovery).

**Lock order: today's, taken inside the admission.** The admission takes every lock the command
needs before its own `FOR SHARE`, in the order today's functions take them, so two commands never
wait on each other in a cycle and no lock is ever upgraded:

1. The set the command changes, first. For an action in `CHANGES_OWNER_SET`, the admission locks all
   of the workspace's owner memberships `FOR UPDATE`, ordered by account id, with each owner's
   `active` flag, before anything else, as `iam.remove_workspace_member` does today
   (`0001_baseline.sql`, lines 815 to 834); `lastOwnerRemoved` counts only the active ones, as today.
   The acting owner's own row is in that set, so its later `FOR SHARE` is already covered. For
   `administrators.manage`, the admission calls `iam.lock_administrators()`, a `SECURITY DEFINER`
   function owned by the table's owner that runs
   `LOCK TABLE iam.installation_administrator IN SHARE ROW EXCLUSIVE MODE`, as
   `0017_installation_administrator.sql:57,83,116` and `0021_first_account_installation_administrator.sql:13` do.
   `hub_command` holds only `UPDATE (revoked_at)` on that table from part 0b (part 6 widens it to
   `(revoked_at, revoked_by)`, section 5), which permits a row lock but not
   `LOCK TABLE`; the function is the one way to take the table lock, and `EXECUTE` on it goes to
   `hub_command` alone.
2. The acting account, then the membership or the open administrator tenure, `FOR SHARE`. For `members.leave` the acting membership is taken `FOR UPDATE`, since the command
   deletes it; an owner's row is already in the step 1 set. So two concurrent leaves of one member
   serialize on the row, and the second finds it gone and answers the outsider code, not 40P01.
3. The resource rows, parent before child: the project first, then a row under it (`admitRun`'s
   run, `admitApplication`'s open grant), each in the mode the action needs at its first read, `FOR UPDATE` for an action that changes
   or deletes it, `FOR SHARE` otherwise. A row is never taken `FOR SHARE` and then `FOR UPDATE` in one
   transaction. Parent before child matters for the purge, which holds the project `FOR UPDATE` and
   then deletes the runs and the grants: an admission that locked its run or its grant first would
   wait on the project in a cycle.
4. The receipt, `FOR UPDATE` (data child, section 3).

The rows locked in step 1 are part of the proof (`owner.scope.owners`), so the command counts from
them and does not read the set again. A tombstone cannot be locked before it exists, so an admitted writer
holds the project row `FOR SHARE` and a deletion holds it `FOR UPDATE` from its admission; they
serialize on the parent row, and two deletions serialize on it too.

**The installation administrator.** `admitInstallationAdministrator(gate, action)` runs in
the person's own command transaction, `database.transaction(accountId, ...)`, not in `system`. It
takes the table lock first for `administrators.manage`, then the account `FOR SHARE` (an inactive
account is refused with the action's code, as Documenso's `adminMiddleware` refuses a disabled
administrator, `refs/calcom-documenso-betterauth-mastra.md`, E5), then the acting account's open
tenure row (`revoked_at IS NULL`) `FOR SHARE`. A revoke that commits while it waits is seen by the
fresh read and refused. Check and write share one transaction and its locks, which closes the time of
check gap that cal.com, Documenso and Better Auth leave open (same file, item 5). The command then runs
on `proof.tx` with the command role's full reach, which is today's reach of the definer functions it
replaces. An administrator's lists are reads, not commands: see section 4. A list that answers 403 to a non
administrator first asks the fact through `isInstallationAdministrator(tx)`, the one function in
`admission.ts` that runs `SELECT rls.acting_installation_administrator()` on the read transaction.
`hub_reader` may execute the helper, so the function needs no grant on
`iam.installation_administrator`. It returns a boolean, not a proof, and takes no lock. Part 2 writes
it for `listWorkspaceConnections` and `checkWorkspaceConnection`, and part 6 uses the same function for IAM-14 and IAM-15, so no part holds a
second copy (HQ decision). The refusal code stays the store's own.

**The project deletion's order.** The tombstone step takes, in order: the account `FOR SHARE` and
the open tenure `FOR SHARE` (the admission), then the project `FOR UPDATE` (`deletion.ts:44` today),
then reads the tombstone again in a new statement, then inserts it with
`INSERT INTO project.project_deletion (project_id, workspace_id, name, requested_by) SELECT project_id, workspace_id, name, <administrator> FROM project.project WHERE project_id = <id>`,
so the tombstone's `workspace_id` is the project row's and never a value carried from an earlier
read (`deletion.ts:50-52` passes it from a separate read today).

**The application.** `admitApplication(gate, projectId)` makes the grantee's proof, and part 0b
builds it, because parts 2 and 4 need it before part 6. In order: the gate's account `FOR SHARE`
(inactive is refused); the actor's membership in the project's workspace `FOR SHARE`, if it has one;
the project `FOR SHARE`; then, when no membership admitted it, the open grant
(`iam.application_grant`, `account_id` the actor, `revoked_at IS NULL`) `FOR SHARE`, after the project
because the grant is its child and the purge deletes grants while it holds the project; then the
fresh read, which requires the `iam.application` row, a project that is not `archived`, no deletion
row, and the membership or the open grant still there. That is today's
`iam.has_application_access` (`0023_application_session.sql:31-51`) plus the lock, the fresh read and
the deletion rule. `via` records which path admitted. A refusal is `APPLICATION_NOT_FOUND`, an
existing code (`hosting/application-host-routes.ts:124`); the host answers `APPLICATION_NOT_READY` on a
null served read today (`hosting/application-host-routes.ts:130`), and parts 2 and 4 keep each caller's
answer when they move it onto this admission.

**The served read.** `checkApplication(gate, projectId)` makes a `Checked<ApplicationScope>` for a request that changes nothing: the application host's manifest and file reads in the request's one `authenticate` entry (part 6), and the connector broker when it writes nothing in that transaction. It runs the same access and deletion predicates as `admitApplication` (active account, the membership or the open grant, the `iam.application` row, a Project that is not archived, no deletion row) in one statement and takes no row lock, not even `FOR SHARE`. `via` records which path admitted. The proof's `tx` is a `ReadTx`, so only read ports accept it. The reason is that the lock exists to serialize a write with a tombstone or a revoke. A served read changes nothing, and today's served read takes no lock. The application host calls it once per asset, and the locking form measured about 3 times slower serial and about 2 times at 16 clients on a local run (review C, Q3.1). A revoke or tombstone that commits during the read is seen by the next request, as today. A caller that writes in the same transaction calls `admitApplication`.

**The run.** `admitRun(gate, builderRunId, owner)` serves two callers. Under `system('builder-executor', ...)`
it takes the project `FOR SHARE`, then the run `FOR UPDATE`, checks `owner_id` and that the run has
not ended, as the claim and heartbeat functions do today, then does the fresh read with the deletion
predicate. Under `transaction(run.accountId, ...)` (a run's own work step) it first takes the
account and its membership `FOR SHARE` and requires `project.build` in `ROLE_ALLOWS`, then the same
project, run and fresh read, and requires the run's `account_id` to be the gate's account. The scope
carries the run's account and Project read from the row.

The account steps of a run before its candidate (phase, candidate, payer record) use the second path,
so they check the owner and the open state, which today's SQL does not. That is stricter on purpose
(HQ decision): a stale owner after a lease takeover cannot record a candidate. A queued run has
`owner_id IS NULL`, so `admitRun` cannot admit its claim. The claim is the two step read of section 6,
not an `admitRun`.

**The system job.** `admitSystem(gate)` takes no lock and reads the job from the gate. It exists so
that a job's statements also wait behind an admission, and so the scope names the job.

**How a command demands it.** The proof is the first parameter, and the command writes on
`proof.tx`; it has no other way to reach a transaction.

```ts
export const removeMember = async (owner: Admitted<WorkspaceScope<'members.manage'>>, member: AccountId) => {
  if (lastOwnerRemoved(owner.scope.owners, member)) throw new Failure('LAST_OWNER')
  await owner.tx.run(sql`DELETE FROM iam.workspace_membership WHERE workspace_id = ${owner.scope.workspaceId} AND account_id = ${member}`)
}
export const leaveWorkspace = async (self: Admitted<WorkspaceScope<'members.leave'>>) => {
  if (lastOwnerRemoved(self.scope.owners, self.scope.accountId)) throw new Failure('LAST_OWNER')
  await self.tx.run(sql`DELETE FROM iam.workspace_membership WHERE workspace_id = ${self.scope.workspaceId} AND account_id = ${self.scope.accountId}`)
}
```

`members.leave` is allowed to every role, as today a member may remove itself; `members.manage` only
to owners. `lastOwnerRemoved` is a pure function over the locked owners.

## 3. `createWorkspace` and the concurrent revoke

**`createWorkspace`** creates a workspace and its creator's owner membership, two owners in one transaction.
`database.transaction(accountId, ...)` opens; `admitAccount` locks the creator's account `FOR SHARE`;
`idempotent` reserves the receipt and returns the reserved `resource_id`; `workspace/` inserts the
workspace with that id; `grantCreatorMembership(creator, workspaceId)`, exported by
`identity-access/admission.ts`, inserts the owner membership; the receipt completes; one commit. A
failure after either insert leaves no workspace, no membership and no completed receipt. The import
law admits `admission.ts` across owners, as it admits `SESSION_CONTRACT`.

`grantCreatorMembership` founds only an empty workspace: its insert is
`INSERT ... SELECT ... WHERE NOT EXISTS (SELECT 1 FROM iam.workspace_membership WHERE workspace_id = $w)`,
and zero inserted rows is `INTERNAL_UNEXPECTED` with invariant `WORKSPACE_ALREADY_FOUNDED`. On the
command role that subquery sees every membership, so the guard holds without a policy. It replaces
the `created_by` column and the founding branch of revision 4.

**The concurrent revoke** (spike 2 and spike 3, both orders, with today's functions as control).
Owner O removes member M while M writes in workspace W. If M admits first, M holds `FOR SHARE` on its
account and membership; O's admission locks the owner set and its `DELETE` of M's row waits until M
commits. If O deletes first, M's admission waits on the row, then under READ COMMITTED finds it gone
and is refused. Two owners removing each other both start with step 1 on the same owner set, so the
second waits for the first and then answers `LAST_OWNER` or succeeds by today's rule, never 40P01.

Part 3 proved the revoke race on `createProject` against today's `iam.remove_workspace_member`. Part 0b runs it
again on the command role. Part 6 proves both races on the TypeScript membership commands.

## 4. The split wall

### 4.1 The roles

| Role | Attributes | Member of | Holds |
| --- | --- | --- | --- |
| `hub_runtime` | `LOGIN NOINHERIT NOBYPASSRLS` | `hub_reader`, `hub_command` | at the end, no table or function privilege of its own; during the parts, the direct grants of the tables and functions no part has split yet (section 7) |
| `hub_reader` | `NOLOGIN NOBYPASSRLS` | none | `SELECT` on the tables a person reads, `USAGE` on schema `rls` and `EXECUTE` on its helpers |
| `hub_command` | `NOLOGIN NOBYPASSRLS` | none | the verbs the table register names per table, with `UPDATE` per column (section 5) |

The Hub logs in as `hub_runtime`. `NOINHERIT` means the login role uses none of its memberships'
privileges until it switches, so a client that is not inside a transaction with a role set reads
nothing (42501). Every transaction entry's first statement after `BEGIN` is `SET LOCAL ROLE`:

| Entry | Role |
| --- | --- |
| `read(accountId, fn)` | `hub_reader` |
| `transaction(accountId, fn)` | `hub_command` |
| `system(job, fn)` | `hub_command`, then the transaction local `conexus.job` set to the job (section 6) |
| `authenticate(fn)` (part 6) | `hub_command` |
| `session(name, fn)` | none: one held client outside the pool that runs only `pg_try_advisory_lock` and the blocking shared lock for presence, as the login role |

The spike measured each fact this rests on, on `postgres:17.10` with node `pg` and one pooled client
(`authz-redesign/spike/spike.md:10-64`): after `COMMIT`, after `ROLLBACK`, and after an error then
`ROLLBACK`, `current_user` is the login role again and a `SELECT` is 42501; the transaction setting
is empty again; `hub_reader` cannot lock, insert, update or delete; `REPEATABLE READ READ ONLY` with
`SET LOCAL ROLE` keeps both the isolation and the read only refusal (25006) even after a switch to the
command role; `hub_command` without `BYPASSRLS` sees every row through its `true` policy and may lock;
`SET ROLE postgres` is refused. Two facts set rules. A bare `SET ROLE` survives `ROLLBACK` and would
hand the next borrower of the client the role (`spike.md:42-44`), so only `SET LOCAL ROLE` exists, in
`db.ts`. `ROLLBACK TO SAVEPOINT` keeps the role, as expected.

**The `sql` tag refuses what a command never needs, at run time.** The split spike measured that
`SET LOCAL ROLE` to the command role works inside a `REPEATABLE READ READ ONLY` transaction, and the
command role sees every row; the second review of revision 5 read that as an escape for a reader. The
login is a member of both roles, so any statement can switch, and a text lint misses case, line
breaks and `SESSION AUTHORIZATION`. The confirmation of revision 5.1 then proved three spellings
that passed the substring match of 5.1 on PostgreSQL 17.10: `set local conexus .job = 'project-purge'`
(a space before the dot, which passed the purge guard), `set local u&"r\006fle" to hub_command` (a
Unicode escape that switched the role inside a READ ONLY transaction), and a `DO` block that builds
its `EXECUTE` by concatenation. A list of forbidden spellings loses to a new spelling, so revision 5.2
turns the rule around. The `sql` tag checks the composed text of every call, after it lowercases it,
turns comments into spaces, collapses whitespace and strips double quotes, and throws
`INTERNAL_UNEXPECTED` with reason `SQL_TEXT_REFUSED` unless the first keyword of the text is `select`,
`insert`, `update`, `delete` or `with`. So a plain `SET`, `DO` or `CALL` is refused whatever it
spells. The tag also refuses, anywhere in the text, the bare word `conexus` (so `conexus.job` and
`conexus .job` both fail), `session_authorization`, `u&`, `set_config` and `current_setting`, and keeps
the statement forms of revision 5.1 (`set role`, `set local role`, `set session role`, `reset role`,
`session authorization`) for a text that starts with `select` and carries a second statement. It
matches these words and forms, not the word `role`, because `role` is a column of
`iam.workspace_membership` that every admission reads (`admission.ts:85,113,118,125`). Checking the
composed text means a fragment cannot split a match across two templates. `db.ts` issues `BEGIN`, its
`SET LOCAL ROLE` and its settings on the client directly, through an internal path the tag never
builds. There is no second login and no second pool. The tag guards against our own accidents, not
against our own code written to evade it (section 8, threat model).

**The role lint stays as the early warning.** A Biome GritQL plugin refuses, in any `sql` template and
in any string passed to a Hub `pg` client, the texts `SET ROLE`, `SET SESSION ROLE`, `RESET ROLE`,
`SESSION AUTHORIZATION` and `set_config(`; `db.ts` holds the only `SET LOCAL ROLE`, as two constants.
It fails in review what the tag would refuse at run time. The plugin covers the Hub database path.
`app-runner/data-plane.ts:100,139` switches roles on the application databases' provisioner, not on
the Hub database, and is outside it (reviewed in the Applications cluster wave, HQ on revision 5).

**The role invariants.** `assertRoleInvariants` checks what makes the switch the only way in: both
memberships of `hub_runtime` have `inherit_option = false` and `admin_option = false` in
`pg_auth_members` (PostgreSQL 16 and later record inheritance per membership, so `NOINHERIT` on the
role is not enough on its own); `pg_db_role_setting` holds no `role` or `session_authorization`
setting for `hub_runtime`, for the Hub database, or for the pair; and `openDatabase` refuses a
connection whose `options` names `role` or `session_authorization` (`db.ts:16` carries `options`, and
`builder/module.ts:141` uses it for `search_path` on `hub_factory`, so the refusal is by content).

### 4.2 Reads: the person policy

Every Hub table that a person reads has `ENABLE` and `FORCE ROW LEVEL SECURITY` and one policy
`FOR SELECT TO hub_reader`. It shows the acting account's rows. `FORCE` makes it apply to the table
owner too. A read that forgets its `WHERE` still returns only those rows, and a read with no account
set returns none.

**The helpers**, in a private schema `rls` owned by `conexus_owner`, each owned by `iam_rls`, each
`STABLE` with `SET search_path TO pg_catalog, pg_temp`, `EXECUTE` revoked from `PUBLIC` and granted to
`hub_reader` only, `USAGE` on `rls` to `hub_reader` and `iam_rls` only. Policies call each as a scalar
subquery, `(SELECT rls.acting_account())`, so the planner evaluates it once per statement, not per
row. Supabase recommends this shape, with the same three cautions (pinned path, private schema,
narrow `EXECUTE`), `refs/postgrest-supabase-basejump.md`, E8 and item 3.

| Helper | Returns | Kind |
| --- | --- | --- |
| `rls.acting_account()` | `nullif(current_setting('conexus.account_id', true), '')::uuid` | `SQL` |
| `rls.acting_workspaces()` | the workspaces where the acting account has a membership and is `active` | `SECURITY DEFINER` |
| `rls.acting_installation_administrator()` | whether the acting account is `active` and holds an open administrator tenure | `SECURITY DEFINER` |

There are three, and no part adds one without a change to this spec. A membership policy that reads
membership recurses (42P17, spike 3). The fix that held: `iam_rls` has `SELECT` on the few tables the
helpers read (`iam.account`, `iam.workspace_membership`, `iam.installation_administrator`) and, once
each table is policed, its own `FOR SELECT TO iam_rls USING (true)` policy on it: part 0b for
`iam.account` and `iam.workspace_membership`, part 6 for `iam.installation_administrator`. No
role has `BYPASSRLS`. A helper returns facts about the acting account, never a role decision:
`ROLE_ALLOWS` stays in TypeScript.

**Rules every reader policy follows.**

1. Every branch requires an acting account (`A IS NOT NULL`). There is no system branch: a job reads
   on the command role.
2. A child table reaches its scope through its own foreign keys, joined to a policed parent; a
   predicate never names a column the table does not have.
3. A policy is derived from the bodies of the functions it replaces, read in full, and every rule
   those bodies enforce on visibility (tombstones, recovery windows, active accounts) appears in it.
4. The administrator branch `ADMIN`, `(SELECT rls.acting_installation_administrator())`, appears
   only on the `SELECT` of a list that has that reach today, as a second policy named `reader_admin`
   (below). The reach list is literal. It names four tables, and no other table has it:
   `project.project_deletion`, for the deletion in progress (`iam.visible_projects`,
   `0030_project_deletion.sql:74`, built in part 3); `connector.connection`, for `listWorkspaceConnections` and `checkWorkspaceConnection`
   (`connector.list_connections`, `0029_connector.sql:157`, part 2);
   `iam.installation_administrator`, and the `iam.account` rows of the open tenures and of the accounts
   named by `granted_by` on them (the grantor's display name, as today), both for IAM-15
   (`iam.list_installation_administrators`, `0020_installation_administrator_list.sql:8`, part 6).
   `project.project` is not on the list: its predicate shows an administrator no row outside the
   workspaces `W` it belongs to, and `ADMIN` there only shapes `HIDDEN`
   (`0064_project_owner.sql:19-25`; `0030_project_deletion.sql:74`). The administrator variant of the
   cross tenant test (section 10) uses this list and no other.
5. A grantee has no reader branch. An application grantee reads the facts of the one application it
   opens on the command role, filtered by `proof.scope.projectId`, after `checkApplication` (a write: `admitApplication`; section 6). A run reads its held
   credential on the command role after `admitRun`, filtered by the run from the proof. A credential flow reads by digest on
   the command role (section 6). The Project thumbnail (`getProjectThumbnail`, part 4) is a member read, not
   a grantee read. It drops today's `iam.application` row condition (`iam.has_application_access`),
   because `hub_reader` holds no grant on that table before part 6. A member of a Project with no
   application row yet now reads its thumbnail. An account with only an application grant no longer
   reads it through this route, since the route lists a person's own Projects (HQ decision).
6. A table a person never lists (sessions, handoffs, previews, OIDC transactions, the bootstrap
   context, the receipt) has no reader policy and no reader grant, so `hub_reader` gets 42501 on it.

**Part 0b reader policies** (`A` is `(SELECT rls.acting_account())`, `W(x)` is
`x IN (SELECT rls.acting_workspaces())`, `HIDDEN(p)` is today's tombstone rule):

| Table | Reader `SELECT` predicate |
| --- | --- |
| `workspace.workspace` | `reader`: `A IS NOT NULL AND W(workspace_id)` |
| `project.project` | `reader`: `A IS NOT NULL AND W(workspace_id) AND NOT HIDDEN(project_id)`, `HIDDEN` being a deletion row that is completed, or any deletion row when not `ADMIN` (`0064_project_owner.sql:19-25` without its `S OR`) |
| `project.project_deletion` | `reader`: `A IS NOT NULL AND W(workspace_id)`. `reader_admin`: `A IS NOT NULL AND ADMIN` |
| `builder.builder_run` | `reader`: `A IS NOT NULL AND project_id IN (SELECT project_id FROM project.project)` |
| `builder.project_working_state` | `reader`: the same |
| `iam.workspace_membership` | `reader`: `A IS NOT NULL AND W(workspace_id)`: the acting account's own memberships and its co members' |
| `iam.account` | `reader`: `A IS NOT NULL AND (account_id = A OR account_id IN (SELECT account_id FROM iam.workspace_membership))`: its own row and its co members, the membership subquery running under the membership's reader policy |

The last two rows are new in revision 5.1. Revision 5 granted `hub_reader` `SELECT` on both tables
without a policy, so any read could list every account and every membership. Part 6 may add to the
`iam.account` `reader` predicate only the grantees of projects the acting account owns, and adds the
`ADMIN` branch for the open tenures as the `reader_admin` policy (rule 4). Neither predicate reads its own table through
a policy that reads it back: the membership policy calls the helper, which reads as `iam_rls`, and
the account policy reads the membership table, whose policy does not read `iam.account`.

**Reader policy names.** A reader policy is named `reader`. Where the administrator branch is separate
(the four tables of rule 4), it is a second permissive `FOR SELECT TO hub_reader` policy named
`reader_admin`, so the person branch and the administrator branch each read on their own and the two
add up. The table register names these policies, and the catalog lint matches them by name (section
5).
### 4.3 Commands: the command policy

Every policed table also has exactly one policy
`CREATE POLICY command ON <table> TO hub_command USING (true) WITH CHECK (true)`. It exists because
`FORCE` with no policy for a role denies that role every row; it adds no rule. What a command may touch
is decided by its proof (section 2), and what the database still holds on a write is section 5.

Why commands have no row policy: under READ COMMITTED a row locked after a wait is not rechecked
against the policy's subqueries, which use the statement's snapshot; `FOR SHARE` and `FOR UPDATE`
need an `UPDATE` policy, so every lock needed a write branch; and the admission already rechecks after
the wait (section 2). The command side of revision 4 paid for a weak wall with most of its policy
rows. The rationale gives the census.

## 5. The second wall on writes

The command role has no row filter, so the database holds a write by four mechanisms instead. Each is
checked in CI.

**Composite tenant keys.** A row with two parent paths to a tenant names the tenant column in both
foreign keys, so it cannot point at a project of one workspace and a connection of another. Today only
`connector.project_binding` does this (`0031_project_binding.sql:15-16`). The spike's census
(`authz-redesign/spike/spike.md:117-127`) names the rest. Each lands in the part that splits the
table, and the table register (section 7) records it:

| Table | Key to add | Part |
| --- | --- | --- |
| `reg.artifact` | dropped by part 4; `reg.artifact_revision` carries `project_id` with one key to `project.project` | 4 |
| `reg.application_thumbnail` | keyed by `artifact_revision_id`, key to `reg.artifact_revision` `ON DELETE CASCADE`; no `project_id` | 4 |
| `iam.host_session` | `(parent_digest, account_id)` to `iam.host_session (token_digest, account_id)` `ON DELETE CASCADE`; `project_id` to `project.project` | 6 |
| `iam.handoff` | the same pair key as `iam.host_session`, and `project_id` to `project.project`; no `preview_id` | 6 |
| `builder.builder_run` | `account_id` to `iam.account` (a reach to a person with no constraint today) | 1 |

A key `(preview_id, project_id)` is not assigned: a Preview session and a Preview handoff have
`project_id IS NULL` (`host_session_preview_check` and `handoff_preview_check`,
`apps/hub/migrations/0026_single_session.sql:82,123`), and a foreign key skips a row with a null
column, so it would check nothing (HQ decision).

`project.project_deletion.project_id` keeps no foreign key: the tombstone outlives the project by
design, and the register records that with its reason. The part 6 and part 4 child specs confirm the
exact columns from the bodies they port.

**Immutable tenant and owner columns.** A composite key does not stop an `UPDATE` that moves a row to
another tenant whose parent rows exist. So `hub_command` gets `UPDATE` only on named columns, never on
a key, tenant or owner column (`workspace_id`, `project_id`, an `account_id` that names the owner,
`owner_account_id`, `requested_by`, `bound_by`, `granted_by`). Basejump guards the same columns with
a trigger (`refs/postgrest-supabase-basejump.md`, item 2); a column grant needs no code. Two facts
follow. A row lock needs `UPDATE` on at least one column, so a table a command locks but never
updates still gets `UPDATE` on one non tenant column, and never on a security column. `iam.account`
locks through `created_at`, a column with no rule on it (the table's columns are `account_id`,
`issuer`, `external_subject`, `display_name`, `email`, `active` and `created_at`,
`0001_baseline.sql:1926-1937`); revision 5.1 granted `UPDATE (active)`, which let a command
deactivate an account. `iam.workspace_membership` locks through `created_at` too; part 6 adds
`UPDATE (role)` with the role command, a security column that only a command holding the matching
proof and the owner set lock writes. `hub_reader` reads `iam.account` through the columns
`account_id`, `display_name` and `email`, so `issuer`, `external_subject` and `origin` stay unreadable. `LOCK TABLE ... SHARE ROW EXCLUSIVE` needs a
table level `UPDATE`, `DELETE` or `TRUNCATE`, and a table level `UPDATE` on
`iam.installation_administrator` would let any command rewrite `account_id` and mint an
administrator. So `hub_command` gets column grants only: `UPDATE (revoked_at)` from part 0b, widened by
part 6 to `UPDATE (revoked_at, revoked_by)`, because the table's revocation check refuses a `revoked_at`
written without `revoked_by` (`0017_installation_administrator.sql:20`). The table lock goes through
`iam.lock_administrators()` (section 2, step 1), a `SECURITY DEFINER` function owned by the table's
owner (`iam_owner` now, `conexus_owner` after part 6), with `SET search_path TO pg_catalog, pg_temp`,
whose body is the one `LOCK TABLE` statement, `EXECUTE` revoked from `PUBLIC` and granted to
`hub_command` only. It holds no business rule, and it is the one function outside schema `rls` that
stays after part 6.

**The catalog lint** (`scripts/hub-catalog-lint.mjs`, run by `db:catalog:check`) asserts per split
table in a Hub schema: `ENABLE` and `FORCE`; exactly one policy `TO hub_command`, `FOR ALL`,
`USING (true) WITH CHECK (true)`; a `FOR SELECT TO hub_reader` policy named `reader` if and only if
`hub_reader` holds `SELECT`, a second named `reader_admin` if and only if the table is on the reach
list of section 4.2, rule 4, no other reader policy, and no other reader privilege; no policy `TO hub_runtime` except the `legacy_runtime`
bridge of section 7; the verbs and update columns `hub_command` holds equal the table register's row;
the composite keys the register names exist. Per pending table it asserts the register row's
privileges for each of `hub_runtime`, `hub_reader` and `hub_command`, so a grant on a table no part
has split is as visible as one on a split table. Per function: every function in schema `rls` is
owned by `iam_rls` and executable only by `hub_reader`; `iam.lock_administrators()` is executable only
by `hub_command`; and the `EXECUTE` lists of `hub_reader` and `hub_command` equal the register's
function rows (in part 0b: the four purges and `builder.register_project_repository` for
`hub_command`, the three `reg` served functions for `hub_reader`). Grants are the command role's only
privilege wall, so their exact list is what the lint guards (Supabase tests the same with
`has_table_privilege`, `refs/postgrest-supabase-basejump.md`, item 4).

**The write lint.** It lives in `scripts/census-boundaries.mjs`, which already walks the TypeScript
AST, because the rule needs normalized text and statement structure that a GritQL pattern cannot
read. For each `sql` tagged template it joins the literal parts with one placeholder per
interpolation, lowercases, turns comments into spaces and collapses whitespace, then refuses:
an `update`, `delete` or `merge` as the statement or inside a `with` (a CTE) whose top level, outside
any parentheses, has no `where`; any `merge` at all (no command needs one); an
`insert ... on conflict ... do update` without its own `where`, because the conflicting row may
belong to another tenant; a `where` whose predicate is a constant (`where true`, `where 1 = 1`); and a
`where` that appears only inside a subquery. The fragment rule: the `where` keyword and at least one
comparison of a column must be literal text in the same template; an interpolated fragment may add
conditions beside them but never stands for the whole filter, so the filter is always visible where
the write is. Each refusal has a fixture that must be found.

## 6. Callers that do not act for a signed in person

| Caller | Entry | Scope |
| --- | --- | --- |
| a job of `platform/jobs.ts` (reaper, purge) | `system(job, fn)`, then `admitSystem(gate, job)` | `Admitted<SystemScope<J>>` |
| project deletion | the tombstone in the administrator's own `transaction(accountId, ...)` after `admitInstallationAdministrator(gate, 'project.delete')`, in the order of section 2; the purge and its completion in `system('project-purge', fn)` after `admitSystem`, which first takes the project `FOR UPDATE` while its row exists (a retry after the row is gone goes on), then checks the tombstone and the busy runs, then passes one `WriteTx` to every owner's purge port, so the five purges stay one transaction as today; each port deletes its rows, and the receipt rows whose `resource_id` is the project | administrator, then system |
| the Builder executor | claims a queued run in two steps (a system read of the run's account and project, then `transaction(run.accountId)` with `admitProject` sets the owner; a queued run has no owner, so the claim is not an `admitRun`), and renews, ends, fails and reconciles a run it owns in `system('builder-executor', fn)` with `admitRun`, which locks the project, then the run, and checks `owner_id` and that the run has not ended, as the claim and heartbeat functions do today; the run's own work (model turns, source writes) runs in `transaction(run.accountId, fn)` after `admitProject` or `admitRun`, so a run whose account lost the project fails its next work step, and the executor settles it under `system` | run |
| the application host and the connector broker | for the application host, one `authenticate(fn)` with the session lookup and `checkApplication(gate, projectId)`; for the connector broker, `transaction(grantHolder, fn)` with `checkApplication`, or `admitApplication` when the transaction writes (section 2); then the served revision, its artifact and the bound connection are read on `proof.tx`, each filtered by `proof.scope.projectId` (section 1). The served pointer is the three `last_preview_*` columns of `builder.project_working_state`, read directly on the admitted Project (part 4), with no SQL function and no Builder port There is no grantee list and no grantee policy | application |
| session and sign in resolution | `authenticate(fn)`, importable only by the identity session and sign in modules; it hands an `AuthenticationGate` with two closed families of exact steps (data child, section 1): `lookupByDigest`, every lookup by the digest of the presented token, and the typed steps: the identity steps (`lookupIdentity`, `provisionIdentity`, `refreshEmail`, `claimInvitations`, `lookupSlug`, `startOidc`), each keyed by one exact value, and `endCredential(reason)`, which acts only on the row the gate's lookup bound, takes no digest argument and needs no active account. Neither family lists. A lookup that finds an account, and `provisionIdentity`, bind it to the gate for `admitAccount`. `endCredential(reason)` ends the bound session or handoff with today's predicates (part 6) | bootstrap or account |
| the operator bootstrap | the sign in callback with `admitBootstrap(gate, identity)`, which takes the administrators' table lock and returns a proof only when no account exists | bootstrap |

**The purge guard.** Revision 5 removed the `PURGE_REQUIRES_SYSTEM` guard of the four purge
functions (`0064_project_owner.sql:73-75,95-97,107-109,121-123`) on the premise that `hub_command`
could already delete their rows. It could not: `hub_command` holds no `DELETE` on
`iam.handoff`, `iam.host_session`, `iam.preview`, the application tables, `connector.project_binding`,
`reg.artifact`, `reg.artifact_revision` or `builder.project_repository`, and the functions run as
their owners. Without the guard any command transaction after any admission could purge another
tenant's project. So `system(job, fn)` sets the transaction local `conexus.job` to its job, through
the internal path the `sql` tag never builds, and the four purges keep their guard, now reading it:
`IF current_setting('conexus.job', true) IS DISTINCT FROM 'project-purge' THEN RAISE EXCEPTION 'PURGE_REQUIRES_SYSTEM' USING ERRCODE = '42501'`.
Our code does not set it. The tag refuses the bare word `conexus`, `set_config` and `current_setting`
(section 4.1), which stops the accident; review and the lints own deliberate evasion (section 8,
threat model).
`EXECUTE` on the four is a register row of `hub_command`, which the lint asserts, and a repository test
fails when the text `purge_project` appears in any Hub file but `project/deletion.ts`. The guard dies
with each function, when its owner's part turns it into a port.

`builder.register_project_repository` takes no job guard: its one caller is `createProject` in a person's
`transaction` (`project/store.ts:98`), not a job. Its two inserts are `ON CONFLICT DO NOTHING` keyed
by a project that must exist (`0032_conexus_git.sql:12`, `0001_baseline.sql:2277`), so on another
tenant's project it changes nothing. Its `EXECUTE` is a register row of `hub_command`.

**Raw tokens.** A token arrives at the HTTP edge as `RawToken`, a brand on `string`. The only way to
a `Digest` is `digest(raw)`. The `sql` template's value parameters are typed so that a value whose
type extends `RawToken` fails `tsc`; a `Digest` interpolates. This is an accident guard, not a wall:
a brand exists only at compile time, so a raw token read back as a plain `string`, or cast, reaches
the tag unrefused. What it stops is the slip of passing the presented token where its digest is due,
and a fixture proves `NoRawToken` refuses a `RawToken` value. The stored and looked up value is the
digest by design. This is stricter than Better Auth and cal.com, which store session or verification
tokens plain (`refs/calcom-documenso-betterauth-mastra.md`, E6).

## 7. During the parts

**The bridge.** A `SECURITY DEFINER` function that reads a policed table runs as its owner role, and
the policies are `TO hub_reader` and `TO hub_command`, so without a bridge the function would see
nothing (spike 3). Each policy migration therefore adds
`CREATE POLICY legacy_owner ON <table> TO <owner roles> USING (true) WITH CHECK (true)`, where the
owner roles are those of every live function whose body reads the table. The catalog lint derives that
set from the function bodies (the caller graph of the function map child, section 2) and fails when a
bridge omits a reader's owner. Each part drops the bridges whose last reader it ported; part 6 drops
the rest with the owner roles.

**The runtime bridge.** Unported TypeScript reads some tables through `unportedPool` as
`hub_runtime`, and `ENABLE ROW LEVEL SECURITY` alone refuses every row to a role that is not the
owner and has no policy. Part 0b polices `iam.account` and `iam.workspace_membership`, and only `iam.account` has an unported
reader: `identity-access/store.ts:100,143,192` reads and writes it that way (sign in). The membership
table has none (its readers are `admission.ts` on the new path and the definer functions, which run as
their owners behind `legacy_owner`). So `iam.account` alone gets
`CREATE POLICY legacy_runtime ON iam.account TO hub_runtime USING (true) WITH CHECK (true)`, kept
while the caller graph lists an unported TypeScript reader of it. The same rule applies to any table
a later census finds with such a reader. The lint allows a policy `TO hub_runtime` only under that
name and only while the caller graph names such a reader, and part 6 drops the bridge when
`unportedPool` goes.

**What `hub_runtime` keeps.** `hub.ts:40` hands unported TypeScript the raw pool (`unportedPool`),
which runs as `hub_runtime` with no role set. So `hub_runtime` keeps its direct grants on the tables
and functions no part has split yet, and loses them on a table in the migration that splits it; on a
split table an unported reader gets 42501, not an empty answer. The one exception is
`iam.account`, behind the `legacy_runtime` bridge, where `hub_runtime` keeps its grants until part 6.
`iam.workspace_membership` has no bridge, and its `hub_runtime` grants go in part 0b. The
count of `hub_runtime`'s direct privileges is a census ceiling that reaches zero in part 6, when
`unportedPool` goes. Until then the fail closed fact of section 4.1 holds for every split table but
`iam.account`, and holds whole only at the end.

**Grants per role.** A split table's grants come from the table register: `SELECT` to `hub_reader`
when it has a reader policy, the register's verbs to `hub_command`. A table the new path reads before
its part splits it gets only what the new path needs, recorded in its pending row: in part 0b,
`iam.installation_administrator` (`hub_command` `SELECT, UPDATE (revoked_at)`), `iam.application`
(`hub_command` `SELECT`) and `iam.application_grant` (`hub_command` `SELECT, UPDATE (revoked_at)`, the
column a `FOR SHARE` needs), and nothing to `hub_reader`. Part 6 widens the tenure grant and the
application grant to `UPDATE (revoked_at, revoked_by)`, since each revocation check needs both columns
(`0017_installation_administrator.sql:20`, `0022_application_access.sql:60`). `iam.account` and
`iam.workspace_membership` are no longer in this group: part 0b gives them reader policies (section
4.2). `EXECUTE` on a live function goes to the role whose entry calls it, from the caller graph:
`hub_reader` for a function a `read()` calls (until part 4, `reg.get_served_application`,
`reg.read_served_application_file` and `reg.get_application_thumbnail`,
`registry/served-application.ts:63-88`), `hub_command` for one a command entry calls, `hub_runtime`
for one only unported code calls.

**Definer functions granted to the reader trust no account argument.** The three `reg` served
functions take `p_account_id` and run as `registry_owner` with every row in view
(`0023_application_session.sql:357`, `0024_application_access_review.sql:256`,
`0048_application_thumbnail.sql:101`). A `read()` could pass another account's id. Part 0b replaces
each, from its latest definition, with the added condition
`p_account_id = nullif(current_setting('conexus.account_id', true), '')::uuid`, so they answer only for
the account the transaction acts as. The condition goes with the functions in part 4.

**The table register.** `contracts/technical/hub-catalog-census.json` gains, per split table, the
reader flag, the command verbs and update columns, and the composite keys; per pending table, the
part that splits it and the privileges each of `hub_runtime`, `hub_reader` and `hub_command` holds on
it; per function a role may execute, that role. `UNSCOPED_TABLES` keeps its permanent rows (with
reasons). Each part moves its rows from pending to split. The lint fails on a table in no list and on
any privilege the register does not name.

## 8. Security model

| Who | May read | May write |
| --- | --- | --- |
| a person, through `read` | rows of the workspaces where it holds an active membership; its own account and its grants; co members and grantees of projects it owns, as accounts; as installation administrator, the four tables of section 4.2, rule 4 | nothing: `hub_reader` holds no write privilege and the transaction is READ ONLY |
| a person, through `transaction` | what its admitted proof's command reads, by key | only through a command that holds the matching proof; the composite keys, column grants and write lint bound the statement |
| an installation administrator's command | as a person's command, with the reach of the closed action list | the same |
| a grantee | the facts of the one application it opens, filtered by the admitted project after `admitApplication` | its own session and handoff rows, through the authentication flows |
| a job, through `system` | every row, by key | through its own command, holding `Admitted<SystemScope>` |
| `hub_runtime` with no role set | nothing on a split table (42501), except `iam.account` through `legacy_runtime` until part 6 | the same |
| `hub_factory` | Mastra storage only, as today | Mastra storage only |
| `iam_rls` | the columns the helpers read | nothing |

**Threat model.** The Hub's SQL is written only by our code; generated apps run on their own
databases. So the database walls and the `sql` tag guard against accidents, not against our own code
written to evade them. Code review and the lints own deliberate evasion. There are no anti tamper
rounds, because a person who can write the Hub's SQL can also edit the tag, the roles and the
policies.

What this guards: an accidental broad list query (the reader policy), a forgotten check (the proof
and the gate), a statement that accidentally switches its role or writes a `conexus` setting (the
`sql` tag, which allows only `select`, `insert`, `update`, `delete` and `with` statements), a revoke racing a write (the
admission's locks and fresh read), a write that crosses tenants through two parents (composite keys),
a write that moves a row between tenants (column grants), an unfiltered update or delete (the write
lint), a purge outside its job by accident (the `conexus.job` guard), a command read by an id of another tenant
(the scoped read rule, proven per operation), and the slip of a raw token into a query (the brand).
What it does not: a command whose `WHERE` names the wrong row inside its admitted scope is not stopped
by the database. The proof, the keys and the lints stop the classes above; review, the per operation
cross tenant test and the store tests stop the rest. A compromised Hub process, or code written to evade the tag, can switch to either role and set any
account, as it could hold any capability role before. The session that names the account is parsed from the signed cookie by the
S3 enforcer (spec 0014), and the data module takes the account only as a parsed `AccountId`. Sealed
columns (connection credentials, model account secrets) stay sealed: the command role can read their
bytes, as the owner role of the functions could before, and opening them still needs the key the Hub
holds.

## 9. Deleted by revision 5

From revision 4 and from the amendments A and A+ that were drafted against it:

- Every `S OR` system branch in a policy, and the setting `conexus.scope` as a policy input, with
  `iam.acting_scope()`. With no policy reading it, `conexus.scope` goes entirely; the four purge
  functions' `PURGE_REQUIRES_SYSTEM` guards (`0064_project_owner.sql:74,96,108,122`) went with it,
  on the premise that `hub_command` could already delete those rows directly. That premise was false;
  revision 5.1 restores the guards on `conexus.job` (section 6, and section 11).
- Every person `INSERT`, `UPDATE` and `DELETE` policy, every lock only policy, and the revision 4
  rules "one `FOR ALL` or one per command", "`WITH CHECK` is the visible set or narrower" and "a
  branch grants the least the operations need" as policy rules (the proof carries them now).
- The receipt policies (`0063_workspace_admission.sql:71-85`): the receipt has the command policy
  only, and no reader grant.
- `workspace.workspace.created_by` and the founding branch; `grantCreatorMembership`'s guard
  replaces them (section 3).
- The credential setting `conexus.credential`, the `Credential` union, `authenticate(credential, fn)`,
  `iam.acting_credential()` and `iam.installation_founded()`.
- `iam.acting_founds()`, `iam.acting_owned_workspaces()`, `iam.acting_invitations()`, and
  `iam.acting_applications()` in both forms (the grant list of revision 4 and the widened served tuple
  of amendment A), with the `iam_rls` column grants and policies on `iam.application`,
  `iam.application_grant`, `project.project` and `builder.project_working_state` that only they
  needed.
- `admitElevated`, `ElevatedAction`, the `elevated` scope and its `JobName`, and the administrator
  wrapper that opened `system`; `admitProjectDeletion` (`admission.ts:166-172`), replaced by
  `admitInstallationAdministrator` in the person's transaction.
- `ConnectionAction`, the `connection` scope, `admitConnection` and their `ACTION_REFUSALS` rows.
- The `JobName` `'migration'`.
- The rule that a statement cannot `RETURNING` a row its policy cannot yet show; a command sees its
  own rows.
- Amendment A+ as a whole: its credential instance and its elevated command instance.

## 10. Critical test scenarios

- A command without a proof, with a proof of the wrong scope or action, with an object literal, with a
  spread copy, or with a read proof; `run` on a `ReadTx`; a query on a `CommandGate`; an object literal
  or a spread copy where a `CommandGate` is due; an admission called with an `accountId` argument; a
  `RawToken` value in a `sql` template (the fixture proves `NoRawToken` refuses it): `tsc` fails (a
  negative fixture file, checked by the census runner), verifies AC-7.
- Revoke race, both orders, on `createProject` on the command role, and on the membership commands (part 6);
  two owners removing each other; two concurrent administrator revocations; an administrator revoked
  while its project deletion waits on the tenure lock; one member leaving twice at once (one succeeds,
  the other answers `WORKSPACE_NOT_FOUND`): today's outcomes, no 40P01, verifies AC-8.
- `checkApplication` (part 0b): a tsc negative fixture passes its `Checked` where an `Admitted` is due, passes it to a command port, and runs `run` on its `tx`, each failing; a purge port handed `Admitted<SystemScope<'builder-executor'>>` fails `tsc`; a grantee and a member read; an outsider and a tombstoned Project are refused with `APPLICATION_NOT_FOUND`; during the read `pg_locks` shows no row lock held by the backend. Benchmark: rerun review C's local benchmark for this form and record it beside today's read.
- Deletion races on the project row (`admitRun` in part 1): an `admitProject`, an `admitApplication` and an `admitRun` that
  waited on a project whose tombstone committed meanwhile each answer their refusal; a tombstone that
  waits on an admitted command is written after it commits; a purge that waits on an admitted run
  proceeds after it, and the run admission that waits on the purge is refused; no 40P01, verifies
  AC-8.
- On one pooled client: after a commit, a rollback and a throw, `current_user` is `hub_runtime` and a
  `SELECT` on `workspace.workspace` (a split table without a runtime bridge) is 42501; `hub_reader` gets 42501 on `FOR SHARE`, `FOR UPDATE`, `INSERT`,
  `UPDATE` and `DELETE`; `read()` reports `repeatable read` and read only, verifies AC-9.
- Role escape at run time: the tag refuses `SET LOCAL ROLE hub_command`, `set local\nrole hub_command`,
  `SET SESSION AUTHORIZATION postgres`, `select set_config('role', 'hub_command', true)`,
  `SET LOCAL conexus.job = 'project-purge'`, a switch with a comment between its words, and a switch
  split across two composed fragments, each with `SQL_TEXT_REFUSED`. The three bypasses proved on
  17.10 are fixtures: (a) `set local conexus .job = 'project-purge'` and `set local conexus
  .account_id = ...` (a space before the dot), (b) `set local u&"r\006fle" to hub_command`, (c) a
  `DO` block whose `EXECUTE` is built by concatenation. A plain `SET`, a plain `DO` and a `CALL` are
  refused for their first keyword; `select`, `insert`, `update`, `delete` and `with ... delete` run;
  `select current_setting('conexus.job')` is refused; a query that names the
  `role` column runs; `assertRoleInvariants` fails on a membership with `inherit_option` or
  `admin_option` true and on a `role` setting in `pg_db_role_setting`; `openDatabase` refuses
  `options` that set `role`, verifies AC-10.
- A nested entry (a `read`, `transaction`, `system` or `authenticate` opened inside another's
  callback) throws `INTERNAL_UNEXPECTED` with reason `NESTED_TRANSACTION`, verifies AC-9.
- The generated cross tenant read test, over every table `hub_reader` can `SELECT` (enumerated from
  the catalog, so a table with a grant and no seed or no policy fails): a member of workspace A
  reading through `read()` sees zero rows seeded in workspace B, and sees exactly A's seeded rows (the
  positive control, so a `USING (false)` policy fails); an installation administrator who is a member
  of neither sees B's rows on exactly `project.project_deletion`, `connector.connection`,
  `iam.installation_administrator` and the `iam.account` rows of open tenures (the literal list of
  section 4.2, rule 4), and none on the others, `project.project` included, verifies AC-9.
- The per operation cross tenant test: the route walk runs every operation as a member or grantee
  of tenant A with tenant B's ids; each answers its not found or refused code, and a digest of B's
  rows is unchanged, verifies AC-9.
- A fixture list read with its `WHERE` deleted returns only the acting account's rows. No account set:
  zero rows, verifies AC-9.
- The route walk records which entry each operation opens; an operation declared as a read that opens
  any entry but `read()` fails, except the application host's served reads, which are listed, verifies
  AC-9.
- `grantCreatorMembership` into a workspace that already has a membership inserts nothing and fails;
  an admitted command that tries to `UPDATE` a tenant column gets 42501; an `UPDATE` of
  `iam.installation_administrator.account_id` as `hub_command` gets 42501, and so does an `UPDATE` of
  `iam.account.active`, while `FOR SHARE` on `iam.account` runs through `UPDATE (created_at)`;
  `hub_runtime` with no role set reads `iam.workspace_membership` and gets 42501 (it has no bridge),
  while `iam.account` answers it through `legacy_runtime`; `iam.lock_administrators()`
  takes the table lock as `hub_command`; a composite key refuses a binding whose connection is in
  another workspace, verifies AC-9.
- The purge guard: `SELECT iam.purge_project(<B's project>)` inside a person's admitted `transaction`
  gets 42501 `PURGE_REQUIRES_SYSTEM`, and inside `system('iam-reaper', ...)` the same; inside
  `system('project-purge', ...)` it runs; a repository test fails on `purge_project` in a file other
  than `project/deletion.ts`. A served function called through `read()` with another account's
  `p_account_id` returns nothing, verifies AC-9.
- Lint fixtures: a bare `SET ROLE`, a `set_config('role'`, `SET SESSION AUTHORIZATION`; for the write
  lint, an `UPDATE` without `WHERE`, a lowercase `delete` on a new line without `where`, a
  `WITH ... DELETE` without a top level `where`, a `MERGE`, an `ON CONFLICT DO UPDATE` without
  `where`, a `WHERE true`, a `WHERE` only inside a subquery, a `DELETE` whose whole `WHERE` is a
  fragment; for the catalog lint, a table whose command policy is not `true`, a reader policy without
  a grant, an extra verb, a pending table with a privilege its register row does not name, an
  `EXECUTE` the register does not name, a helper outside `rls`, a policy `TO hub_runtime` not named
  `legacy_runtime`, a `legacy_runtime` on `iam.workspace_membership`, a reader policy not named
  `reader` or `reader_admin`, a `reader_admin` on a table off the reach list of section 4.2: each is
  found, verifies AC-9 and AC-13.
- An administrator who is not a member deletes a project; an inactive administrator and a non
  administrator get `PROJECT_DELETE_DENIED`; the tombstone's `workspace_id` is the project row's; a
  member's `admitProject` that waited on a project whose tombstone committed meanwhile answers
  `PROJECT_NOT_FOUND`; an administrator's command on a project whose deletion started is refused,
  while its `read()` still lists the deletion in progress, verifies AC-8.
- A grantee with no workspace membership opens an application whose connector reads its bound
  connection; `hub_reader` with that grantee's account reads none of the project, its revisions or its
  connections (parts 2, 4 and 6); `admitApplication` refuses a revoked grant, an archived project and
  a project in deletion, verifies AC-9.

## 11. Revisions

### Revision 5.1

What changed from revision 5, and why. Two reviewers on different models interrogated revision 5
(`authz-redesign/interrogate/opus-findings.md`, `sonnet-findings.md`); HQ decided each point
(`authz-redesign/rev51-hq-decisions.md`, decisions 1 to 16).

- **The `sql` tag refuses a role switch at run time** (decision 1; Sonnet B1). A statement could run
  `SET LOCAL ROLE hub_command` from a read and see every row, and the text lint missed case, line
  breaks and `SESSION AUTHORIZATION`. Section 4.1. The match is on statement forms, not the word
  `role`, which is a column every admission reads. Revision 5.2 replaces this match (see below).
- **Every command read is scoped, and a test per operation proves it** (decision 2; Sonnet B2).
  Revision 5 moved exact id reads to a role with no filter and named no check. Section 1, the scoped
  read rule, and section 10. `authenticate` hands two closed families of exact steps (`lookupByDigest(key)` and the eight typed steps), not a `WriteTx`.
- **The purge guard is back, on `conexus.job`** (decision 3; both reviewers). Revision 5 removed it
  on a false premise. Section 6. `builder.register_project_repository` gets no job guard, because its
  caller is a person's command; why it needs none is in section 6.
- **Every admission that reaches a project locks it and reads it again** (decision 4; Opus 2 and 3,
  Sonnet F5 and F10). `admitApplication` and `admitRun` had no tombstone rule; `admitApplication` is
  built in part 0b; the deletion and the purge take the project `FOR UPDATE` first; the administrator
  exception goes for commands. Section 2.
- **The gate is nominal and carries the actor** (decision 5; Opus 4 and 5, Sonnet F3). Admissions
  take no `accountId`; `ReadTx.accountId` stays as built (`db.ts:43`); `system` hands a gate too, so
  `admitSystem` reads its job from it; signatures for `admitRun`, `admitBootstrap` and `admitSystem`.
  The text on what the gate stops is corrected. Section 2.
- **Role invariants per membership** (decision 6; Opus 6). Section 4.1.
- **Pending tables are register rows, and the two `iam` tables the reader reads get policies**
  (decision 7; Opus 7, Sonnet F8). Revision 5 let any read list every account and membership.
  Sections 4.2 and 7. Since sign in still reads `iam.account` through `unportedPool`, those two tables
  get a `legacy_runtime` bridge until part 6.
- **`members.leave` takes the acting membership `FOR UPDATE`** (decision 8; Sonnet F11). Two
  concurrent leaves deadlocked. Section 2.
- **The tenure lock goes through `iam.lock_administrators()`** (decision 9; Sonnet F6, Opus 13). A
  table level `UPDATE` would let any command mint an administrator. Section 5.
- **Nested entries are refused** (decision 10; Sonnet N12). One pool of 20 runs out when an entry
  holds a client while it opens another. Data child, section 1.
- **The tombstone takes `workspace_id` from the project row** (decision 11; Sonnet N13). Section 2.
- **The write lint reads normalized text and statement structure** (decision 12; Opus 11, Sonnet
  F9). It moves from a GritQL pattern to `census-boundaries.mjs`. Section 5.
- **The cross tenant read test has a positive control, an administrator variant and covers every
  readable table** (decision 13; Opus 10, Sonnet F7). Section 10.
- **Definer functions granted to the reader check `p_account_id`** (decision 14; Opus 9, Sonnet F2b).
  Section 7.
- **`RawToken` is described as an accident guard** (decision 15; Opus 12). Section 6.
- **Part 2's brief names the owner's connection action, and the unused `DELETE` grant on
  `workspace.workspace` goes** (decision 16; Sonnet N14, Opus 13). Umbrella build plan.
- Also from the findings, without a numbered decision: `USAGE` on every Hub schema to both
  transaction roles and the idempotent role creation of `0062_runtime_data_boundary.sql:2-12` in part
  0b's migration (Sonnet F5c and F5d).

### Revision 5.2

What changed from revision 5.1, and why. A Sonnet reviewer confirmed 29 of the 30 findings of revision
5.1 closed and proved one still open on PostgreSQL 17.10
(`authz-redesign/interrogate/sonnet-confirm-51.md`); HQ decided each point
(`authz-redesign/rev52-hq-decisions.md`, decisions 1 to 6).

- **Threat model, stated.** The Hub's SQL is written only by our code, so the database walls and the
  tag guard against accidents, not against our own code written to evade them. Code review and the
  lints own deliberate evasion, and there are no anti tamper rounds. Section 8 and the rationale. The
  claims of sections 4.1, 6 and 8 that said "no statement can" now say what the tag refuses.
- **The tag allows only `select`, `insert`, `update`, `delete` and `with` statements** (decision 1;
  confirmation B1). Revision 5.1's substring match was bypassed three ways (a space before the dot of
  `conexus .job`, a `u&` escape for `role`, a `DO` block with a concatenated `EXECUTE`). The tag now
  refuses any other first keyword, and refuses the bare word `conexus`, `session_authorization`,
  `u&`, `set_config` and `current_setting` anywhere. Fixtures for the three bypasses and for a plain
  `SET`, `DO` and `CALL`. Sections 4.1 and 10.
- **The administrator reach list is literal** (decision 2; confirmation, medium). Four tables:
  `project.project_deletion`, `connector.connection`, `iam.installation_administrator` and the
  `iam.account` rows of open tenures and of their grantors. `project.project` is not on it, since `ADMIN` only shapes
  `HIDDEN` there. The administrator variant of the cross tenant test uses this list. Section 4.2,
  rule 4, and section 10.
- **`legacy_runtime` only on `iam.account`** (decision 3; confirmation, low). Its unported reader is
  `identity-access/store.ts:100,143,192`. `iam.workspace_membership` has no unported reader, gets no
  bridge, and its `hub_runtime` grants go in part 0b. Section 7, sections 8 and 10, and the part 0b
  plan in the umbrella.
- **The row lock goes through a harmless column** (decision 4; confirmation, low). `iam.account`
  grants `UPDATE (created_at)` where 5.1 granted `UPDATE (active)`. `iam.workspace_membership`
  does too, and part 6 adds `UPDATE (role)`. Section 5.
- **Reader policies have names** (decision 5; confirmation, nit). `reader`, and `reader_admin` where
  the administrator branch is separate; the register and the catalog lint use those names. Section
  4.2.
- **Citations** (decision 6; confirmation, nit). The lines for the administrator reach now name the
  policy and the function that carry it (`0064_project_owner.sql:19-25`,
  `0030_project_deletion.sql:74`), and the account columns cite `0001_baseline.sql:1926-1937`.

## Revision 5.3, HQ trims of the child specs (2026-10-05)

Decided by HQ on the open items of the child specs of parts 1, 2, 4, 5 and 6. Each touches this
spec's text above.

- `ReadAction` gains `'connections.bind'` and `'application.manage'`, owner only, with the read
  overload of `admitProject` (section 1).
- `RunScope` gains `projectId` (sections 1 and 2).
- `isInstallationAdministrator(tx)`, one function in `admission.ts` (section 2).
- The `AuthenticationGate` has a second closed family of typed steps (data child, section 1; section 6).
  It also holds `consumeOidcState()` and `endCredential(reason)`, which act only on the row the
  gate's lookup bound and need no active account (section 6; part 6). The family is eight steps.
  `lookupByDigest(key)` takes a closed `key` union per kind, not `(kind, digest)`, because the
  handoff kind is keyed by more than the digest (data child, section 1).
- The administrator reach list widens `iam.account` to the grantors of open tenures (section 4.2).
- `reg.artifact` is dropped by part 4, so it gets none, and the session keys are the account pairs (section 5).
- The tenure and application grant updates are `(revoked_at, revoked_by)` from part 6 (section 5).
- The thumbnail drops the application row condition, and the served pointer is read directly
  (sections 4.2 and 6).
- The account steps of a run before its candidate use `admitRun` (section 2).
- Reviews B and C (HQ, 2026-10-05): `checkApplication` and `Checked` (sections 1, 2, 6 and 10); `SystemScope<J>` with `admitSystem(gate, job)`; `RunScope.via`; `openGate` also importable by `identity-access/authentication.ts`. The surface finalizes when #512 merges.
