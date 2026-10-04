# 0013. One job executor for the Hub and one reaper for what expires

**Date**: 2026-10-04
**Status**: Approved (approved by the operator on 2026-10-04)
**Lane**: `lane:shaped`
**Depends on**: spec 0011 (merged in #501) for the run lease and the run deadlines; spec 0009
(merged in #499) for the failure table. Base `125d7a6c`.
**Followed by**: spec 0014 (S3), which numbers its migrations after 0059. S3 owns the session
lifetimes and the functions that open, resolve and end sessions; it starts from the bodies of
`iam.open_preview` and `iam.mint_application_handoff` that 0058 leaves, keeps the signature of
`iam.end_host_session(bytea, text)`, keeps the two pairing clauses of the `host_session` checks
(`(ended_at IS NULL) = (provider_refresh_token IS NOT NULL)` and `(ended_at IS NULL) = (ended_reason IS NULL)`),
and does not touch `iam.reap_expired` or `iam.purge_project`. This spec owns the retention after
expiry (24 h, 72 h, 30 days) and keeps each as a literal in its `reap_expired` statement; the reaper
reads the deadline from the row (`expires_at`, `absolute_expires_at`, `idle_expires_at`), never from
a session lifetime constant.

References to "spike N" name facts measured before the build against PostgreSQL 17.10 with every
Hub migration applied, on throwaway tests that are not in this repository. Each part proves its fact
again in its own tests.

## Summary

Today the Hub runs its periodic work through three hand copies of the same timer code and two loose
timers that can crash the Hub, and several kinds of database rows that expire are never removed (an
expired session can keep its sealed sign in token forever). After this spec, every periodic job is
declared beside its own logic and run by one small executor (the one piece of code that repeats a
job on a timer). One database function (the reaper) removes what expired, each rule with its own
deadline. History stays while the Project exists. CI fails when someone adds a second timer or an
expiry column with no rule.

## Requirements

**User stories**:
- As an administrator, I want an invitation nobody accepted in time to show as "Vencido", with a way
  to invite the same person again, so the list never claims an invitation is still pending.
- As the operator, I want expired sign in data, sessions and one time grants removed on their own, so
  a sealed token never outlives its session and the tables stop growing.
- As the next engineer, I want one way to run periodic work, so a job never crashes the Hub and a
  test never waits on a real clock.

**Acceptance criteria**:
- **AC-1**: Every periodic job of the Hub runs through `startJobs` in `apps/hub/src/platform/jobs.ts`:
  idle machines (1 h), run lease (10 s), span prune (24 h), idle conversations (60 s), idle
  cliproxy (60 s, only when Google AI Pro is configured) and the iam reaper (5 min). Each job runs one
  pass at start and the next pass `everyMs` after the previous pass settles; a pass never overlaps
  another pass of the same job.
- **AC-2**: A rejected pass writes one `JOB_FAILED` line (category `SYSTEM`, audience `operator`,
  `details.job` = the job's name) and the next pass runs as usual. No pass rejection reaches
  `unhandledRejection` (today `builder/conversation.ts:98` and `builder/google-ai-pro/pool.ts:250`
  can exit the Hub).
- **AC-3**: `hub.ts` starts the jobs once, after the instance lock and the composition and right
  before the first `listen`. `close()` closes the executor first: it aborts the shared signal, arms
  nothing more and resolves when every pass in flight has settled, before the listeners, MAR and any
  module pool close. A start that fails exits the process through `exitOnFailedStart` (`server.ts`),
  which ends the jobs with it; no other cleanup path is added.
- **AC-4**: The run lease is one job and one SQL call, `builder.renew_run_lease(owner, live_ids,
  stale_after_ms)`, made on every pass, the empty live set included. The live ids are the
  `builderRunId` of each run in the service's `runs` map (keyed by conversation). A run the Hub
  listed is never taken over, whatever its heartbeat age or how late the SQL runs. A stale run of
  another owner, and a stale run of this owner that is not live (a lost settle), are taken over and
  settled exactly as today. Before settling a returned row the service skips any run that is live at
  that moment. The functions `builder.heartbeat_builder_runs` and
  `builder.take_over_stale_builder_runs` are dropped.
- **AC-5**: `iam.reap_expired(p_now, p_limit)` applies the rules of section 5. Each rule handles at
  most `p_limit` root rows per call, selected with `FOR UPDATE SKIP LOCKED` in deadline order, and the
  call returns one row per rule in section 5 order, zero included. Repeated passes drain every
  eligible unlocked row; once drained, a call with the same `p_now` changes nothing.
- **AC-6**: An open Hub or application session past its absolute or idle limit is ended with reason
  `EXPIRED` and its sealed refresh token removed by the first reaper pass that finds it unlocked
  (with no backlog, within 5 minutes plus a pass), through `iam.end_host_session`.
- **AC-7**: `iam.open_preview` and `iam.mint_application_handoff` no longer delete other rows on
  expiry; the reaper is the one way an expired row goes. With no backlog, one reaper pass past a
  Preview's expiry removes its handoffs, its sessions and the Preview.
- **AC-8**: `iam.purge_project` succeeds when an `iam.oidc_transaction` row references the Project's
  application (today it fails with `23503 oidc_transaction_application_project_id_fkey`, spike 3).
- **AC-9**: The workspace roster (`IAM-04`) and the application access list (`IAM-11`) return a
  `state` per invitation, `PENDING` or `EXPIRED`, decided by the database clock. Both screens show the
  invitations under "Convites", each with the word "Pendente" or "Vencido" and "vale até" or "venceu
  em" its date (never color alone, never computed in the browser). An expired invitation offers
  "Convidar de novo", which calls `IAM-05` with the entry's email and role (workspace) or `IAM-12`
  with its email (application access). The screen then shows what the server returned: the
  invitation `PENDING` with a new deadline, or, for application access, the existing "já tem acesso"
  outcome when a grant already covers the email.
- **AC-10**: The reaper deletes an invitation 30 days after it expired. No rule touches history:
  Builder runs, Mastra threads and messages, Git refs, artifact revisions, Project tombstones, sharing
  history, and the project and workspace idempotency receipts stay while their entity exists.
- **AC-11**: CI enforces the rule. Biome `noRestrictedGlobals` forbids `setInterval` in
  `apps/hub/src`; the three timers that stay carry a reasoned `biome-ignore` (section 3); the census
  item `repeatedTimerSuppressions` is 3 and may only fall; an unused suppression fails
  `--error-on-warnings`. A PostgreSQL test fails when a column of a user table, in any schema except
  `factory` (Mastra's storage) and the system schemas, whose name ends in `expires_at` belongs to a
  table that `iam.reap_expired` does not answer for and that is not in the test's `DOES_NOT_EXPIRE`
  list (empty at the start, a reason per entry).
- **AC-12**: No test of periodic work waits on a real clock: the executor is tested with
  `t.mock.timers`, each job by calling its pass, and the real waits in today's lease, idle machine and
  pool tests go.
- **AC-13**: The failure rows `BUILDER_IDLE_MACHINE_SWEEP_FAILED`, `BUILDER_RUN_LEASE_FAILED` and
  `BUILDER_RETENTION_PRUNE_FAILED` are deleted and `JOB_FAILED` is added in
  `contracts/technical/failures.json`; the event `IAM_EXPIRED_REAPED` (info) is added in
  `contracts/technical/log-events.json` and written once per rule that removed or ended at least one
  row.
- **AC-14**: On a local database seeded with fewer than 500 rows per rule, one reaper pass leaves no
  `iam.oidc_transaction` more than 24 h past its expiry and no Hub or application session open past
  its limits; the before and after counts are recorded with the pass's `p_now`.

## Decision

**Chosen option**: one in process executor with jobs declared by their owner, the lease invariant as
a SQL clause, and one reaper function in `iam` whose rules carry their own deadlines.

Periodic work is a `Job` value owned by the module that knows the work; `platform/jobs.ts` only runs
jobs. No dependency is added: one Hub per database already holds through the instance lock, so
machinery for running a job once across several instances buys nothing.

## Rationale

Reasoning, options and the evidence: see [rationale.md](rationale.md).

## Feature design

### 1. The executor

```ts
// apps/hub/src/platform/jobs.ts
export type Job = Readonly<{
  /** The job's name in its failure line. A label: nothing dispatches on it. */
  name: string
  /** The wait from the end of one pass to the start of the next. */
  everyMs: number
  /** One pass. It converges when repeated and stops at its next step once `signal` aborts. */
  run(signal: AbortSignal): Promise<void>
}>
export type Jobs = Readonly<{ close(): Promise<void> }>
export const startJobs = (jobs: readonly Job[]): Jobs
```

That is the whole public surface. Behind it, per job: a pass runs at once; when it settles, one
`setTimeout(everyMs)` (unref) arms the next, so a job never overlaps itself and no `inFlight` set,
`sweeping` flag or beat counter is needed. A rejected pass becomes
`logFailure(logger, new Failure('JOB_FAILED', { cause, details: { job: name } }))` with the platform
logger, as `platform/` code already logs. `close()` is idempotent: it aborts one shared
`AbortController`, clears every armed timer and awaits every pass in flight. No pass starts after it.

Not in the executor, on purpose: a clock parameter, a start delay, jitter, retry, cron, per job
configuration, a `JobName` union. Nothing needs them; Node's `t.mock.timers` drives the one executor
test.

Declarations live with their owner and `hub.ts` concatenates them:

```ts
// builder/module.ts
const jobs: readonly Job[] = [
  { name: 'run-lease', everyMs: RUN_LEASE_EVERY_MS, run: service.renewLease },
  { name: 'span-prune', everyMs: DAY_MS, run: (signal) => pruneSpans(storage, log, signal) },
  { name: 'idle-conversations', everyMs: MINUTE_MS, run: liveConversations.sweep },
  ...(machines ? [{ name: 'idle-machines', everyMs: HOUR_MS, run: async (signal: AbortSignal) => { await sweepIdleMachines(machines, signal) } }] : []),
  ...(config.googleAiPro ? [{ name: 'idle-cliproxy', everyMs: MINUTE_MS, run: async (signal: AbortSignal) => { await (await googleAiProReady)?.pool.sweepIdle(signal) } }] : []),
]

// identity-access/module.ts
jobs: [iamReaperJob(pool)]

// hub.ts
const jobs = startJobs([...identityAccess.jobs, ...(builder?.jobs ?? [])])   // right before the first listen
// close(): await jobs.close() first.
```

Adapters each pass needs:
- `sweepIdleMachines` keeps returning its count; the job awaits and discards it.
- `googleAiProReady` keeps its startup failure path through composition; the pool exports
  `sweepIdle(signal)`, which awaits every stop it started (including the refresh write back) before it
  resolves or rejects, so no stop outlives the executor's drain.
- `liveConversations.sweep(signal)`, `pool.sweepIdle(signal)` and `service.renewLease(signal)` check
  the signal before new work and between awaited items.
- `pruneSpans(storage, log, signal)` is the body of today's `scheduleRetentionPrune` pass
  (`storage.init()`, then `prune({ signal })` and its two events).

`platform/jobs.ts` imports only `platform/failure.ts` and `platform/logger.ts`; `hub.ts` gains one
allowlist line in `scripts/check-import-law.mjs`.

### 2. Which periodic work becomes a job

| Today | Job | Owner | Every |
| --- | --- | --- | --- |
| `builder/idle-machine-sweep.ts:68` | `idle-machines` (only with E2B sandboxes) | builder | 1 h |
| `builder/run-lease.ts:44` | `run-lease` | builder | 10 s |
| `builder/storage.ts:51` | `span-prune` (Mastra `prune()` stays the deleter) | builder | 24 h |
| `builder/conversation.ts:98` | `idle-conversations` | builder | 60 s |
| `builder/google-ai-pro/pool.ts:250` | `idle-cliproxy` | builder | 60 s |
| none (new) | `iam-reaper` | identity-access | 5 min |

Paused E2B machines stay a separate job, not a reaper rule: they are removed through the E2B API with
an API key, after reading open runs between list and kill, with a different failure and their own
7 day limit (`idle-machine-sweep.ts:11`).

### 3. What stays outside the executor

| Timer | Why it stays | Mark |
| --- | --- | --- |
| Heap watch, `telemetry/heap-watch.ts:32` | started by the `--import` preload that the application runner shares (`telemetry/register.ts`), outside the Hub's composition | `biome-ignore` with this reason |
| SSE buffer guard, `builder/mastra-session-routes.ts:119` | one timer per open stream, born and closed with the response | `biome-ignore` |
| `holdOpen`, `builder/sandbox.ts:61` | one timer per run (spec 0011) | `biome-ignore` |

Also outside, with no mark needed: the run and request deadlines of spec 0011 (question wait, turn
silence, settle retry and the rest), the OTel SDK's own export timer, the boot only sweeps
(`connectors.sweepHandlerPorts`, `pool.sweepOrphans`), Mastra's internal timers, and the daily backup
(systemd). `setInterval` in Hub production code goes from 8 to 3.

### 4. The run lease

`builder.renew_run_lease(p_owner_id uuid, p_live_run_ids uuid[], p_stale_after_ms integer) RETURNS
jsonb`, `plpgsql`, `SECURITY DEFINER`, `SET search_path TO 'pg_catalog', 'pg_temp'`, owner
`builder_owner`, `REVOKE ALL ... FROM PUBLIC`, `EXECUTE` to `hub_builder_executor` only. It reads the
clock once (`t := clock_timestamp()`), then in one transaction:

1. sets `heartbeat_at = t` on every run in `p_live_run_ids` owned by `p_owner_id` and still open;
2. takes over every open run with `COALESCE(heartbeat_at, created_at) < t - stale_after` **and**
   `builder_run_id <> ALL(p_live_run_ids)`, `FOR UPDATE SKIP LOCKED`, and returns them in the shape
   `take_over_stale_builder_runs` returns today.

`service.renewLease(signal)` reads `[...runs.values()].map((run) => run.builderRunId)` at the start of
the pass and calls the function every time, with an empty array when no run is live (today's
heartbeat skips its call on an empty map, `service.ts:199-201`; the takeover must not). For each
returned row it first checks whether a run with that `builderRunId` is in `runs` now; if so it skips
it (the row is already owned by this Hub with a fresh heartbeat). Every other row is settled with the
existing `takenOver` classification (`service.ts:88-107`) and `BUILDER_RUN_SWEEP_SETTLE_FAILED`
handling. The store method `renewRunLease` on the executor pool replaces `heartbeatBuilderRuns` and
`takeOverStaleBuilderRuns` (`builder/store.ts:250-255`) and parses the returned rows with Zod into
`TakenOverRun` at the edge, instead of today's typed query generic. The stale window stays `RUN_STALE_AFTER_MS`
(30 s); the takeover now runs every 10 s.

Why this holds (spike 1, control included: the old takeover alone takes a live run): a run listed in
the call is excluded by the clause however late the SQL runs; a QUEUED run in `runs` is held by the
clause alone, since a beat cannot touch an ownerless row. A run that became live after the ids were
read is caught by the recheck before settling. That covers both cases the clause cannot see: an
idempotent replay that returns an old QUEUED row (spike 1b), and SQL delayed past the stale window
after a claim (in `start`, `startRun` issues the claim and `runs.set` follows synchronously, before
the claim's result is handled; `service.ts:132-136`, `run/run.ts:318`). A claim in flight holds the
row lock, so `SKIP LOCKED` passes over it.

### 5. The reaper

`iam.reap_expired(p_now timestamptz, p_limit integer) RETURNS TABLE(relation text, action text,
removed integer)`, `plpgsql`, `SECURITY DEFINER`, `SET search_path TO 'pg_catalog', 'pg_temp'`,
owner `iam_owner`, `REVOKE ALL ... FROM PUBLIC`, `EXECUTE` to `hub_iam_runtime` only. No Hub role
gains `DELETE` on a table. Every live `%expires_at` column is in `iam` (8 columns in 7 tables), so one
function on the pool identity-access already holds covers them.

Rules, in this order. Each deadline is a literal in the one statement that applies it. Each selects
at most `p_limit` root rows, ordered by deadline then primary key, `FOR UPDATE SKIP LOCKED`. `removed`
counts root rows only (not children, not receipts). Dependent rows a root carries with it (a Preview's
sessions, a session's children and handoffs through `iam.end_host_session`) are locked and changed
with it; a parent that a child still names waits for a later pass.

| # | `relation` | `action` | Rule |
| --- | --- | --- | --- |
| 1 | `iam.handoff` | `DELETED` | at `expires_at` (lives 30 to 60 s, carries a sealed token) |
| 2 | `iam.preview` | `DELETED` | at `expires_at`, with its sessions, once no handoff names it (0026: nothing of a Preview is kept) |
| 3 | `iam.host_session` | `ENDED` | kind `HUB` or `APPLICATION`, open, past `absolute_expires_at` or `idle_expires_at`: `iam.end_host_session(digest, 'EXPIRED')` |
| 4 | `iam.host_session` | `DELETED` | 72 h after `ended_at`, when no child session or handoff names it |
| 5 | `iam.oidc_transaction` | `DELETED` | 24 h after `expires_at` |
| 6 | `iam.bootstrap_context` | `DELETED` | 24 h after `expires_at`, together with every `iam.operation_idempotency` row where `operation_id = 'IAM-03'` and `authority_scope = 'bootstrap:' \|\| issuer \|\| ':' \|\| external_subject` of a deleted context, in one statement (two data modifying CTEs, spike 2); a receipt with no context is left as it is |
| 7 | `iam.workspace_invitation` | `DELETED` | 30 days after `expires_at` |
| 8 | `iam.application_invitation` | `DELETED` | 30 days after `expires_at` |

The job (`identity-access/reaper.ts`) calls the function once per pass with `p_now = new Date()` and
`p_limit = 500`, parses the rows with Zod at the edge (`relation` a string, `action` the enum
`DELETED | ENDED`, `removed` a non negative integer; the list of relations is not repeated in
TypeScript, the function owns it and the coverage test reads it from there), and logs `IAM_EXPIRED_REAPED { relation, action,
removed }` through `logLine` for each row with `removed > 0`. A backlog drains over later passes.

The same migration:
- replaces `iam.open_preview` and `iam.mint_application_handoff` without their expiry deletes
  (`0026:269`, `0026:294-299`); the test at `application-access.postgres.test.mjs:642` becomes a
  reaper test;
- adds `DELETE FROM iam.oidc_transaction WHERE application_project_id = p_project_id` to
  `iam.purge_project` before the application delete (AC-8).

### 6. The invitation state

`iam.list_workspace_roster` and `iam.list_application_access` return a `state` column:
`CASE WHEN expires_at > clock_timestamp() THEN 'PENDING' ELSE 'EXPIRED' END` on invitation rows,
NULL on member, grant and application rows. `iam.invite_workspace_member` sets
`created_at = clock_timestamp()` on the upsert (`0001_baseline.sql:784`), as the application upsert
already does (`0025:130`), so `invitedAt` means the latest invitation in both lists.

The two screens, under the `conexus-frontend` skill (pt-BR sentence case, the status travels with a
word, the state shown is the one the server sends):

| | Workspace members (`components/workspace-members.tsx`) | Application access (`components/application-access.tsx`) |
| --- | --- | --- |
| Section | "Convites" with the count; empty: "Nenhum convite." | same |
| Chip | `PENDING`: "Pendente", `data-tone="pending"`; `EXPIRED`: "Vencido", `data-tone="neutral"` | the same chip, added beside the row |
| Date line | role, then "vale até" or "venceu em" `expiresAt` | "Vale até" or "Venceu em" `expiresAt` |
| Re invite | row menu item "Convidar de novo", only for `EXPIRED`, owner only (as the menu is today) | a "Convidar de novo" button beside "Cancelar", only for `EXPIRED` |
| Call | a row level mutation calling the workspace invite client (`IAM-05`) with the entry's email and role | a row level mutation calling `grantApplicationAccess(projectId, { email })` (`IAM-12`) |
| After | invalidate the roster query; on error the existing `failureText` alert | invalidate `applicationAccessQueryKey(projectId)`; a returned grant shows the existing "já tem acesso" outcome; on error the existing alert |
| While pending | the row's actions are disabled | same |

The invite mutations are private to their forms today (`workspace-members.tsx:197-210`,
`application-access.tsx:164-175`); each screen gets one mutation that both its form and its rows use.
If the reaper already deleted the invitation, the same call creates a new entry; the screen shows
whatever the list returns. `web:style:check` confirms the `neutral` chip tone has a rule on these
screens.

Contract and code that follow:

| Consumer | Change |
| --- | --- |
| `contracts/api/product/identity-workspace-paths.yaml` | `state` enum `PENDING`, `EXPIRED`, required, on `WorkspaceInvitationEntry` and `ApplicationInvitationEntry`; descriptions say "invitations with their state" |
| `npm run generate:iam` | regenerates `apps/hub/src/generated/iam-routes.ts` and `apps/web/src/generated/iam-client.ts` |
| `identity-access/membership.ts`, `identity-access/application-access.ts` | entry types, column lists, row mapping |
| `workspace-membership-http.test.mjs`, `application-access-http.test.mjs` | fixtures carry `state` (4 tests return 500 without it) |
| browser fixtures `project-settings-access.browser.test.mjs`, `project.browser.test.mjs` | carry `state`; one test per screen shows "Vencido" and re invites (stubbed Hub, for the screen's behaviour) |
| `docs/product/operation-ledger.md`, `docs/product/contract.md`, `docs/reference/frontend-and-product-surfaces.md` | the list wording; no new operation (`wire:bijection` stays at 30) |

### 7. API surface

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
| --- | --- | --- | --- | --- | --- |
| workspace roster (`IAM-04`) | GET | workspace | entries; invitation entries gain `state` | unchanged | unchanged |
| workspace invite (`IAM-05`) | POST | email, role | the invitation, `state` `PENDING`, new deadline and invited date | unchanged | unchanged |
| application access list (`IAM-11`) | GET | project | entries; invitation entries gain `state` | unchanged | unchanged |
| application access grant (`IAM-12`) | POST | email | the grant or the invitation (union, unchanged); an invitation is `PENDING` | unchanged | unchanged |

No new route. The executor and the reaper have no HTTP surface.

### 8. Value sourcing

| Action | Value | Source |
| --- | --- | --- |
| a job pass | when it runs | `everyMs` constant in the owning module |
| reaper | `p_now` | `new Date()` in the job, like every session function takes `p_now` |
| reaper | batch size | `p_limit` = 500, constant in `identity-access/reaper.ts` |
| reaper | each deadline | the literal in its statement in `iam.reap_expired` |
| reaper | `relation`, `action`, `removed` | section 5 table; root rows counted |
| lease | owner id | the service's `ownerId` (`service.ts:117`) |
| lease | live ids | `builderRunId` of each value of the service's `runs` map, read at the start of the pass |
| lease | live now (recheck) | the same map, read before each settle |
| lease | stale window | `RUN_STALE_AFTER_MS` (30 s) |
| invitation list | `state` | `expires_at` against `clock_timestamp()` in the list function |
| invitation list | invited date | `created_at`, reset by both upserts |
| "Convidar de novo" | email, role | the invitation entry the list returned (role for the workspace only) |
| "Vencido", "venceu em" | text | the web copy, from `state = 'EXPIRED'` |
| `JOB_FAILED` | job | `Job.name` |

### 9. Key invariants

- A run in the Hub's `runs` map is never settled as taken over by that Hub.
- No Hub login role has `DELETE` on an `iam`, `project`, `workspace` or `builder` table.
- An open Hub or application session always holds its sealed token, an ended one never does
  (`host_session_hub_check`), so ending goes through `iam.end_host_session`.
- The reaper deletes a bootstrap context and its `IAM-03` receipts together; it never deletes a
  receipt on its own.
- The reaper converges: once drained, two calls with the same `p_now` equal one.

### 10. Security model

The reaper runs as `hub_iam_runtime` through a `SECURITY DEFINER` function owned by `iam_owner`,
the pattern of every `iam` write today. It ends local sessions and clears the sealed tokens the Hub
stores, sooner than today (handoffs at expiry, expired sessions within a pass). It calls no identity
provider; the provider session behind a locally expired Hub session ends on the provider's own limits.

### 11. Critical test scenarios

- Executor with `t.mock.timers`: a pass runs at start, the next one `everyMs` after it settles, never
  two at once; a rejected pass logs `JOB_FAILED` and the next pass runs; `close()` awaits a pass in
  flight and arms nothing after. Verifies **AC-1**, **AC-2**, **AC-3**, **AC-12**.
- Lease through `service.renewLease` on real PostgreSQL, with conversation ids and run ids distinct:
  a listed run with a heartbeat an hour old stays `RUNNING` and is beaten; a stale run of another
  owner and an unlisted stale run of this owner are taken and settled; an empty `runs` map still
  takes a stale foreign run; a run that enters `runs` after the ids were read and comes back from the
  SQL is not settled. Verifies **AC-4**.
- Reaper on real PostgreSQL, `p_now` moved forward: each rule removes its row just past its deadline
  and keeps it just before; more than `p_limit` eligible rows drain over two calls; a row locked by
  another transaction is skipped and taken on the next call; an expired open session ends `EXPIRED`
  with a NULL token; a Preview with its handoff and session goes in one pass; a drained call removes
  nothing. Verifies **AC-5**, **AC-6**, **AC-7**, **AC-10**.
- Purge with an OIDC row naming the application succeeds (failing first on today's function).
  Verifies **AC-8**.
- Coverage: a new user schema table with an `expires_at` column and no rule fails the test; a
  `factory` table does not. Verifies **AC-11**.
- Real Hub (the repository's `verify` skill: disposable Hub, real PostgreSQL and Keycloak): an
  expired invitation in each screen shows "Vencido"; "Convidar de novo" returns the same entry
  `PENDING` with a new deadline and invited date, checked against the database. Verifies **AC-9**.
- One reaper pass on a seeded local database, counts before and after. Verifies **AC-14**.

## Build plan

Skateboard order: the executor and the lease first, as a subtraction, then the reaper, then the
screen. Each part ends green on `npm run verify:quick`, the full PostgreSQL group, and the `rest` and
`live` groups. Every part that adds a migration pins its digest in `scripts/run-hub-migrations.mjs`
and refreshes the catalog snapshot (`npm run db:catalog:snapshot`) in the same commit.

1. **One executor and the lease in one call.** `platform/jobs.ts` and its `t.mock.timers` test; the
   five in process jobs move onto it with the adapters of section 1, and the three schedulers and two
   loose timers go; `hub.ts` starts and closes the executor; the import law line. Migration 0057 with
   `builder.renew_run_lease`, the two old functions dropped; `service.renewLease` and the store
   method; every old caller moves (`builder-run-lease.test.mjs`,
   `builder-conexus-git.postgres.test.mjs:191-198`, `builder-run-recovery.postgres.test.mjs:196-197`,
   `builder-run-harness.mjs:309-310,363`, `builder-composition.postgres.test.mjs:337-403`); the
   call site row in `tests/repository/hub-call-sites.mjs`. `JOB_FAILED` replaces the three rows, then
   `node scripts/generate-failures.mjs` and `node scripts/generate-log-codes.mjs`. The Biome rule, the
   three reasoned suppressions in the same commit, and `repeatedTimerSuppressions: 3`. Satisfies
   **AC-1** (all but the reaper job), **AC-2**, **AC-3**, **AC-4**, **AC-12**, **AC-13** (failure
   rows), the timer half of **AC-11**.
2. **The reaper.** The failing purge test first. Migration 0058: `iam.reap_expired`, the two
   functions without their lazy deletes, the purge fix. `identity-access/reaper.ts` and its job;
   `IAM_EXPIRED_REAPED` in `log-events.json`, then the log code generator; the call site row
   `'identity-access/reaper.ts': { 'iam.reap_expired': 'hub_iam_runtime' }` and
   `hub-call-site-privileges.postgres.test.mjs`; `iam-reaper.postgres.test.mjs` with the coverage
   test and the rule tests; the test at `application-access.postgres.test.mjs:642` replaced; one pass
   on a seeded local database. Satisfies **AC-1** (the reaper job), **AC-5**, **AC-6**, **AC-7**,
   **AC-8**, **AC-10**, **AC-13** (event), **AC-14**, the expiry half of **AC-11**.
3. **"Vencido" and "Convidar de novo".** Migration 0059 (`state` in both lists, the workspace invited
   date); the contract, `generate:iam`, the Hub types and the HTTP and browser fixtures; the two
   screens and their shared mutations; the browser tests; the real Hub check. Satisfies **AC-9**.
4. **The rule written down.** Principle 8 "Enforced by" names the Biome rule, the census item and the
   coverage test; `shapes.md` gets two decided rows, "periodic work is a `Job` run by the one executor; whatever expires is removed by `iam.reap_expired`" (owner: this spec) and "a module is a function returning a frozen object with private state; a class only extends `Error`, `Failure` or a library base class" (owner: this spec; the Hub already follows it, it was not written down); `wire-contract.md` states that project and
   workspace receipts are kept while their entity exists; `hub-database-roles.md` function count.
   Documentation only. Satisfies **AC-10** (contract wording), **AC-11** (documentation).

## Consequences

**Positive**:
- One way to run periodic work; a failed pass can no longer exit the Hub.
- The lease invariant is a clause plus one recheck, not a timing argument.
- Sealed tokens of expired sessions are cleared within a reaper pass instead of never.
- The invitation lists tell the truth and offer the fix.
- Hub TypeScript shrinks by about 50 lines; three failure rows become one.

**Negative / tradeoffs**:
- SQL grows by about 250 lines, most of it the reaper and two function bodies replaced in full
  because a merged migration is never edited.
- The takeover query runs every 10 s instead of 30 s (a few open rows, `SKIP LOCKED`).
- An expired session may hold its token until the next pass that finds it unlocked; a backlog over
  500 rows per rule takes several passes.
- A deadline change is a migration that replaces `iam.reap_expired`.
- An expiry column not named `%expires_at` would escape the coverage test; none exists today.
- Three `setInterval` stay, each with a reason; a hand written `setTimeout` loop would escape the
  Biome rule (none exists; review covers it).
- Part 1 is the largest part: the executor and the lease move together so the lease is migrated
  once, with no interim adapter.

**Neutral**:
- Every job runs one pass at start; the two that did not (idle conversations, idle cliproxy) find
  nothing then.
- Project and workspace receipts are kept while their entity exists, now written in the contract.

## Migration plan

**Strategy**: no compatibility layer (development data). Parts 1 to 3 each add one migration; the
old lease functions are dropped in the same migration that adds the new one, and every caller moves
in the same commit.
**Rollback**: revert the part's commit and its migration on a development database.
**Risks**: running the migrations on the pilot needs the operator's Aprovo, as every migration does.
