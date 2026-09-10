# 3L-R2 — Managed Execution & Deciding Evidence Proportional Rederivation

> Frozen accepted-decision snapshot. [../ROADMAP.md](../roadmap.md) alone owns current phase and implementation status.

**Status:** `APPROVED / OPERATOR RATIFIED 2026-08-20`  
**Phase:** 3L — Technology Qualification  
**Scope:** Package D (Managed Execution) + Package E (Deciding Evidence) proportional rederivation after Package-B closure  
**Method:** DevelopmentConexus Engineering Method v1.0.0  
**Product implementation:** `BLOCKED`  
**C-018:** `NOT RATIFIED`  
**PR #40 merge:** `NOT AUTHORIZED`  
**DT-1' execution:** `NOT AUTHORIZED BY THIS DECISION`

## 1. Decision in one sentence

Package D is rederived to one bounded pre-C-018 composition probe, `DT-1' — Transactional Managed-Occurrence Admission`, using `pg-boss 12.26.3` only as private MAR queue mechanics inside the **existing** `hub_control.mar` owner schema, with vendor DDL folded into the single `hub_control` migration lineage and recurrence driven by MAR owner reconciliation/freshness rather than rolling future `JobRun`s or scheduler authority; Package E is `DEFER SAFELY / NO PRE-C-018 RUNTIME PROBE`, with its Mastra observability basis corrected to name `@mastra/observability` as an unpinned, not-yet-C-016-admitted realization dependency.

This decision creates no Product requirement, owner, module, durable record class, Conexus schema, database, scheduler domain, outbox, observability backend or Product implementation.

---

## 2. Authority and evidence

This bounded Decision Loop preserves the current Product/owner architecture and adjudicates the independent review:

- `3L-R1 — Framework-Native Proportional Qualification Rebaseline`;
- `3A-R9 — Managed Job / Deterministic Sync Dispatch Reconciliation`;
- `3A-R10 — Pre-Implementation Convergence & Realization Routing`;
- `3E-01 — Hub Control Data Ownership & Persistence Boundaries`;
- `3E-02 — Module Durable Record Inventory & Reference Closure`;
- `3H-03 — Runtime Isolation, Correlation & Handoff`;
- `3L-Q0 — Technology Qualification Manifest`;
- `3L-D/E — Fable Independent Proportional Rederivation Review` — Evidence only, reviewed at parent HEAD `f0bae6aa03f6f84f29b91068e6020377cdcd8784`.

The Fable review remains non-authoritative. Its Findings are accepted, corrected or narrowed below against current authority.

External source Evidence used for this rederivation is exact-version scoped:

```text
pg-boss        = 12.26.3
PostgreSQL     = 17.10 probe pin
Node           = 24.18.0 probe host pin
@mastra/core   = 1.56.0 exact Package-B bytes
Package-B lock = 5e8b2b4ea2ef5ae5676652cdbafd8c7c284be68cfc445de92950b2decdc8a4f0
```

Primary pg-boss 12.26.3 facts used:

```text
send()/insert()/fetch()/complete() accept a caller-supplied Db adapter
adapter contract = executeSql(text, values) -> { rows }
operations through the transaction adapter roll back with the caller transaction
schema is configurable
createSchema=false is supported
migrate=false skips runtime migrations and start() fails if migrations are pending
schedule=false disables schedule monitoring on the instance
manual/exported vendor SQL is supported for externally managed schema lifecycle
send() ordinary duplicate/suppression behavior may return null rather than throw
retryLimit default is not acceptable by inheritance; retryLimit=0 fences automatic redelivery for this probe
native cron catch-up is insufficient for the accepted one-catch-up law
job.signal exists for handler timeout/shutdown but boss.cancel() is not MAR cancellation authority
```

---

## 3. Outcome

```text
Package D = REDERIVED / ONE BOUNDED PRE-C-018 COMPOSITION PROBE REQUIRED
Package E = DEFER SAFELY / NO PRE-C-018 RUNTIME PROBE

Package D probe = DT-1' — Transactional Managed-Occurrence Admission
DT-1' execution = NOT AUTHORIZED by this document
Package E runtime probe = NONE

new Product requirement       = 0
new Hub module                = 0
new durable record class      = 0
new Conexus owner schema      = 0
new database                  = 0
new scheduler/automation owner= 0
new outbox/dispatcher         = 0
new observability backend     = 0
third Mastra instance         = 0
Product implementation        = 0
```

3L-R2 supersedes only the exact Package-D/Package-E **routing and realization clauses** that still said `REQUIRE PROPORTIONAL REDERIVATION`. It does not weaken structural invariants from 3A-R9, 3E, 3H, 3I or 3K.

---

# Package D — Managed Execution

## 4. Protected invariant

Unchanged from 3A-R9:

> Recurring managed work may reuse queue/timer mechanics, but its production meaning, exact revision, authority and allowed effects remain derived from existing Project/Release/artifact/Gateway owners. No physical execution may occur without a durable MAR `JobRun`, and an admitted `JobRun` may not be irrecoverably lost through a persist→enqueue gap.

Additional realization law:

> Queue/timer state is private MAR substrate state. It can optimize or materialize work; it never decides whether work is currently authorized, which Release/job revision is current, or whether a sync is due.

---

## 5. FBL-D1 adjudication — queue substrate physical home

### 5.1 Finding root accepted

The independent review correctly found that the earlier rederivation assumed same-database co-admission without explicitly placing pg-boss in the ratified persistence topology.

The review's proposed binary choice was not the Global Maximum:

```text
A. new vendor substrate schema inside hub_control
B. separate vendor database
```

A smaller topology exists inside current authority:

```text
hub_control
└── mar                     # existing owner schema; owner = Managed Application Runtime
    ├── Conexus owner records
    │   ├── serving_route
    │   └── job_run
    │
    └── pg-boss private substrate objects
        ├── queue/job/version/...
        ├── vendor functions/types/indexes
        └── vendor schedule/subscription objects may physically exist as package baggage,
            but F1 does not use them as schedule authority
```

### 5.2 Ratified placement

```text
pg-boss database = hub_control
pg-boss schema   = existing mar schema
schema owner     = MAR
new schema       = NO
new database     = NO
new domain record= NO
```

This is compatible with 3E-01/3E-02 because:

1. `mar` remains the single existing owner schema of MAR;
2. pg-boss tables/functions are internal substrate/provider state, not new Conexus durable record classes;
3. same-owner atomicity between `mar.job_run` and MAR-private queue machinery is not a third cross-owner domain transaction class;
4. no module reads another owner's tables;
5. the queue library receives no new Product/business authority.

### 5.3 DDL lineage

Runtime vendor schema mutation is not admitted.

Current realization rule:

```text
pg-boss schema lifecycle
→ exported/reviewed exact-version SQL
→ folded into the ONE ordered hub_control migration lineage
→ migration owner = MAR
→ no independent pg-boss migration stream
→ no CREATE privilege required by normal Hub runtime merely for pg-boss bootstrap
```

Candidate runtime configuration for the current probe/first realization:

```text
schema       = "mar"
createSchema = false
migrate      = false
schedule     = false
```

The exact vendor DDL is still third-party substrate DDL even though it lives
physically under `mar`; Conexus code must not hand-edit pg-boss object
definitions to create a forked schema. A final Project migration may wrap that
exact source with the Hub-owned schema/role/grant prelude, privilege closure and
the single migration transaction envelope required by the native runner, while
leaving provider object definitions unchanged. The wrapper is a new deciding
artifact: its bytes, vendor-source digest and runtime configuration must be
requalified together before Product MAR admission.

### 5.4 Accepted bounded risk

Upstream supports using an existing schema but discourages it because object-name collisions and uninstall/upgrade work become more sensitive.

Conexus accepts that bounded risk for F1 because the alternative separate database would structurally foreclose the preferred same-transaction co-admission and a 14th vendor schema would add topology with no semantic owner need.

Controls/reopen triggers:

```text
pg-boss version change
→ C-016/Q0 repin + exported-SQL diff + migration review

vendor object collision in mar
→ fail closed; do not rename/fork vendor internals silently
→ return to Decision Loop if no bounded supported placement exists

pg-boss requires runtime schema mutation despite migrate=false
OR cannot coexist safely in mar
→ Package-D material Finding / reopen exact realization only
```

---

## 6. FBL-D4 adjudication — recurrence model = immediate freshness-driven reconciliation

The rolling future occurrence candidate is rejected for F1 because it introduces durable future rows, Release-handoff settlement and projection-repair obligations that the first sync consumer does not need.

Selected realization:

```text
Hub/MAR process starts
→ reconcile immediately

process-local MAR wake tick
→ wake only; contains no Project/job schedule authority
→ asks MAR reconciliation whether current owner facts require work

MAR reconciliation reads:
  current served Release / exact managed composition
  exact job artifact/config
  current durable sync freshness/merge state
  existing active/admitted JobRun facts

not due / already covered
→ no occurrence

due and admissible
→ atomically admit one immediate JobRun + one queue projection
→ physical worker may then execute
```

The process-local wake tick owns no durable state, no interval per job, no next-due table, no calendar, no queue of missed slots and no current production truth. If the process dies, restart derives the need again from durable owner facts.

F1 therefore does **not** use as baseline:

```text
rolling future JobRun
future-dated startAfter as recurrence authority
pg-boss schedule()/cron as managed-sync admission authority
Mastra Scheduler for MAR
JobSchedule/ScheduleOccurrence record
nominal missed-slot enumeration
persistent timer cursor separate from existing owner facts
```

Native pg-boss schedule tables may physically exist because they are part of vendor schema, but `schedule=false` and no admitted schedule API consumer keep them non-authoritative and unused for the F1 managed-sync route.

---

## 7. Fixed interval law — no nominal slot walk

3A-R9 already freezes `FIXED_INTERVAL` and the one-catch-up/no-backlog invariant but did not freeze the formula strongly enough.

Current clarification:

> **F1 `FIXED_INTERVAL` is derived from the sync's current durable successful freshness/merge position plus the exact Release-pinned interval policy. Reconciliation never walks a sequence of nominal calendar slots forward. Downtime or overlap can make the current sync stale and may admit at most one catch-up, never N historical ticks.**

The numerical interval remains calibration/Project configuration.

First-load/absence of a successful freshness point is owner logic: if the current served composition requires the sync and no active/admitted run already covers it, reconciliation may treat it as due without inventing historical slots.

---

## 8. Release handoff law — admission commit is the version-lock boundary

No new lifecycle state is created.

For Release version locking only:

> **A managed `JobRun` becomes admitted/in-flight at the successful durable admission commit of `mar.job_run`; physical `RUNNING` still begins when the worker starts. A later active-Release change may prevent new old-Release admissions but does not mutate or re-resolve an already committed exact-pin JobRun.**

Therefore:

```text
R17 current
→ J admitted and committed under exact R17/job pins
→ R18 later becomes current
→ J remains R17 exact-pin work
→ R17 may not admit another new occurrence after handoff
→ R18 does not rewrite J
```

Because F1 no longer pre-admits a JobRun an interval in advance, the exposure between admission and physical execution is only the ordinary admitted-work dispatch window. No `SUPERSEDED`, `SKIPPED_BY_RELEASE` or fake `CANCELLED` state is introduced.

---

## 9. Occurrence identity, dedupe and queue null handling

The correctness fence is owner-side, not queue-side.

```text
same owner-derived logical occurrence
→ at most one admitted mar.job_run
→ enforced by a MAR-owned uniqueness constraint in the final realization

pg-boss job id
→ queue projection identity only
→ never Product occurrence authority

pg-boss singleton/policy
→ optional defense in depth
→ never the primary Product correctness fence
```

The exact logical-occurrence-key formula remains derived Realization Planning, but it must be deterministic for the same owner-derived admission input and must not depend on mutable queue state.

Exact `pg-boss 12.26.3` source shows ordinary `send()` may return `null` for suppression/missing insertion cases rather than raising.

Current rule:

```text
boss.send(...) returns null
→ NEVER success
→ fail closed inside admission path
→ transaction must not commit a newly admitted owner JobRun as successfully projected
```

Queue existence is an explicit startup/migration prerequisite; absence cannot be interpreted as dedupe.

---

## 10. Retry, cancel, timeout and orphan routing

Source-resolved facts are not re-probed merely for ceremony:

```text
retryLimit=0 can fence automatic pg-boss retry/redelivery for DT-1'
job.signal exists for handler timeout/shutdown
boss.cancel() does not itself abort the active handler
native cron catch-up window is insufficient for 3A-R9 one-catch-up law
transaction adapters exist and do not require choosing an ORM
```

Current routing:

```text
single-flight/coalesce owner lifecycle               → FIRST-BUILD
retry preserving exact Release/job pins              → FIRST-BUILD
owner cancel intent + no new admission/retry         → FIRST-BUILD + 3M
cooperative interruption / honoring job.signal       → FIRST-BUILD
honest timeout/partial-progress + cursor settlement  → FIRST-BUILD + 3M
RUNNING owner orphan after worker/process loss        → 3M by name
MANAGED_JOB Gateway last-mile authority revalidation → FIRST-BUILD security/Gateway
Release SERVED_VERIFIED activation proof             → FIRST-BUILD / Release
architecture-wide duplicate-authority proof           → 3N/3O
```

No `JobAttempt`, generic retry engine, durable cancel registry, outbox or scheduler domain is admitted by this routing.

---

## 11. DT-1' — exact bounded pre-C-018 probe

Name:

```text
DT-1' — Transactional Managed-Occurrence Admission
```

Question:

> Can `PostgreSQL 17.10 + pg-boss 12.26.3`, with pg-boss objects under the existing `mar` schema and no runtime vendor migrations/scheduler, compose one MAR owner admission and one queue projection atomically and fail-closed under rollback/race without allowing queue state to become execution authority?

### 11.1 GREEN properties

```text
P1  owner JobRun fixture + pg-boss projection commit atomically through one transaction
P2  forced rollback leaves neither owner fixture nor queue projection
P3  commit followed by process loss leaves both facts discoverable from a fresh process
P4  concurrent same logical occurrence produces exactly one admitted owner occurrence;
    losing path is fail-closed and its exact observable DB/library behavior is recorded
P5  delivered queue work without a currently admissible owner fixture is refused before the
    physical-effect canary fires
P6  provider/model/E2B/Sankhya/real external effect calls = 0
```

### 11.2 RED properties

```text
R1  intentionally split owner INSERT and queue send into separate commits
    → reproduce the persist→enqueue lost-window class

R2  intentionally remove the owner uniqueness fence
    → reproduce duplicate logical admission under concurrency

R3  intentionally trust queue delivery without owner revalidation
    → effect canary fires; then guarded path must block the same class
```

### 11.3 Explicitly outside DT-1'

```text
Product MAR implementation
production hub_control schema/table spelling
real Release/Promotion/SERVED_VERIFIED path
real Project sync_state/cursor/ETL
real Sankhya/Gateway/Connection
real external effects
provider/model/E2B
pg-boss cron/schedule behavior
future startAfter/delayed occurrence
rolling future JobRun
N-missed-slot Product simulation
full cancel/timeout/retry lifecycle
RUNNING-orphan recovery policy
full projection reconstruction
outbox/dispatcher
JobModule/SchedulerModule/Automation/Workflow engine
```

### 11.4 Allowed DT-1' verdicts

```text
QUALIFIED_TRANSACTIONAL_MANAGED_OCCURRENCE_ADMISSION
NARROW_RECONCILIATION_REQUIRED
PG_BOSS_REJECTED_FOR_CURRENT_F1
NOT_PROVEN
MATERIAL_REALIZATION_FAILURE
```

A PASS qualifies only the tested PostgreSQL/pg-boss composition. It does not qualify Product managed-job correctness.

### 11.5 Execution gate

This decision ratifies the **question and route**, not execution.

```text
3L-R2 projection reviewed by operator
+ exact Codex DT-1' plan reviewed
+ explicit execution authorization
→ DT-1' may execute
```

No actor may infer execution permission merely because Package D now has a bounded admitted probe.

---

# Package E — Deciding Evidence

## 12. Package-E verdict

```text
Package E = DEFER SAFELY
pre-C-018 runtime execution = NO
pre-C-018 source review = COMPLETE FOR CURRENT LOAD-BEARING QUESTION
```

The independent review confirmed the core architectural conclusion: a synthetic pre-C-018 observability harness would invent Product owners/records/F5/verifier composition that does not yet exist and would prove the fixture rather than Product correctness.

The basis, however, required one material correction.

---

## 13. Mastra observability exact-lock correction

Current exact Package-B lock contains:

```text
@mastra/core   1.56.0
@mastra/memory 1.25.0
@mastra/pg     1.19.0
```

It does **not** contain `@mastra/observability`.

Exact `@mastra/core 1.56.0` provides public observability contracts/types and a no-op path, including concepts equivalent to:

```text
ObservabilityEntrypoint
ObservabilityInstance
ObservabilityExporter
CorrelationContext
ObservabilityDropEvent
NoOpObservability
Mastra config field for an Observability entrypoint
```

Core alone does not ship the concrete observability implementation needed to instantiate the real export path. Passing a plain config object in place of the expected entrypoint can disable observability with a logger warning rather than a fail-fast exception.

Current realization dependency:

```text
@mastra/observability
= named F1 realization dependency for the accepted Mastra observability integration path
= VERSION UNPINNED
= C-016 admission NOT PERFORMED
= lock closure NOT FROZEN
```

First acquisition of that package is a requalification/admission trigger under C-016 + 3L-Q0. Do not install it pre-C-018 merely to satisfy sequence ceremony.

Conexus hand-implementing Mastra's `ObservabilityEntrypoint`/`ObservabilityInstance` subsystem to avoid the package is rejected absent a concrete failure class.

---

## 14. Package-E integration and trust laws

When first-build reaches the real observability slice:

```text
Mastra public observability path
→ Conexus-authored ObservabilityExporter
→ server-side producer-trust/correlation binding
→ obs.operational_event
```

Not admitted as Conexus truth path:

```text
MastraStorageExporter / default Mastra storage
→ mastra_builder / mastra_par
→ Conexus cross-reads vendor tables
```

`MastraStorageExporter` may be used for Studio/dev diagnostics only if useful; it is never a Conexus OBS read path or current authority.

Trust/correlation rules:

```text
runtime RequestContext IDs / CorrelationContext IDs
!= trusted Conexus owner identity

requestContextKeys auto-extraction
→ observational metadata only
→ stale/runtime-supplied owner IDs cannot become HUB_AUTHORITY

owner IDs accepted as authoritative correlation
→ bound server-side from owner dispatch/ingestion context
→ payload/runtime IDs are cross-check observations
```

Drop-event precision:

```text
absence of ObservabilityDropEvent != telemetry complete
sampling/filtering/truncation/crash-before-flush/uninitialized exporter/downstream loss may be silent
required evidence missing or incomplete → NOT_PROVEN / INCONCLUSIVE
```

No OTel Collector, Sentry, Spotlight, ClickHouse, event bus, telemetry outbox or mandatory backend is selected by this decision.

---

## 15. Package-E criterion routing

```text
exact ActorRun/AgentRun + candidate/output correlation
→ CX-OBS-V0-01 immediately after smallest implementing slice

Mastra observation mapping through public exporter seam
→ FIRST-BUILD after @mastra/observability C-016 admission/pin

E2B physical sandboxId observation anchor
→ bounded property already established by Package A; concrete Product mapping later

GUEST_OBSERVED trust stamping
→ FIRST-BUILD negative security fixture

producer cannot forge HUB/GATEWAY authority
→ FIRST-BUILD negative

required-evidence capture policy
→ Realization + FIRST-BUILD

missing/dropped evidence => NOT_PROVEN
→ FIRST-BUILD + 3M

telemetry outage cannot manufacture PASS
→ FIRST-BUILD + 3M

valid F5 without telemetry still reaches owner truth
→ FIRST-BUILD owner composition

complete telemetry without F5 cannot move owner truth
→ FIRST-BUILD negative

architecture-wide deciding-evidence completeness
→ 3N/3O
```

---

## 16. Finding adjudication summary

| Finding | Adjudication |
|---|---|
| FBL-D1 — queue substrate physical home | `ACCEPT ROOT / CORRECT SOLUTION` — existing `hub_control.mar` schema; no new schema/database |
| FBL-D2 — future JobRun × Release handoff | `ACCEPT CLASS / REMOVE FUTURE PRE-ADMISSION`; version-lock boundary clarified at durable admission commit |
| FBL-D3 — `send()` may return `null` | `ACCEPT`; null is fail-closed, never success |
| FBL-D4 — admission model undecided | `ACCEPT`; select immediate freshness-driven reconciliation (Alternative C) |
| FBL-D5 — fixed-interval formula unfrozen | `ACCEPT`; current freshness position, never nominal-slot walk |
| FBL-D6 — `job.signal` fact set | `ACCEPT EVIDENCE CORRECTION`; first-build obligation, no pre-C-018 probe |
| FBL-D7 — projection repair incomplete | `ACCEPT`; RUNNING orphan named for 3M, remove general reconstruction claim from DT-1' |
| FBL-D8 — source-known facts misclassified | `ACCEPT`; DT-1' narrowed to composed behavior only |
| FBL-E1 — concrete Mastra observability package absent | `ACCEPT MATERIAL FACT CORRECTION`; E remains DEFER SAFELY |
| FBL-E2 — drop events not completeness | `ACCEPT` |
| FBL-E3 — requestContextKeys stale-correlation path | `ACCEPT` |
| FBL-E4 — MastraStorageExporter wrong default | `ACCEPT`; diagnostics-only, never Conexus OBS truth path |

Fable's `STOP_SPLIT_PREREQUISITE` is not retained as the final D verdict because the physical-placement prerequisite is resolved here without a new schema/database and the larger delayed-occurrence model is deleted.

---

## 17. Supersession / preservation map

### Superseded by 3L-R2

```text
3L-R1 / current router:
  Packages D/E = NOT EXECUTED / REQUIRE PROPORTIONAL REDERIVATION

3L-Q0 historical serial implication:
  unconditional execution of Package D/E by sequence

Lead pre-Fable candidate:
  DT-1 — Transactional Delayed Occurrence Projection
  rolling future JobRun baseline
  native cron rejection as reason to pre-create future durable rows
```

### Preserved

```text
3A-R9 Product/owner invariants
MAR owner
mar.job_run as sole Conexus durable occurrence record
Release as schedule/composition authority
MANAGED_JOB Gateway surface
manual + fixed interval only F1
single-flight/coalesce
one catch-up / no N-slot backlog
persist-before-physical-execution
exact Release/job pins
Gateway current-authority last-mile
queue/scheduler mechanism != authority
3E closed 13 owner schemas / 46 durable classes / single hub_control migration lineage
3H/3I telemetry/authority/correlation laws
3L-R1 Package-B closure and Package-C defer
```

---

## 18. Known / Inferred / Unknown / Deferred after ratification

### KNOWN

```text
first vertical requires recurring governed analytical sync
MAR owns managed-job lifecycle
mar.job_run is sole Conexus durable occurrence record
pg-boss candidate pin = 12.26.3
PostgreSQL probe pin = 17.10
pg-boss supports same-transaction Db adapter path
pg-boss supports schema/createSchema/migrate/schedule controls used by the candidate
pg-boss vendor DDL can be exported/externally managed
pg-boss native cron does not satisfy one-catch-up by itself
send() null must be treated fail-closed
retryLimit=0 fences automatic redelivery for the probe
Package-B lock lacks @mastra/observability
core observability types/no-op != concrete real exporter runtime
```

### INFERRED / TO BE TESTED BY DT-1'

```text
same transaction can compose MAR owner fixture + pg-boss projection with the exact pinned runtime path
concurrent same-occurrence owner uniqueness + queue projection remains fail-closed in real PG17.10 composition
fresh process can discover both committed facts after process loss
owner guard can keep queue delivery semantically subordinate
```

### UNKNOWN

```text
exact DT-1' outcome under real PostgreSQL 17.10
exact transitive pg-boss lock closure at authorized acquisition time
whether first-build evidence later exposes a pg-boss limitation requiring a smaller reconciliation change
exact @mastra/observability version/lock until first authorized acquisition
```

### DEFERRED

```text
real Product MAR implementation
real schema/table/constraint names beyond existing semantic records
real sync/cursor/ETL behavior
RUNNING-orphan recovery
cancel/timeout/partial-progress recovery
Gateway MANAGED_JOB end-to-end enforcement
Release promotion/serving race proof
OBS ingestion and producer-trust implementation
@mastra/observability acquisition/runtime mapping
3M / 3N / 3O
```

---

## 19. Reopen triggers

Return to the exact implicated Decision Loop if any of these become true:

```text
pg-boss cannot coexist in existing mar schema without unsupported/forked vendor DDL
same-transaction admission cannot be made real under exact PG17.10 + pg-boss 12.26.3
DT-1' shows an irreconcilable persist→enqueue gap
correctness requires a durable pending-intent record beyond mar.job_run
first real job requires per-occurrence fidelity rather than freshness/coalesce semantics
multi-writer/multi-host topology invalidates current owner admission assumptions
a real background-work class requires calendar/RRULE/EVENT/DAG semantics
@mastra/observability public path cannot support Conexus exporter integration after C-016 admission
required deciding evidence proves non-rederivable and requires durable transport/backend
```

Do not reopen for package preference, new release availability or framework capability that has no named current consumer/failure class.

---

## 20. Exact next action

```text
3L-R2 = APPROVED / OPERATOR RATIFIED
Package D = REDERIVED / DT-1' ROUTE ADMITTED / EXECUTION NOT YET AUTHORIZED
Package E = DEFER SAFELY / NO PRE-C-018 RUNTIME PROBE
Product implementation = BLOCKED
C-018 = NOT RATIFIED
PR #40 merge = NOT AUTHORIZED
```

Next mechanical step:

> Review the derived Codex `DT-1'` execution plan against this authority. Only explicit operator execution authorization may start dependency acquisition, harness implementation or probe execution.
