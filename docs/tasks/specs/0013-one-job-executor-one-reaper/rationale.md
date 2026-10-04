# 0013. Rationale

## Context

The Hub runs its periodic work in five places with three behaviours. Three jobs (the paused machine
sweep, the run lease, the span prune) are hand copies of one shape: an `inFlight` set, an
`AbortController`, a `setInterval` and a `close()` that waits (`builder/idle-machine-sweep.ts:55-77`,
`builder/run-lease.ts:24-56`, `builder/storage.ts:33-60`). Two more (`builder/conversation.ts:98`,
`builder/google-ai-pro/pool.ts:250`) call `void sweep()` from a bare timer; a rejection there reaches
`unhandledRejection` and the fatal handler exits the Hub. The close order is assembled by hand in
`builder/module.ts:326-349`. Principle 8 of `codebase-principles.md` ("one runner for periodic jobs
and one reaper for what expires") is enforced only by review.

Rows that expire are only filtered on read. Nobody deletes an expired `iam.oidc_transaction`, an
`iam.bootstrap_context`, an ended or expired `iam.host_session`,
or an invitation past its deadline. An expired Hub session stays open with its sealed Keycloak refresh
token until someone uses it again. Previews and handoffs are deleted
only as a side effect of the next write (`0026:269`, `0026:294-299`), a second way to expire. The
members and application access screens list an expired invitation as "Pendente", although it can no
longer be claimed.

Forces. One Hub per database is guaranteed: the advisory lock is taken in `hub.ts:41` before anything
periodic starts, a second Hub ends with `HUB_ALREADY_RUNNING`, and a Hub that loses the lock exits
(spec 0011). No Hub login role has `DELETE` on a table; every write goes through a `SECURITY DEFINER`
function owned by the schema owner. The Hub never writes Mastra tables. The run lease must never take
over a run the Hub still works; today that rests on timing (beat, then takeover in the same tick).
Spec 0011 owns the run's own deadlines; history (runs, conversations, Git refs, artifact revisions)
stays while the Project exists, by the operator's decision.

The survey of today's code is in the study notebook (census of every timer, sweep and expiry column
by mechanism, rerunnable as a script) and the grounding trace; their conclusions are the facts above.

## Options considered

### Option 1: an in process executor, jobs declared by their owner, one reaper function (chosen)

`platform/jobs.ts` runs `Job` values; each module declares its jobs; `hub.ts` starts them after the
lock and closes them first. The lease becomes one SQL call that excludes the live ids. The reaper is
one `iam.reap_expired` with each deadline in its statement.

**Pros**:
- The smallest public surface: one type, one function, one method.
- The lease invariant becomes a WHERE clause, proven on real PostgreSQL.
- No dependency, no new schema or role; Hub TypeScript shrinks.

**Cons**:
- A deadline change is a migration replacing the reaper function.
- The coverage check reads relations, not deadline values; deadlines are held by behaviour tests.
- A backlog larger than the batch drains over several passes, so timings are eventual.

### Option 2: deadlines as data (a rules table or immutable views) read by the reaper and by CI

Each schema declares its rules as rows (target, deadline, or a reason it does not expire); the reaper
functions and the CI check read the same rows.

**Pros**:
- CI reads deadline values from the same owner the reaper reads.
- A later settings registry (spec 0008) could edit a deadline without a migration.

**Cons**:
- Every rule is still a hand written statement (end then delete for sessions, a joint delete for the
  bootstrap context and its receipt), so a rule lives in two places joined by a string key.
- Nobody needs to change these deadlines at runtime.
- The design that carried it grew the code by 540 to 900 lines with an AST checker and a base revision
  comparison.

### Option 3: a durable job library (pg-boss) or Mastra's workflow `Scheduler`

**Pros**:
- Retry, history and once only execution across instances come with the library.
- Both were proven to run here (pg-boss under a role that owns its schema; the `Scheduler` with a
  one step workflow on `@mastra/core` 1.71).

**Cons**:
- Once only execution across instances solves a problem the instance lock already removed.
- pg-boss needs a new role, a schema outside the migrations and DDL at runtime (42 objects, daily
  partitions). The `Scheduler` needs the evented engine and workers, and every target is still a
  `SECURITY DEFINER` function.

### Option 4: fix in place

Add a `catch` to the two loose timers, keep the three copies, add a reaper as one more copied
scheduler.

**Pros**:
- The smallest diff.

**Cons**:
- A fourth copy of the shape principle 8 forbids; the lease keeps its timing proof; nothing in CI
  stops a sixth timer.

## Rationale

Option 1 follows from the forces. The instance lock makes the hard part of every job library
irrelevant, so the remaining need is small: run a pass, never overlap it, log its failure, stop
cleanly. Arming the next pass with `setTimeout` after the previous one settles (the Documenso and
Trigger.dev pattern) gives no overlap without bookkeeping, which deletes the `inFlight` sets, the
`sweeping` flag and the beat counter. Declaring jobs with their owner keeps `platform/` free of
module knowledge (no `JobName` union that lists every module's jobs).

The lease is the one place timing mattered. Moving "never take a live run" into the takeover's WHERE
clause turns a timing argument into a structural one, and a control test showed the old takeover alone
does take a live run. The reaper is one function because every expiry column is in `iam`; a rules
table would not remove a single hand written statement, so the deadline sits in the statement it
governs and the behaviour tests hold its value.

Three design candidates were written independently and judged against six criteria; Option 1's
candidate scored highest and was used as the base.
From the others: the lease reads the clock once and the service rechecks its live runs before
settling a taken row; the invitation state and the 30 day invitation deadline come from the
operator's decisions. An independent review of the draft corrected the live ids (the `runs` map is
keyed by conversation, so the ids are each run's `builderRunId`), required the call on an empty live
set, and made the reaper's batch bounds explicit in the criteria. Rejected: deadline views and tables, an AST timer checker,
moving the heap watch into an executor inside the application runner, reaping project and workspace
receipts (deleting a completed receipt turns a late retry into a duplicate Project or workspace).

Deadlines follow the references studied: GoTrue keeps flow state 24 h and ended sessions 72 h past
expiry; Better Auth and Documenso delete one time grants on use, and nobody skips the sweep for rows
nobody reads again. The 30 days for invitations is a product choice.

## Evidence from the spikes

PostgreSQL 17.10, all 56 Hub migrations replayed by the suites' own harness, then the spike migration.

| Spike | Fact | Result |
| --- | --- | --- |
| 1 | `renew_run_lease` never takes a listed run (heartbeat an hour old), takes a foreign stale run and an unlisted stale run of this owner; the old takeover alone takes a live run | verified |
| 1b | a claim in flight is skipped by `SKIP LOCKED`; an idempotent replay of an old QUEUED row that becomes live after the ids are read can be taken; with a recheck of the live map before settling, the claim still succeeds | verified; the recheck is in the design |
| 2 | the bootstrap context and its `IAM-03` receipt go together 24 h past expiry through two data modifying CTEs under plpgsql `SELECT INTO`; a second call removes nothing | verified |
| 3 | `iam.purge_project` fails today with `23503` when an OIDC row names the application; one added `DELETE` fixes it | verified |
| 4 | removing the lazy deletes breaks only `application-access.postgres.test.mjs:642`, which becomes a reaper test; no uniqueness, count or read depends on them | verified |
| 5 | `state` in both lists; "Convidar de novo" is `IAM-05` and `IAM-12` with the same entry id; the workspace upsert does not reset the invited date, the application one does | verified |
| 6 | Biome 2.5.11 reports an unused suppression and `--error-on-warnings` fails | verified |

## Not verified

- The TypeScript executor and `service.renewLease` were not built; the lease was proven on the SQL
  function called as `hub_builder_executor`. The order in `start` was read, not run: `startRun` issues
  the claim and `runs.set` follows synchronously, before the claim's result is handled
  (`service.ts:132-136`, `run/run.ts:318`).
- SQL delayed past the stale window after a claim (an independent review found the case) was reasoned,
  not reproduced; the recheck before settling covers it.
- Whether the heap watch could run through the executor from each process's entry point; it stays
  outside because the preload is shared with the application runner.
- The digest pins, `db:catalog:snapshot` and the browser tests were not run.
