# Integrations and Capability Gateway

Current technical detail extracted without semantic rewriting from the accepted Phase-3 architecture baseline. `docs/architecture/index.md` owns the overview; this file owns the detailed task surface named by its title.

## 18. Connections architecture

## 18.1 Ownership

```text
Connection.ownerScope = WORKSPACE | PROJECT

WORKSPACE
→ reusable organizational Connection

PROJECT
→ private Project Connection, not implicitly reusable by siblings

Connections
→ logical Connection/qualification/credential-handle facts

Project
→ ProjectConnectionBinding to exact ConnectionRevision

CredentialBackend
→ encrypted secret-byte/crypto mechanics

Gateway
→ trusted last-mile execution
```

Provider does not determine scope, and cross-Workspace use is denied. These rules preserve one Connection class; they do not create two Connection classes, a generic scope engine or a generic ResourceBinding framework.

## 18.2 Connector model

Connector definitions remain narrow/declarative and provider-aware enough to express real auth shape, operations, effects/idempotency, environment/qualification and bounded provider-specific behavior.

Native/provider-specific operations are admissible where that is the honest semantic shape. Lowest-common-denominator flattening and full provider DTO mirroring are both rejected.

Free-form hook runtime is not baseline merely for future flexibility.

## 18.3 Secret lifecycle

Connection secret plaintext exists only at:

```text
A. write-only trusted administration ingress
B. Gateway trusted last-mile external use
```

No read-back API by default. Credential material is durable-before-visible and fails closed on corrupt/missing/unsupported backing/key state.

Logical credential version, crypto key version and transient access-token generation remain separate meanings.

---

## 19. Capability Gateway architecture

Gateway is the narrow execution boundary for governed business/application capabilities and enterprise effects.

## 19.1 Owns

```text
current capability/effect admission
exact Connection/binding resolution where external
business/application external I/O
effect identity/idempotency/replay safety
last-mile precondition/effect rules
credential materialization at exact use point
execution receipt / traffic-state truth
external-effect unit/budget authority
```

### 19.1.1 Registered key-conformance read

Operator-approved scope amendment `2026-09-05`: Gateway may execute an internal
registered aggregate read for the Brain admission consumer. Only trusted
composition registers query definitions/executors. A caller selects no SQL,
table, URL, credential, source scope or successful proof result. Project and
Connection owners resolve current authority and the exact qualified binding;
the not-yet-admitted Brain binding cannot authorize its own validation read.

The producer checks missing/null source-qualified key components and duplicate
key groups over a complete coherent observation of the registered population.
Brain owns the intended grain and mapping requirements. Predicate success does
not itself establish business meaning, general Brain conformance, continued
source freshness or synchronization correctness. Empty complete data and
unknown/incomplete data remain distinct.

The executor must be separately admitted for its source, query revision,
observation-coherence and invalidation semantics. A caller-written PASS,
timestamp, page count or connection qualification cannot replace this proof.
Current binding/input identities are checked before and after observation;
drift or indeterminate execution refuses a positive result. This is an
owner-local result, not a new public operation or generic durable receipt class.
Controlled-source tests establish only their named module/adapter properties;
they do not admit a live Sankhya source or arbitrary SQL execution.

## 19.2 Does not own

```text
Project business meaning
Brain semantic meaning
Account identity
Product Agent lifecycle
Release source authority
model-spend authority
```

### 19.2.1 `budget_counter` — external-effect budgets only

The current Product Agent contract admits explicit `budgets`, and an approved exact effect rechecks current authorization/policy/budget before Gateway admission. The Gateway-owned durable `budget_counter` is the smallest current-state record for **non-monetary external-effect unit budgets** when an exact Release/Agent policy actually declares such a bound.

```text
current Product Agent / Release effect budget
+ current admitted effect units already consumed in the declared scope
→ Gateway checks and consumes the next allowed unit at effect admission
→ process restart / runtime retry / fresh AgentRun cannot reset or oversubscribe that same current budget
```

`budget_counter` is therefore not model-spend authority, not provider-invoice truth and not the hard USD reservation/cost-envelope machinery deferred by 3L-R1. Exact counter scope, columns and concurrency primitive belong to derived Realization Planning. No generic `BudgetService` or quota framework is introduced.

## 19.3 Caller surfaces and the 3A-R9 amendment

Gateway caller context is surface-specific. Current callers include the bounded explicit:

```text
MANAGED_JOB
```

This is the 3A-R9 amendment to the older 3D-02 caller list. The Hub derives exact `JobRun`, Project/environment, Release, Job ArtifactRevision and admitted input/occurrence identity server-side; the caller cannot select arbitrary Project, Connection, Release, revision or environment. Package D proves only the current tested transactional-admission subset; the current F1 managed-job consumer remains governed sync.

## 19.4 Retry law

```text
runtime retry != effect retry permission
```

Possible external acceptance + ambiguous response:

```text
OUTCOME_UNKNOWN
→ current reconciliation/evidence
-X-> blind replay
```

### 19.4.1 Semantic effect identity

One logical external-effect intent has one Gateway-owned semantic effect/replay identity:

```text
one logical effect intent
→ exact sealed effect subject
+ owner-stable intent/context facts admitted by the capability
→ one server-derived Gateway replay identity
```

That identity is independent of runtime/model/AgentRun/JobRun/transport attempt, is stable across retry/recovery of the same intent, and is never allocated from a counter/sequence namespace that a restored generation can reuse.

Identical payload or sealed subject does not collapse every future legitimate repetition into the same intent. Each effect-capable capability/connector declares the semantic idempotency/reconciliation scope that distinguishes duplicate risk from a later legitimate intent.

That scope is not trusted as arbitrary author metadata: it must be validated through the existing Connection/capability qualification and exact Release composition gates. A deliberately under-declared scope is a required first-build negative falsifier.

### 19.4.2 Unresolved truth fences new admission

Unresolved Gateway effect truth fences not only replay but any new effect admission that could duplicate the same logical intent inside the validated idempotency/reconciliation scope.

```text
fresh AgentRun / ApprovalRequest / transport attempt / process restart
-X-> bypass unresolved Gateway effect truth
```

Provider/SDK transport retry is subordinate mechanics and is allowed only when Gateway policy bounds it and preserves the same semantic effect/replay identity. Upstream runtimes never create a second semantic retry layer.

### 19.4.3 Disaster-restore effect posture

A disaster restore can lose an `EffectAttempt` that was created and externally applied entirely after the protected cutoff. Therefore the initial recovery posture cannot infer a safe affected-set by enumerating restored unresolved effects.

```text
disaster recovery active
→ all governed external-effect admission DENY by default
→ each effect-capable Connection/Gateway surface re-enabled only through existing owner checks
   after provider/business reconciliation establishes acceptable current safety
```

If the lost interval cannot be reconciled sufficiently, that effect surface remains fail-closed until explicit operator/business reconciliation through existing authority. No missing local EffectAttempt is fabricated and no generic recovery owner is introduced. Removing the infrastructure recovery deny never itself grants Gateway admission; each effect still passes the ordinary current Gateway/Connection checks.

A future provider/effect class that cannot fit this idempotency/reconciliation model reopens the smallest Gateway/operations Decision Loop.

## 19.5 Closed Contracts/API projection

```text
LIVE SURFACE = INTERNAL | INDEPENDENT
CONDITIONAL  = routing only
persistence alone != contract
VERSION-GAP  = PRESERVE | REJECT_STALE | QUIESCE | TRANSFORM | DISCARD
```

Payload families remain owner-specific; there is no `UniversalRequest`, `UniversalResponse`, `UniversalStatus` or `InternalFailure`. One `ApprovalRequest` represents one human decision over one exact sealed effect subject. Bindings remain concrete: `ProjectConnectionBinding` and `ProjectBrainBinding`.

The closed public consumer-behavior code baseline is:

```text
CLIENT_OUTDATED
CAS_CONFLICT
CAPABILITY_UNAVAILABLE_HEALTH
NOT_FOUND
OPERATION_REJECTED
VALIDATION_FAILED
MANIFEST_INVALID
OUTPUT_CONTRACT_VIOLATION
INTERNAL_ERROR
```

`code` is the semantic consumer-behavior key; HTTP/transport status is not a second taxonomy. Exact route and DTO spelling remain derived realization, not frozen here.

---

## 37. First vertical architecture — Budget Analyzer

The first vertical proves one real composition, not every platform capability.

```text
Workspace: Metal Nobre
├── Workspace Brain
│   └── budget/pending/conversion semantics + caveats
├── Connection
│   └── Sankhya
└── Project: Budget Analyzer
    ├── Project Baseline
    ├── ProjectBrainBinding
    ├── ProjectConnectionBinding
    ├── governed managed sync
    ├── derived analytical Project DB read model
    ├── registered read-only Query capabilities
    ├── React application/dashboard
    └── exact Release / Published Application
```

Data path:

```text
Sankhya
→ Gateway live reads
→ Discovery / qualification / reconciliation / verification / Evidence

Sankhya
→ governed sync
→ Project analytical read model
→ registered Query capabilities
→ dashboard
```

Truth laws:

```text
Project DB != Sankhya source authority
Project DB != Brain semantic authority
read model exists != sync completeness proved
historical benchmark != current operational truth
```

No Product Agent or external/business write is required for this vertical.

The Sankhya/read-model pattern is not universal doctrine; every future Project selects the minimum path required by its current Baseline.

---
