# 0015. Child: part 3, the project owner

**Status**: Approved (by HQ on 2026-10-04, under the operator's delegation for S1 part specs; revision 3, after a three model review of revision 1 and a confirmation review of revision 2).

Part of [spec 0015](index.md). Written when part 3 starts, from the full bodies of the functions it
ports (the latest definition of each, read from the migrations), under the rules of the admission
child, section 4. It decides inside the umbrella; nothing here changes the surface part 0 froze.

## Summary

Part 3 moves the project owner to the new shape: its six operations declared in Zod, its ten
functions ported to TypeScript, its tables under policies, and the project purge as one system
transaction across the owners. It merges second, alone, because project's functions call builder,
connector, registry and `iam`, and the later parts' policies read `project.project`. Behavior stays
as today, with one improvement the umbrella asks for: a deletion and an admitted writer serialize on
the project row. Revision 2 answers the three model review (`review/`): the installation administrator
reaches a project only through the deletion command, as today, and never through the read policies.

## 1. What it ports

| Function (latest in) | Today | After |
| --- | --- | --- |
| `project.list_project_summaries` (0001) | members' projects of a workspace, hiding tombstoned ones from non administrators | `projectStore.list(accountId, workspaceId)` in `read`, one query, the policy filters |
| `project.get_project` (0055) | a visible project with its `deleting` flag; for an installation administrator, a tombstone not yet completed | `projectStore.get(accountId, projectId)` in `read`, two queries: the project; if none, `SELECT ... FROM project.project_deletion WHERE project_id = $1 AND completed_at IS NULL AND (SELECT iam.acting_installation_administrator())`, which answers the purged member of PRJ-02's reply |
| `project.list_project_summaries_with_activity` (0030) | cards with the latest run, preview flag, and administrator tombstones | one query in `project/store.ts` joining `builder.builder_run` and `builder.project_working_state` read only, then a pure presenter `toProjectCard` |
| `project.reserve_or_replay_create_project`, `project.lock_create_project_receipt`, `project.complete_create_project_receipt` (0001) | PRJ-03 receipt in two transactions | `reserve` and `complete` of `platform/receipt.ts` under the workspace authority |
| `project.create_project_with_repository` (0032) | inserts the project and calls `builder.register_project_repository` | `createProject` on `proof.tx`, still calling `builder.register_project_repository` as SQL until part 1 turns it into a port |
| `project.begin_project_deletion` (0032) | installation administrator only; the tombstone; refuses while a run is queued or running | `beginDeletion(proof, projectId, confirmName)` in `system('project-purge', fn)` (section 3) |
| `project.purge_project` (0030) | refuses without a tombstone; the four owner purges, the receipts, the project row, one transaction | the purge orchestrator in `system('project-purge', fn)` (section 5) |
| `project.complete_project_deletion` (0030) | stamps `completed_at` | `completeDeletion` in `system('project-purge', fn)` |

`project.operation_idempotency` is dropped (its rows are not copied, as the data child says).
`iam.admit_project` and `iam.visible_projects` stay until part 6, since builder, connector and registry
bodies still call them; the bridge keeps them working.

## 2. Operations

| Id | Method and path | Access | Success | Failures beyond the common set | `malformed` |
| --- | --- | --- | --- | --- | --- |
| PRJ-01 | `GET /api/control/workspaces/:workspaceId/projects` | session | 200 project list | none (an outsider gets an empty list, as today) | `workspaceId: WORKSPACE_NOT_FOUND` |
| PRJ-02 | `GET /api/control/projects/:projectId` | session | 200 project, a union of two members (below) | `PROJECT_NOT_FOUND` | `projectId: PROJECT_NOT_FOUND` |
| PRJ-03 | `POST /api/control/workspaces/:workspaceId/projects` | session | 201 created | `PROJECT_CREATE_DENIED`, `IDEMPOTENCY_CONFLICT`, `PROJECT_SOURCE_REFUSED`, `PROJECT_REPOSITORY_UNAVAILABLE` | `workspaceId: WORKSPACE_NOT_FOUND` |
| PRJ-04 | `DELETE /api/control/projects/:projectId` | session | 204 | `PROJECT_DELETE_DENIED`, `PROJECT_NOT_FOUND`, `PROJECT_NAME_MISMATCH`, `PROJECT_BUSY`, `PROJECT_DELETION_INCOMPLETE` | `projectId: PROJECT_NOT_FOUND` |
| PRJ-SUMMARIES | `GET /api/control/workspaces/:workspaceId/project-summaries` | session | 200 cards | `PROJECT_SUMMARIES_UNAVAILABLE` | `workspaceId: WORKSPACE_NOT_FOUND` |
| PRJ-THUMBNAIL | `GET /api/control/projects/:projectId/thumbnail` | session | 200 `Binary` (`image/png`) | `PROJECT_THUMBNAIL_NOT_FOUND`, `PROJECT_THUMBNAIL_UNAVAILABLE` | `projectId: PROJECT_NOT_FOUND` |

The paths, statuses and codes are today's (the generated routes and `routes.ts`, `summary-routes.ts`,
`thumbnail-routes.ts`); the builder copies each from the YAML it deletes and the bijection proves it.
The thumbnail keeps reading through `reg.get_application_thumbnail` as SQL until part 4; the bytes are
checked by the `Binary` rule. `PRJ-SUMMARIES` and `PRJ-THUMBNAIL` keep today's ids from the route
ledger.

**PRJ-02's reply.** Today a purged project seen by an installation administrator comes back with
`projectRevision: ''`, which the YAML's `minLength: 1` forbids and `project-settings.tsx` reads as
"purged". The empty value also reaches a non member administrator between the tombstone and the purge,
since that administrator never sees the project row; the web text is a moment early for them. The Zod success is a union, so the wire stays byte for byte and the empty value is declared:
the live project (`projectRevision: ProjectRevision`, `deleting: boolean`) or the purged tombstone
(`projectRevision: z.literal('')`, `archived: z.literal(false)`, `deleting: z.literal(true)`). The web
narrows on the literal.

**PRJ-03's body.** `sourceBootstrap` keeps today's two shapes (`NEW` and `EXISTING_GIT`), and
`EXISTING_GIT` answers `PROJECT_SOURCE_REFUSED` (422) before any transaction, as `createProject` does
today. `starterRevision` from `repository.prepare` parses as the branded `Revision` (40 lower hex, the
check `create_project_with_repository` makes today); a value that does not parse is
`INTERNAL_UNEXPECTED`, as today's unmapped `P0001`.

**Copied from today, named so the builder does not invent them.** PRJ-01 orders by `name, project_id`.
PRJ-SUMMARIES orders by `last_activity_at DESC, project_id` and wraps the cards as `{ projects }`;
`latestRun` is `null` when a tombstone exists or there is no run, otherwise the run picked by
`created_at DESC, builder_run_id DESC`. PRJ-THUMBNAIL sets `ETag: "<artifactRevisionId>"` and
`Cache-Control: private, no-cache`, declared as the operation's response headers. Today the thumbnail
route exists only when `thumbnailReader` is configured; after part 3 it is always declared and
registered, and without a reader it answers `PROJECT_THUMBNAIL_UNAVAILABLE`, so the boot refusal holds
in every setup.

## 3. Admissions and locks

| Operation | Entry | Admission | Locks, in order |
| --- | --- | --- | --- |
| PRJ-01, PRJ-SUMMARIES | `read(accountId)` | none: the policy shows only what the account may see | none |
| PRJ-02, PRJ-THUMBNAIL | `read(accountId)` | none | none |
| PRJ-03, transaction 1 | `transaction(accountId)` | `admitWorkspace(tx, accountId, workspaceId, 'project.create')` | account, membership `FOR SHARE`; receipt `FOR UPDATE` |
| PRJ-03, transaction 2 | `transaction(accountId)` | the same admission again | account, membership `FOR SHARE`; receipt `FOR UPDATE` |
| PRJ-04, the tombstone | `system('project-purge')` | `admitProjectDeletion(proof, accountId)`: the account row `FOR SHARE`, then `iam.is_installation_administrator(accountId)` as SQL until part 6 ports it | account `FOR SHARE`; project `FOR UPDATE`, only on the path with no tombstone |
| PRJ-04, purge and complete | `system('project-purge')` | the system proof | today's order (section 5) |

**Why the tombstone runs in `system`.** The installation administrator's deletion authority is
installation wide; the policies are workspace scoped. Expressing it in a policy (an `ADMIN` branch on
`project.project`) showed every live project of every workspace to every administrator in PRJ-01,
PRJ-02 and the summaries, and still could not lock the row, because `FOR UPDATE` also applies the
`UPDATE` policy (all three reviewers). Today `begin_project_deletion` is a `SECURITY DEFINER` function
that reads the row directly, so its reach is every row. `system`, which `project/deletion.ts` may
already import, gives the same reach to the one command that has it today, and the admission inside it
checks the person. `admitProjectDeletion` returns `Admitted<InstallationAdministratorScope>`
(`{ kind: 'installation-administrator', accountId }`, already in the `Scope` union) on the same
transaction; part 3 adds it and `admitProject` (below) to `admission.ts`. The busy check sees every run
of the project because the transaction is `system`, as today's definer function did.

**What the admission holds.** The account row `FOR SHARE` (part 0 already gives `hub_runtime` the
privilege for it), so a deactivation waits for the tombstone to commit or commits first and refuses
it. The administrator tenure is read through `iam.is_installation_administrator` without a lock, as
today: a revocation that commits between that read and the tombstone insert does not stop the
deletion, which is today's race (`0017_installation_administrator.sql`, a STABLE read). Locking the
tenure needs `UPDATE` on `iam.installation_administrator`, a table only part 6 polices and grants;
part 6's `admitInstallationAdministrator` takes the tenure `FOR SHARE` and closes it, and part 6's
child spec lists this race among the ones it closes.

**The tombstone command, in today's order** (`begin_project_deletion`):

1. The admission. Not an active installation administrator: `PROJECT_DELETE_DENIED` (403), as today
   (an inactive account fails `is_installation_administrator` today too, so its code does not change).
2. The tombstone for `projectId`. If one exists: a different name is `PROJECT_NAME_MISMATCH`, otherwise
   it is returned, with no project lock and no busy check, as today. `workspace_id` and `name` come from
   the tombstone. `deletion.ts` then returns 204 when `completed_at` is set and resumes the remaining
   steps otherwise (`deletion.ts:87-95`).
3. Otherwise the project row `FOR UPDATE`, then the tombstone read again (a concurrent deletion may
   have committed one while this transaction waited on the lock, and a concurrent purge may have
   removed the row). A tombstone now: step 2's outcome. No tombstone and no row: `PROJECT_NOT_FOUND`.
   A different name: `PROJECT_NAME_MISMATCH`. A queued or running run: `PROJECT_BUSY`. Then the
   tombstone insert, with `workspace_id` and `name` from the locked row and `requested_by` from the
   proof.

Two concurrent deletions of one project: one inserts the tombstone, the other waits on the row, reads
that tombstone at step 3 and returns it. One tombstone, no 40P01, no unique violation.

The improvement: after part 1, run creation holds the project row `FOR SHARE` through `admitProject`,
so a tombstone and an admitted writer serialize on that row. Until part 1 merges, the run start is
today's (`builder.lock_project_for_run`), and the race is today's. The tombstone transaction never
touches `builder.project_working_state`, so it has no lock cycle with today's run start, which holds
that row and then waits for a key share on the project.

**`admitProject`, for the parts that follow.** The umbrella's build plan puts it in part 3, so parts 1,
2 and 4 use one admission instead of each writing its own in parallel. It ports `iam.admit_project`
(`0030_project_deletion.sql`) to the umbrella's lock order:

```ts
export function admitProject<A extends Exclude<ProjectAction, 'project.delete'>>(tx: WriteTx, accountId: AccountId, projectId: ProjectId, action: A): Promise<Admitted<ProjectScope<A>>>
export function admitProject(tx: ReadTx, accountId: AccountId, projectId: ProjectId, action: 'project.read'): Promise<Admitted<ProjectScope<'project.read'>, 'read'>>
```

0. The transaction must be an account transaction (`transaction` or `read` for `accountId`); a `system`
   transaction throws `INTERNAL_UNEXPECTED`, because under `S` the policy hides nothing and the
   visibility steps below would admit a tombstoned project. Tested.
1. The account `FOR SHARE` (write only); not `active`: `ACCOUNT_INACTIVE`.
2. `SELECT workspace_id FROM project.project WHERE project_id = $1`, no lock. The policy already hides
   a project whose tombstone hides it (today's `PROJECT_DELETING` check) and one outside the account's
   workspaces. No row: the action's `outsider` code.
3. The membership in that workspace `FOR SHARE` (write only), then `ROLE_ALLOWS`: the `forbidden` code.
4. The project row again, `FOR SHARE` (write only). No row now (a purge committed meanwhile): the
   `outsider` code. `workspaceId` in the scope is this row's.
5. The visibility read once more, as a new statement after the lock (write only):
   `SELECT 1 FROM project.project WHERE project_id = $1`. A tombstone that committed while step 4 waited
   on the tombstone transaction's `FOR UPDATE` is not seen by step 4 (READ COMMITTED rechecks a locked row
   only when that row changed, and the tombstone does not change it), so this read, with a new snapshot,
   applies `HIDDEN` again. Hidden now: the `outsider` code. (Part 1's review, Sonnet finding 6.)

`ProjectAction` maps onto today's `iam.action` for the membership check: `project.read` to
`workspace.read`, and `project.build` to its own `ROLE_ALLOWS` row, which part 3 adds to
`WorkspaceAction` and to both roles (the umbrella lets a part add an action row), as `iam.admit_project`
passes its action to `iam.admit_workspace` today. Both roles hold both actions, so the forbidden branch
of `admitProject` is unreachable with today's roles. The parts that call it add the `ACTION_REFUSALS` rows for `project.read`
and `project.build`; where today's callers map the 42501 to different codes for one action, that
part's child spec says which code the row keeps. Part 3 tests it on fixtures only: a member (admitted),
an outsider, a member without the role, a plain member of a tombstoned project (outsider code), a member
administrator while the deletion is incomplete (admitted, as today), and a tombstone waiting on an
`admitProject` that holds the row `FOR SHARE`, both orders, no 40P01; and the run start held at step 4
while a tombstone commits, which step 5 refuses.

**PRJ-03's refusals** (`ACTION_REFUSALS` row part 3 adds, codes as today):

| Action | outsider | forbidden |
| --- | --- | --- |
| `project.create` | `PROJECT_CREATE_DENIED` (403) | `PROJECT_CREATE_DENIED` (403) |

One change, stated as admission section 2 asks: an account that is not `active` gets the umbrella's
`ACCOUNT_INACTIVE` on PRJ-03, where today it gets `PROJECT_CREATE_DENIED`. It reaches PRJ-03 only with a
session opened before the deactivation.

`ProjectSummary` stays in `identity-workspace-paths.yaml`, since a workspace response still references
it; part 6 deletes it.

## 4. Policies

`S`, `A` and `W(x)` as in the admission child. `ADMIN` is `(SELECT iam.acting_installation_administrator())`.
`HIDDEN(p)` is `EXISTS (SELECT 1 FROM project.project_deletion d WHERE d.project_id = p AND (d.completed_at IS NOT NULL OR NOT ADMIN))`,
today's tombstone rule from `iam.visible_projects`: a member who is also an administrator still sees a
project whose deletion has not completed, as today.

| Table | Command | Predicate |
| --- | --- | --- |
| `project.project` | `SELECT` | `S OR (A IS NOT NULL AND W(workspace_id) AND NOT HIDDEN(project_id))` |
| `project.project` | `INSERT` | `WITH CHECK (A IS NOT NULL AND W(workspace_id))` |
| `project.project` | `UPDATE` | `USING` and `WITH CHECK` the same as `SELECT` |
| `project.project` | `DELETE` | `USING (S)` |
| `project.project_deletion` | `SELECT` | `S OR (A IS NOT NULL AND (W(workspace_id) OR ADMIN))` |
| `project.project_deletion` | `INSERT`, `UPDATE`, `DELETE` | `S` only (the tombstone, the purge stamp and the completion run in `system`) |
| `builder.builder_run` | `SELECT` | `S OR project_id IN (SELECT project_id FROM project.project)` |
| `builder.project_working_state` | `SELECT` | `S OR project_id IN (SELECT project_id FROM project.project)` |

There is no `ADMIN` branch on `project.project`. A non member administrator reads no live project, as
today (`0017_installation_administrator.sql`: the role "admits nothing inside any Workspace or
Project"). Members can read their workspace's tombstones because `HIDDEN` must see them; the two reads
that show a tombstone as a card test `ADMIN` and `completed_at IS NULL`, as today's bodies do.
PRJ-02's second query runs only when the first found no visible project, as today. The summaries'
tombstone branch today tests `NOT EXISTS` the project row as `project_owner`, which sees every row;
under the policy, a row the administrator cannot see would look purged and show its card early
(Astra, revision 2). So the purge stamps the tombstone: `project.project_deletion.purged_at
timestamptz`, set in the purge transaction, and the branch tests `purged_at IS NOT NULL` instead of
`NOT EXISTS`. Part 3's migration adds the column and sets it to `requested_at` for every tombstone
whose project row is already gone. `HIDDEN` reads `project.project_deletion`, whose policy does not read `project.project`, so there
is no recursion.

The two builder tables get their read policy now, as admission section 4 assigns to part 3: a row is
readable when its project is (rule 3, through the table's own `project_id`). They get `SELECT` only;
their write policies and grants come with part 1. No TypeScript reads them directly today (grep of
`apps/hub/src`), so only the summaries query and the builder's own functions reach them.

**Bridges** (derived by the catalog lint from the live function bodies; the lint fails on a missing or
extra one). Expected: `legacy_owner` on `project.project` and `project.project_deletion` `TO iam_owner,
connector_owner` (`admit_project`, `visible_projects`, `admit_application_owner`,
`grant_application_access`, `has_application_access`, `admit_project_owner`, `list_bound_connections`),
and on the two builder tables `TO` the owners whose bodies read them, `builder_owner` at least. Foreign
key checks skip row security, so the builder's inserts need no bridge on the project tables.

**The helper's read** (with the part 0 amendment, option A): `project.project` gets `FOR SELECT TO iam_rls USING (true)`
and `iam_rls` gets column `SELECT (project_id, workspace_id, archived)`, in the same migration that forces
its RLS, because `iam.acting_applications()` reads it as `iam_rls` and a forced table with no policy for that
role returns no rows (spike section 7). Test: the helper returns the project for a member and for a grantee
on a part 3 head.

**The purges.** `iam`, `connector`, `reg` and `builder` `.purge_project` are granted to `hub_runtime`
only, and `project_owner` loses its execute on them and on `builder.register_project_repository`. Each
purge is recreated in part 3's migration with a first statement that raises `PURGE_REQUIRES_SYSTEM`
(42501) unless `conexus.scope` is `system`, so a person transaction that calls one is refused and
leaves its rows.

**Grants**: `hub_runtime` gets `SELECT, INSERT, UPDATE, DELETE` on `project.project` and
`project.project_deletion`, and `SELECT` on the two builder tables, in part 3's migration. It gets
nothing on `iam.installation_administrator`; the admission reads it through the definer function.

## 5. The purge

`project/deletion.ts` keeps its order: tombstone, release the application data, kill the sandboxes,
purge, delete the repository, complete. The purge opens `system('project-purge', fn)` and, on one
`WriteTx`, runs today's `purge_project` in today's order:

1. No tombstone for the project: `PROJECT_DELETION_NOT_STARTED`. It is an invariant, unreachable from
   HTTP, since the deletion command inserts the tombstone in the transaction before it.
2. A queued or running run: `PROJECT_BUSY`.
3. `iam.purge_project`, `connector.purge_project`, `reg.purge_project` and `builder.purge_project` as
   SQL (each owner's part replaces its call with a port on the same `WriteTx`).
4. `DELETE FROM platform.operation_receipt WHERE operation_id = 'PRJ-03' AND resource_id = $1`
   (today's `reserved_project_id` delete; each later owner deletes its own receipts).
5. `DELETE FROM project.project WHERE project_id = $1`, last, as today, then
   `UPDATE project.project_deletion SET purged_at = coalesce(purged_at, now()) WHERE project_id = $1`.

The purge takes no leading lock on the project row in part 3. A leading `FOR UPDATE` deadlocks with
today's run start, which holds the working state row and then waits for a key share on the project
while the purge waits to delete that working state (Opus and Astra traced it). Part 1, which replaces
the run start with `admitProject`, decides the purge's lock together with it. A retry after the
project row is gone runs every step on zero rows and succeeds, as today. A crash rolls all of it back.

`completeDeletion` stamps `completed_at` in `system('project-purge', fn)`, idempotent as today.

## 6. Value sourcing

| Action | Value | Source |
| --- | --- | --- |
| PRJ-03 | `projectId` | `ProjectId.parse(randomUUID())` once, then the receipt's `resource_id` |
| PRJ-03 | `projectRevision` | minted once per attempt, as today (`store.ts`, `mintIdentity`) |
| PRJ-03 | `starterRevision` | `repository.prepare(projectId)`, outside the transactions |
| PRJ-04 | the tombstone's `workspace_id`, `name` | the locked project row; on a retry, the existing tombstone |
| PRJ-04 | the tombstone's `requested_by` | the administrator proof's `accountId` |
| summaries | `lastActivityAt`, `latestRun`, `hasPreview`, `deleting` | the latest run, the working state and the tombstone, as `list_project_summaries_with_activity` computes them; the presenter formats `lastActivityAt` as ISO UTC with milliseconds |
| summaries, administrator tombstones | the card | the tombstone row, as the function's second branch does |

## 7. Tests (each with literal expected values)

- PRJ-01 and PRJ-SUMMARIES as a member, as an outsider (empty), and as an installation administrator
  who is not a member (PRJ-01 empty; summaries only the administrator tombstone cards of purged
  projects, so none while the project row and its tombstone both exist), each before a tombstone, after
  it, after the purge and after `completed_at`.
- PRJ-02 for a member, an outsider (404), a non member administrator on a live project (404), a
  tombstoned project as a plain member (404), as a member administrator (the live row, `deleting:
  true`), and as a non member administrator after the purge (`projectRevision: ''`, `deleting: true`).
- PRJ-03: create, replay, conflict, the same key and body in another workspace (creates there), a
  crash between Git and completion (same project id on retry), a retry after the account lost the
  workspace (`PROJECT_CREATE_DENIED`), an inactive account (`ACCOUNT_INACTIVE`), `EXISTING_GIT`
  (`PROJECT_SOURCE_REFUSED` and no receipt row), and the revoke race in both orders against today's
  `iam.remove_workspace_member`.
- PRJ-04: a non administrator (`PROJECT_DELETE_DENIED`), an account deactivated while the deletion
  waits on the project lock (the deactivation waits, or commits first and the deletion answers
  `PROJECT_DELETE_DENIED`), an administrator who is not a member of the
  workspace (deletes, 204), wrong name, busy, two concurrent deletions (one tombstone, no 40P01), a
  retry after the purge with the repository delete failed (resumes, 204), a delete after completion
  (204), a crash inside the purge (nothing purged), the purge called with no tombstone
  (`PROJECT_DELETION_NOT_STARTED`), and the receipts of every account gone after the purge.
- Deletion racing today's run start, in both orders: no 40P01, today's outcomes (umbrella section 8).
- The fixture that deletes the `WHERE` of PRJ-01 still returns only the acting account's projects, for
  an outsider and for a non member administrator.
- Without an account set, `SELECT`, `UPDATE` and `DELETE` on both project tables and `SELECT` on both
  builder tables touch zero rows; as an outsider, a direct `SELECT` of both builder tables returns zero
  rows.
- `iam.acting_installation_administrator()` is false for an administrator whose account is not
  `active`, as `is_installation_administrator` is today.

## 8. Deletes

The project YAML section, `scripts/generate-project-contracts.mjs` and its generated files,
`features/project/api.ts` casts (4), the three `22P02` catches (`routes.ts`, `summary-routes.ts`,
`thumbnail-routes.ts`), the 42501 mapping in `store.ts` and `deletion.ts`, `validReplay`,
`project.operation_idempotency`, and the ten functions. Census: project rows (6) reach zero.
