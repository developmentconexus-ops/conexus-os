# 4D OPP-C01 — Durable Execution and Workflow Runtimes Study

> **Status:** `PASS 1 OPERATOR APPROVED / STRATEGIC SEAMS PROMOTED / CURRENT ADOPTION DEFERRED`
> **Inputs:** C-002, C-010, C-017, MAR/Builder/PAR owners, Realization exclusions, OPP-B03, current Mastra mapping and 3L qualification
> **Research date:** `2026-08-28`
> **Runtime execution:** `NOT PERFORMED`
> **Implementation authority:** `BLOCKED`

## 1. Decision question

Can durable-execution/workflow runtimes materially improve restart, long waits,
reconnect and multi-step correctness without creating a Workflow Product owner,
duplicating Conexus run state, replaying effects or moving current authority into
runtime history?

## 2. Current consumers and non-consumers

| Surface | Current need | Strategic durable opportunity | Current disposition |
| --- | --- | --- | --- |
| first Budget Analyzer managed sync | single-flight, one catch-up, deterministic restart from owner cursor/merge facts | little benefit beyond current pg-boss + owner-state composition | `NO NEW WORKFLOW RUNTIME` |
| Builder | bounded ActorRuns, physical sandbox lineage, checkpoints, long coding work | resumable orchestration may reduce lost work after real Builder exists | `DEFER WITH BUILDER TRIGGER` |
| PAR approval wait | exact ApprovalRequest + same AgentRun suspension | native Mastra snapshot/resume is already the accepted bounded mechanic | `PRESERVE + REQUALIFY AT INSTALL` |
| ordinary Product Agent execution | request/turn scoped; lost active run cannot infer completion | reconnect and crash recovery may improve UX/cost | `DEFER WITH MEASURED BENEFIT` |
| future deterministic Project flow | no Workflow/BPM Product domain exists | long timers/signals/compensation may justify a runtime | `DEFER WITH REAL FLOW` |

The operator-triggered C02R correction now instantiates Builder for the first
operational Product proof while still excluding PAR, DurableAgent and generic
workflow machinery. Builder inclusion does not imply a durable workflow engine.

## 3. Binding authority law

```text
Conexus owner admits exact run/occurrence/wait
→ durable runtime receives narrow pinned mechanical input
→ runtime journals/checkpoints/timers/signals mechanics
→ every material continuation re-resolves current owner authority
→ owner validates and writes owner transition
```

Runtime state never becomes:

- `ActorRun`, `AgentRun`, `ApprovalRequest`, `JobRun` or Promotion truth;
- Permission, binding, Release, schedule or effect authority;
- proof that an external side effect did or did not occur;
- a generic user-visible Workflow owner.

Owner wait without recoverable mechanics is a named failure. Recoverable runtime
state without owner authority is forbidden.

## 4. Required durable-mechanics profile

Any future candidate must prove only the properties its consumer needs:

```text
exact owner run/occurrence + Release/runtime pins
idempotent start identity
durable timer/wait/signal where admitted
bounded retry classification
version-pinned continuation
single-winner resume/recovery
current authority recheck before progression
Gateway-only effect execution/reconciliation
cancel/timeout/process-loss honesty
owner/runtime state reconciliation
retention/GC and recovery provenance
```

“Exactly once” is never accepted without scope. A runtime may avoid repeating a
journaled step while an external service still observes zero, one or multiple
attempts. Gateway effect identity/idempotency/reconciliation remains decisive.

## 5. Candidate horizon

### A — owner-local state machine + pg-boss

For short bounded flows with durable owner facts, a queue wake-up and explicit
state transitions remain the smallest architecture. This is already the leading
current MAR composition.

Stop using it as the default when code begins rebuilding durable timers,
signals, histories, versioning, compensation or cross-process continuation.

**Disposition:** `LEADING CURRENT SMALL-FLOW BASELINE / NOT A GENERIC ENGINE`.

### B — Temporal

Temporal provides the strongest mature general durable-execution model in this
comparison: deterministic event-history replay, Activities for side effects,
durable timers, Signals/Updates/Queries, retry policies, Continue-As-New and
worker deployment versioning/pinning.

Material costs:

- separate Temporal service/control plane, workers, persistence and operations;
- deterministic workflow programming constraints and history/version lifecycle;
- Activity retries require exact Gateway/idempotency adaptation;
- Workflow visibility/history can tempt duplication of Conexus owner state;
- adoption for one sync or approval wait would be disproportionate.

**Disposition:** `LEADING FUTURE HIGH-COMPLEXITY CANDIDATE / DEFER`.

Reopen trigger: a real Builder/PAR/Project flow requires multiple long-lived
signals/timers/branches and safe versioned continuation that owner-local state +
queue cannot provide without recreating a workflow engine.

### C — Restate

Restate offers durable services, keyed virtual objects, workflows, journaled
operations, timers and stateful concurrency through ordinary TypeScript service
handlers. It is a compelling smaller-topology challenger for durable RPC and
entity-key serialization.

Risks:

- Restate service/object state could become a parallel owner database;
- journal naming/determinism and service protocol become application constraints;
- another runtime/server and state lifecycle still enter operations;
- “exactly-once” language must be decomposed at external-effect boundaries.

**Disposition:** `STRONG LEAN DURABLE-SERVICE CHALLENGER / DEFER`.

### D — DBOS TypeScript

DBOS is the strongest PostgreSQL-aligned embedded challenger. It provides
durable workflows, sleep/events, queues, recovery and transaction integration
using a system database. Co-locating application transactions and durability
records can close a narrow exactly-once database boundary.

Risks:

- decorators/runtime interception and system tables enter the Hub programming model;
- application-version recovery semantics must preserve exact old Release/run pins;
- transaction integration cannot widen cross-owner DB access or replace CR-1;
- external effects remain outside database exactly-once closure;
- sharing PostgreSQL physically must not merge owner/storage authority.

**Disposition:** `LEADING POSTGRES/TS EMBEDDED CHALLENGER / BOUNDED FUTURE PROBE`.

### E — Mastra Workflows and native suspension

Current Mastra workflows persist snapshots with step state, outputs, path,
suspension metadata, retry state and RequestContext. `suspend()`/`resume()` and
storage-backed snapshots are a good fit for exact PAR approval waits and real
deterministic agent-adjacent flows.

The current accepted mapping remains correct:

- direct Agent for ordinary Product Agent execution;
- Workflow only for a real deterministic multi-step flow;
- native approval suspension is mechanical; PAR owns ApprovalRequest;
- RequestContext/snapshot data is never current authority;
- separate Builder/PAR storage and runtime identity remain required.

No Mastra package may enter Product from this study. Exact admission still must
contain the prior concurrent-resume and raw-auth-token fixes and rerun affected
qualification.

**Disposition:** `PRESERVE ACCEPTED ROLE-LOCAL MECHANIC / VERSION ADMISSION BLOCKED UNTIL CONSUMER`.

### F — Mastra DurableAgent

Current official documentation marks DurableAgent beta and warns breaking
changes may occur without a major bump. It adds workflow-backed agent loops,
PubSub/event caching, reconnect/observe, background execution, approvals and
optional crash recovery.

Important current falsifiers:

- in-memory event cache only reconnects within one process unless a persistent
  cache such as Redis is added;
- automatic recovery re-drives from a snapshot and can repeat LLM/tool calls;
- current multi-instance recovery has no distributed lease/lock and can race;
- Mastra recommends idempotent tools, but Conexus effects still require Gateway
  authority and outcome reconciliation;
- Stored Agent/API durability conflicts with Conexus Release-derived agents if
  adopted directly.

**Disposition:** `HIGH-VALUE RECONNECT/RECOVERY OPPORTUNITY / DEFER + REQUALIFY`.

Admission trigger: a named PA-01/Builder experience metric proves client
disconnect or active-run process loss materially harms completion/cost, and an
exact version passes single-winner, replay/effect, storage, security and owner
reconciliation proofs.

### G — Inngest

Inngest provides durable step memoization, retries, sleeps, event waits,
concurrency and monitoring while invoking application code on owned compute.
Mastra currently offers an Inngest-backed durable-agent/workflow path.

Strategic strengths: low application-side infrastructure, strong waits and
event-driven developer experience. Costs: external/platform execution trust,
event/state custody, callback reachability, pricing/availability and another
observability/control plane. Wait-for-event begins listening when reached, so
race handling and owner recheck remain explicit.

**Disposition:** `LEADING MANAGED DURABLE-EXECUTION CHALLENGER / DEFER`.

### H — Trigger.dev

Trigger.dev offers durable waits, subtasks, idempotency and checkpoint/resume,
including whole-process checkpoint mechanics in its current platform model.
This can preserve arbitrary local state but creates a stronger physical runtime
and checkpoint trust dependency than step-journal approaches.

**Disposition:** `STRATEGIC REFERENCE / DEFER WITH DEDICATED OR CLOUD CONSUMER`.

### I — Hatchet and other task orchestrators

PostgreSQL-backed task orchestration, concurrency controls, event triggers and
operational dashboards remain credible alternatives for future high-volume task
graphs. No current property differentiates them enough to enter a selection.

**Disposition:** `REFERENCE ONLY / REOPEN ON MEASURED TASK-GRAPH NEED`.

## 6. No universal runtime abstraction

Do not create `Workflow`, `Execution`, `RuntimeRun`, `Signal` or `Step` Product
records for uniformity. Also do not create one lowest-common-denominator adapter
that hides materially different replay/version/effect semantics.

The stable seam is consumer-specific admission and reconciliation:

```text
Builder continuation mechanic → Builder ActorRun owner
PAR suspension mechanic       → PAR AgentRun/ApprovalRequest owners
MAR wake/continuation         → MAR JobRun + Project cursor/merge owners
```

Shared infrastructure may be selected later only after isolation and total-cost
comparison; semantic contracts remain separate.

## 7. Promotion result

Wave C promotes three strategic properties, not a dependency:

1. `DXE-01`: any durable runtime remains subordinate to exact owner admission,
   pins and write-once terminal truth;
2. `DXE-02`: continuation/recovery is single-winner, version-compatible and
   rechecks current authority before progress;
3. `DXE-03`: runtime retry/memoization never authorizes external-effect replay;
   Gateway identity/outcome reconciliation remains required.

These refine the existing runtime seams and should enter the 4D-A/B property
contracts. They add no Product operation, owner or current runtime dependency.

## 8. Required future falsifiers

1. `C01-P1`: runtime start cannot precede exact owner run/occurrence admission.
2. `C01-P2`: snapshot/history/runtime ID cannot authorize resume without current owner checks.
3. `C01-P3`: concurrent recovery/resume has one winner and a deterministic loser.
4. `C01-P4`: code/runtime upgrade preserves exact pinned old continuation or stops safely.
5. `C01-P5`: cancel/timeout/process loss cannot infer success or absence of external effect.
6. `C01-P6`: retry/replay never calls an effect outside Gateway identity/idempotency/reconciliation.
7. `C01-P7`: runtime state loss is reconciled honestly against owner wait/run facts.
8. `C01-P8`: owner state loss cannot be reconstructed as authority from runtime history.
9. `C01-P9`: Builder, PAR and MAR stores/namespaces cannot cross-read or resume each other.
10. `C01-P10`: a measured consumer benefit defeats the smaller owner-local baseline before adoption.
11. `C01-P11`: operational recovery/backup/GC covers the exact admitted runtime without making it canonical owner truth.
12. `C01-P12`: exact dependency/security/license/topology qualification passes at consumer admission time.

## 9. Pass-1 outcome

```text
OPP-C01 PASS 1 = OPERATOR APPROVED
current first slice workflow-runtime adoption = DEFER
owner-local state + pg-boss = LEADING CURRENT SMALL-FLOW BASELINE
Temporal = LEADING FUTURE HIGH-COMPLEXITY CANDIDATE
Restate = STRONG LEAN DURABLE-SERVICE CHALLENGER
DBOS = LEADING POSTGRES/TS EMBEDDED CHALLENGER
Mastra native workflow/suspension = PRESERVE ROLE-LOCAL ACCEPTED MECHANIC
Mastra DurableAgent = HIGH-VALUE RECONNECT/RECOVERY OPPORTUNITY / DEFER + REQUALIFY
Inngest = LEADING MANAGED CHALLENGER
Trigger.dev = STRATEGIC REFERENCE
Hatchet/others = REFERENCE ONLY
DXE-01..03 = PROMOTE TO 4D PROPERTY CONTRACTS
new Product owner/operation/record = 0
exact runtime/dependency/version selection = 0
Product implementation authority = 0
```
