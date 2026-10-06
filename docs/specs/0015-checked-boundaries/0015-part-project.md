# 0015. Child: part 3, the project owner

**Status**: Approved (by HQ on 2026-10-04, under the operator's delegation for S1 part specs; revision 4, which aligns the text to revision 5.2 of the umbrella and its admission child: the split wall of part 0b, a gate in place of a transaction, and the tombstone in the administrator's own transaction).

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
Revision 4 follows the split wall that part 0b built: reads run as `hub_reader` behind the `reader`
policies, commands as `hub_command` behind an admission, and the tombstone is written in the
administrator's own `transaction`, not in `system`.

## 1. What it ports

| Function (latest in) | Today | After |
| --- | --- | --- |
| `project.list_project_summaries` (0001) | members' projects of a workspace, hiding tombstoned ones from non administrators | `projectStore.list(accountId, workspaceId)` in `read`, one query, the policy filters |
| `project.get_project` (0055) | a visible project with its `deleting` flag; for an installation administrator, a tombstone not yet completed | `projectStore.get(accountId, projectId)` in `read`, two queries: the project; if none, `SELECT ... FROM project.project_deletion WHERE project_id = $1 AND completed_at IS NULL AND (SELECT rls.acting_installation_administrator())`, which answers the purged member of `getProject`'s reply |
| `project.list_project_summaries_with_activity` (0030) | cards with the latest run, preview flag, and administrator tombstones | one query in `project/store.ts` joining `builder.builder_run` and `builder.project_working_state` read only, then a pure presenter `toProjectCard` |
| `project.reserve_or_replay_create_project`, `project.lock_create_project_receipt`, `project.complete_create_project_receipt` (0001) | `createProject` receipt in two transactions | `reserve` and `complete` of `platform/receipt.ts` under the workspace authority |
| `project.create_project_with_repository` (0032) | inserts the project and calls `builder.register_project_repository` | `createProject` on `proof.tx`, still calling `builder.register_project_repository` as SQL until part 1 turns it into a port |
| `project.begin_project_deletion` (0032) | installation administrator only; the tombstone; refuses while a run is queued or running | `begin` in the administrator's `transaction(accountId, fn)` after `admitInstallationAdministrator(gate, 'project.delete')` (section 3) |
| `project.purge_project` (0030) | refuses without a tombstone; the four owner purges, the receipts, the project row, one transaction | the purge in `system('project-purge', fn)` after `admitSystem(gate)` (section 5) |
| `project.complete_project_deletion` (0030) | stamps `completed_at` | `complete` in `system('project-purge', fn)` after `admitSystem(gate)` |

`project.operation_idempotency` is dropped (its rows are not copied, as the data child says).
`iam.admit_project` and `iam.visible_projects` stay until part 6, since builder, connector and registry
bodies still call them; the bridge keeps them working.

## 2. Operations

| Id | Method and path | Access | Success | Failures beyond the common set | `malformed` |
| --- | --- | --- | --- | --- | --- |
| `listProjects` | `GET /api/control/workspaces/:workspaceId/projects` | session | 200 project list | none (an outsider gets an empty list, as today) | `workspaceId: WORKSPACE_NOT_FOUND` |
| `getProject` | `GET /api/control/projects/:projectId` | session | 200 project, a union of two members (below) | `PROJECT_NOT_FOUND` | `projectId: PROJECT_NOT_FOUND` |
| `createProject` | `POST /api/control/workspaces/:workspaceId/projects` | session | 201 created | `PROJECT_CREATE_DENIED`, `IDEMPOTENCY_CONFLICT`, `PROJECT_SOURCE_REFUSED`, `PROJECT_REPOSITORY_UNAVAILABLE` | `workspaceId: WORKSPACE_NOT_FOUND` |
| `deleteProject` | `DELETE /api/control/projects/:projectId` | session | 204 | `PROJECT_DELETE_DENIED`, `PROJECT_NOT_FOUND`, `PROJECT_NAME_MISMATCH`, `PROJECT_BUSY`, `PROJECT_DELETION_INCOMPLETE` | `projectId: PROJECT_NOT_FOUND` |
| `listProjectSummaries` | `GET /api/control/workspaces/:workspaceId/project-summaries` | session | 200 cards | `PROJECT_SUMMARIES_UNAVAILABLE` | `workspaceId: WORKSPACE_NOT_FOUND` |
| `getProjectThumbnail` | `GET /api/control/projects/:projectId/thumbnail` | session | 200 `Binary` (`image/png`) | `PROJECT_THUMBNAIL_NOT_FOUND`, `PROJECT_THUMBNAIL_UNAVAILABLE` | `projectId: PROJECT_NOT_FOUND` |

The paths, statuses and codes are today's (the generated routes and `routes.ts`, `summary-routes.ts`,
`thumbnail-routes.ts`); the builder copies each from the YAML it deletes and the bijection proves it.
The thumbnail keeps reading through `reg.get_application_thumbnail` as SQL until part 4; the bytes are
checked by the `Binary` rule. `listProjectSummaries` and `getProjectThumbnail` keep today's ids from the route
ledger.

**`getProject`'s reply.** Today a purged project seen by an installation administrator comes back with
`projectRevision: ''`, which the YAML's `minLength: 1` forbids and `project-settings.tsx` reads as
"purged". The empty value also reaches a non member administrator between the tombstone and the purge,
since that administrator never sees the project row; the web text is a moment early for them. The Zod success is a union, so the wire stays byte for byte and the empty value is declared:
the live project (`projectRevision: ProjectRevision`, `deleting: boolean`) or the purged tombstone
(`projectRevision: z.literal('')`, `archived: z.literal(false)`, `deleting: z.literal(true)`). The web
narrows on the literal.

**`createProject`'s body.** `sourceBootstrap` keeps today's two shapes (`NEW` and `EXISTING_GIT`), and
`EXISTING_GIT` answers `PROJECT_SOURCE_REFUSED` (422) before any transaction, as `createProject` does
today. `starterRevision` from `repository.prepare` parses as the branded `Revision` (40 lower hex, the
check `create_project_with_repository` makes today); a value that does not parse is
`INTERNAL_UNEXPECTED`, as today's unmapped `P0001`.

**Copied from today, named so the builder does not invent them.** `listProjects` orders by `name, project_id`.
`listProjectSummaries` orders by `last_activity_at DESC, project_id` and wraps the cards as `{ projects }`;
`latestRun` is `null` when a tombstone exists or there is no run, otherwise the run picked by
`created_at DESC, builder_run_id DESC`. `getProjectThumbnail` sets `ETag: "<artifactRevisionId>"` and
`Cache-Control: private, no-cache`, declared as the operation's response headers. Today the thumbnail
route exists only when `thumbnailReader` is configured; after part 3 it is always declared and
registered, and without a reader it answers `PROJECT_THUMBNAIL_UNAVAILABLE`, so the boot refusal holds
in every setup.

## 3. Admissions and locks

| Operation | Entry | Admission | Locks, in order |
| --- | --- | --- | --- |
| `listProjects`, `listProjectSummaries` | `read(accountId)` | none: the `reader` policy shows only what the account may see | none |
| `getProject`, `getProjectThumbnail` | `read(accountId)` | none | none |
| `createProject`, transaction 1 | `transaction(accountId)` | `admitWorkspace(gate, workspaceId, 'project.create')` | account `FOR SHARE`, membership `FOR SHARE`; receipt `FOR UPDATE` |
| `createProject`, transaction 2 | `transaction(accountId)` | the same admission again | the same |
| `deleteProject`, the tombstone | `transaction(accountId)` | `admitInstallationAdministrator(gate, 'project.delete')` | account `FOR SHARE`; the tenure row `FOR SHARE`; the project row `FOR UPDATE`, only on the path with no tombstone |
| `deleteProject`, purge and complete | `system('project-purge')` | `admitSystem(gate)` | the project row `FOR UPDATE` while it exists (section 5) |

**Why the tombstone runs in the administrator's own transaction.** The installation administrator's
deletion authority is installation wide, and the reader policies are workspace scoped, so the tombstone
cannot be read through a policy that also lists projects (an `ADMIN` branch on `project.project` showed
every live project to every administrator, and could not lock the row). The command role has one
`USING (true)` policy, so on `transaction` the admission is the wall: the person is checked by
`admitInstallationAdministrator`, and the tombstone reads and locks the project row directly, which is
the reach today's `SECURITY DEFINER` function had. The busy check sees every run of the project for the
same reason. `system` is kept for the work that has no person (the purge and its completion).

**What the admission holds.** `iam.lock_administrators()` is not taken here, because deletion does not
change the tenure set. The account row `FOR SHARE` (`hub_command` holds `UPDATE (created_at)` on
`iam.account` for that lock only), so a deactivation waits for the tombstone to commit or commits
first and refuses it. The tenure row `FOR SHARE` (`hub_command` holds `UPDATE (revoked_at)` on
`iam.installation_administrator` for that lock only), taken after the account and read again after the
lock, so a revocation that commits while the deletion waits makes it answer `PROJECT_DELETE_DENIED`.
This closes the race this child left to part 6 in revision 3. Nobody revokes in part 0b; the
revoking command arrives with part 6, which widens the grant to `(revoked_at, revoked_by)`.

**The tombstone command, in today's order** (`begin_project_deletion`):

1. The admission. Not an active installation administrator: `PROJECT_DELETE_DENIED` (403), as today.
2. The tombstone for `projectId`. If one exists: a different name is `PROJECT_NAME_MISMATCH`, otherwise
   it is returned, with no project lock and no busy check, as today. `deletion.ts` then returns 204 when
   `completed_at` is set and resumes the remaining steps otherwise.
3. Otherwise the project row `FOR UPDATE`, then the tombstone read again (a concurrent deletion may
   have committed one while this transaction waited on the lock, and a concurrent purge may have
   removed the row). A tombstone now: step 2's outcome. No tombstone and no row: `PROJECT_NOT_FOUND`.
   A different name: `PROJECT_NAME_MISMATCH`. A queued or running run: `PROJECT_BUSY`. Then the
   tombstone insert, as one `INSERT ... SELECT` from the locked project row, so `workspace_id` and
   `name` are the row's and `requested_by` is the proof's `accountId`; a count other than one is the
   invariant `PROJECT_TOMBSTONE_NOT_WRITTEN`.

Two concurrent deletions of one project: one inserts the tombstone, the other waits on the row, reads
that tombstone at step 3 and returns it. One tombstone, no 40P01, no unique violation.

The improvement: after part 1, run creation holds the project row `FOR SHARE` through `admitProject`,
so a tombstone and an admitted writer serialize on that row. Until part 1 merges, the run start is
today's (`builder.lock_project_for_run`), and the race is today's. The tombstone transaction never
touches `builder.project_working_state`, so it has no lock cycle with today's run start, which holds
that row and then waits for a key share on the project.

**`admitProject`, for the parts that follow.** It ports `iam.admit_project` to the umbrella's lock
order, on a gate for a command and on a `ReadTx` for the one read action:

```ts
export function admitProject<A extends ProjectAction>(gate: CommandGate, projectId: ProjectId, action: A): Promise<Admitted<ProjectScope<A>>>
export function admitProject(tx: ReadTx, projectId: ProjectId, action: 'project.read'): Promise<Admitted<ProjectScope<'project.read'>, 'read'>>
```

`ProjectAction` is `'project.read' | 'project.build'`. `'project.delete'` belongs to
`admitInstallationAdministrator`.

0. The gate carries the acting account. A gate opened by `system` is refused with the invariant
   `GATE_ACTOR_REFUSED`, because a job has no account to admit. Tested.
1. The account `FOR SHARE` (command only); not `active`: `ACCOUNT_INACTIVE`.
2. `SELECT workspace_id FROM project.project WHERE project_id = $1`, no lock. On a command this read
   carries the deletion predicate itself, with no administrator exception (`HIDDEN` with `ADMIN` false:
   any deletion row hides the project), because the command role's policy shows every row. On a read the
   `reader` policy applies `HIDDEN` as today, so a member administrator still sees a project whose
   deletion has not completed. No row: the action's `outsider` code.
3. The membership in that workspace `FOR SHARE` (command only), then `ROLE_ALLOWS`: the `forbidden` code.
4. The project row again, `FOR SHARE` (command only). No row now (a purge committed meanwhile): the
   `outsider` code. `workspaceId` in the scope is this row's.
5. The visibility read once more, as a new statement after the lock (command only), with the same
   deletion predicate. A tombstone that committed while step 4 waited on the tombstone transaction's
   `FOR UPDATE` is not seen by step 4 (READ COMMITTED rechecks a locked row only when that row changed,
   and the tombstone does not change it), so this read, with a new snapshot, applies the predicate
   again. Hidden now: the `outsider` code.

A command therefore never admits a project whose deletion has started, member administrators included.
Today's `iam.admit_project` admitted a member administrator until completion; revision 5.2 removes that
exception on commands (admission section 2), and a read keeps it.

`project.build` is its own `ROLE_ALLOWS` row for both roles, as `iam.admit_project` passes its action to
`iam.admit_workspace` today, so the forbidden branch is unreachable with today's roles. The parts that
call it add the `ACTION_REFUSALS` rows they need. Part 3 tests it on fixtures: a member (admitted), an
outsider, a plain member of a tombstoned project (outsider code), a member administrator whose project's
deletion has started (refused on a command, listed on a read), a system gate (refused), an inactive
account, and a tombstone waiting on an `admitProject` that holds the row `FOR SHARE`, both orders, no
40P01; and the run start held at step 4 while a tombstone commits, which step 5 refuses.

**`createProject`'s refusals** (`ACTION_REFUSALS` row, codes as today):

| Action | outsider | forbidden |
| --- | --- | --- |
| `project.create` | `PROJECT_CREATE_DENIED` (403) | `PROJECT_CREATE_DENIED` (403) |

One change, stated as admission section 2 asks: an account that is not `active` gets the umbrella's
`ACCOUNT_INACTIVE` on `createProject`, where today it gets `PROJECT_CREATE_DENIED`. It reaches `createProject` only with a
session opened before the deactivation.

`ProjectSummary` stays in `identity-workspace-paths.yaml`, since a workspace response still references
it; part 6 deletes it.

## 4. Policies

`A` is `(SELECT rls.acting_account())`, `W(x)` is `x IN (SELECT rls.acting_workspaces())` and `ADMIN` is
`(SELECT rls.acting_installation_administrator())`. `HIDDEN(p)` is
`EXISTS (SELECT 1 FROM project.project_deletion d WHERE d.project_id = p AND (d.completed_at IS NOT NULL OR NOT ADMIN))`,
today's tombstone rule from `iam.visible_projects`: a member who is also an administrator still sees a
project whose deletion has not completed, as today. The table register of
`contracts/technical/hub-catalog-census.json` and part 0b's migration `0065_split_wall.sql` hold the
text; the admission child, section 4.2, holds the rule.

| Table | Role and policy | Predicate |
| --- | --- | --- |
| `project.project` | `hub_reader`, `reader` | `A IS NOT NULL AND W(workspace_id) AND NOT HIDDEN(project_id)` |
| `project.project_deletion` | `hub_reader`, `reader` | `A IS NOT NULL AND W(workspace_id)` |
| `project.project_deletion` | `hub_reader`, `reader_admin` | `A IS NOT NULL AND ADMIN` |
| `builder.builder_run` | `hub_reader`, `reader` | `A IS NOT NULL AND project_id IN (SELECT project_id FROM project.project)` |
| `builder.project_working_state` | `hub_reader`, `reader` | the same |
| each of the four tables above | `hub_command`, `command` | `USING (true) WITH CHECK (true)` |

There is no `ADMIN` branch on `project.project`. A non member administrator reads no live project, as
today (`0017_installation_administrator.sql`: the role "admits nothing inside any Workspace or
Project"). Members can read their workspace's tombstones because `HIDDEN` must see them; the two reads
that show a tombstone as a card test `ADMIN` and `completed_at IS NULL`, as today's bodies do. The reader
sees a deletion in progress of a workspace it belongs to or, as an administrator, of any workspace
(`reader_admin`); the command role reads every row.
`getProject`'s second query runs only when the first found no visible project, as today. The summaries'
tombstone branch today tests `NOT EXISTS` the project row as `project_owner`, which sees every row;
under the policy, a row the administrator cannot see would look purged and show its card early. So the
purge stamps the tombstone: `project.project_deletion.purged_at timestamptz`, set in the purge
transaction, and the branch tests `purged_at IS NOT NULL` instead of `NOT EXISTS`. The migration adds the
column and sets it to `requested_at` for every tombstone whose project row is already gone. `HIDDEN`
reads `project.project_deletion`, whose reader policies do not read `project.project`, so there is no
recursion.

**Grants** (the register rows): `hub_reader` holds `SELECT` on the four tables. `hub_command` holds on
`project.project` `SELECT, INSERT, DELETE, UPDATE (name)`; on `project.project_deletion` `SELECT, INSERT,
DELETE, UPDATE (completed_at, purged_at)`; on `builder.builder_run` and `builder.project_working_state`
`SELECT`. `hub_runtime` holds nothing on any of them, so a login with no role switched gets 42501. The
composite tenant keys keep a row from moving between workspaces, and no `UPDATE` column grant names a
tenant column.

**Bridges** (derived by the catalog lint from the live function bodies; the lint fails on a missing or
extra one): `legacy_owner` on `project.project` and `project.project_deletion` for the owners whose
function bodies still read them, and on the two builder tables for the owners that read them, as the
snapshot lists. Foreign key checks skip row security, so the builder's inserts need no bridge on the
project tables.

**The helper's read.** `project.project` has `FOR SELECT TO iam_rls USING (true)` and `iam_rls` has the
column `SELECT` it needs, because `rls.acting_workspaces()` reads membership as `iam_rls` and a forced
table with no policy for that role returns no rows.

**The purges.** `iam`, `connector`, `reg` and `builder` `.purge_project` are granted `EXECUTE` to
`hub_command` only (a register row), `hub_runtime` loses it, and `project_owner` loses its execute on
them and on `builder.register_project_repository`. Each purge is recreated with a first statement that
raises `PURGE_REQUIRES_SYSTEM` (42501) unless the transaction-local `conexus.job` is `project-purge`,
which only `system('project-purge', fn)` sets, so a person transaction and the reaper's job that call one
are refused and leave their rows. A repository test fails on the text `purge_project` in any Hub file but
`project/deletion.ts`.

## 5. The purge

`project/deletion.ts` keeps its order: tombstone, release the application data, kill the sandboxes,
purge, delete the repository, complete. The purge opens `system('project-purge', fn)`, passes
`admitSystem(gate)`, and on one `WriteTx` runs today's `purge_project` in this order:

0. The project row `FOR UPDATE` while it exists, so the purge waits for an admitted command on the
   project and a later admission waits for the purge (admission section 6). A retry after the row is
   gone goes on. This is a leading lock that revision 3 left out, because it deadlocked with today's run
   start (which holds the working state row and then waits for a key share on the project); it is taken
   now because a purge that does not wait for an admitted command can delete rows under it. Part 1
   replaces the run start with `admitProject`, and the order is then the same everywhere. The
   deadlock case is tested in both orders against `builder.lock_project_for_run`.
1. No tombstone for the project: `PROJECT_DELETION_NOT_STARTED`. It is an invariant, unreachable from
   HTTP, since the deletion command inserts the tombstone in the transaction before it.
2. A queued or running run: `PROJECT_BUSY`.
3. `iam.purge_project`, `connector.purge_project`, `reg.purge_project` and `builder.purge_project` as
   SQL (each owner's part replaces its call with a port on the same `WriteTx`).
4. `DELETE FROM platform.operation_receipt WHERE operation_id = 'createProject' AND resource_id = $1`
   (today's `reserved_project_id` delete; each later owner deletes its own receipts).
5. `DELETE FROM project.project WHERE project_id = $1`, last, as today, then
   `UPDATE project.project_deletion SET purged_at = coalesce(purged_at, now()) WHERE project_id = $1`.

A retry after the project row is gone runs every step on zero rows and succeeds, as today. A crash rolls
all of it back.

`complete` stamps `completed_at` in `system('project-purge', fn)`, idempotent as today.

## 6. Value sourcing

| Action | Value | Source |
| --- | --- | --- |
| `createProject` | `projectId` | `ProjectId.parse(randomUUID())` once, then the receipt's `resource_id` |
| `createProject` | `projectRevision` | minted once per attempt, as today (`store.ts`, `mintIdentity`) |
| `createProject` | `starterRevision` | `repository.prepare(projectId)`, outside the transactions |
| `deleteProject` | the tombstone's `workspace_id`, `name` | the locked project row, copied by the `INSERT ... SELECT`; on a retry, the existing tombstone |
| `deleteProject` | the tombstone's `requested_by` | the administrator proof's `accountId` |
| summaries | `lastActivityAt`, `latestRun`, `hasPreview`, `deleting` | the latest run, the working state and the tombstone, as `list_project_summaries_with_activity` computes them; the presenter formats `lastActivityAt` as ISO UTC with milliseconds |
| summaries, administrator tombstones | the card | the tombstone row, as the function's second branch does |

## 7. Tests (each with literal expected values)

- `listProjects` and `listProjectSummaries` as a member, as an outsider (empty), and as an installation administrator
  who is not a member (`listProjects` empty; summaries only the administrator tombstone cards of purged
  projects, so none while the project row and its tombstone both exist), each before a tombstone, after
  it, after the purge and after `completed_at`.
- `getProject` for a member, an outsider (404), a non member administrator on a live project (404), a
  tombstoned project as a plain member (404), as a member administrator (the live row, `deleting:
  true`), and as a non member administrator after the purge (`projectRevision: ''`, `deleting: true`).
- `createProject`: create, replay, conflict, the same key and body in another workspace (creates there), a
  crash between Git and completion (same project id on retry), a retry after the account lost the
  workspace (`PROJECT_CREATE_DENIED`), an inactive account (`ACCOUNT_INACTIVE`), `EXISTING_GIT`
  (`PROJECT_SOURCE_REFUSED` and no receipt row), and the revoke race in both orders against today's
  `iam.remove_workspace_member`.
- `deleteProject`: a non administrator (`PROJECT_DELETE_DENIED`), an account deactivated while the deletion
  waits on the project lock (the deactivation waits, or commits first and the deletion answers
  `PROJECT_DELETE_DENIED`), an administrator who is not a member of the
  workspace (deletes, 204), wrong name, busy, two concurrent deletions (one tombstone, no 40P01), a
  retry after the purge with the repository delete failed (resumes, 204), a delete after completion
  (204), a crash inside the purge (nothing purged), the purge called with no tombstone
  (`PROJECT_DELETION_NOT_STARTED`), and the receipts of every account gone after the purge.
- Deletion racing today's run start, in both orders: no 40P01, today's outcomes (umbrella section 8).
- The fixture that deletes the `WHERE` of `listProjects` still returns only the acting account's projects, for
  an outsider and for a non member administrator.
- Without an account set, `SELECT`, `UPDATE` and `DELETE` on both project tables and `SELECT` on both
  builder tables touch zero rows; as an outsider, a direct `SELECT` of both builder tables returns zero
  rows.
- `rls.acting_installation_administrator()` is false for an administrator whose account is not
  `active`, as `is_installation_administrator` is today.

## 8. Deletes

The project YAML section, `scripts/generate-project-contracts.mjs` and its generated files,
`features/project/api.ts` casts (4), the three `22P02` catches (`routes.ts`, `summary-routes.ts`,
`thumbnail-routes.ts`), the 42501 mapping in `store.ts` and `deletion.ts`, `validReplay`,
`project.operation_idempotency`, and the ten functions. Census: project rows (6) reach zero.
