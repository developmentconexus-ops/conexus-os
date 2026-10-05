# 0015. Child: the admission proof and the read policies

Part of [spec 0015](index.md). Covers who may act: the typed proof every command requires, the
admission functions that make it, the lock order, the Row Level Security policies that bound every
read, the runtime callers that act for someone other than a signed in person, and the two cases the
move must keep (WS-01 and the concurrent revoke). Satisfies AC-7 to AC-9 of the umbrella.

## Summary

A command cannot run without a proof that only an admission function can make, and that function
locks the rows it read inside the command's own transaction, in the same order today's functions lock
them, so a forgotten check does not compile and a revoke cannot slip between the check and the write.
Reads are bounded by the database: each Hub table has a policy that shows only what the acting account
may see, so a list query that forgets its filter still returns only those rows. The spike showed that
a typed read without the filter compiled and leaked, which is why reads get the second guard.

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
type WorkspaceAction = 'workspace.read' | 'members.manage' | 'members.leave' | 'project.create'   // today's iam.action values, plus members.leave
type ProjectAction = 'project.read' | 'project.build' | 'project.delete'                         // project.delete: installation administrator, as today
type ConnectionAction = 'connection.read' | 'connection.manage' | 'connection.use'                 // part 2's child spec confirms them from the bodies
type JobName = 'iam-reaper' | 'project-purge' | 'builder-executor' | 'migration'   // closed list, one per job of platform/jobs.ts
type RunOwner = { readonly ownerId: string }   // builder_run.owner_id, the executor instance's randomUUID, as today; the heartbeat stays a column

type Scope =
  | { readonly kind: 'account'; readonly accountId: AccountId }
  | { readonly kind: 'installation-administrator'; readonly accountId: AccountId }
  | { readonly kind: 'workspace'; readonly accountId: AccountId; readonly workspaceId: WorkspaceId; readonly role: WorkspaceRole; readonly action: WorkspaceAction; readonly owners: readonly OwnerRow[] | null }
  | { readonly kind: 'project'; readonly accountId: AccountId; readonly workspaceId: WorkspaceId; readonly projectId: ProjectId; readonly action: ProjectAction }
  | { readonly kind: 'application'; readonly accountId: AccountId; readonly projectId: ProjectId; readonly via: 'grant' | 'membership' }
  | { readonly kind: 'connection'; readonly accountId: AccountId; readonly connectionId: ConnectionId; readonly action: ConnectionAction }
  | { readonly kind: 'run'; readonly builderRunId: BuilderRunId; readonly accountId: AccountId; readonly owner: RunOwner }
  | { readonly kind: 'bootstrap'; readonly issuer: string; readonly subject: string }
  | { readonly kind: 'system'; readonly job: JobName }
```

```ts
type Action = WorkspaceAction | ProjectAction | ConnectionAction
type ReadAction = 'workspace.read' | 'project.read' | 'connection.read'   // the actions a read admission may name
type ChangesOwnerSet = (typeof CHANGES_OWNER_SET)[number]
type AccountScope = Extract<Scope, { kind: 'account' }>
type ProjectScope = Extract<Scope, { kind: 'project' }>
type ApplicationScope = Extract<Scope, { kind: 'application' }>
type RunScope = Extract<Scope, { kind: 'run' }>
type BootstrapScope = Extract<Scope, { kind: 'bootstrap' }>
type SystemScope = Extract<Scope, { kind: 'system' }>
type OwnerRow = { readonly accountId: AccountId; readonly active: boolean }
// owners is the locked owner set for an action in CHANGES_OWNER_SET, and null for every other action:
type WorkspaceScope<A extends WorkspaceAction> = Extract<Scope, { kind: 'workspace' }> & {
  readonly action: A
  readonly owners: A extends ChangesOwnerSet ? readonly OwnerRow[] : null
}
```

`members.leave` names what today's `iam.remove_workspace_member` allows a member to do to itself (it
admits `workspace.read` when the actor is the member). The action lists above are the ones today's
functions check; each part may add the actions its
operations check, and a new action is a row of `ROLE_ALLOWS`, not a change to this union's shape.

**Ids.** The ids of the admitted scope come only from the proof. An id the command creates or acts on
inside that scope is an argument (`grantCreatorMembership(creator, workspaceId)`,
`removeMember(owner, member)`). A command never takes a second id of the scope's own kind.

## 2. Admission and locks

```ts
export function admitAccount(tx: WriteTx, accountId: AccountId): Promise<Admitted<AccountScope>>
export function admitWorkspace<A extends WorkspaceAction>(tx: WriteTx, accountId: AccountId, workspaceId: WorkspaceId, action: A): Promise<Admitted<WorkspaceScope<A>>>
export function admitWorkspace<A extends ReadAction & WorkspaceAction>(tx: ReadTx, accountId: AccountId, workspaceId: WorkspaceId, action: A): Promise<Admitted<WorkspaceScope<A>, 'read'>>   // today 'workspace.read' only
// and admitInstallationAdministrator, admitProject, admitApplication, admitConnection, admitRun, admitBootstrap, admitSystem
export const ROLE_ALLOWS: { readonly [R in WorkspaceRole]: readonly WorkspaceAction[] }  // iam.role_allows as a table
export const CHANGES_OWNER_SET = ['members.manage', 'members.leave'] as const satisfies readonly WorkspaceAction[]
```

The admission reads `tx.mode` to decide the lock: in a write transaction it takes `FOR SHARE OF` the
account and the membership (and the project for `admitProject`), as `iam.admit_workspace` does today
(`0009_remove_model_connections.sql`); in a read transaction it takes no lock, because PostgreSQL
refuses `FOR SHARE` in a READ ONLY transaction (25006, spike 2). Then it decides in TypeScript over
`ROLE_ALLOWS`. Refusals come from one table in `admission.ts`, keyed by action:

```ts
export const ACTION_REFUSALS: { readonly [A in Action]: { readonly outsider: FailureCode; readonly forbidden: FailureCode } }
// e.g. 'members.manage': { outsider: 'WORKSPACE_NOT_FOUND', forbidden: 'MEMBERS_MANAGE_REQUIRED' }
//      'project.create': { outsider: 'PROJECT_CREATE_DENIED', forbidden: 'PROJECT_CREATE_DENIED' }   (today's 403 for both)
```

An account that is not `active` is `ACCOUNT_INACTIVE`; an account that is not a member gets the
action's `outsider` code (404, so an outsider cannot tell a missing workspace from one it may not see);
a member without the role gets its `forbidden` code. Each row keeps the code today's function raises;
a part that changes one says so in its child spec.

**Lock order: today's, taken inside the admission.** The admission takes every lock the command
needs before its own `FOR SHARE`, in the order today's functions take them, so two commands never
wait on each other in a cycle and no lock is ever upgraded:

1. The set the command changes, first. For an action in `CHANGES_OWNER_SET`, the admission locks all
   of the workspace's owner memberships `FOR UPDATE`, ordered by account id, with each owner's
   `active` flag, before anything else, as `iam.remove_workspace_member` does today
   (`0001_baseline.sql`, lines 815 to 834); `lastOwnerRemoved` counts only the active ones, as today.
   The acting owner's own row is in that set, so its later `FOR SHARE` is already covered. For the
   installation administrator set, the admission takes
   `LOCK TABLE iam.installation_administrator IN SHARE ROW EXCLUSIVE MODE`, as
   `0017_installation_administrator.sql` and its successors do.
2. The acting account, then the membership, `FOR SHARE`.
3. The resource rows: the admission takes the resource row (`admitProject`'s project) in the mode the
   action needs at its first read, `FOR UPDATE` for an action that changes or deletes it
   (`project.delete`), `FOR SHARE` otherwise. A row is never taken `FOR SHARE` and then `FOR UPDATE`
   in one transaction.
4. The receipt, `FOR UPDATE` (data child, section 3).

The rows locked in step 1 are part of the proof (`owner.scope.owners`), so the command counts from
them and does not read the set again. A tombstone cannot be locked before it exists, so an admitted writer
holds the project row `FOR SHARE` and a deletion holds it `FOR UPDATE` from its admission; they
serialize on the parent row, and two deletions serialize on it too.

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

## 3. WS-01 and the concurrent revoke

**WS-01** creates a workspace and its creator's owner membership, two owners in one transaction.
`database.transaction(accountId, ...)` opens; `admitAccount` locks the creator's account `FOR SHARE`;
`idempotent` reserves the receipt; `workspace/` inserts the workspace with `created_by` set to the
creator and without `RETURNING`; `grantCreatorMembership(creator, workspaceId)`, exported by
`identity-access/admission.ts`, inserts the owner membership; the receipt completes; one commit. A
failure after either insert leaves no workspace, no membership and no completed receipt. The import
law admits `admission.ts` across owners, as it admits `SESSION_CONTRACT`.

**The concurrent revoke** (spike 2 and spike 3, both orders, with today's functions as control).
Owner O removes member M while M writes in workspace W. If M admits first, M holds `FOR SHARE` on its
account and membership; O's admission locks the owner set and its `DELETE` of M's row waits until M
commits. If O deletes first, M's admission waits on the row, then under READ COMMITTED finds it gone
and is refused. Two owners removing each other both start with step 1 on the same owner set, so the
second waits for the first and then answers `LAST_OWNER` or succeeds by today's rule, never 40P01.

Part 3 proves the revoke race on the first TypeScript command with a workspace proof (PRJ-03), against
today's `iam.remove_workspace_member`. Part 6 proves both races on the TypeScript membership commands.

## 4. The read policies

Every Hub table that holds tenant data has `ENABLE` and `FORCE ROW LEVEL SECURITY` and policies
`TO hub_runtime` that together cover `SELECT`, `INSERT`, `UPDATE` and `DELETE` (one `FOR ALL` policy,
or one per command under rule 2 below). `USING` bounds which rows a statement sees, updates, deletes or locks.
`WITH CHECK` bounds which rows it may write. `FORCE` makes the policy apply to the table owner too.
Because the policy names `hub_runtime`, an owner role running a definer function sees only the bridge
(below), never the main policy, so the helpers need no grant to owner roles.

**The helpers**, in schema `iam`, owned by `iam_rls`, each `STABLE`, granted `EXECUTE` to
`hub_runtime` only. Policies call each as a scalar subquery, `(SELECT iam.acting_account())`, so the
planner evaluates it once per statement, not per row.

| Helper | Returns | Kind | Lands in |
| --- | --- | --- | --- |
| `iam.acting_account()` | `nullif(current_setting('conexus.account_id', true), '')::uuid` | `SQL` | part 0 |
| `iam.acting_scope()` | `nullif(current_setting('conexus.scope', true), '')` (`'system'`, `'authentication'` or null) | `SQL` | part 0 |
| `iam.acting_workspaces()` | the workspaces where the acting account has a membership and is `active` | `SECURITY DEFINER` | part 0 |
| `iam.acting_founds(workspace_id)` | true when the workspace was created by the acting account and has no membership yet, for the membership founding branch | `SECURITY DEFINER` | part 6 |
| `iam.acting_installation_administrator()` | whether the acting account holds an open administrator tenure | `SECURITY DEFINER` | part 0 |
| `iam.acting_applications()` | the projects whose application the acting account holds an open grant for | `SECURITY DEFINER` | part 0 |
| `iam.acting_invitations()` | `(workspace_id, invitation_id, role)` of the pending invitations addressed to the acting account's email | `SECURITY DEFINER` | part 6 |

The helpers more than one part needs land in part 0, so no two parts create the same one; the two
that only `iam` reads land in part 6. A membership
policy that reads membership recurses (42P17, spike 3). The fix that held: `iam_rls` has `SELECT` on
the few tables the helpers read and, once those tables are policed (part 6), its own
`FOR SELECT TO iam_rls USING (true)` policy on them. No role has `BYPASSRLS`. A helper returns facts
about the acting account, never a role decision: `ROLE_ALLOWS` stays in TypeScript.

**Rules every policy follows.**

1. Every branch except the system branch requires an acting account (`A IS NOT NULL`), so a
   transaction with no account set can neither read nor write a policed row.
2. A table gets one `FOR ALL` policy only when the same rows may be read and written. When read and
   write authority differ (a shared model account is readable by others and writable only by its
   owner; a default is readable by everyone and writable only by an administrator), it gets one policy
   per command (`SELECT`, `INSERT`, `UPDATE`, `DELETE`), because `DELETE` and `UPDATE` are gated by
   `USING`, not by `WITH CHECK`.
3. A child table reaches its scope through its own foreign keys, joined to a policed parent; a
   predicate never names a column the table does not have.
4. A branch grants the least the operations need: using an application (the served revision, the
   bound connection it calls) is a different branch from administering it (all grants, all
   invitations, all revisions).
5. `WITH CHECK` is the visible set or narrower, never `true` (spike 3).
6. A policy is derived from the bodies of the functions it replaces, read in full, and every rule
   those bodies enforce on visibility (tombstones, recovery windows, active accounts) appears in it.

**Part 0 policies** (`S` is `(SELECT iam.acting_scope()) = 'system'`, `A` is
`(SELECT iam.acting_account())`, `W(x)` is `x IN (SELECT iam.acting_workspaces())`):

| Table | Command | Predicate |
| --- | --- | --- |
| `workspace.workspace` | `ALL` | `USING (S OR W(workspace_id))`, `WITH CHECK (S OR W(workspace_id) OR (A IS NOT NULL AND created_by = A))` |
| `platform.operation_receipt` | `ALL` | `S OR (A IS NOT NULL AND account_id = A)`; the bootstrap receipt (null account) is written in part 6 under the rule part 6 decides |

`workspace.workspace` gains `created_by uuid NOT NULL REFERENCES iam.account` in part 0 (filled from
the earliest owner membership for existing rows), so only the creator can found a workspace, and an
emptied workspace cannot be taken over.

**Each later part designs its own policies.** Parts 1 to 6 each begin with a short child spec of this
umbrella, `0015-part-<owner>.md`, written through `/jm-architect` from the full bodies of the functions
that part ports, following the rules above, and approved before that part builds. It gives one row per
table and command, the lock order of each command it ports, the failure codes of each refusal, and the
fixtures of section 8. The reviews of this spec already found what those child specs must answer:

| Part | Must decide, from the bodies |
| --- | --- |
| 3 project | normal read versus tombstone versus administrative recovery (`0030_project_deletion.sql`, `visible_projects`); an installation administrator who is not a member creating a tombstone (`0032_conexus_git.sql`, `begin_project_deletion`); the lock mode of `project.delete` at its first read (no share then update); the read only policies, grants and bridges on `builder.builder_run` and `builder.project_working_state`, which the project summaries query reads from part 3 on |
| 1 builder | each `builder.*` table's path to its project; settling a run whose account lost access (section 5); the served revision pointer a grantee needs, without opening `builder.*` to grantees |
| 2 connectors | the bound connection a grantee's application reads, and nothing else of `connector.connection` |
| 4 registry | the served revision only for a grantee, every revision for a member |
| 5 model accounts | read versus write by sharing, per command; `model_account_sharing_history` through `model_account_id`; whether a run keeps the authority over the credential it was handed (today `rewrite_model_account_secret` does not check sharing, `0035_model_account_by_id.sql`), and what zero updated rows means |
| 6 identity and access | the bootstrap that creates the account, claims invitations and grants the first administrator in one transaction; the application login before any session (`applicationBySlug`), an application invitation claimed into the first grant, and the access check during session resolution; grantee visibility for the application owner without exposing other grantees to a grantee; the invitation claim that binds the invited role |

What the spike settled about writes: `WITH CHECK (true)` let an outsider plant a row in another
workspace and insert its own membership, after which the read policy showed it everything (spike 3),
hence rule 5. RLS still does not replace the proof: it stops a write
into what the account cannot see, not a member doing what its role does not allow.

**Behavior that follows.** A transaction with no account set sees no row and gets no error, so a
read that forgets `read(accountId, ...)` fails closed. A statement cannot `RETURNING` a row its policy
cannot yet show (the WS-01 workspace insert). The policy cost was under 1.5 ms on 12 thousand
projects, 0.14 ms with an index on `workspace_id` (spike 3); each part adds the index for its keyed
tables.

## 5. Callers that do not act for a signed in person

| Caller | Entry | Scope |
| --- | --- | --- |
| a job of `platform/jobs.ts` (reaper, purge) | `system(job, fn)` | `Admitted<SystemScope>` |
| project purge | `project/deletion.ts` opens `system('project-purge', fn)` (the import law lists it beside `platform/jobs.ts` and the executor) and passes one `WriteTx` to every owner's purge port, so the five purges stay one transaction as today; each port deletes its rows, and the receipt rows whose `resource_id` is the project | system |
| the Builder executor | claims, renews, ends, fails and reconciles a run it owns in `system('builder-executor', fn)` with `admitRun`, which checks `owner_id` and that the run has not ended, as the claim and heartbeat functions do today; the run's own work (model turns, source writes) runs in `transaction(run.accountId, fn)`, so it runs under the policies of the account that started it. A run whose account lost the project fails its next work step, and the executor settles it under `system` | run |
| the application host and the connector broker | `read(grantHolder, fn)` or `transaction(grantHolder, fn)` with `admitApplication`; what the grantee may read through the policies is decided by the child specs of parts 2, 4 and 6 | application |
| session and sign in resolution | `authenticate(fn)` (data child), importable only by the identity session and sign in modules | bootstrap or account |

## 6. During the parts

**The bridge.** A `SECURITY DEFINER` function that reads a policed table runs as its owner role, and
the main policy is `TO hub_runtime`, so without a bridge the function would see nothing (spike 3).
Each policy migration therefore adds
`CREATE POLICY legacy_owner ON <table> TO <owner roles> USING (true) WITH CHECK (true)`, where the
owner roles are those of every live function whose body reads the table. The catalog lint derives that
set from the function bodies (the caller graph of the function map child, section 2) and fails when a
bridge omits a reader's owner. Each part drops the bridges whose last reader it ported; part 6 drops
the rest with the owner roles.

**Direct readers.** Unported TypeScript that reads a policed table as `hub_runtime` with no account
set would see nothing. The part that polices a table first moves every direct reader of it onto an
entry with an account (or `system`), and a test runs each such reader with the policies on.

**Grants follow policies.** `hub_runtime` gets `SELECT, INSERT, UPDATE, DELETE` on a table in the
same migration that polices it, plus, in part 0, on the `iam` tables the TypeScript reads directly
today. A table no part has policed yet is reached only through its functions, as today.

**The catalog lint.** `hub-catalog-snapshot.json` already records `rls`, `forcerls` and every policy
per relation (`scripts/hub-catalog.mjs`). `db:catalog:check` gains one rule: every table in a Hub
schema has `rls`, `forcerls` and policies that together cover the four commands, or is listed in
`UNSCOPED_TABLES` with its reason. The list has two kinds: permanent entries (above, section 4) and pending entries, each naming
the part that will police it. Part 0 computes the pending list from the catalog it leaves behind
(every table not policed by part 0 and not permanent); each part removes its rows, and part 6 leaves
only permanent ones. The rule also counts `legacy_owner` policies, a ceiling that reaches zero in
part 6.

## 7. Security model

| Who | May read | May write |
| --- | --- | --- |
| a person, through `read` or `transaction` | rows of the workspaces where it holds an active membership; its own account, sessions and receipts; co members and grantees as accounts; applications it holds a grant for, with their bindings; invitations addressed to it; model accounts it owns or that are shared; as installation administrator, what that role names | only through a command that holds the matching proof; the policy also bounds the write |
| a job, through `system` | every row | through its own command, holding `Admitted<SystemScope>` |
| the executor's run step | what the run's account may read | through the run's commands |
| `hub_runtime` with no account set | nothing a policy guards | nothing a policy guards |
| `hub_factory` | Mastra storage only, as today | Mastra storage only |
| `iam_rls` | the columns the helpers read | nothing |

What this guards: an accidental broad query, a forgotten check, a revoke racing a write. What it does
not: a compromised Hub process can set any account, as it could hold any capability role before. The
session that names the account is parsed from the signed cookie by the S3 enforcer (spec 0014), and
the data module takes the account only as a parsed `AccountId`. Sealed columns (connection
credentials, model account secrets) stay sealed: the one role can read their bytes, as the owner role
of the functions could before, and opening them still needs the key the Hub holds.

## 8. Critical test scenarios

- A command without a proof, with a proof of the wrong scope or action, with an object literal, with a
  spread copy, or with a read proof; `run` on a `ReadTx`: `tsc` fails (a negative fixture file, checked
  by the census runner), verifies AC-7.
- Revoke race, both orders, on PRJ-03 (part 3) and on the membership commands (part 6); two owners
  removing each other; two concurrent administrator revocations: today's outcomes, no 40P01, verifies
  AC-8.
- An outsider account with a seeded second tenant calls every list read: empty or 404. A fixture that
  deletes a list's `WHERE` still returns only the acting account's rows. No account set: zero rows,
  verifies AC-9.
- An outsider tries to insert a row into a workspace it cannot see, to insert its own membership into a
  workspace it did not create, and to claim an invitation with a role it does not name: 42501, verifies
  AC-9.
- A grantee with no workspace membership opens an application whose connector reads its bound
  connection, and cannot list other grantees, old revisions or unbound connections; an owner who is
  not an installation administrator lists the grantees of its application (part 6 and the child specs
  of parts 2 and 4), verifies AC-9.
- Without an account set, `SELECT`, `UPDATE` and `DELETE` on every policed table touch zero rows,
  verifies AC-9.
- Two deletions of one project, and a deletion racing a run start: one order, no 40P01 (part 3),
  verifies AC-8.
- `set_config` with `true` on a pool of one client: the next transaction sees no account, after a
  commit, a rollback and a throw, verifies AC-9.
