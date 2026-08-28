# 4B Evidence — Managed Application Runtime schema closure

> **Status:** CLOSED / BOUNDED EVIDENCE  
> **Phase:** 4B — Executable Wire Contract  
> **Slice:** `MAR-01 → MAR-04`
> **Implementation:** BLOCKED

## 1. Authority compiled

This slice compiles only the accepted Managed Application Runtime Product surface:

```text
MAR-01 ListManagedJobRuns
MAR-02 GetManagedJobRun
MAR-03 RunManagedJobNow
MAR-04 ListRunnableManagedJobs
```

`MAR-01` and `MAR-02` are Control Plane read/provenance operations under current `project.read`. `MAR-03` is the explicit `job.run` occurrence command for one exact authored job admitted by the currently served Release. The later operator-approved `4C-F33` adds `MAR-04` as the distinct safe job-discovery read under ordinary `project.read` or purpose-bound `job.run`.

Queue delivery/redelivery, worker claims, retries, heartbeat, scheduler state, catch-up mechanics and pg-boss identity remain runtime-private. No workflow/scheduler Product domain is created.

## 2. Canonical wire

The canonical Product OAD routes the four MAR Path Items through:

```text
contracts/api/product/mar-paths.yaml
```

Routes:

```text
GET  /api/control/projects/{projectId}/managed-jobs
GET  /api/control/projects/{projectId}/job-runs
GET  /api/control/projects/{projectId}/job-runs/{jobRunId}
POST /api/control/projects/{projectId}/jobs/{jobId}/runs
```

`MAR-01` exposes only the accepted optional exact `releaseId` / `jobId` filters plus the shared opaque `pageToken` continuation. No status/filter/sort/query DSL is admitted.

`MAR-04` exposes only the safe job identity, human name/purpose and optional schedule presentation admitted by the exact currently served Release. It does not expose JobRun history, queue/scheduler mechanics or execution eligibility as browser truth.

## 3. JobRun truth

The list/detail projections preserve only MAR owner truth and provenance:

```text
jobRunId
projectId?            = exact owner Project on detail/admission
releaseId             = exact immutable Release pinned at admission
jobId                 = exact admitted job/v1 identity
state                 = MAR owner-issued; no invented universal queue lifecycle enum
admittedAt
startedAt? / completedAt?
evidenceRefs          = exact detail provenance
```

A queue/worker/provider status can support execution mechanics, but it does not become Product JobRun truth by itself.

## 4. Run-now admission

`MAR-03` has no request body and accepts no caller Release, environment, queue, schedule, retry, force or catch-up override.

```text
POST exact job route
+ Idempotency-Key
→ current authority recheck
→ resolve exact currently served Release server-side
→ verify exact job/v1 is admitted by that Release
→ preserve single-flight/coalesce law
→ admit one JobRun
→ 202 ManagedJobRunAdmission
```

`409` preserves an admitted current-state/single-flight/coalesce conflict. A repeatable intake key cannot manufacture a second occurrence.

The Product API does not expose:

```text
CreateCron
ReplayMissedSlots
ForceRedelivery
RetryJob
ReplayJob
RedeliverJob
MarkJobSucceeded
CreateWorkflow / ExecuteWorkflow / RunWorkflow
queueId / pgBossJobId / workerId / claimToken / leaseToken
retry/redelivery/heartbeat/cron/schedule/missed-slot/catch-up controls
```

## 5. Recovery / recurrence boundary

The accepted owner law remains outside caller wire mechanics:

```text
single-flight / coalesce
+ after downtime at most one owner-admitted catch-up
  only when current served Release still requires sync
  and current freshness is behind
-X-> replay every missed slot
```

This slice does not select or expose pg-boss implementation details. Those mechanics remain later 4D realization subject to the accepted MAR owner contract.

## 6. Executable negative controls

`scripts/check-wire-mar.mjs` rejects, among other drift:

```text
MAR method/path changes
non-SCHEMA_CLOSED MAR rows
request body or runtime override on RunManagedJobNow
missing Idempotency-Key on MAR-03
If-Match on MAR-03
missing 409 current conflict
invented universal JobRun lifecycle enum
list filters beyond releaseId/jobId/pageToken
queue/worker/claim/lease/retry/redelivery/scheduler/catch-up fields
caller Product operations for cron, replay, redelivery, retry, completion marking or generic workflow execution
```

## 7. TDD proof

RED was opened before `mar-paths.yaml` existed:

```text
Verify #329 = FAILURE
Error: MAR-01 is not SCHEMA_CLOSED
```

All already-closed owner gates reached that exact failure first.

Minimal GREEN then added `mar-paths.yaml` and changed only the three canonical MAR `$ref` targets:

```text
Verify #331 = SUCCESS
MAR = 3 / 3
fixed 4A↔OAS = 111 / 111
schema-closed = 106 / 111
missing / extra / duplicate = 0
literal IF_MATCH = { PRJ-12, PAR-14 }
Budget Analyzer positive + negative proof = green
```

## 8. Closure result

```text
Managed Application Runtime Product surface = CLOSED
MAR Product operations = exactly 4
MAR-04 bounded F33 discovery read = 1
queue/scheduler-control Product operations added = 0
current whole-wire total = 126 / 126
```

The next bounded owner slice is Observability & Audit only:

```text
OBS-01 ListProjectActivity
OBS-02 GetExecutionObservationDetail
OBS-03 GetProjectUsageCostSummary
OBS-04 ListAuditRecords
OBS-05 GetAuditRecord
```

This Evidence does not begin OBS, 4C, runtime/Paved Road selection, persistence design or Product implementation.
