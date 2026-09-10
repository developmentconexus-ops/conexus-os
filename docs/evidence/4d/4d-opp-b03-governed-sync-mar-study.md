# 4D OPP-B03 — Governed Sync / Managed Application Runtime Study

> **Status:** `PASS 1 OPERATOR APPROVED / PG-BOSS INCUMBENT CONFIRMED / NO DEPENDENCY SELECTION`
> **Inputs:** managed-execution owner; Package-D qualification; `RUN-01..04`; first Budget Analyzer sync
> **Research date:** `2026-08-28`
> **Implementation authority:** `BLOCKED`

## 1. Decision question

> Which private execution mechanics best preserve exact served-Release
> admission, atomic `JobRun`/queue projection, single-flight/coalesce, at most
> one freshness-derived catch-up and deterministic restart without creating a
> workflow/scheduler/retry Product owner?

## 2. Current Product/runtime contract

```text
exact active SERVED_VERIFIED Release
→ exact job/v1 artifact and current bindings
→ reconciliation asks whether current freshness requires work
→ atomically admit one exact mar.job_run + private queue projection
→ worker revalidates exact owner fact/pins
→ governed Gateway/Project capability execution
→ durable Project cursor/merge/freshness settlement
→ MAR owner settlement
```

Non-degradable laws:

```text
queue delivery != execution authority
queue job ID != JobRun identity
queue retry != Product retry permission
later Release != rewrite admitted JobRun pins
process-local tick != schedule authority
downtime != N missed occurrences
timeout/cancel/process loss != rollback/terminal truth
Project read-model state != sync correctness proof
```

## 3. Existing deciding Evidence

Package D already proved a bounded **test-only fixture composition** with
PostgreSQL 17.10 and pg-boss 12.26.3. The fixture demonstrates the class-level
properties below; it is not Product MAR DDL and does not establish the identity
or constraints of the future `mar.job_run` table:

- same transaction commits an owner fixture and queue projection;
- forced rollback leaves neither;
- commit followed by process loss leaves both discoverable;
- concurrent same logical occurrence admits one owner fixture and a fail-closed
  loser;
- queue delivery without an admissible owner fixture is refused before effect;
- external/provider/Mastra/Sankhya calls remain zero in the qualification probe.

The qualification fixes the important composition properties:

```text
database      = hub_control
schema        = existing mar
createSchema  = false
migrate       = false
schedule      = false
retryLimit    = 0 for bounded first admission path
vendor DDL    = exported/reviewed into one hub_control migration lineage
```

It does not prove Product `mar.job_run` DDL, real sync cursor/merge/restart, Release handoff, one catch-up,
cancel/timeout or current external-source behavior. Those remain first-build
properties.

## 4. Current source observations

Context7 provided current official Graphile Worker, Temporal and Microsoft
`pg_durable` material. pg-boss was checked against current official source/docs.

Primary sources:

- [pg-boss constructor/configuration](https://github.com/timgit/pg-boss/blob/master/docs/api/constructor.md)
- [pg-boss jobs/transaction adapter](https://github.com/timgit/pg-boss/blob/master/docs/api/jobs.md)
- [pg-boss releases](https://github.com/timgit/pg-boss/releases)
- [Graphile Worker transactional job keys](https://worker.graphile.org/docs/job-key)
- [Graphile Worker recurring tasks](https://worker.graphile.org/docs/cron)
- [Graphile Worker recovery/error handling](https://worker.graphile.org/docs/error-handling)
- [Temporal architecture](https://docs.temporal.io/temporal-service/temporal-server)
- [Microsoft pg_durable](https://github.com/microsoft/pg_durable)
- [BullMQ PostgreSQL backend](https://docs.bullmq.io/guide/postgresql)

Registry observations are Evidence, not pins:

| Package | Observed version | License | Observation |
| --- | --- | --- | --- |
| `pg-boss` | `12.28.1` | MIT | incumbent qualification pin is `12.26.3`; current version drift requires exact DDL/behavior requalification |
| `graphile-worker` | `0.17.3` | MIT | PostgreSQL-native worker with job-key, cron, retry and graceful-shutdown machinery |
| `@temporalio/client/worker` | `1.23.0` | MIT | SDK is only one part; Temporal Service and persistence remain separate operational infrastructure |
| `inngest` | `4.18.1` | Apache-2.0 | broad durable function/event/runtime and observability surface |
| `bullmq` | `6.3.1` | MIT | current optional PostgreSQL backend; Redis remains documented as most battle-tested |

Current pg-boss releases add useful schema-drift/doctor and correctness fixes,
but also move vendor schema/version. `12.26.3` Evidence cannot be relabeled as
`12.28.1` proof.

## 5. Candidate analysis

### A — pg-boss

Strengths:

- only candidate with exact current Conexus Package-D proof;
- custom `db.executeSql` adapter enables owner row and queue projection in one
  caller transaction;
- stock PostgreSQL, Node/TS and current `pg` alignment;
- schema/config/migration/scheduler controls allow Conexus-managed DDL and
  schedule authority exclusion;
- queue projection can live inside existing MAR owner schema/database;
- retries, expiration, heartbeats, groups and policies are available but can be
  narrowed rather than prebuilt;
- polling remains fallback when LISTEN/NOTIFY is unavailable;
- current source includes schema-drift diagnostics useful for vendor DDL
  conformance.

Risks:

- default retry limit is nonzero and therefore unacceptable by inheritance;
- queue policies/singletons are not the primary owner correctness fence;
- `send()` can return `null` under suppression and must fail admission closed;
- vendor schedule/flow/subscription objects may exist as unused schema baggage;
- current versions use per-queue/schema machinery with meaningful DDL/upgrade
  complexity;
- `boss.cancel()`/signals do not prove handler rollback or owner settlement;
- exact-version upgrade may change queue/schema/runtime behavior.

**Pass-1 disposition:** `LEADING ADAPT CANDIDATE / INCUMBENT CONFIRMED / NOT
SELECTED`.

### B — Graphile Worker

Strengths:

- PostgreSQL-native `add_job()` can participate directly in an existing SQL
  transaction;
- `FOR UPDATE SKIP LOCKED` worker claim and named queues;
- job keys, attempts, backoff, abort signal and graceful shutdown;
- configurable schema and library-mode integration;
- explicit cron/backfill and distributed scheduling behavior;
- public job views exclude payload.

Material mismatches:

- cron `fill` walks and enqueues all matching missed occurrences; it cannot cap
  backfill to one current freshness-derived occurrence;
- `jobKey` replacement can create a second job when the prior job is locked;
- high-contention job-key insert may return `null`;
- normal crash recovery may leave jobs locked for roughly four hours before
  sweep/release, unless additional recovery machinery is used;
- retry/backoff and worker job states must remain subordinate to MAR owner truth;
- default separate schema/migration lifecycle needs the same vendor-DDL
  integration work;
- no accepted property is materially stronger than the already-proven pg-boss
  co-admission result.

**Pass-1 disposition:** `KEEP_AS_IMPLEMENTATION_ALTERNATIVE / REAL CHALLENGER`.
Probe only if pg-boss repin/DDL/recovery fails a named property.

### C — BullMQ PostgreSQL backend

Interesting current opportunity:

- exposes a mature Queue/Worker/FlowProducer API over optional PostgreSQL;
- avoids Redis when desired and aligns with the Hub database direction;
- may offer broader operational tooling.

Risks:

- PostgreSQL backend is newer and official docs still call Redis the most
  battle-tested path;
- datastore-agnostic API imports broad queue/flow semantics not required by one
  managed sync;
- exact caller-transaction co-admission with `mar.job_run` is not established;
- global default backend/process-wide configuration can blur bounded MAR
  composition;
- no current Conexus qualification or vendor-DDL placement proof.

**Pass-1 disposition:** `KEEP_REFERENCE_ONLY / EMERGING CHALLENGER`. Promote
only on a material incumbent gap plus successful co-admission proof.

### D — Temporal

Useful properties:

- excellent durable event history, deterministic workflow replay, timers,
  activity retries, cancellation and worker recovery;
- strong testing/replay story;
- credible solution when a real multi-step long-running process needs durable
  orchestration across failures.

Current mismatch:

- Temporal Service introduces frontend/history/matching/worker services and a
  separate persistence topology;
- Workflow Execution/Event History/Task Queue/Activity state overlaps the
  bounded `JobRun` + Project cursor/merge owner model;
- automatic activity retries are broader than current owner-authorized retry;
- deterministic workflow constraints and deployment versioning add major
  operational/cognitive surface;
- one read-only governed sync has no multi-step wait/orchestration consumer that
  defeats the PostgreSQL-private queue approach.

**Pass-1 disposition:** `KEEP_REFERENCE_ONLY` for recovery/replay/versioning
properties; `REJECT` as current MAR dependency. Reopen on a real deterministic
multi-step/long-wait consumer that cannot fit the bounded JobRun seam.

### E — Microsoft `pg_durable`

Interesting properties:

- durable functions, retries and scheduling inside PostgreSQL;
- ACID state, crash survival and database-aware waits;
- explicit security model and function grants.

Current mismatch:

- materializes generic workflow nodes, instances, triggers and execution history
  in a new extension schema;
- creates exactly the durable workflow lifecycle/record family Conexus has
  rejected without a consumer;
- extension/worker installation, privilege and maturity/upgrade surface is
  substantial;
- SQL/HTTP workflow primitives could bypass owner/Gateway boundaries;
- no benefit over pg-boss for single-step owner-controlled sync justifies this
  ontology.

**Pass-1 disposition:** `KEEP_REFERENCE_ONLY / REJECT CURRENT ADOPTION`.

### F — Inngest / hosted durable-function platforms

Useful reference properties include steps, retries, concurrency, schedules and
observability. Current SDK/runtime surface is broad and adds event/function
ontology, service dependency and telemetry machinery. It does not improve the
same-database atomic owner/queue admission property.

**Pass-1 disposition:** `KEEP_REFERENCE_ONLY`; reconsider only with a real
external durable-function/event consumer and exact topology/custody decision.

### G — custom PostgreSQL queue

Could precisely implement the current minimal law, but would require Conexus to
own worker claim, visibility timeout, crash recovery, heartbeats, cleanup,
backpressure, shutdown and upgrade behavior already provided by mature queues.

**Pass-1 disposition:** `BUILD ONLY ON MATERIAL FRAMEWORK FALSIFIER`.

## 6. Leading MAR realization hypothesis

```text
process-local wake tick
→ calls MAR reconcile (no durable schedule authority)
→ current served Release + job artifact + binding + freshness/cursor
→ due? and no active/admitted owner occurrence?
→ one transaction
   ├── insert exact mar.job_run under owner uniqueness
   └── pg-boss send through same transaction adapter
→ commit = exact-pinned JobRun admission
→ private worker delivery
→ re-read/revalidate mar.job_run before handler
→ deterministic Project cursor/merge execution
→ owner settlement
```

Configuration hypothesis remains bounded:

```text
schema       = mar
createSchema = false
migrate      = false
schedule     = false
retryLimit   = 0 unless an exact later owner retry contract admits otherwise
```

The wake tick is process-local and immediately reconciles on startup. Due-ness
comes from current successful freshness plus exact Release-pinned interval, not
from cron slots or queue schedule rows.

## 7. Recovery model

### Before physical execution

Committed owner+queue facts survive process loss. Fresh worker delivery still
must find the exact admissible owner JobRun.

### During sync

Project-owned durable cursor/merge facts decide whether the same exact JobRun
can continue. Queue retry/redelivery cannot decide.

### Orphan/ambiguous progress

```text
exact JobRun pins
+ cursor/merge transaction state
+ handler quiescence
+ current owner gates
→ CONTINUE SAME JOBRUN | TERMINALIZE/FAIL | STOP/INVESTIGATE
```

No generic JobAttempt or workflow history is admitted. A new occurrence cannot
silently replace an unresolved prior occurrence.

### Cancel/timeout/shutdown

1. owner prevents new progression/admission;
2. propagate cooperative abort where available;
3. establish quiescence or keep state unknown/running honestly;
4. settle only proven cursor/merge facts;
5. never infer rollback of already committed Project DB work.

## 8. Required falsifiers before selection

### `B03-P1` — exact repin and vendor DDL

Select one exact pg-boss source/package candidate descending from the deciding
fixes; diff exported vendor DDL/config behavior from 12.26.3 and rerun affected
Package-D criteria.

### `B03-P2` — atomic admission

Real PostgreSQL proves owner JobRun + queue projection commit/rollback atomically
through the final driver/transaction abstraction.

### `B03-P3` — owner uniqueness/null queue outcome

Concurrent same logical occurrence yields one JobRun; queue `null`/suppression,
duplicate or missing queue fails the admission transaction closed.

### `B03-P4` — one current catch-up

Simulate multiple missed intervals and Release changes. Reconciliation admits at
most one current due occurrence and never walks historical slots.

### `B03-P5` — Release handoff

Already committed old-Release JobRun preserves exact pins; new old-Release
admission is denied after handoff; new Release never rewrites old work.

### `B03-P6` — process loss matrix

Kill before commit, after commit/before fetch, during source read, during Project
merge and after merge/before owner settlement. Each point must produce one
deterministic/explicit continuation or stop outcome.

### `B03-P7` — queue not authority

Forge queue delivery without owner row, with terminal/cancelled owner row, wrong
Release/job pins and wrong Project. Effect/read-model canary must not fire.

### `B03-P8` — retry/cancel/timeout

Prove retryLimit/queue redelivery cannot create a new owner attempt or bypass
current owner gates. Cooperative abort and late completion remain subordinate.

### `B03-P9` — vendor schema/runtime discipline

Normal runtime has no schema mutation privilege; pending vendor migration blocks
startup; exact vendor objects live under MAR custody without semantic census
inflation.

### `B03-P10` — challenger trigger

Run Graphile/BullMQ/custom/Temporal probes only when pg-boss fails a named
co-admission, recovery, upgrade, performance or operational property. Feature
breadth alone is not a trigger.

## 9. Pass-1 outcome

```text
OPP-B03 PASS 1 = OPERATOR APPROVED
pg-boss = INCUMBENT LEADING ADAPT CANDIDATE / NOT SELECTED
Graphile Worker = REAL POSTGRESQL CHALLENGER
BullMQ PostgreSQL = EMERGING REFERENCE CHALLENGER
Temporal = RECOVERY REFERENCE / REJECT CURRENT MAR ADOPTION
pg_durable = INTERESTING REFERENCE / REJECT CURRENT WORKFLOW ONTOLOGY
Inngest = REFERENCE_ONLY
custom queue = BUILD ONLY ON MATERIAL FRAMEWORK FALSIFIER
process-local wake + freshness reconciliation = CONFIRMED
owner JobRun uniqueness/cursor/merge = PRIMARY CORRECTNESS
queue scheduler/retry/state = PRIVATE SUBORDINATE MECHANICS
exact dependency/version selection = 0
Product implementation authority = 0
```

The incumbent survives because it already proves the hardest current property —
same-database atomic owner/queue admission — and the richer alternatives add
more authority/operations surface than the first sync consumes. Their strongest
recovery ideas remain valuable reference inputs for the first-build proof.
