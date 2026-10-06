# 0015. Child: part 1, the Builder owner

**Status**: Approved by HQ (revision for umbrella 5.3)

Part of spec 0015. This revision brings the approved child of 2026-10-05 (revision 2 under the old
per table policy model) to the umbrella's revision 5.2, design 4, the split wall. It keeps every
behavior, refusal code and test of that child that does not depend on the mechanisms 5.2 deleted.
It cuts the 15 `INSERT`, `UPDATE` and `DELETE` policy rows, the `S` branch of the five `SELECT` rows,
the reader rows of `builder.project_repository` and `builder.builder_run_model_account` (HQ decision:
rule 6, no person lists them), the served pointer paragraph with its `iam_rls` policy and grant on `builder.project_working_state`,
every `iam.acting_applications` use, and the section "If the part 0 amendment is refused". It uses
the latest bodies of all 31 live `builder` functions in `builder-bodies.sql`. It follows the
admission child, sections 1, 2 and 4 to 11, and the data child, sections 1 and 3. Part 0b builds the
surface (the gate, `admitProject`, `admitApplication`, `checkApplication`, the `reader` policies on `builder_run`
and `project_working_state`, the purge guard on `conexus.job`) before this part builds. Nothing here
changes the Proof class, the database entries, the three `rls` helpers or the Scope union.

## Summary

Part 1 declares eight BLD operations, ports 29 of the 31 Builder functions, and puts the five Builder
tables under the split wall: a `reader` policy where a person reads (three tables), the one `command` policy, column
grants, and one composite key (`builder.builder_run.account_id` to `iam.account`). A run keeps its row
key and replays its current state. Project admission uses the account that started the run. The
executor claims and settles under `system('builder-executor')`, and a run's later steps are admitted
by `admitRun`, whose body this part builds. The run state machine of spec 0011 stays one state
machine. The Project purge and repository registration become ports on the Project transaction. Two
Builder SQL functions remain live for registry callers until part 4 ports those callers. Today's
Builder store has separate ingress and executor pools and generic JSON rows
(`apps/hub/src/builder/store.ts:2`, `apps/hub/src/builder/store.ts:39`,
`apps/hub/src/builder/module.ts:115`).

## 1. What it ports

The line in the Body column is the latest body in `part1/builder-bodies.sql`. The named migration is
the latest definition. Each after home reads parsed rows through the data module. `false` and `null`
remain distinct where the current body makes them distinct.

| Function and latest migration | Today, body line | After |
| --- | --- | --- |
| `admit_source_revision` (0032) | A visible Project accepts `main`, its last Preview, or the base or result of the latest code changing run. Other revisions return false (`builder-bodies.sql:1`). | `builder/preview-state.ts` admits, under `read(accountId)`, `main`, the last Preview, or the base or result of any run of the Project that recorded a result, whatever its state (operator decision, #534); a revision from another Project or one no run records is refused. The Git source reader still rejects a missing tree (`apps/hub/src/builder/source.ts:43`). |
| `admit_verified_application_source` (0036) | The exact account, Project, running execution and result source yield true (`builder-bodies.sql:33`). | Keep this SQL function for registry retention through part 1. Part 4 ports the predicate under `admitRun` on the command role and drops the function. Retention is after the candidate: no `admitProject` and no `PROJECT_BUILD_DENIED`; the Project is share locked by `admitRun`; a run whose account lost access still retains and advances its Preview, as today (part 4 revision 3). |
| `advance_builder_run_source` (0036) | A running run and working row accept its candidate once; a conflicting source returns false (`builder-bodies.sql:51`). | A system run transition under `admitRun`. It returns true when the source is already equal, and false when the working row is missing. |
| `bind_builder_run_message` (0001) | A trimmed message id of 1 to 200 characters binds only once to an open run (`builder-bodies.sql:70`). | The same conditional update in `builder/store.ts`. |
| `bind_builder_run_sandbox` (0001) | A trimmed sandbox id of 1 to 200 characters binds only once to a running run (`builder-bodies.sql:84`). | The same conditional update in `builder/store.ts`. |
| `claim_builder_run` (0056) | A queued run becomes running, phase `PREPARING`, with owner and heartbeat after Project admission (`builder-bodies.sql:98`). | A system read learns the queued row's account and Project, then `transaction(run.accountId)` calls `admitProject(gate, projectId, 'project.build')` and claims the row. Later owned writes use `admitRun`. A refused, unclaimed row uses `failUnclaimed`. See sections 3 and 5. |
| `clear_builder_run_phase` (0001) | The trigger clears phase when the run is not running or cancellation was requested (`builder-bodies.sql:117`; `apps/hub/migrations/0001_baseline.sql:2271`). | Delete after the parity test. Each transition writes a null phase, and the existing phase CHECK remains (`apps/hub/migrations/0056_builder_question_waits_in_the_run.sql:14`). |
| `create_builder_run` (0056) | It validates digests and message fields, locks working state, checks the repository, replays the current row for the same key, or inserts one queued run. It refuses a second active run (`builder-bodies.sql:130`). | `builder/store.ts` keeps the same order after Project admission and the same row key. See section 5. |
| `fail_builder_run` (0001) | An open run becomes `FAILED` with the given code and finish time (`builder-bodies.sql:160`). | An owned run settles under `admitRun`. A refused claim fails an unowned queued row through `failUnclaimed`. |
| `interrupt_builder_run` (0001) | An open run becomes `INTERRUPTED`; the first cancellation time and reason survive (`builder-bodies.sql:174`). | A system settlement under the run proof. |
| `list_builder_runs` (0056) | A visible Project lists only this account's runs, newest first, with limit clamped to 1 through 50 (`builder-bodies.sql:190`). | One parsed read with the same author filter, order and limit. |
| `lock_project_for_run` (0032) | Project admission precedes the working row lock and repository check (`builder-bodies.sql:212`). | The run start uses `admitProject` before the working row lock, on one transaction. |
| `purge_project` (0032) | It deletes runs, working state and repository in that order (`builder-bodies.sql:227`). | `builder.purge(proof: Admitted<SystemScope<'project-purge'>>, projectId)` on the Project purge transaction; a proof of another job fails `tsc`. See section 5. |
| `read_builder_run` (0056) | A visible Project returns its latest run, regardless of author (`builder-bodies.sql:239`). | One parsed read, ordered by creation time as today. |
| `read_conversation_sandbox` (0040) | The exact conversation and Project return one provider sandbox id or null (`builder-bodies.sql:251`). | A parsed read under the admitted account that opened the conversation or the stored run account. |
| `read_latest_code_changing_builder_run` (0008) | A visible Project returns the latest changed source result, ordered by creation time then run id (`builder-bodies.sql:260`). | The same parsed read and pure projection. |
| `read_open_run_conversations` (0046) | It returns distinct conversation ids for queued or running runs (`builder-bodies.sql:293`). | `system('builder-executor')`, `admitSystem`, then the read, for the executor and idle sweep. |
| `read_preview_subject` (0032) | A visible Project returns its three last Preview columns, including nulls (`builder-bodies.sql:303`). | A parsed member read of working state under `read(accountId)`. A grantee never reads this row. Part 4 reads the served pointer directly for an application host (section 5). |
| `read_project_sandboxes` (0045) | It returns nonnull sandbox ids ordered by id for one Project (`builder-bodies.sql:328`). | `system('project-purge')`, `admitSystem`, then the read, before Project deletion kills the sandboxes outside the purge transaction (`apps/hub/src/builder/module.ts:325`, `apps/hub/src/project/deletion.ts:84`). |
| `record_builder_run_candidate` (0036) | A running, uncancelled run records one candidate and phase `SOURCE_ADMISSION` (`builder-bodies.sql:338`). | The same run transition before Git moves `main` (`apps/hub/src/builder/run/admit.ts:33`). |
| `record_builder_run_model_account` (0038) | A running run records a model account once (`builder-bodies.sql:355`). | `transaction(run.accountId)`, `admitRun`, then the insert. An `admitRun` refusal or a run that is not `RUNNING` answers `BUILDER_RUN_MODEL_ACCOUNT_RECORD_REFUSED`. The child table belongs to this part. |
| `record_conversation_sandbox` (0040) | It upserts one valid provider id, but refuses a Project change (`builder-bodies.sql:370`). | The same parsed write in `builder/store.ts`. |
| `record_conversation_session` (0039) | It upserts the mirror head, optional synced main and optional turn end, but refuses a Project change (`builder-bodies.sql:389`). | The same parsed write in `builder/store.ts`. |
| `register_project_repository` (0032) | It inserts the working state and repository markers, each once (`builder-bodies.sql:411`). | A Builder port takes the Project creation proof (`Admitted<WorkspaceScope<'project.create'>>`) and writes on `proof.tx`. Project replaces its SQL call. |
| `renew_run_lease` (0057) | It beats listed live runs, takes stale unlisted runs with `SKIP LOCKED`, and returns former owners in creation order (`builder-bodies.sql:422`). | One system transaction in the executor, after `admitSystem`. See section 5. |
| `request_builder_run_cancellation` (0056) | Project admission and an exact run lock precede cancellation; queued runs end, running runs get the first request (`builder-bodies.sql:453`). | A Project proof then a run row lock. The same summary is returned. |
| `run_summary` (0056) | It projects the run and formats `createdAt` as UTC milliseconds (`builder-bodies.sql:478`). | One pure presenter used by the store and routes. |
| `served_preview_revision` (0023) | It returns the three last Preview columns only when the source is nonnull (`builder-bodies.sql:494`). | Keep this SQL function for the three `reg` served functions through part 1. Part 4 stops calling it and reads the three columns directly, so this part builds no port for it, and part 4's merge drops the function (section 5). No grantee gets a working state row. |
| `set_builder_run_phase` (0056) | It accepts only the six known phases on an uncancelled running run; refusal is null (`builder-bodies.sql:504`). | A conditional transition with the same summary or null. |
| `settle_builder_run` (0032) | A response only run with no candidate succeeds (`builder-bodies.sql:524`). | A system run transition, keeping `RESPONSE_ONLY`. |
| `settle_builder_run_build` (0036) | It checks source and artifact identity, locks run then working state, matches the registry artifact and sets success or build failure (`builder-bodies.sql:542`). | A system transaction under `admitRun`. Part 4 later adds retention and the thumbnail to its BUILT branch and drops the matcher. The last good Preview stays on build failure. |

The table has 31 rows. The trigger is one of them. Part 1 drops 29 functions and keeps the two
registry dependencies named above. Part 4 drops those two. `iam.admit_project` and
`iam.visible_projects` remain for other owners until part 6.

## 2. Operations

Every row below is session access (`apps/hub/src/builder/routes.ts:81`,
`apps/hub/src/builder/routes.ts:107`, `apps/hub/src/builder/routes.ts:122`,
`apps/hub/src/builder/routes.ts:132`, `apps/hub/src/builder/routes.ts:167`). The success status and
payload follow the current handler and Builder YAML. A malformed `projectId` gets
`PROJECT_NOT_FOUND`. A malformed `builderRunId` gets `BUILDER_RUN_NOT_FOUND`. An invalid query, body or
header gets `REQUEST_VALIDATION_FAILED`, except a missing or empty idempotency key gets
`IDEMPOTENCY_KEY_REQUIRED`, as the contract child requires.

| Id | Method and path | Access | Success | Failures beyond the common set | `malformed` |
| --- | --- | --- | --- | --- | --- |
| BLD-08 | `GET /api/control/projects/:projectId/source/tree` | session | 200 source tree | `SOURCE_REVISION_NOT_FOUND`, `BUILDER_SOURCE_UNAVAILABLE`, `BUILDER_SOURCE_READ_REFUSED`, `BUILDER_SOURCE_READ_TREE_TOO_LARGE`, `BUILDER_SOURCE_READ_UNSAFE_ENTRY` | `projectId: PROJECT_NOT_FOUND` |
| BLD-09 | `GET /api/control/projects/:projectId/source/file` | session | 200 exact file | `SOURCE_REVISION_NOT_FOUND`, `SOURCE_FILE_NOT_FOUND`, `BUILDER_SOURCE_UNAVAILABLE` | `projectId: PROJECT_NOT_FOUND` |
| BLD-23 | `GET /api/control/projects/:projectId/builder-session` | session | 200 session projection | `BUILDER_SESSION_UNAVAILABLE`, `PROJECT_BUILD_DENIED` | `projectId: PROJECT_NOT_FOUND` |
| BLD-24 | `POST /api/control/projects/:projectId/builder-session/messages` | session | 201 new or replayed run; 200 message taken by a waiting run | `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_CONFLICT`, `CONVERSATION_NOT_FOUND`, `BUILDER_CAPACITY_FULL`, `PROJECT_BUILD_DENIED`, `ACCOUNT_INACTIVE`, `BUILDER_MESSAGE_REFUSED`, `BUILDER_RUN_CREATE_FAILED`, `BUILDER_BUSY`, `PROJECT_BUSY`, `BUILDER_UNAVAILABLE` | `projectId: PROJECT_NOT_FOUND` |
| BLD-25 | `POST /api/control/projects/:projectId/builder-session/runs/:builderRunId/cancel` | session | 200 run projection | `BUILDER_RUN_NOT_FOUND`, `PROJECT_BUILD_DENIED`, `ACCOUNT_INACTIVE`, `BUILDER_CANCELLATION_UNAVAILABLE` | `projectId: PROJECT_NOT_FOUND`; `builderRunId: BUILDER_RUN_NOT_FOUND` |
| BLD-26 | `GET /api/control/projects/:projectId/builder-session/runs/:builderRunId/trace` | session | 200 safe native trace | `BUILDER_RUN_NOT_FOUND`, `BUILDER_TRACE_UNAVAILABLE`, `PROJECT_BUILD_DENIED` | `projectId: PROJECT_NOT_FOUND`; `builderRunId: BUILDER_RUN_NOT_FOUND` |
| BLD-29 | `GET /api/control/projects/:projectId/source/compare` | session | 200 changed paths | `SOURCE_REVISION_NOT_FOUND`, `BUILDER_SOURCE_UNAVAILABLE`, `BUILDER_SOURCE_READ_REFUSED`, `BUILDER_SOURCE_READ_TREE_TOO_LARGE`, `BUILDER_SOURCE_READ_UNSAFE_ENTRY` | `projectId: PROJECT_NOT_FOUND` |
| BLD-30 | `POST /api/control/projects/:projectId/builder-session/preview` | session | 201 Preview launch | `PREVIEW_SUBJECT_NOT_FOUND`, `PROJECT_BUILD_DENIED`, `PREVIEW_UNAVAILABLE` | `projectId: PROJECT_NOT_FOUND` |

The source tree and comparison keep the Git limits and sorted paths
(`apps/hub/src/builder/source.ts:30`, `apps/hub/src/builder/source.ts:54`,
`apps/hub/src/builder/source.ts:73`). BLD-23 keeps `latestBuilderRun`, `latestCodeChangingRun`,
`preview` and `runHistory`; only the latest live run gains `pendingCalls`
(`apps/hub/src/builder/routes.ts:86`, `contracts/api/product/builder-paths.yaml:271`). BLD-24 keeps
the status union. A row key replay returns the current run summary and still answers 201 because the
service sets `created: true` on that path; 200 means a waiting run took a message
(`apps/hub/src/builder/store.ts:114`, `apps/hub/src/builder/service.ts:159`,
`apps/hub/src/builder/service.ts:176`, `apps/hub/src/builder/routes.ts:119`). The key is a header,
and the body keeps `content` and `conversationId` (`apps/hub/src/builder/routes.ts:107`). BLD-25
keeps an empty JSON body (`apps/hub/src/builder/routes.ts:122`). The trace keeps Mastra usage detail
when present, with null totals when unavailable (`apps/hub/src/builder/routes.ts:34`,
`apps/hub/src/builder/module.ts:277`, `contracts/api/product/builder-paths.yaml:296`).

The web replaces its eight `response.json() as` reads with `call`, and its hand written BLD types with
the shared schemas (`apps/web/src/features/builder/api.ts:76`, `apps/web/src/features/builder/api.ts:128`).
The nine Mastra mount routes remain foreign. Parse only the fields Conexus reads in session state,
the tool answer, the model list and each known `data-*` event before use. Keep the mount's own
Project and conversation guard and its problem response (`apps/hub/src/builder/mastra-session-routes.ts:43`,
`apps/hub/src/builder/mastra-session-routes.ts:265`, `apps/hub/src/builder/mastra-session-routes.ts:296`,
`apps/web/src/features/builder/mastra-session.ts:203`,
`apps/web/src/features/builder/construir/pending-card.tsx:15`,
`apps/web/src/features/builder/transcript.ts:323`).

BLD-30 declares the current Preview POST and adds its operation ledger row. It answers 201 with `entryUrl`,
`previewUrl`, `entryGrant`, `artifactRevisionId`, `artifactDigest` and `expiresAt`; its named failures
are `PREVIEW_SUBJECT_NOT_FOUND`, `PROJECT_BUILD_DENIED` and `PREVIEW_UNAVAILABLE`
(`apps/hub/src/builder/routes.ts:145`, `apps/hub/src/builder/routes.ts:153`,
`apps/web/src/features/builder/api.ts:112`). Its body is the empty JSON object. BLD-08 remains
ListProjectSourceTree, and the retired BLD-27 and BLD-28 stay unused
(`contracts/api/product/builder-paths.yaml:12`, `docs/product/operation-ledger.md:102`).
The BLD-30 ledger row names `LaunchBuilderPreview`, owned by Builder, for an authorized Project's
last good Preview artifact. It is a command. The umbrella count becomes eight BLD operations.

**Changes from today.** For an outsider, removed member or inactive account, BLD-24 now returns
403 `PROJECT_BUILD_DENIED` or `ACCOUNT_INACTIVE`, where the current route can wrap the refusal as
503 `BUILDER_UNAVAILABLE`. BLD-25 makes the same change from 503
`BUILDER_CANCELLATION_UNAVAILABLE`. Under a held Project proof, a missing working state or
repository marker is an invariant breach: it answers `INTERNAL_UNEXPECTED` (500) with
`details.invariant` `BUILDER_PROJECT_ROWS_MISSING`, because a refusal names a person's access and this is not
about access; `BUILDER_SUBJECT_NOT_FOUND` no longer exists. A hidden Project (tombstoned or no longer visible) answers BLD-25 with 403
`PROJECT_BUILD_DENIED` from the shared admission, as for an outsider; HQ dropped the 404 promise of
its decision 3, because part 3's step 5 refuses before any run lookup. Preserve the named 503 failures for other unavailable causes
(`apps/hub/src/builder/routes.ts:118`, `apps/hub/src/builder/routes.ts:128`,
`builder-bodies.sql:143`). BLD-23 and BLD-26 return `PROJECT_BUILD_DENIED` when the Preview subject
read returns null for a hidden Project or missing working row. BLD-26 serves only the latest run;
an older run id answers 404 `BUILDER_RUN_NOT_FOUND` (`apps/hub/src/builder/routes.ts:138`).

These codes need one row of `ACTION_REFUSALS` changed by this part: `'project.build'` answers
`PROJECT_BUILD_DENIED` for both its `outsider` and its `forbidden` code. The built row answers
`PROJECT_NOT_FOUND` for both (`apps/hub/src/identity-access/admission.ts:42`, in the worktree of part
0b). A row is data, not a change to the shape (admission child, section 1). Part 4 already
relies on `PROJECT_BUILD_DENIED` for the admitted work before the candidate.

## 3. Admissions and locks

All admissions below read the actor from the gate. None takes an `accountId`.

`admitProject(gate, projectId, 'project.build')` is the admission of the admission child. It
takes an account gate only. A job gate (`system`) throws `INTERNAL_UNEXPECTED` with invariant
`GATE_ACTOR_REFUSED`, so a Project proof never carries system reach. Its command path locks the
account, the membership and the Project `FOR SHARE` in that order, then reads the Project again in a
new statement with the deletion predicate in SQL and no administrator exception (admission child,
section 2). A missing or hidden Project, a deleted one, or a member without build authority answers
`PROJECT_BUILD_DENIED` (403), the part 4 HQ decision, through the `ACTION_REFUSALS` row of section 2.
An inactive account gets `ACCOUNT_INACTIVE` (403).

`admitRun(gate, builderRunId, owner)` is the admission of a run the executor owns. This part builds
its body, as the umbrella assigns. It follows the lock order of the admission child, section 2, step 3:
the project row before the run row.

0. Before any lock it reads the run's `project_id`, and the Project's `workspace_id` for the account
   path, by `builder_run_id = $1` with no lock. A missing run throws `BUILDER_RUN_NOT_ADMITTED`. After
   the locks of step 1 or 2 it reads the run again under its lock and throws the same code if
   `project_id` differs. `project_id` has no `UPDATE` grant, so the recheck guards a deleted and
   reused id, not a moved run. Never lock the run before the Project: the purge takes the Project
   `FOR UPDATE` first.

1. Under `system('builder-executor', ...)` the gate carries the job. The admission takes the Project
   `FOR SHARE`, then the run `FOR UPDATE`, requires `owner_id` to equal `owner.ownerId` and the state
   to be `QUEUED` or `RUNNING`, then reads the Project in a new statement with the deletion predicate.
2. Under `transaction(run.accountId, ...)` it first takes the account and the membership `FOR SHARE`
   and requires `project.build` in `ROLE_ALLOWS`, then the same Project, run and fresh read, and
   requires the run's `account_id` to equal the gate's account.
3. The run row it locks is read by `builder_run_id = $1`. The scope carries the run's `account_id`, its
   `project_id` and the run id read from the row. `RunScope` gains `projectId` and `via` here (HQ decision; the
   umbrella adds them to the scope, admission child, section 1). `via` is `'account'` for the step 2 path and `'executor'` for the step 1 path. `proof.scope.builderRunId` and
   `proof.scope.projectId` are the filters of every later statement.
4. A run that is missing, owned by another instance or ended throws `BUILDER_RUN_NOT_ADMITTED`. A
   Project that is gone or has a deletion row throws the same code. An account that lost the Project
   throws `PROJECT_BUILD_DENIED`, from the step 2 checks. A store function that today returns `false`
   or `null` for a run it cannot change catches `BUILDER_RUN_NOT_ADMITTED` and returns the same
   `false` or `null`, so the ports stay one for one.

The row lock needs `UPDATE` on at least one column of `builder.builder_run` for `hub_command`. The
column grant of section 4 provides it, and it also serves part 4's retention, which locks the run `FOR
SHARE`.

Today's SQL uses `iam.admit_project`, and the store maps its 42501 in the claim to
`BUILDER_RUN_NOT_ADMITTED` (`apps/hub/migrations/0030_project_deletion.sql:39`,
`apps/hub/src/builder/store.ts:154`). The executor keeps that literal failure code for a refused
claim. `endingOf` makes it a failed ending, and `writeEnding` stores it
(`apps/hub/src/builder/run/run.ts:334`, `apps/hub/src/builder/run/run.ts:370`).

Every statement a command runs filters by a scope column taken from its proof. In this part that is
`proof.scope.projectId` for Project proofs and `proof.scope.builderRunId` with `proof.scope.projectId`
for run proofs. An argument
id, such as a run id in a cancel, is only a second condition beside it (admission child, section 1).

| Command, read or store write | Entry and proof | Locks in order |
| --- | --- | --- |
| BLD-23, BLD-26, BLD-08, BLD-09, BLD-29 and member Preview reads | `read(accountId)`. The `reader` policies limit each read to the acting account's Projects. | None. |
| BLD-24, before any conversation lookup or inbox access | `transaction(accountId)`; `admitProject(gate, projectId, 'project.build')`; commit. An outsider or removed member gets 403 `PROJECT_BUILD_DENIED`, with no inbox message. | Account and membership `FOR SHARE`; Project `FOR SHARE`; fresh read. No Builder row lock (`apps/hub/src/builder/service.ts:159`). |
| BLD-24, a new run | `transaction(accountId)`; `admitProject(gate, projectId, 'project.build')`. The earlier admission does not replace this proof. | Account and membership `FOR SHARE`; Project `FOR SHARE`; fresh read; working state `FOR UPDATE` where `project_id` is the proof's; nonlocking row key lookup and active run lookup, both by the proof's Project; insert with the proof's Project and account. `readBase` runs while these locks are held (`apps/hub/src/builder/store.ts:116`, `builder-bodies.sql:143`). |
| BLD-24, waiting message | Use the committed admission before `waiting.message`, then read the current run summary under `read(accountId)`. | No Builder SQL row lock. The live inbox owns the message (`apps/hub/src/builder/service.ts:159`). |
| BLD-25 | `transaction(accountId)`; `admitProject(gate, projectId, 'project.build')`. | Account and membership `FOR SHARE`; Project `FOR SHARE`; the run `FOR UPDATE` where `builder_run_id` is the argument and `project_id` and `account_id` are the proof's. A missing run or another author's run is `BUILDER_RUN_NOT_FOUND` (`builder-bodies.sql:453`). |
| Claim, step 1: learn the queued row | `system('builder-executor')`; `admitSystem(gate)`; a read of the queued row by run id; commit. No Project proof. | None. |
| Claim, step 2 | `transaction(run.accountId)`; `admitProject(gate, row.projectId, 'project.build')`, then the claim in the same transaction. A nested entry is refused, so step 1 has already ended. | Account and membership `FOR SHARE`; Project `FOR SHARE`; fresh read; run `FOR UPDATE` where `project_id` and `account_id` are the proof's; reread state; conditional `QUEUED` update sets `owner_id` (`builder-bodies.sql:98`). |
| Refused claim, `failUnclaimed` | `system('builder-executor')`; `admitSystem(gate)`. No Project proof. | Conditional update of `builder_run_id = $1 AND state = 'QUEUED' AND owner_id IS NULL`. Store `FAILED`, `BUILDER_RUN_NOT_ADMITTED` and finish time. Zero rows means a claim or cancellation won (`builder-bodies.sql:160`, `apps/hub/src/builder/run/run.ts:334`). |
| `bind_builder_run_message` | `transaction(accountId)`; `admitProject(gate, projectId, 'project.build')`. | Project before run `FOR UPDATE`; the update filters by the proof's Project (`builder-bodies.sql:70`). |
| `set_builder_run_phase` before the candidate, `record_builder_run_candidate`, `record_builder_run_model_account` | `transaction(run.accountId)`; `admitRun(gate, runId, owner)`, which also requires `project.build` and the run's account. Recording the candidate is the last account admitted write: `fastForwardMain` follows it (`apps/hub/src/builder/run/admit.ts:32-36`), so a revoked account never moves `main`. | Account and membership `FOR SHARE`; Project `FOR SHARE`; fresh read; run `FOR UPDATE` (`builder-bodies.sql:338`, `builder-bodies.sql:504`, `builder-bodies.sql:355`). |
| `set_builder_run_phase` after the candidate (settling phases) | `system('builder-executor')`; `admitRun`. | Project `FOR SHARE`; run `FOR UPDATE` (`builder-bodies.sql:504`). |
| `advance_builder_run_source` | `system('builder-executor')`; `admitRun`. | Project `FOR SHARE`; run `FOR UPDATE`, then working state `FOR UPDATE` where `project_id` is read from the run row (`builder-bodies.sql:51`). |
| `settle_builder_run` | `system('builder-executor')`; `admitRun`. | Project `FOR SHARE`; run `FOR UPDATE` (`builder-bodies.sql:524`). |
| `settle_builder_run_build` | `system('builder-executor')`; `admitRun`. | Project `FOR SHARE`; run `FOR UPDATE`, then working state `FOR UPDATE` (`builder-bodies.sql:542`). |
| `fail_builder_run` after claim | `system('builder-executor')`; `admitRun`. | Project `FOR SHARE`; run `FOR UPDATE` (`builder-bodies.sql:160`). |
| `interrupt_builder_run` after claim | `system('builder-executor')`; `admitRun`. | Project `FOR SHARE`; run `FOR UPDATE` (`builder-bodies.sql:174`). |
| Lease heartbeat | `system('builder-executor')`; `admitSystem(gate)`. | The owner's listed open run rows, updated where `owner_id` is the owner (`builder-bodies.sql:422`). |
| Lease takeover | `system('builder-executor')`; `admitSystem(gate)`. | Run `FOR UPDATE SKIP LOCKED`, with no Project row; a later settlement of a taken run is its own transaction under `admitRun` (`builder-bodies.sql:422`). |
| `record_conversation_session` from a person's command | `transaction(accountId)`; `admitProject(gate, projectId, 'project.build')`. | Project before conversation row upsert, whose `ON CONFLICT DO UPDATE` carries `WHERE session.project_id` equal to the proof's (`builder-bodies.sql:389`). |
| `bind_builder_run_sandbox` | `system('builder-executor')`; `admitRun`. | Project `FOR SHARE`; run `FOR UPDATE` (`builder-bodies.sql:84`). |
| `recordConversationSandbox` | `system('builder-executor')`; `admitRun`. | Conversation row upsert whose Project and conversation are checked against the run row named by the proof, in the same statement. The run's `conversation_id` is `text` and the session's is `uuid`, so the statement compares `session.conversation_id::text = run.conversation_id` and never casts the run's text. A run whose id is not a uuid matches no row and answers `BUILDER_CONVERSATION_SESSION_REFUSED` (`builder-bodies.sql:370`, `apps/hub/migrations/0008_builder_run.sql:9`, `apps/hub/migrations/0039_conversation_session.sql:9`). |
| `endMirror`, through `record_conversation_session` | `system('builder-executor')`; `admitRun`. | The same upsert (`apps/hub/src/builder/run/run.ts:156`, `builder-bodies.sql:389`). |
| Conversation sandbox read | `read(accountId)` after the Mastra mount's Project guard, or `read(run.accountId)` for run work. | None. The mount must pass its parsed account into the conversation opener (`apps/hub/src/builder/mastra-session-routes.ts:286`, `apps/hub/src/builder/conversation.ts:39`, `apps/hub/src/builder/conversation.ts:78`). |
| Register working state and repository markers | The Project creation transaction and its workspace proof, `Admitted<WorkspaceScope<'project.create'>>`. | Project row, then working state insert, then repository insert, each selected from the Project row of the proof's workspace; a Project outside it inserts nothing (`builder-bodies.sql:411`, `apps/hub/migrations/0032_conexus_git.sql:87`, `apps/hub/migrations/0032_conexus_git.sql:94`). |
| BLD-30, Preview launch | `transaction(accountId)`; `admitProject(gate, projectId, 'project.build')`; the Preview subject read on `proof.tx`, filtered by `proof.scope.projectId`; commit. Then `getApplicationBySource` under `read(accountId)` and `launchPreview` in its own entry, with the account and Project taken from the committed proof. `iam.open_preview` stays SQL until part 6 ports it. An outsider, removed member, missing or tombstoned Project gets 403 `PROJECT_BUILD_DENIED` from `admitProject`, before any subject read. The `APPLICATION_SUBJECT_REFUSED` message match in the route is deleted. | Account and membership `FOR SHARE`; Project `FOR SHARE`; fresh read. No Builder row lock (`apps/hub/src/builder/routes.ts:146`). |
| Purge run rows, working state and repository | The Project purge's `system('project-purge')` transaction and its `Admitted<SystemScope<'project-purge'>>` (the umbrella's `WriteTx` is `proof.tx`). A proof of another job fails `tsc`, so the port has no runtime job check. | Live Project `FOR UPDATE` first (built by part 0b), busy read, then run delete, working state delete, repository delete. A missing Project row after an earlier purge is a successful retry (`builder-bodies.sql:227`). |

A zero row result from a conversation upsert (a conversation of another Project) is
`BUILDER_CONVERSATION_SESSION_REFUSED`, raised by the store. The command role sees every row, so no
42501 is involved any more. A refused payer insert is `BUILDER_RUN_MODEL_ACCOUNT_RECORD_REFUSED`, as
the `admitRun` refusal of the same row maps (`apps/hub/src/builder/store.ts:197`).

**Cycle check.** Part 0b already makes the purge take the Project `FOR UPDATE` before its busy read
and its owner ports, which part 3 left out (`../part3/0015-part-project.md:229`). Part 1 moves run
start to Project `FOR SHARE` before working state, and `admitRun` takes the Project before the run, so
every Builder transaction takes the Project row first. After it the orders are run then working state
(source advance and settlement) or working state then an inserted run (run start). An inserted row
conflicts with no existing lock. Claim takes the Project proof before its run lock, and its queued
row is first read without a lock in its own transaction. Lease heartbeat and takeover take run rows
and never seek the Project row, and the purge refuses a queued or running row before it deletes a run
(`builder-bodies.sql:422`, `builder-bodies.sql:542`, `apps/hub/migrations/0030_project_deletion.sql:267`).
Part 4 retention takes the run `FOR UPDATE` through `lockedRun` after `admitRun`, so it follows the same direction.

The remaining `iam` functions lock account and membership, not Builder rows
(`apps/hub/migrations/0009_remove_model_connections.sql:70`,
`apps/hub/migrations/0030_project_deletion.sql:39`). The remaining connector functions touch their
connection and binding rows and acquire no Builder row lock
(`apps/hub/migrations/0031_project_binding.sql:117`). Registry readers call the old served pointer
without locking working state (part 4 reads it directly after its merge, still without a lock); until part 4, its retain function takes run before artifact; part 4 retains inside the settlement transaction, which takes Project, run, then working state, with no artifact lock (`0015-part-registry.md`, section 3).
Part 5 model functions touch model rows, and its held credential read goes through `admitRun` in an
account transaction, which this part's order already covers. Test the purge against each live caller
at the actual merge head. A leading Project lock is valid only when the caller graph finds no
surviving function that locks a Builder child first and then needs a Project lock. If it finds one,
stop and reopen this order before the migration.

Add an index on `builder.conversation_session(project_id)`. Its primary key is conversation id,
while its reader policy and the purge use Project id
(`apps/hub/migrations/0039_builder_conversation_session.sql:8`).

## 4. The split wall for the five tables

All five Builder tables have `ENABLE` and `FORCE ROW LEVEL SECURITY` and exactly one policy
`command ... TO hub_command USING (true) WITH CHECK (true)`. Part 0b already built both for
`builder.builder_run` and `builder.project_working_state`; this part adds them for
`builder.project_repository`, `builder.conversation_session` and `builder.builder_run_model_account`.
The command role holds no row filter, so what it may touch is the proof (section 3), the composite
key, the column grants and the write lint (admission child, section 5).

**Reader policies.** `A` is `(SELECT rls.acting_account())` and `P(p)` is `p IN (SELECT project_id FROM
project.project)`, the Project row visible through its own `reader` policy. An account with no
membership, including a grantee who only opens an application, gets no Builder row, because the
grantee has no reader branch (admission child, section 4.2, rule 5). The nonmember administrator gets
none either: none of the five tables is on the administrator reach list (rule 4).

| Table | `reader` predicate |
| --- | --- |
| `builder.builder_run` | `A IS NOT NULL AND P(project_id)`, as part 0b built it. The direct reads still filter author where the body did (`builder-bodies.sql:190`, `builder-bodies.sql:239`). |
| `builder.project_working_state` | `A IS NOT NULL AND P(project_id)`, as part 0b built it. The member reads and Project summaries use it (`builder-bodies.sql:303`, `apps/hub/migrations/0030_project_deletion.sql:378`). |
| `builder.conversation_session` | `A IS NOT NULL AND P(project_id)`. A person's sandbox read uses it (`builder-bodies.sql:251`). |

`builder.project_repository` and `builder.builder_run_model_account` get no reader policy and no reader
grant (HQ decision, rule 6 of the admission child, section 4.2). No person lists them: run start reads
the repository on the command role, and the held credential reads the payer row on the command role
after `admitRun`. So `hub_reader` gets 42501 on both, and nothing is dead. Another Project member
cannot read the payer relation (`builder-bodies.sql:355`).

The child predicate follows the table's own `project_id`
(`apps/hub/migrations/0001_baseline.sql:2274`,
`apps/hub/migrations/0039_builder_conversation_session.sql:16`; the key of the payer table is
`apps/hub/migrations/0038_builder_run_model_accounts.sql:8`). Every rule these rows must keep from the
bodies they replace (a Project visible only while not tombstoned) is in `P` through the Project
policy. No system branch exists. A job reads these tables on the command role.

**Grants and register rows.** The register (`contracts/technical/hub-catalog-census.json`) gets one
row per table with exactly these privileges. `hub_reader` holds `SELECT` on `builder_run`,
`project_working_state` (0b gave it on both) and `conversation_session`, and on neither of the other
two. `hub_command` holds:

| Table | `hub_command` verbs and update columns | Key |
| --- | --- | --- |
| `builder.builder_run` | `SELECT`, `INSERT`, `DELETE` (only the purge port deletes runs, under its job check), and `UPDATE (state, phase, started_at, finished_at, owner_id, heartbeat_at, failure_code, cancellation_requested_at, cancellation_reason, trigger_message_id, sandbox_id, candidate_revision, result_source_revision, result_kind)`. | `account_id` to `iam.account (account_id)`, new |
| `builder.project_working_state` | `SELECT`, `INSERT`, `DELETE`, and `UPDATE (current_state, last_preview_source_revision, last_preview_artifact_revision_id, last_preview_artifact_digest, updated_at)` | `project_id` to `project.project`, as today |
| `builder.project_repository` | `SELECT`, `INSERT`, `DELETE`. No `UPDATE`: nothing updates it and nothing locks it. | `project_id` to `project.project`, as today |
| `builder.conversation_session` | `SELECT`, `INSERT`, and `UPDATE (provider_sandbox_id, mirror_head, synced_main, last_turn_ended_at)`. No `DELETE`: the repository cascade removes it on purge. | `project_id` to `builder.project_repository`, as today |
| `builder.builder_run_model_account` | `SELECT`, `INSERT`. No `UPDATE` and no `DELETE`: the run cascade removes it on purge. | `builder_run_id` to `builder.builder_run`, as today |

No grant covers `builder_run_id`, `project_id`, `account_id`, `conversation_id`, the digests or the
request columns of `builder_run`, nor `working_source_revision`, nor
`project_id` or `conversation_id` of `conversation_session`. `owner_id` is the executor instance's id,
not a tenant column, and the claim and the lease must write it. `hub_command` also lacks the legacy
`model_*` columns of `builder_run`. The row lock for `FOR UPDATE` and `FOR SHARE` on `builder_run`
and `project_working_state` goes through those update columns, so no extra grant exists for it.
`hub_runtime`'s privileges on the three newly split tables are revoked in the migration. Part 0b
already revoked them on the other two. No Builder table is granted to `hub_factory`. The five
pending `UNSCOPED_TABLES` rows leave the catalog lint.

**The composite key.** `ALTER TABLE builder.builder_run ADD CONSTRAINT builder_run_account_id_fkey
FOREIGN KEY (account_id) REFERENCES iam.account (account_id) ON DELETE RESTRICT`. Today the column
reaches a person with no constraint. The migration validates it against existing rows, and the build
runs the `ADD FOREIGN KEY` itself against a copy of the local Conexus data before the pull request
(HQ decision), so a run row whose account is gone shows up before the merge. A command that inserts a run for an
account that does not exist fails 23503 and answers `INTERNAL_UNEXPECTED`: admission makes it unreachable. No other composite key is
assigned to this part (admission child, section 5).

**Bridges.** Part 3 and part 0b installed `legacy_owner TO builder_owner` on run and working state,
for the live Builder bodies. This part adds no bridge on the other three tables: the migration
drops every function that read them in the same step (the lint derives the set and finds none). The
two kept functions, `admit_verified_application_source` and `served_preview_revision`, read only run
and working state, so those two bridges stay until part 4 drops the functions. The caller graph gate
names all five registry to Builder edges. The lint rejects a missing reader and an extra bridge:

| Table | Live Builder bodies requiring the bridge at the part 1 merge head |
| --- | --- |
| `builder.builder_run` | `admit_verified_application_source` (`builder-bodies.sql:33`). |
| `builder.project_working_state` | `served_preview_revision` (`builder-bodies.sql:494`). |

At the part 1 merge head those two functions remain live. Registry retention and thumbnail retention
call the first. Thumbnail and served application reads call the second
(`apps/hub/migrations/0054_compiler_template_failures_gen.sql:27`,
`apps/hub/migrations/0048_application_thumbnail.sql:55`,
`apps/hub/migrations/0048_application_thumbnail.sql:114`,
`apps/hub/migrations/0023_application_session.sql:366`,
`apps/hub/migrations/0023_application_session.sql:398`). Part 4 ports those registry callers and
drops the two functions and their bridges. Part 1's migration keeps the two functions and part 4's migration drops them. They are two merges, never one step (umbrella, migration plan risks).

## 5. The executor, run state and owner ports

**One run state machine.** Use the generated states `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED` and
`INTERRUPTED`; phases are `PREPARING`, `AGENT`, `WAITING`, `SOURCE_ADMISSION`, `COMPILING` and
`FINALIZING` while a run is running and not cancelled. The generated vocabulary and CHECK already
encode these values (`apps/hub/migrations/0056_builder_question_waits_in_the_run.sql:14`,
`apps/web/src/features/builder/api.ts:2`). Keep spec 0011's rule that a waiting question belongs to
the same run, and the next message either ends the wait or starts a new run. The run summary's
`cancellationRequested` is derived from `cancellation_requested_at`, never a second state
(`builder-bodies.sql:478`; spec 0011 is built and its file is in Git history).
Before dropping the trigger, drive each state and cancellation transition against today's trigger
and record the literal phase it leaves. Then drive the TypeScript transition and CHECK against those
same rows. A final, cancelled or interrupted row has `phase: null`; a running uncancelled row may
hold only a named phase (`builder-bodies.sql:117`,
`apps/hub/migrations/0056_builder_question_waits_in_the_run.sql:14`).

**Claim, work and settlement.** The executor opens `system('builder-executor')`, calls
`admitSystem`, reads a queued row to learn its stored account and Project, and commits. It then opens
`transaction(run.accountId)`, calls `admitProject(gate, projectId, 'project.build')`, and rechecks the
queued state under `FOR UPDATE`. The conditional update requires `state = 'QUEUED'` and sets owner,
heartbeat, start time and `PREPARING` in that transaction. The owner id is the Hub process UUID, as
today (`apps/hub/src/builder/service.ts:124`, `builder-bodies.sql:98`). Later executor row transitions
use `admitRun` in `system('builder-executor')`. Source advance, settlement and executor bookkeeping use
this entry, so they can finish after the run account loses access. Before the candidate, work that
reads or writes Project source, conversation state, registry inputs or connector bindings uses
`transaction(run.accountId)` and a Project proof (`admitProject`, or `admitRun` for a write on the run
row, section 3). If the account loses Project access, its next pre candidate work admission is
`PROJECT_BUILD_DENIED` (403). Retention and every write after the candidate run under `admitRun` in
the system entry and are not refused for it. The executor can still settle its owned run in system
scope.

For a refused claim, `failUnclaimed(proof: Admitted<SystemScope<'builder-executor'>>, builderRunId, code)` uses
`system('builder-executor')` to fail only a still queued, unowned row. It stores
`BUILDER_RUN_NOT_ADMITTED`, the literal code today's claim wrapper sends to `endingOf` and
`writeEnding`. If its conditional update changes zero rows, a claim or cancellation won; it does
nothing (`apps/hub/src/builder/store.ts:154`, `apps/hub/src/builder/run/run.ts:334`,
`apps/hub/src/builder/run/run.ts:370`). No owned run proof is required for this one transition.

The model call reads that stored run account from `RUN_ACCOUNT_ID_KEY` in the bound request context,
and the run id from `RUN_ID_KEY`. Part 5 uses both for its held credential read (see the held
credentials paragraph below).

**The lease.** One `system('builder-executor')` transaction, after `admitSystem`, takes the one clock
value. First it updates heartbeat for the owner's listed live ids that are queued or running. Next it
selects other queued or running rows whose heartbeat, or creation time when null, is older than the
threshold, `FOR UPDATE SKIP LOCKED`, excluding every listed id. It changes owner and heartbeat, and
returns `builderRunId`, `projectId`, `conversationId`, `candidateRevision`, `resultSourceRevision`,
`previousOwnerId`, ordered by creation time and run id. This is the latest lease body
(`builder-bodies.sql:422`). The takeover is a `with ... update` whose `UPDATE` has its own top level
`WHERE`, so the write lint accepts it. The service compares the previous owner with its own id,
settles a candidate against Git `main`, and retries a failed settlement on a later pass
(`apps/hub/src/builder/service.ts:88`, `apps/hub/src/builder/service.ts:101`,
`apps/hub/src/builder/run/admit.ts:125`). A run the account can no longer use is settled through
system scope. Do not replace a row's current state with the first queued reply.

**Row key.** Keep `builder_run_project_idempotency` and the one active run index. Hash the header key
and canonical `{ content }` separately as today. The row key is scoped to Project. Under the working
state lock, read the replay run without locking it, filtered by the proof's Project. Compare account,
request digest, request text and trimmed conversation id. The working state lock serializes creation
and idempotency. A different input is `IDEMPOTENCY_CONFLICT` (409); an equal input returns the current
summary, even when the run has ended (`apps/hub/migrations/0001_baseline.sql:2265`,
`apps/hub/src/builder/store.ts:115`, `builder-bodies.sql:130`). A replay must pass current Project
admission before it reads the row. No operation receipt is made for BLD-24.

**Project ports.** Repository registration runs after Project insert, on the Project creation
transaction, and makes exactly one working state marker and one repository marker. The Project
purge calls `builder.purge` with the `Admitted<SystemScope<'project-purge'>>` it holds, on `proof.tx`, deleting runs,
working state and repository in today's order. The type is the job check: a proof of another job fails `tsc`, and `admitSystem` keeps the one runtime check. This replaces the
`conexus.job` guard of `builder.purge_project`, which dies with that function; the repository test
that `purge_project` appears only in `project/deletion.ts` stays for the other owners' functions. A
missing Project row after an earlier purge is a successful retry; a missing tombstone is still
`PROJECT_DELETION_NOT_STARTED` in the Project owner. Its receipt deletion and tombstone completion
remain Project work (`builder-bodies.sql:227`, `apps/hub/migrations/0030_project_deletion.sql:267`,
`apps/hub/src/project/deletion.ts:87`). `hub.ts` supplies both Builder ports to Project, as it
already supplies repository preparation and sandbox deletion (`apps/hub/src/hub.ts:93`,
`apps/hub/src/hub.ts:100`). The `builder.conversation_session` and `builder.builder_run_model_account`
rows go with the repository and run deletes by their foreign key cascades.

**Registry and the served pointer.** At the part 1 merge head, TypeScript settlement calls
`reg.matches_application_artifact` as SQL through the `EXECUTE` grant this part's migration adds to `hub_command` (part 0 does not). Part 4 drops the matcher: retention and settlement are one transaction. This
part builds no port for the served pointer (HQ decision). Part 4 reads the three last Preview columns
directly from `builder.project_working_state` on the command role, `WHERE project_id =
proof.scope.projectId` after `checkApplication` (built in part 0b), so a grantee never reads working
state through a policy and no Builder function or port stands between. Part 4 drops
`builder.served_preview_revision` with `admit_verified_application_source` and the two remaining
bridges after its caller graph has no edge. The Project purge's registry port stays on its one
transaction (`builder-bodies.sql:542`, `builder-bodies.sql:494`,
`apps/hub/migrations/0030_project_deletion.sql:276`, `../part4/0015-part-registry.md:102`).

**Held credentials.** Part 5 builds `readHeldCredential` and `persistHeldCredential` in
`builder/model-account/accounts.ts` (`0015-part-model.md`, section 3); part 1 as merged built neither. The
model store takes only proofs.

- `readHeldCredential(builderRunId, accountId, modelAccountId)` opens `transaction(accountId)`, calls
  `admitRun(gate, builderRunId, owner)` with its own process owner id, and gives the proof to the
  store's `readById`. The store reads the model row joined to `builder.builder_run_model_account` by
  `proof.scope.builderRunId`, so a run reads only a credential its own run recorded. It reads under
  the command role, so a withdrawn sharing does not hide the row. A refusal of `admitRun`
  (`BUILDER_RUN_NOT_ADMITTED` or `PROJECT_BUILD_DENIED`) is a null result, which the hold turns into
  `BUILDER_MODEL_NOT_SELECTED`.
- `persistHeldCredential(modelAccountId, sealedSecret)` opens `system('builder-executor')`, calls
  `admitSystem`, and gives the system proof to part 5's `rewrite`. It writes only the sealed secret
  and its time, even after the run ended. Zero changed rows remain `false` and the hold raises
  `BUILDER_MODEL_NOT_SELECTED`, as the part 5 HQ decision requires.

The current model call records the account that paid on the run, and part 5 reads that relation for
its held lookup (`apps/hub/src/builder/module.ts:162`, `builder-bodies.sql:355`,
`../part5/hq-decisions-rev3.md:5`). `hub_command` holds `SELECT` on the relation for that join.

## 6. Value sourcing

| Value | Source |
| --- | --- |
| Acting account | The parsed Hub session account, then `read` or `transaction`, and for a command the gate (`apps/hub/src/builder/routes.ts:82`). |
| Project and workspace of a command | The proof's scope. An argument id is a second condition beside it. |
| Run account and Project in the executor | The stored, parsed run row, read in the claim's first step, or the run row `admitRun` locked. The browser never supplies them to the executor (`apps/hub/src/builder/service.ts:139`, `builder-bodies.sql:98`). |
| Run id and owner id | `BuilderRunId.parse(randomUUID())` once per new run; the service's process owner UUID once per Hub start (`apps/hub/src/builder/store.ts:108`, `apps/hub/src/builder/service.ts:124`). |
| Base source revision | Git `main`, read while the Project and working row locks are held, not a browser value (`apps/hub/src/builder/service.ts:174`). |
| Row key and request digest | SHA 256 of the idempotency header and canonical `{ content }`, as today's store does (`apps/hub/src/builder/store.ts:115`). |
| Current replay body | The nonlocking Builder run read under the working state lock, through the summary presenter (`builder-bodies.sql:143`, `builder-bodies.sql:147`, `builder-bodies.sql:478`). |
| Run timestamps and lease age | Database `clock_timestamp()`; the lease uses one captured time for its pass (`builder-bodies.sql:98`, `builder-bodies.sql:422`). |
| Last good Preview | The three columns of `project_working_state`; a failed build leaves them as they were (`builder-bodies.sql:542`). |
| Served application tuple | Part 4's direct read of the three columns, filtered by `proof.scope.projectId` and matching the stored pointer, never a guessed latest revision (`apps/hub/migrations/0023_application_session.sql:340`). |
| Mastra foreign values | The pinned SDK response or stream event, parsed at each Conexus read (`apps/web/src/features/builder/mastra-session.ts:203`, `apps/web/src/features/builder/transcript.ts:323`). |

## 7. Tests (each with literal expected values)

1. Seed two Projects and two accounts. A member sees its Project's two runs in descending creation
   order; the list returns only that account's runs. The latest read may return another author's run.
   An outsider and an unset account read zero rows from the three reader tables through `read()`, and
   `hub_reader` gets 42501 on `project_repository` and `builder_run_model_account`. A
   grantee with only an application grant and a nonmember installation administrator also read zero
   Builder rows. Removing the list's `WHERE` still returns no other Project's rows. The
   member Preview subject returns the stored three columns, such as
   `lastPreviewSourceRevision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'`, while an outsider gets
   `null` (`builder-bodies.sql:190`, `builder-bodies.sql:239`, `builder-bodies.sql:303`). The
   generated cross tenant read test of the admission child, section 10, runs over the three reader tables
   with seeded rows in two workspaces, a positive control and its administrator variant, which sees
   none of them.
2. Start BLD-24 with key `k` and content `hello`. Expect 201 and `state: 'QUEUED'`. Repeat with the
   same key after it has succeeded. Expect 201 and `state: 'SUCCEEDED'` with the same `builderRunId`.
   Change content to `goodbye` with key `k`. Expect 409 `IDEMPOTENCY_CONFLICT`. Use the same key in a
   second Project. Expect a different id. Remove membership before replay. Expect 403
   `PROJECT_BUILD_DENIED` and no run summary. For an outsider and removed member, BLD-24 returns
   403 before `conversations.ownerOf` or `waiting.message`. The waiting inbox stays empty. An
   inactive account gets 403 `ACCOUNT_INACTIVE`. A missing working state or repository marker under
   a held Project proof gets 403 `PROJECT_BUILD_DENIED` (`builder-bodies.sql:130`,
   `apps/hub/src/builder/service.ts:160`, `apps/hub/src/builder/service.ts:173`).
3. Deletion races. First run today's `lock_project_for_run` against a project deletion as a control:
   it takes no Project row lock (part 3 finding 4), so the test proves the move onto `admitProject`
   changes the order. Then hold `readBase` during run start and race a Project deletion in both
   orders. When the run starts first, deletion answers 409 `PROJECT_BUSY`. When deletion gets the
   Project lock first, run start answers 403 `PROJECT_BUILD_DENIED` or the existing missing Project
   refusal after purge. Hold run start at the Project lock while the tombstone commits. The fresh
   read then answers 403 `PROJECT_BUILD_DENIED`. The same for `admitRun`: an executor step that waited
   on a Project whose tombstone committed meanwhile answers `BUILDER_RUN_NOT_ADMITTED`; a tombstone
   that waits on an admitted run is written after it commits; a purge that waits on an admitted run
   proceeds after it, and the `admitRun` that waits on the purge is refused. Neither order yields
   40P01. Race claim, cancellation, retention, lease takeover and purge in both orders; each reaches
   one terminal row or a named refusal, with no 40P01. Include replay against source advance and
   settlement, with the replay run read left nonlocking. Run these interleavings while the connector
   and IAM functions are still SQL (`apps/hub/src/builder/store.ts:119`,
   `apps/hub/migrations/0030_project_deletion.sql:270`).
4. Cancel a queued run. Expect `state: 'INTERRUPTED'`, `phase: null`,
   `cancellationRequested: true`, `cancellation_reason: 'USER_CANCELLED'`. Cancel a running run.
   Expect `state: 'RUNNING'`, `phase: null`, `cancellationRequested: true` until its executor ends it.
   Cancel twice. Expect the first timestamp and reason unchanged. A wrong author's run is 404
   `BUILDER_RUN_NOT_FOUND`. A hidden Project returns 403 `PROJECT_BUILD_DENIED`. An outsider,
   removed member or inactive account gets 403 `PROJECT_BUILD_DENIED` or `ACCOUNT_INACTIVE` before
   the run lookup (`builder-bodies.sql:453`, `builder-bodies.sql:478`).
5. Compare every transition to today's trigger before dropping it. `RUNNING` with phase `AGENT`
   remains `AGENT`; `FAILED`, `SUCCEEDED`, `INTERRUPTED` and a cancelled `RUNNING` row have null
   phase. The CHECK rejects a final row with phase `AGENT`. A response only run has
   `resultKind: 'RESPONSE_ONLY'` and `resultSourceRevision: null`. A build failure has
   `resultKind: 'SOURCE_CHANGED_BUILD_FAILED'` and preserves the previous Preview pointer
   (`builder-bodies.sql:117`, `builder-bodies.sql:524`, `builder-bodies.sql:542`).
6. Seed two stale rows and one listed live id. The lease returns the stale ids in creation order,
   with `previousOwnerId` from before takeover, and never returns the listed id. Two lease passes
   with a locked row use `SKIP LOCKED` and do not duplicate a takeover. A candidate on Git `main`
   settles to the existing build failure code `BUILDER_PREVIEW_NOT_BUILT`; an absent candidate ends
   `FAILED` with `BUILDER_SOURCE_ADMISSION_FAILED` (`builder-bodies.sql:422`,
   `apps/hub/src/builder/run/admit.ts:129`).
7. After an account loses Project access, its next account scoped work answers 403
   `PROJECT_BUILD_DENIED`. After `main` moved, the executor still settles the last good Preview in
   system scope. A later claim of a queued run by the removed account fails immediately as
   `BUILDER_RUN_NOT_ADMITTED`, before any lease pass. It never becomes `RUNNING`. If cancellation
   won first, `failUnclaimed` changes zero rows. A held model credential can still be persisted by
   part 5's system port after the run ends. When its row was deleted, that port returns `false` and
   the hold raises `BUILDER_MODEL_NOT_SELECTED` (`../part5/hq-decisions-rev3.md:5`,
   `apps/hub/src/builder/store.ts:154`). A tombstoned Project whose run author loses administrator
   tenure before claim never reaches `RUNNING`. `admitProject` on a `system` gate throws
   `INTERNAL_UNEXPECTED` with invariant `GATE_ACTOR_REFUSED`. `admitRun` on an account gate whose
   account is not the run's account is refused; on a run owned by another instance, a run that
   ended, or a missing run, it answers `BUILDER_RUN_NOT_ADMITTED`.
8. Run the source tree, file and compare routes on exact immutable revisions. For a missing revision
   expect 404 `SOURCE_REVISION_NOT_FOUND`; for a missing file expect 404
   `SOURCE_FILE_NOT_FOUND`. Feed the Mastra parser one valid `state_changed` run and one malformed
   known `data-*` event. Expect the valid parsed fields and `HUB_RESPONSE_UNREADABLE` for the
   malformed known event. Unknown event kinds remain ignored. Call source advance twice with the
   same candidate and expect true both times; with the working row missing, expect false. A
   conversation session upsert on a conversation of another Project answers
   `BUILDER_CONVERSATION_SESSION_REFUSED` and changes no row. A nonrunning payer write answers
   `BUILDER_RUN_MODEL_ACCOUNT_RECORD_REFUSED` (`apps/hub/src/builder/source.ts:43`,
   `apps/hub/src/builder/source.ts:57`, `apps/web/src/features/builder/mastra-session.ts:203`).
9. The wall, on one pooled client. After a commit, a rollback and a throw, `hub_runtime` with no role
   set gets 42501 on each of the five tables. `hub_reader` gets 42501 on `FOR SHARE`, `FOR UPDATE`,
   `INSERT`, `UPDATE` and `DELETE` on each. As `hub_command`, an `UPDATE` of `project_id` or
   `account_id` of `builder_run`, of `project_id` of `conversation_session`, and of `project_id`
   of `project_working_state` each get 42501; `FOR UPDATE` and `FOR SHARE` on a run and on a working
   row run; a direct `DELETE` on `conversation_session` gets 42501 while the repository delete cascades
   it. A `builder_run` insert for an account that does not exist fails 23503. A command that runs the
   five Builder tables' statements through the write lint fixtures (the lease takeover, the two
   `ON CONFLICT DO UPDATE` upserts) passes it. The per operation cross tenant test runs the BLD
   operations: as a member of workspace A with workspace B's Project id, run id and conversation id,
   each answers its refusal (`PROJECT_BUILD_DENIED`, `BUILDER_RUN_NOT_FOUND` or `PROJECT_NOT_FOUND`),
   and a digest of B's rows is unchanged. A grantee's `read()` from working state returns zero rows. Part 4 tests the served pointer after
   `checkApplication`.
10. Run the route walk for all eight declared BLD operations as a member and outsider. BLD-30 as an
    outsider, a removed member and on a tombstoned Project answers 403 `PROJECT_BUILD_DENIED` with
    no Preview session row created; it is in the per operation cross tenant test of test 9. Check
    BLD-30's current 201 body, BLD-24's 201 and 200 union, missing and malformed ids, missing
    idempotency header, trace with null totals, and exact source projection. For BLD-23 and BLD-26,
    a null Preview subject from a hidden Project or missing working row returns
    `PROJECT_BUILD_DENIED`. BLD-26 returns 404 `BUILDER_RUN_NOT_FOUND` for an older run id. Run
    `contract:check`, `wire:bijection`, `db:catalog:check` (the five register rows) and the caller
    graph at the part 1 head. The migration drops 29 exact signatures without `CASCADE` and keeps the
    two registry callers' Builder functions. The full suite and local Conexus path close the part.

- Part 5 proves `readHeldCredential`: with the run owned by this instance, it returns the literal sealed secret.
  After a lease takeover by another owner it returns `null`; with an `accountId` that is not the run's,
  `null`; for a run that recorded no model account, `null`; for a model account id the run did not
  record, `null`.
- Revoke the run account's membership after message binding and before candidate recording: the
  candidate write answers `PROJECT_BUILD_DENIED`, no candidate is recorded and `main` is unchanged
  (literal revision before and after).

## 8. Deletes

Drop 29 exact Builder function signatures and the phase trigger object after the parity test, first in
the migration (subtract before add). Remove their `EXECUTE` grants, including the one of
`builder.register_project_repository` that part 0b gave `hub_command`. Keep
`builder.admit_verified_application_source` and `builder.served_preview_revision`, their grants, and
the two bridges they need until part 4 ports the registry callers. Replace the seven old BLD YAML paths
and add BLD-30. Remove `scripts/generate-builder-contracts.mjs` with its generated files; remove the
hand written route and web BLD types, the eight `builder/api.ts` response casts, `JsonRow<T>` and the
Builder SQL message matching (`apps/hub/src/builder/routes.ts:21`,
`apps/web/src/features/builder/api.ts:76`, `apps/hub/src/builder/store.ts:95`). Part 0 already moved
both Builder pools to `hub_runtime`, so part 1 has no Builder pool to delete. Keep the `hub_factory`
pool for Mastra (`apps/hub/src/builder/module.ts:142`). Replace the Project SQL calls to
`builder.register_project_repository` and `builder.purge_project` with ports. TypeScript settlement
still calls `reg.matches_application_artifact` as SQL at the part 1 head. Part 4 replaces that call
and the registry served pointer and retention calls (`apps/hub/migrations/0032_conexus_git.sql:94`,
`apps/hub/migrations/0030_project_deletion.sql:277`,
`apps/hub/migrations/0023_application_session.sql:365`, `builder-bodies.sql:542`).

Two more items from the sibling parts. `application-build.ts:91-96` keeps a second `PrepareResult`
union; import the shape owned by `app-runner/requests.ts` through an allowed path, or move the shape
(part 7 review N4). The unsafe assertion suppressions that part 7 maps to this part go with the part:
`builder/runtime.ts` (3) and `trace-summary.ts` (2) (`part7/0015-part-json-input.md`, section 4.1),
which lowers rule 3 by 5.

Census: Builder unparsed rows, 21 to zero; eight BLD operations declared; Builder web API casts,
8 to zero; Builder functions, 31 to 2 at part 1 and 0 at part 4; rule 9 falls by the privileges
`hub_runtime` held on the three newly split tables. The phase trigger object goes in part 1. The five
Builder pending register rows become split rows. Five registry to Builder caller edges remain until
part 4. The stale grants for the 29 removed functions leave with them. The full database owner roles
remain until part 6, as the data child requires.

## 9. Notes from sibling parts

- Part 3: `builder_run` and `project_working_state` already have `reader` policies (part 0b, through
  `project.project`), `command` policies and `SELECT` grants for both roles. Part 1 adds the verbs of
  section 4. The purge already leads with the Project `FOR UPDATE` (part 0b), and part 1 proves it
  with the test of section 7, item 3.
- Part 4: refusal after a run loses Project access is `PROJECT_BUILD_DENIED` (403). Part 4's retention
  locks `builder_run` `FOR UPDATE` through `lockedRun` after `admitRun`; the `UPDATE` column grant of section 4 provides
  that row lock, and no policy is needed. Its retention takes the Project from `RunScope.projectId`
  (section 3). Part 4 builds after part 1, reads the served pointer directly and drops the two kept
  functions in its own migration.
- Part 5: this part owns `builder.builder_run_model_account` (its grants and its
  composite key as today, and no reader policy). The model store reads it only inside the join of `readById` after
  `admitRun`, through the port `readHeldCredential`, which part 5 builds after part 1.

## 10. Decided by HQ

- The reader rows on `builder.project_repository` and `builder.builder_run_model_account` are dropped.
  Rule 6 of the admission child gives a reader policy only to a table a person lists, and no person
  lists these two (run start and the held credential read on the command role). They get no reader
  policy and no reader grant, so `hub_reader` gets 42501 and nothing is dead. The umbrella keeps three
  `SELECT` rows for this part.
- Pre candidate account steps (phase, candidate, payer record) keep `admitRun` on the account gate,
  so they also check the owner and the open state. Today's SQL checks neither owner nor Project access
  for these three. This is stricter on purpose and the umbrella says so (admission child, section 2).
  A stale owner after a lease takeover cannot record a candidate.
- `'project.build'` in `ACTION_REFUSALS` changes from `PROJECT_NOT_FOUND` to `PROJECT_BUILD_DENIED`
  (section 2). Part 4 already depends on this code.
- The admission child, section 6, says the executor claims a run it owns in `system('builder-executor')`
  with `admitRun`. A queued run has `owner_id IS NULL`, so `admitRun`'s owner check cannot admit it,
  and today's claim runs `iam.admit_project` for the author, which a system admission would skip. This
  draft claims in two steps instead: a system read of the queued row, then `transaction(run.accountId)`
  with `admitProject` and the conditional update (section 3). HQ keeps the two step claim and has
  corrected the umbrella's section 6 to say so: `admitRun` covers the claimed run only.
- The same owner check applies to `readHeldCredential` (section 5, built by part 5): a model call on an instance that
  just lost the lease cannot read its credential, because `admitRun` refuses a run it no longer owns.
  HQ accepts it: the new owner's own calls read it, and the old instance's call fails with
  `BUILDER_MODEL_NOT_SELECTED`.
- The builder runs the `ADD FOREIGN KEY` on `builder.builder_run.account_id` against a copy of the
  local data before the pull request (section 4).
- The umbrella counts (rows, tables, operations) are HQ's to fix. This child does not restate them.
- Review of 5.3 (HQ, 2026-10-05). BLD-30 gets its own admission row: `admitProject` with
  `project.build`, committed before the launch, so the route no longer depends on a SQL message.
  `admitRun` gets step 0, an unlocked pre read and a recheck under the lock. The run to session
  conversation compare is text. The purge guard moves from SQL to the TypeScript job check, which is
  weaker than a database guard: the `DELETE` grant on `builder_run` is table wide and only the port
  and the write lint (a `WHERE` is required) stand in front of it. HQ accepts this under the
  umbrella's threat model (our own code, by accident). Part 4 builds after this part merges.
- Reviews B and C (HQ, 2026-10-05). Part 1 keeps `admit_verified_application_source` and `served_preview_revision`, and part 4 drops them, so "one step" is gone from this part and the umbrella. `RunScope` records `via`. The purge port and `failUnclaimed` take `SystemScope<J>` proofs, and the runtime job check is gone from the ports. The part builder checks, while porting the Builder stream, whether `MastraError` serializes `cause`, and adds a test if it leaks. The reviews' other items are in the umbrella's decided list.

## 11. The split of `builder/store.ts`

Today's `apps/hub/src/builder/store.ts` holds 275 lines of SQL function calls. Its port would pass the
500 line file cap, so it splits by subject in the first commit of the build, and each file stays under
the cap. `BuilderStore` stays the one object `service.ts` and `run/run.ts` read, composed from these:

| File | Subject |
| --- | --- |
| `builder/run-row.ts` | the parsed run row, the pure `runSummary` presenter, the shared summary and vocabulary types |
| `builder/run-start.ts` | run start (BLD-24 new run), cancellation (BLD-25) and `bindBuilderRunMessage`: the commands a person's account runs |
| `builder/run-steps.ts` | the executor's transitions of an owned run (claim, `failUnclaimed`, phase, candidate, payer, settle, advance, `settleBuilderRunBuild`, fail, interrupt, sandbox bind) |
| `builder/run-reads.ts` | the parsed reads (latest run, list, latest code changing run, Preview subject, source admission, open run conversations) |
| `builder/run-lease.ts` | the heartbeat and the takeover |
| `builder/conversation-store.ts` | the conversation session and sandbox rows, and the Project's sandbox list |
| `builder/project-ports.ts` | `register` and `purge`, the two Builder ports on the Project transactions |
| `builder/store.ts` | the composition and the exported types |
